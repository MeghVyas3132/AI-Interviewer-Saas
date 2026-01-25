import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { updateCandidate } from '@/lib/postgres-data-store';
import { analyzeResume, extractStructuredResumeData } from '@/ai/flows/resume-analyzer';
import { getAdminSession } from '@/lib/auth';
import { isValidResumeFile, validateResumeName } from '@/lib/resume-validation';

// Disable default body parser for file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

async function extractTextFromFile(fileContent: Buffer, filename: string): Promise<string> {
  try {
    const isPDF = filename.toLowerCase().endsWith('.pdf');
    const isDocx = filename.toLowerCase().endsWith('.docx');
    const isDoc = filename.toLowerCase().endsWith('.doc');

    if (isPDF) {
      // Use pdf-parse for PDF extraction
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: fileContent });
      const result = await parser.getText();
      await parser.destroy();
      console.log(`Extracted ${result.text.length} characters from PDF: ${filename}`);
      return result.text;
    } else if (isDocx) {
      // Use mammoth for DOCX extraction
      const mammothModule = await import('mammoth');
      const mammoth = mammothModule.default || mammothModule;
      const result = await mammoth.extractRawText({ buffer: fileContent });
      console.log(`Extracted ${result.value.length} characters from DOCX: ${filename}`);
      return result.value;
    } else if (isDoc) {
      console.warn(`DOC file format not fully supported: ${filename}`);
      return `[DOC file: ${filename}] Text extraction for .doc files requires additional setup. Please convert to PDF or DOCX for best results.`;
    } else {
      console.warn(`Unsupported file type: ${filename}`);
      return `[Unsupported file type: ${filename}] Please upload PDF or DOCX format.`;
    }
  } catch (error) {
    console.error('Error extracting text from file:', error);
    throw error;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Check authentication
  const user = await getAdminSession(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ success: false, error: 'Candidate ID is required' });
    }

    // Handle "new" case - this means we need to create candidate first or upload later
    if (id === 'new') {
      return res.status(400).json({ 
        success: false, 
        error: 'Please create the candidate first, then upload the resume.' 
      });
    }

    const candidateId = parseInt(id);
    
    // Verify candidate exists
    const { getCandidateById } = await import('@/lib/postgres-data-store');
    const candidate = await getCandidateById(candidateId);
    if (!candidate) {
      return res.status(404).json({ success: false, error: 'Candidate not found' });
    }

    // Configure formidable for file upload
    const uploadDir = path.join(process.cwd(), 'uploads', 'resumes');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const form = formidable({
      uploadDir,
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      filename: (name, ext, part, form) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        return `resume-${candidateId}-${uniqueSuffix}${ext}`;
      }
    });

    const [fields, files] = await form.parse(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!file) {
      return res.status(400).json({ success: false, error: 'Resume file is required' });
    }

    // Validate file type (must be PDF, DOC, or DOCX)
    if (!isValidResumeFile(file.originalFilename || '', file.mimetype)) {
      // Clean up uploaded file
      try {
        fs.unlinkSync(file.filepath);
      } catch (e) {
        console.error('Error deleting invalid file:', e);
      }
      return res.status(400).json({
        success: false,
        error: 'Invalid file type. Please upload a resume in PDF, DOC, or DOCX format.',
      });
    }

    // Read file content
    const fileContent = fs.readFileSync(file.filepath);
    const extractedText = await extractTextFromFile(fileContent, file.originalFilename || 'resume.pdf');

    console.log(`Resume uploaded: ${file.originalFilename}, extracted text length: ${extractedText.length}`);

    // Analyze resume with AI (both comprehensive analysis and structured extraction)
    let analysis = null;
    let structuredData = null;
    try {
      console.log('Starting comprehensive resume analysis...');
      
      // Convert extracted text to data URI for analysis
      const resumeDataUri = `data:text/plain;base64,${Buffer.from(extractedText).toString('base64')}`;
      const fileType = file.originalFilename?.toLowerCase().endsWith('.docx') ? 'docx' : 
                       file.originalFilename?.toLowerCase().endsWith('.doc') ? 'doc' : 'pdf';
      
      const input = {
        resumeDataUri,
        fileType,
        fileName: file.originalFilename || 'resume.pdf'
      };

      // Run both analyses in parallel for comprehensive results
      console.log('Running AI analysis and structured extraction...');
      const [analysisResult, structuredResult] = await Promise.all([
        analyzeResume(input),
        extractStructuredResumeData(input)
      ]);

      analysis = analysisResult;
      structuredData = structuredResult;

      if (!analysis.isResume) {
        // Clean up uploaded file
        try {
          fs.unlinkSync(file.filepath);
        } catch (e) {
          console.error('Error deleting invalid resume file:', e);
        }
        return res.status(400).json({
          success: false,
          error: 'The uploaded file does not appear to be a resume. Please upload a valid resume.',
        });
      }

      // Validate name match between resume and registered candidate
      const registeredCandidateName = candidate.first_name && candidate.last_name
        ? `${candidate.first_name} ${candidate.last_name}`.trim()
        : null;
      
      if (registeredCandidateName) {
        // Use structured name if available (more accurate), otherwise use analysis name
        const resumeCandidateName = structuredData?.name || analysis.candidateName || '';
        
        const nameValidation = validateResumeName(registeredCandidateName, resumeCandidateName);
        
        if (!nameValidation.isValid) {
          // Clean up uploaded file
          try {
            fs.unlinkSync(file.filepath);
          } catch (e) {
            console.error('Error deleting file after name validation failure:', e);
          }
          
          console.warn('Resume name validation failed:', {
            registeredName: nameValidation.registeredName,
            resumeName: nameValidation.resumeName,
            error: nameValidation.errorMessage
          });
          
          return res.status(400).json({
            success: false,
            error: nameValidation.errorMessage || 'Name verification failed. Please ensure the name in the resume matches the candidate\'s registered name.',
          });
        }
        
        console.log('Resume name validation passed:', {
          registeredName: nameValidation.registeredName,
          resumeName: nameValidation.resumeName
        });
      } else {
        console.warn('Could not validate resume name: registered candidate name not available');
      }

      console.log('Comprehensive resume analysis complete:', {
        candidateName: analysis.candidateName,
        structuredName: structuredData.name,
        skillsCount: analysis.skills.length,
        atsScore: analysis.atsScore,
        experienceCount: structuredData.workExperience.length,
        educationCount: structuredData.education.length,
        certificationsCount: structuredData.certifications.length
      });

      // Use structured name if available, otherwise use analysis name
      const finalCandidateName = structuredData.name || analysis.candidateName;
      if (finalCandidateName && finalCandidateName !== analysis.candidateName) {
        console.log(`Using structured name "${finalCandidateName}" instead of analysis name "${analysis.candidateName}"`);
      }
    } catch (analysisError) {
      console.error('Error analyzing resume:', analysisError);
      return res.status(500).json({
        success: false,
        error: 'Failed to analyze resume. Please try again.',
        details: analysisError instanceof Error ? analysisError.message : 'Unknown error'
      });
    }

    // Store comprehensive analysis with structured data
    const comprehensiveAnalysis = {
      ...analysis,
      // Override candidateName with structured name if available (more accurate)
      candidateName: structuredData?.name || analysis.candidateName,
      structuredData: structuredData,
      analyzedAt: new Date().toISOString()
    };

    // Update candidate with resume file path and comprehensive analysis
    const relativePath = path.relative(process.cwd(), file.filepath);
    
    await updateCandidate(candidateId, {
      resume_file_path: relativePath,
      resume_url: `/uploads/resumes/${path.basename(file.filepath)}`, // Public URL
      resume_analysis_json: comprehensiveAnalysis,
    });

    res.status(200).json({
      success: true,
      data: {
        resumeUrl: `/uploads/resumes/${path.basename(file.filepath)}`,
        analysis: comprehensiveAnalysis
      },
      message: 'Resume uploaded and analyzed successfully'
    });

  } catch (error) {
    console.error('Resume upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload resume',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

