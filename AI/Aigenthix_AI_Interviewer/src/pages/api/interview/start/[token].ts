import { NextApiRequest, NextApiResponse } from 'next';
import { getInterviewSessionByToken, updateInterviewSession } from '@/lib/postgres-data-store';
import { checkRateLimit } from '@/lib/rate-limiter';
import { determineResumeReadiness } from '@/lib/interview-readiness';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apply rate limiting
  if (!checkRateLimit.interview(req, res)) {
    return; // Response already sent with 429 status
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
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

    const session = await getInterviewSessionByToken(token);
    
    if (!session) {
      console.warn('[start_attempt_failed_reason]', {
        event: 'start_attempt_failed_reason',
        token: token.substring(0, 8) + '...',
        reason: 'invalid_token',
      });
      return res.status(404).json({ 
        success: false, 
        error: 'Invalid interview token' 
      });
    }

    if (!session.is_active) {
      return res.status(400).json({ 
        success: false, 
        error: 'Interview session is no longer active' 
      });
    }

    if (session.status === 'expired') {
      await updateInterviewSession(session.id, { status: 'pending' });
    }

    if (session.status === 'completed') {
      console.warn('[start_attempt_failed_reason]', {
        event: 'start_attempt_failed_reason',
        token,
        sessionId: session.id,
        reason: 'already_completed',
      });
      return res.status(400).json({ 
        success: false, 
        error: 'Interview session has already been completed' 
      });
    }

    // Check if interview has already been started - one-time use link
    if (session.started_at) {
      console.log('[start_attempt_success]', {
        event: 'start_attempt_success',
        token,
        sessionId: session.id,
        status: 'already_started',
        startedAt: session.started_at,
      });
      return res.status(200).json({
        success: true,
        status: 'already_started',
        message: 'Interview already started. Redirecting to interview.',
        session,
      });
    }

    const readiness = await determineResumeReadiness(token, session);
    if (!readiness.ready) {
      const responsePayload = {
        success: false,
        status: readiness.status.state,
        message: readiness.status.message,
        resumeStatus: readiness.status,
      };

      console.warn('[start_attempt_failed_reason]', {
        event: 'start_attempt_failed_reason',
        token,
        sessionId: session.id,
        reason: readiness.status.state,
        resumeStatus: readiness.status,
      });

      // Map readiness states to appropriate HTTP status codes
      let statusCode: number;
      switch (readiness.status.state) {
        case 'missing':
          // Client-side invalid state: resume not uploaded
          statusCode = 400;
          break;
        case 'processing':
          // Temporary/unready processing state that is retryable
          statusCode = 503;
          break;
        case 'error':
          // Internal server error during processing
          statusCode = 500;
          break;
        default:
          // Fallback for unknown states
          statusCode = 500;
      }
      return res.status(statusCode).json(responsePayload);
    }

    // Update session to in_progress
    await updateInterviewSession(session.id, {
      status: 'in_progress',
      started_at: new Date().toISOString()
    });

    const updatedSession = await getInterviewSessionByToken(token);
    console.log('[start_attempt_success]', {
      event: 'start_attempt_success',
      token,
      sessionId: session.id,
      status: 'started',
      startedAt: updatedSession?.started_at,
    });
    res.status(200).json({ 
      success: true, 
      status: 'started',
      message: 'Interview session started',
      session: updatedSession
    });

  } catch (error) {
    console.error('Start interview error:', error);
    console.warn('[start_attempt_failed_reason]', {
      event: 'start_attempt_failed_reason',
      reason: 'internal_error',
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}
