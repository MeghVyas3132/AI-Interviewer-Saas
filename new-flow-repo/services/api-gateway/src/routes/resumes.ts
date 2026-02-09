import { Router, Response } from 'express';
import { pool } from '../db';
import { logger } from '../utils/logger';
import { authenticateJWT, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { SaveResumeSchema } from '../types/schemas';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads', 'resumes');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * Save or update candidate resume
 * POST /api/resumes
 * Access: HR, ADMIN (or internal service)
 */
router.post('/', authenticateJWT, requireRole('HR', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validationResult = SaveResumeSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({ 
        error: 'Validation failed', 
        details: validationResult.error.issues 
      });
      return;
    }

    const { externalCandidateId, resumeJson } = validationResult.data;

    // Extract key facts for quick matching
    const keyFacts = extractKeyFacts(resumeJson);

    const result = await pool.query(
      `INSERT INTO candidate_resumes (external_candidate_id, resume_json, key_facts)
       VALUES ($1, $2, $3)
       ON CONFLICT (external_candidate_id) 
       DO UPDATE SET resume_json = $2, key_facts = $3, updated_at = NOW()
       RETURNING *`,
      [externalCandidateId, JSON.stringify(resumeJson), JSON.stringify(keyFacts)]
    );

    logger.info('Resume saved', { candidateId: externalCandidateId });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error saving resume', { error });
    res.status(500).json({ error: 'Failed to save resume' });
  }
});

/**
 * Get candidate resume
 * GET /api/resumes/:candidateId
 * Access: HR, ADMIN, assigned EMPLOYEE
 */
router.get('/:candidateId', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { candidateId } = req.params;

    const result = await pool.query(
      'SELECT * FROM candidate_resumes WHERE external_candidate_id = $1',
      [candidateId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Resume not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching resume', { error });
    res.status(500).json({ error: 'Failed to fetch resume' });
  }
});

/**
 * Extract key facts from resume for quick contradiction checking
 */
function extractKeyFacts(resume: any) {
  const keyFacts: {
    companies: Array<{ name: string; duration: string; startDate: string; endDate: string }>;
    skills: string[];
    totalExperienceMonths: number;
    education: Array<{ institution: string; degree: string; year: number }>;
    certifications: string[];
  } = {
    companies: [],
    skills: [],
    totalExperienceMonths: 0,
    education: [],
    certifications: [],
  };

  // Extract company info
  if (resume.experience) {
    keyFacts.companies = resume.experience.map((exp: any) => ({
      name: exp.company,
      duration: `${exp.durationMonths || 0} months`,
      startDate: exp.startDate,
      endDate: exp.endDate,
    }));

    keyFacts.totalExperienceMonths = resume.experience.reduce(
      (sum: number, exp: any) => sum + (exp.durationMonths || 0),
      0
    );
  }

  // Extract skills
  if (resume.skills) {
    keyFacts.skills = [
      ...(resume.skills.programmingLanguages || []),
      ...(resume.skills.frameworks || []),
      ...(resume.skills.databases || []),
      ...(resume.skills.tools || []),
    ];
  }

  // Extract education
  if (resume.education) {
    keyFacts.education = resume.education.map((edu: any) => ({
      institution: edu.institution,
      degree: edu.degree,
      year: edu.graduationYear,
    }));
  }

  // Extract certifications
  if (resume.certifications) {
    keyFacts.certifications = resume.certifications.map((cert: any) => cert.name);
  }

  return keyFacts;
}

/**
 * Upload resume file for a candidate
 * POST /api/resumes/upload
 * Access: Authenticated (Candidates can upload their own resume)
 */
