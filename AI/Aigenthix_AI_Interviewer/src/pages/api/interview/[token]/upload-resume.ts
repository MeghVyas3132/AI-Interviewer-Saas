import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { getInterviewSessionByToken, updateInterviewSession, getCandidateById, updateCandidate } from '@/lib/postgres-data-store';
import type { InterviewSession as InterviewSessionRecord } from '@/lib/postgres-data-store';
import { pool } from '@/lib/postgres';
import { analyzeResume, extractStructuredResumeData } from '@/ai/flows/resume-analyzer';
import { connectMongo } from '@/lib/mongodb';
import { ResumeAnalysis } from '@/lib/models';
import { isValidResumeFile } from '@/lib/resume-validation';
import { cache, CacheKeys } from '@/lib/cache';

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

type ResumeStatusState = 'processing' | 'ready' | 'error';

interface ResumeStatusPayload {
  state: ResumeStatusState;
  resumeId?: number | null;
  fileName?: string | null;
  uploadedAt?: string;
  processedAt?: string;
  message: string;
  details?: Record<string, any>;
}

function parseResultsJson<T = any>(value: any): T {
  if (!value) return {} as T;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch (err) {
      console.warn('Failed to parse results_json, defaulting to empty object', err);
      return {} as T;
    }
  }
  return value as T;
}

