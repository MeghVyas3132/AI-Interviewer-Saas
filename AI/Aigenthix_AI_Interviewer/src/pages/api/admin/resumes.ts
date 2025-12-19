import { NextApiRequest, NextApiResponse } from 'next';
import { getResumes, createResume } from '@/lib/postgres-data-store';
import { getAdminSession } from '@/lib/auth';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const user = await getAdminSession(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    switch (req.method) {
      case 'GET':
        const { candidateId } = req.query;
        const resumes = await getResumes(candidateId ? Number(candidateId) : undefined);
        res.status(200).json({ success: true, data: resumes });
        break;

      case 'POST':
        await handleResumeUpload(req, res);
        break;

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Resumes API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

async function handleResumeUpload(req: NextApiRequest, res: NextApiResponse) {
  try {
    const form = formidable({
      uploadDir: './uploads',
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
    });

    // Ensure uploads directory exists
    if (!fs.existsSync('./uploads')) {
      fs.mkdirSync('./uploads', { recursive: true });
    }

    const [fields, files] = await form.parse(req);
    
    const candidateId = fields.candidateId?.[0];
    const fileName = fields.fileName?.[0];
    const file = files.file?.[0];

    if (!candidateId || !file) {
      return res.status(400).json({ 
        success: false, 
        error: 'Candidate ID and file are required' 
      });
    }

    // Read file content for text extraction
    const fileContent = fs.readFileSync(file.filepath);
    const extractedText = await extractTextFromFile(fileContent, file.originalFilename || '');

    console.log(`Resume uploaded: ${file.originalFilename}, extracted text length: ${extractedText.length}`);

    // Analyze resume if needed (optional - can be done later)
    let parsedData = null;
    try {
      if (extractedText.length > 0) {
        // Can add resume analysis here if needed
        parsedData = {
          extractedAt: new Date().toISOString(),
          textLength: extractedText.length
        };
      }
    } catch (analysisError) {
      console.error('Resume analysis skipped:', analysisError);
    }

    // Create resume record
    const resume = await createResume({
      candidate_id: Number(candidateId),
      file_name: fileName || file.originalFilename || 'resume.pdf',
      file_path: file.filepath,
      file_size: file.size,
      file_type: file.mimetype || 'application/pdf',
      extracted_text: extractedText,
      parsed_data: parsedData,
      is_active: true
    });

    res.status(201).json({ success: true, data: resume });
  } catch (error) {
    console.error('Resume upload error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload resume' });
  }
}

async function extractTextFromFile(fileContent: Buffer, filename: string): Promise<string> {
  try {
    const isPDF = filename.toLowerCase().endsWith('.pdf');
    const isDocx = filename.toLowerCase().endsWith('.docx');

    if (isPDF) {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: fileContent });
      const result = await parser.getText();
      await parser.destroy();
      return result.text;
    } else if (isDocx) {
      const mammothModule = await import('mammoth');
      const mammoth = mammothModule.default || mammothModule;
      const result = await mammoth.extractRawText({ buffer: fileContent });
      return result.value;
    } else {
      console.warn(`Unsupported file type: ${filename}`);
      return `[Unsupported file type: ${filename}] Please upload PDF or DOCX format.`;
    }
  } catch (error) {
    console.error('Error extracting text from file:', error);
    return `[Error extracting text from ${filename}] ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

