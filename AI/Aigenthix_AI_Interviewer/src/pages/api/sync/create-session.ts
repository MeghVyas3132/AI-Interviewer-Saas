/**
 * Sync API: Create Interview Session from Main Backend
 * 
 * This endpoint allows the main backend (FastAPI) to create interview sessions
 * in the AI service database when generating AI interview tokens.
 * 
 * Since both services use the same database, this primarily creates the 
 * interview_sessions record that the AI service expects to find when
 * validating tokens.
 * 
 * Request body:
 * {
 *   "token": "secure-token-string",
 *   "candidate_name": "John Doe",
 *   "candidate_email": "john@example.com",
 *   "job_role": "Full Stack Engineer",
 *   "questions": [{"id": "uuid", "text": "question text"}],
 *   "scheduled_time": "ISO datetime (optional)",
 *   "scheduled_end_time": "ISO datetime (optional)",
 *   "expires_at": "ISO datetime",
 *   "api_key": "shared secret for authentication"
 * }
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { query } from '@/lib/postgres';

// Simple API key authentication for backend-to-backend communication
const SYNC_API_KEY = process.env.SYNC_API_KEY || 'ai-interviewer-sync-key-2024';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Verify API key
    const apiKey = req.headers['x-api-key'] || req.body.api_key;
    if (apiKey !== SYNC_API_KEY) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    const {
      token,
      candidate_name,
      candidate_email,
      job_role,
      questions,
      scheduled_time,
      scheduled_end_time,
      expires_at,
    } = req.body;

    // Validate required fields
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required' });
    }

    // Check if session with this token already exists
    const existingResult = await query(
      'SELECT id FROM interview_sessions WHERE token = $1',
      [token]
    );

    if (existingResult.rows.length > 0) {
      // Session already exists, update it
      await query(
        `UPDATE interview_sessions SET
          questions_generated = $1,
          scheduled_time = $2,
          scheduled_end_time = $3,
          expires_at = $4,
          updated_at = NOW()
        WHERE token = $5`,
        [
          questions ? JSON.stringify(questions) : null,
          scheduled_time || null,
          scheduled_end_time || null,
          expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          token
        ]
      );

      return res.status(200).json({
        success: true,
        message: 'Interview session updated',
        session_id: existingResult.rows[0].id
      });
    }

    // First, check if candidate exists by email (candidates table uses UUID 'id')
    // We receive the candidate_id from the main backend directly
    let candidateId: string | null = null;
    
    if (candidate_email) {
      const candidateResult = await query(
        'SELECT id FROM candidates WHERE email = $1',
        [candidate_email]
      );

      if (candidateResult.rows.length > 0) {
        candidateId = candidateResult.rows[0].id;
      }
      // If candidate doesn't exist in AI service's view, we'll create session without candidate_id
      // The main backend has already created the candidate in the shared database
    }

    // Check if job position exists or create it
    // Note: job_positions table uses position_id as primary key
    let jobRoleId: number | null = null;
    
    if (job_role) {
      const jobResult = await query(
        'SELECT position_id FROM job_positions WHERE title = $1',
        [job_role]
      );

      if (jobResult.rows.length > 0) {
        jobRoleId = jobResult.rows[0].position_id;
      } else {
        // Create job position
        const newJobResult = await query(
          `INSERT INTO job_positions (title, description, status, created_at, updated_at)
           VALUES ($1, $2, 'active', NOW(), NOW())
           RETURNING position_id`,
          [job_role, `Auto-created for ${job_role} interviews`]
        );
        jobRoleId = newJobResult.rows[0].position_id;
      }
    }

    // Create the interview session
    const sessionResult = await query(
      `INSERT INTO interview_sessions (
        candidate_id,
        job_role_id,
        token,
        status,
        scheduled_time,
        scheduled_end_time,
        expires_at,
        questions_generated,
        interview_mode,
        created_at,
        updated_at,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), true)
      RETURNING id, token`,
      [
        candidateId,
        jobRoleId,
        token,
        'pending',
        scheduled_time || null,
        scheduled_end_time || null,
        expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        questions ? JSON.stringify(questions) : null,
        'voice' // Default to voice mode
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Interview session created',
      session_id: sessionResult.rows[0].id,
      token: sessionResult.rows[0].token,
      interview_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/interview/${token}`
    });

  } catch (error) {
    console.error('Error creating synced session:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}
