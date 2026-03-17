import { NextApiRequest, NextApiResponse } from 'next';
import { getInterviewSessionByToken } from '@/lib/postgres-data-store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Token is required' 
      });
    }

    // Get the interview session by token
    const session = await getInterviewSessionByToken(token);
    
    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'Invalid interview token' 
      });
    }

    // Check if session is still active
    if (!session.is_active) {
      return res.status(400).json({ 
        success: false, 
        error: 'Interview session is no longer active' 
      });
    }

    // Check if interview is completed - if so, the link is expired and cannot be accessed again
    if (session.status === 'completed' || session.completed_at) {
      return res.status(400).json({ 
        success: false, 
        error: 'This interview has already been completed. The link is no longer accessible.' 
      });
    }

    // Allow access if session is in_progress but not completed
    // This allows candidates to retry after uploading a correct resume (if they previously uploaded wrong resume)
    // The session might have started_at set from a previous attempt, but we allow them to continue
    // as long as the interview hasn't been completed
    
    // Allow re-access to abandoned sessions if they haven't been started yet
    // This handles cases where the session was accidentally marked as abandoned (e.g., during resume upload)
    // Only block abandoned sessions that have actually started (started_at is set)
    if (session.status === 'abandoned' && session.started_at) {
      return res.status(400).json({ 
        success: false, 
        error: 'This interview session has been abandoned. Please contact the administrator to schedule a new interview.' 
      });
    }
    
    // If session is abandoned but not started, reset it to pending to allow retry
    if (session.status === 'abandoned' && !session.started_at) {
      const { updateInterviewSession } = await import('@/lib/postgres-data-store');
      await updateInterviewSession(session.id, { 
        status: 'pending',
        // Clear any abandoned timestamp from results_json if it exists
        results_json: session.results_json ? {
          ...session.results_json,
          abandonedAt: undefined
        } : null
      });
      // Refresh session data after update
      const updatedSession = await getInterviewSessionByToken(token);
      if (updatedSession) {
        Object.assign(session, updatedSession);
        console.log('Reset abandoned session to pending:', { token, sessionId: session.id });
      }
    }

    if (session.status === 'expired') {
      const { updateInterviewSession } = await import('@/lib/postgres-data-store');
      await updateInterviewSession(session.id, { status: 'pending' });
      const updatedSession = await getInterviewSessionByToken(token);
      if (updatedSession) {
        Object.assign(session, updatedSession);
        console.log('Reset expired session to pending (expiry disabled):', {
          token,
          sessionId: session.id
        });
      }
    }

    console.log('Session validated successfully (expiry disabled):', {
      token,
      status: session.status,
      is_active: session.is_active,
      started_at: session.started_at,
      completed_at: session.completed_at
    });

    // Get candidate's resume analysis if available
    let resumeAnalysis = null;
    if (session.candidate_id) {
      const { getCandidateById } = await import('@/lib/postgres-data-store');
      const candidate = await getCandidateById(session.candidate_id);
      if (candidate?.resume_analysis_json) {
        resumeAnalysis = candidate.resume_analysis_json;
      }
    }

    // Determine if session is proctored
    // Token-based sessions (email-based) are always proctored
    // Check if session has is_proctored field, otherwise default to true for token-based sessions
    const isProctored = (session as any).is_proctored !== undefined 
      ? (session as any).is_proctored 
      : true; // Default to true for token-based sessions

    // Return the session data with resume analysis
    // Flag this as an email-based interview (token-based sessions are always email-based)
    res.status(200).json({ 
      success: true,
      isEmailInterview: true, // Flag for frontend to restrict navigation
      session: {
        ...session,
        isProctored, // Include proctoring flag
        resumeAnalysis // Include resume analysis in session data
      }
    });

  } catch (error) {
    console.error('Token validation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}