async function setSessionResumeStatus(
  sessionId: number,
  currentResults: any,
  status: ResumeStatusPayload
) {
  const nextResults = {
    ...(currentResults ?? {}),
    resumeStatus: {
      ...(currentResults?.resumeStatus ?? {}),
      ...status,
      state: status.state,
      updatedAt: new Date().toISOString(),
    },
  };

  await updateInterviewSession(sessionId, {
    results_json: nextResults,
  });

  return nextResults;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  let session: InterviewSessionRecord | null = null;
  let processingStatus: ResumeStatusPayload | null = null;
  let cacheKey: string | null = null;
  let uploadedFileName: string | null = null;

  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: 'Interview token is required' });
    }

    // Get interview session by token
    session = await getInterviewSessionByToken(token);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Invalid interview token' });
    }

    // Check if session is still active
    if (!session.is_active) {
      return res.status(400).json({ 
        success: false, 
        error: 'Interview session is no longer active' 
      });
    }

    // Check if session has expired
    // Use scheduled_end_time if available, otherwise use expires_at
    const currentTime = new Date().getTime();
    let actualExpiryTime: number;
    
    if (session.scheduled_end_time) {
      actualExpiryTime = new Date(session.scheduled_end_time).getTime();
    } else {
      actualExpiryTime = new Date(session.expires_at).getTime();
    }
    
    if (currentTime > actualExpiryTime) {
      return res.status(400).json({ 
        success: false, 
        error: session.scheduled_end_time
          ? 'The interview window has ended. Please contact the administrator to schedule a new interview.'
          : 'Interview session has expired'
      });
    }

    cacheKey = `resume_analysis_${token}`;

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
        return `interview-${session.id}-${uniqueSuffix}${ext}`;
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

    const uploadReceivedAt = new Date().toISOString();
    const existingResults = parseResultsJson(session.results_json);
    processingStatus = {
      state: 'processing',
      resumeId: session.resume_id ?? null,
      fileName: file.originalFilename || path.basename(file.filepath),
      uploadedAt: uploadReceivedAt,
      message: 'Resume upload received. Processing...',
    };

    const updatedProcessingResults = await setSessionResumeStatus(
      session.id,
      existingResults,
      processingStatus
    );
    session.results_json = updatedProcessingResults;
    uploadedFileName = file.originalFilename || path.basename(file.filepath);

    if (typeof global !== 'undefined') {
      if (!global.resumeAnalysisCache) {
        global.resumeAnalysisCache = new Map();
      }
      global.resumeAnalysisCache.set(cacheKey, {
        status: 'processing',
        uploadedAt: uploadReceivedAt,
        fileName: file.originalFilename || path.basename(file.filepath),
      });
    }

    console.log('[resume_uploaded]', {
      event: 'resume_uploaded',
      sessionId: session.id,
      candidateId: session.candidate_id ?? null,
      token,
      fileName: file.originalFilename,
      fileSize: file.size,
      uploadedAt: uploadReceivedAt,
      status: 'processing',
    });

    // Read file content
    const fileContent = fs.readFileSync(file.filepath);
    const extractedText = await extractTextFromFile(fileContent, file.originalFilename || 'resume.pdf');

    console.log(`Resume uploaded for interview session ${session.id}: ${file.originalFilename}, extracted text length: ${extractedText.length}`);

    // Analyze resume with AI (both comprehensive analysis and structured extraction)
    let analysis = null;
    let structuredData = null;
    try {
      console.log('Starting comprehensive resume analysis for interview session...');
      
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

      console.log('Comprehensive resume analysis complete:', {
        candidateName: analysis.candidateName,
        structuredName: structuredData.name,
        skillsCount: analysis.skills.length,
        atsScore: analysis.atsScore,
        experienceCount: structuredData.workExperience.length,
        educationCount: structuredData.education.length,
        certificationsCount: structuredData.certifications.length
      });
    } catch (analysisError: any) {
      console.error('Error analyzing resume:', analysisError);
      
      // Check if it's a rate limit error (429)
      const isRateLimit = analysisError?.status === 429 || 
                         analysisError?.statusCode === 429 ||
                         analysisError?.message?.includes('429') ||
                         analysisError?.message?.includes('Too Many Requests') ||
                         analysisError?.message?.includes('Resource exhausted');
      
      // Clean up uploaded file on error
      try {
        fs.unlinkSync(file.filepath);
      } catch (e) {
        console.error('Error deleting file after analysis error:', e);
      }

      const errorStatus: ResumeStatusPayload = {
        state: 'error',
        resumeId: session.resume_id ?? null,
        fileName: file.originalFilename || path.basename(file.filepath),
        uploadedAt: processingStatus?.uploadedAt ?? uploadReceivedAt,
        message: analysisError instanceof Error
          ? `Resume processing failed: ${analysisError.message}`
          : 'Resume processing failed due to an unexpected error.',
        details: analysisError,
      };

      try {
        const errorResults = await setSessionResumeStatus(
          session.id,
          parseResultsJson(session.results_json),
          errorStatus
        );
        session.results_json = errorResults;
      } catch (statusError) {
        console.error('Failed to persist resume error status on session:', statusError);
      }

      if (typeof global !== 'undefined' && global.resumeAnalysisCache) {
        global.resumeAnalysisCache.set(cacheKey, {
          status: 'error',
          error: errorStatus.message,
          uploadedAt: processingStatus.uploadedAt,
        });
      }
      
      // Provide specific error messages based on error type
      if (isRateLimit) {
        return res.status(429).json({
          success: false,
          error: 'The AI service is currently experiencing high demand. Please wait a moment and try uploading your resume again.',
          retryable: true,
          retryAfter: 60 // Suggest retrying after 60 seconds
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Failed to analyze resume. Please try again.',
        details: analysisError instanceof Error ? analysisError.message : 'Unknown error',
        retryable: true
      });
    }

    // Store comprehensive analysis with structured data
    const comprehensiveAnalysis = {
      ...analysis,
      // Override candidateName with structured name if available (more accurate)
      candidateName: structuredData?.name || analysis.candidateName,
      structuredData: structuredData,
      extractedText: extractedText,
      analyzedAt: new Date().toISOString()
    };

    // Build comprehensive resume text for interview agent
    let comprehensiveResumeText = '';
    if (structuredData) {
      const structuredDataObj = structuredData.structuredData || structuredData;
      const parts: string[] = [];
      
      // Add professional summary if available
      if (structuredDataObj.professionalSummary) {
        parts.push(`Professional Summary: ${structuredDataObj.professionalSummary}`);
      }
      
      // Add work experience with details
      if (structuredDataObj.workExperience && structuredDataObj.workExperience.length > 0) {
        parts.push('\nWork Experience:');
        structuredDataObj.workExperience.forEach((exp: any) => {
          parts.push(`${exp.role} at ${exp.company} (${exp.duration})`);
          if (exp.description) parts.push(`  ${exp.description}`);
          if (exp.highlights && exp.highlights.length > 0) {
            exp.highlights.forEach((h: string) => parts.push(`  - ${h}`));
          }
        });
      }
      
      // Add education
      if (structuredDataObj.education && structuredDataObj.education.length > 0) {
        parts.push('\nEducation:');
        structuredDataObj.education.forEach((edu: any) => {
          parts.push(`${edu.degree} from ${edu.institution}${edu.year ? ` (${edu.year})` : ''}${edu.field ? `, ${edu.field}` : ''}`);
        });
      }
      
      // Add skills
      if (analysis.skills && analysis.skills.length > 0) {
        parts.push(`\nSkills: ${analysis.skills.join(', ')}`);
      } else if (structuredDataObj.skills && structuredDataObj.skills.length > 0) {
        parts.push(`\nSkills: ${structuredDataObj.skills.join(', ')}`);
      }
      
      // Add certifications
      if (structuredDataObj.certifications && structuredDataObj.certifications.length > 0) {
        parts.push(`\nCertifications: ${structuredDataObj.certifications.join(', ')}`);
      }
      
      // Add comprehensive summary or experience summary
      if (analysis.comprehensiveSummary) {
        parts.push(`\nSummary: ${analysis.comprehensiveSummary}`);
      } else if (analysis.experienceSummary) {
        parts.push(`\nExperience Summary: ${analysis.experienceSummary}`);
      }
      
      comprehensiveResumeText = parts.join('\n');
    } else {
      comprehensiveResumeText = extractedText || '';
    }

    const processedAt = new Date().toISOString();
    let resumeIdForSession: number | null = session.resume_id ?? null;
    const currentResultsForReady = parseResultsJson(session.results_json);
    const readyStatus: ResumeStatusPayload = {
      state: 'ready',
      resumeId: resumeIdForSession,
      fileName: file.originalFilename || path.basename(file.filepath),
      uploadedAt: processingStatus?.uploadedAt ?? uploadReceivedAt,
      processedAt,
      message: 'Resume processed successfully. You can start your interview.',
    };

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        if (session.candidate_id) {
          if (resumeIdForSession) {
            await client.query(
              `
                UPDATE resumes
                   SET file_name = $2,
                       file_path = $3,
                       file_size = $4,
                       file_type = $5,
                       extracted_text = $6,
                       parsed_data = $7::jsonb,
                       upload_date = CURRENT_TIMESTAMP,
                       is_active = true
                 WHERE resume_id = $1
              `,
              [
                resumeIdForSession,
                file.originalFilename || path.basename(file.filepath),
                file.filepath,
                file.size || null,
                file.mimetype || 'application/octet-stream',
                extractedText,
                JSON.stringify(comprehensiveAnalysis),
              ]
            );
          } else {
            const resumeInsert = await client.query(
              `
                INSERT INTO resumes
                  (candidate_id, file_name, file_path, file_size, file_type, extracted_text, parsed_data, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, true)
                RETURNING resume_id
              `,
              [
                session.candidate_id,
                file.originalFilename || path.basename(file.filepath),
                file.filepath,
                file.size || null,
                file.mimetype || 'application/octet-stream',
                extractedText,
                JSON.stringify(comprehensiveAnalysis),
              ]
            );
            resumeIdForSession = resumeInsert.rows[0]?.resume_id ?? null;
            readyStatus.resumeId = resumeIdForSession;
          }
        }

        const mergedResults = {
          ...(currentResultsForReady ?? {}),
          resumeStatus: {
            ...(currentResultsForReady?.resumeStatus ?? {}),
            ...readyStatus,
            state: 'ready',
            updatedAt: processedAt,
          },
        };

        await client.query(
          `
            UPDATE interview_sessions
               SET resume_id = $2,
                   results_json = $3::jsonb,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
          `,
          [session.id, resumeIdForSession, JSON.stringify(mergedResults)]
        );

        await client.query('COMMIT');

        session.resume_id = resumeIdForSession ?? undefined;
        session.results_json = mergedResults;

        // Invalidate cache to ensure fresh session data is fetched on next status check
        cache.delete(CacheKeys.interviewSession(token));
      } catch (dbError) {
        await client.query('ROLLBACK');
        console.error('Error updating resume and session readiness:', dbError);
        throw dbError;
      } finally {
        client.release();
      }
    } catch (dbError) {
      console.error('Database error while finalizing resume upload:', dbError);
      throw dbError;
    }

    console.log('[resume_parsed]', {
      event: 'resume_parsed',
      sessionId: session.id,
      candidateId: session.candidate_id ?? null,
      token,
      resumeId: resumeIdForSession,
      processedAt,
      status: 'ready',
    });

    // Get candidate information if available
    let candidateName = '';
    let candidateEmail = '';
    if (session.candidate_id) {
      try {
        const candidate = await getCandidateById(session.candidate_id);
        if (candidate) {
          candidateName = `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim();
          candidateEmail = candidate.email || '';
        }
      } catch (err) {
        console.warn('Could not fetch candidate information:', err);
      }
    }

    // Use structured name or analysis name if candidate name not available
    const finalCandidateName = candidateName || structuredData?.name || analysis.candidateName || '';

    // Store resume analysis in MongoDB
    try {
      const mongoConnected = await connectMongo();
      if (mongoConnected) {
        // Check if resume analysis already exists for this token
        const existingAnalysis = await ResumeAnalysis.findOne({ interviewToken: token });
        
        const resumeAnalysisData = {
          interviewToken: token,
          interviewSessionId: session.id,
          candidateId: session.candidate_id || null,
          candidateName: finalCandidateName,
          candidateEmail: candidateEmail,
          fileName: file.originalFilename || 'resume.pdf',
          filePath: file.filepath,
          fileSize: file.size,
          fileType: file.mimetype || 'application/pdf',
          extractedText: extractedText,
          comprehensiveResumeText: comprehensiveResumeText,
          analysis: {
            isResume: analysis.isResume,
            candidateName: finalCandidateName,
            skills: analysis.skills || [],
            experienceSummary: analysis.experienceSummary || '',
            comprehensiveSummary: analysis.comprehensiveSummary || '',
            atsScore: analysis.atsScore,
            sectionRatings: analysis.sectionRatings || {},
            feedback: analysis.feedback || {},
            strengths: analysis.strengths || [],
            areasForImprovement: analysis.areasForImprovement || [],
          },
          structuredData: structuredData || {},
          analyzedAt: new Date(),
          uploadedAt: new Date(),
        };

        if (existingAnalysis) {
          // Update existing analysis
          await ResumeAnalysis.findOneAndUpdate(
            { interviewToken: token },
            resumeAnalysisData,
            { new: true }
          );
          console.log('Updated resume analysis in MongoDB for token:', token);
        } else {
          // Create new analysis
          await ResumeAnalysis.create(resumeAnalysisData);
          console.log('Saved resume analysis to MongoDB for token:', token);
        }
      } else {
        console.warn('MongoDB not connected, skipping database save');
      }
    } catch (mongoError) {
      console.error('Error saving resume analysis to MongoDB:', mongoError);
      // Continue even if MongoDB save fails - cache will still work
    }

    if (session.candidate_id) {
      try {
        const candidateResumeAnalysis = {
          ...comprehensiveAnalysis,
          comprehensiveResumeText,
        };
        delete (candidateResumeAnalysis as any).extractedText;

        await updateCandidate(session.candidate_id, {
          resume_analysis_json: candidateResumeAnalysis,
        });
      } catch (candidateUpdateError) {
        console.error('Failed to update candidate resume analysis metadata:', candidateUpdateError);
      }
    }

    // Store resume analysis in cache (using session token as key) for backward compatibility
    // We'll use a simple in-memory cache for now, but this could be Redis in production
    cacheKey = `resume_analysis_${token}`;
    const cacheData = {
      analysis: comprehensiveAnalysis,
      comprehensiveResumeText: comprehensiveResumeText,
      extractedText: extractedText,
      status: 'ready',
      resumeId: resumeIdForSession,
        uploadedAt: processingStatus?.uploadedAt ?? uploadReceivedAt,
      processedAt,
      fileName: file.originalFilename || path.basename(file.filepath),
    };

    // Store in a global cache object (in production, use Redis or similar)
    if (typeof global !== 'undefined') {
      if (!global.resumeAnalysisCache) {
        global.resumeAnalysisCache = new Map();
      }
      global.resumeAnalysisCache.set(cacheKey, cacheData);
      // Set expiration to 24 hours
      setTimeout(() => {
        if (global.resumeAnalysisCache) {
          global.resumeAnalysisCache.delete(cacheKey);
        }
      }, 24 * 60 * 60 * 1000);
    }

    res.status(200).json({
      success: true,
      data: {
        analysis: comprehensiveAnalysis,
        status: 'ready',
        resumeId: resumeIdForSession,
        resumeStatus: readyStatus,
        message: 'Resume uploaded and analyzed successfully. You can now start the interview.'
      }
    });

  } catch (error) {
    console.error('Resume upload error:', error);

    if (session) {
      const fallbackStatus: ResumeStatusPayload = {
        state: 'error',
        resumeId: session.resume_id ?? null,
        fileName: uploadedFileName,
        message: 'Resume upload failed due to an unexpected error. Please try again.',
      };

      try {
        const errorResults = await setSessionResumeStatus(
          session.id,
          parseResultsJson(session.results_json),
          fallbackStatus
        );
        session.results_json = errorResults;
      } catch (statusError) {
        console.error('Failed to persist fallback resume error status:', statusError);
      }
    }

    if (cacheKey && typeof global !== 'undefined' && global.resumeAnalysisCache) {
      global.resumeAnalysisCache.set(cacheKey, {
        status: 'error',
        error: 'Resume upload failed due to an unexpected error.',
        uploadedAt: new Date().toISOString(),
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to upload resume',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