router.post('/upload', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Parse multipart form data manually using raw body
    const contentType = req.headers['content-type'] || '';
    
    if (!contentType.includes('multipart/form-data')) {
      res.status(400).json({ error: 'Content-Type must be multipart/form-data' });
      return;
    }

    // For simplicity, we'll store the raw file data
    // In production, you'd use multer or a cloud storage service
    const chunks: Buffer[] = [];
    
    await new Promise<void>((resolve, reject) => {
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve());
      req.on('error', reject);
    });

    const body = Buffer.concat(chunks);
    const boundary = contentType.split('boundary=')[1];
    
    if (!boundary) {
      res.status(400).json({ error: 'Invalid multipart boundary' });
      return;
    }

    // Parse multipart form data
    const parts = body.toString('binary').split(`--${boundary}`);
    let resumeContent: Buffer | null = null;
    let fileName = 'resume.pdf';
    let roundId = '';
    let candidateId = '';

    for (const part of parts) {
      if (part.includes('Content-Disposition')) {
        const nameMatch = part.match(/name="([^"]+)"/);
        const filenameMatch = part.match(/filename="([^"]+)"/);
        
        if (nameMatch) {
          const name = nameMatch[1];
          const contentStart = part.indexOf('\r\n\r\n') + 4;
          const contentEnd = part.lastIndexOf('\r\n');
          const content = part.slice(contentStart, contentEnd);
          
          if (name === 'resume' && filenameMatch) {
            fileName = filenameMatch[1];
            resumeContent = Buffer.from(content, 'binary');
          } else if (name === 'roundId') {
            roundId = content.trim();
          } else if (name === 'candidateId') {
            candidateId = content.trim();
          }
        }
      }
    }

    if (!resumeContent) {
      res.status(400).json({ error: 'No resume file provided' });
      return;
    }

    if (!candidateId) {
      candidateId = req.user?.id || '';
    }

    if (!candidateId) {
      res.status(400).json({ error: 'Candidate ID is required' });
      return;
    }

    // Generate unique filename
    const timestamp = Date.now();
    const ext = path.extname(fileName) || '.pdf';
    const storedFileName = `${candidateId}_${timestamp}${ext}`;
    const filePath = path.join(uploadsDir, storedFileName);

    // Write file to disk
    fs.writeFileSync(filePath, resumeContent);

    // Store reference in database
    const fileUrl = `/api/resumes/files/${storedFileName}`;
    
    await pool.query(
      `INSERT INTO candidate_resume_files (external_candidate_id, round_id, file_name, file_path, file_url, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (external_candidate_id) 
       DO UPDATE SET round_id = $2, file_name = $3, file_path = $4, file_url = $5, mime_type = $6, updated_at = NOW()
       RETURNING *`,
      [candidateId, roundId || null, fileName, filePath, fileUrl, 'application/pdf']
    );

    logger.info('Resume file uploaded', { candidateId, fileName: storedFileName, roundId });
    
    res.status(201).json({ 
      success: true, 
      fileUrl,
      message: 'Resume uploaded successfully' 
    });
  } catch (error) {
    logger.error('Error uploading resume file', { error });
    res.status(500).json({ error: 'Failed to upload resume' });
  }
});

/**
 * Serve resume file
 * GET /api/resumes/files/:filename
 * Access: Authenticated (HR, ADMIN, or assigned interviewer)
 */
router.get('/files/:filename', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filename } = req.params as { filename: string };
    const filePath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Resume file not found' });
      return;
    }

    // Set appropriate headers for PDF - allow embedding in iframe
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.removeHeader('X-Frame-Options'); // Remove frame restrictions for PDF viewing
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    logger.error('Error serving resume file', { error });
    res.status(500).json({ error: 'Failed to retrieve resume' });
  }
});

/**
 * Get resume file URL for a round
 * GET /api/resumes/round/:roundId
 * Access: Authenticated (Interviewer, HR, ADMIN)
 */
router.get('/round/:roundId', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params as { roundId: string };

    // First get the candidate ID from the round
    const roundResult = await pool.query(
      'SELECT external_candidate_id FROM interview_rounds WHERE id = $1',
      [roundId]
    );

    if (roundResult.rows.length === 0) {
      res.status(404).json({ error: 'Round not found' });
      return;
    }

    const candidateId = roundResult.rows[0].external_candidate_id;

    // Get the resume file for this candidate
    const resumeResult = await pool.query(
      'SELECT * FROM candidate_resume_files WHERE external_candidate_id = $1 ORDER BY updated_at DESC LIMIT 1',
      [candidateId]
    );

    if (resumeResult.rows.length === 0) {
      res.status(404).json({ error: 'No resume uploaded for this candidate' });
      return;
    }

    res.json(resumeResult.rows[0]);
  } catch (error) {
    logger.error('Error fetching resume for round', { error });
    res.status(500).json({ error: 'Failed to fetch resume' });
  }
});

export default router;
