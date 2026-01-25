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

    // Check scheduled time window if scheduled_time is set
    const currentTime = new Date().getTime();
    
    // IMPORTANT: If session has scheduled_end_time, check if we're within the window
    // and reset status from 'expired' if we are (handles cases where status was incorrectly set)
    if (session.scheduled_end_time) {
      const scheduledEndTime = new Date(session.scheduled_end_time).getTime();
      const scheduledStartTime = session.scheduled_time ? new Date(session.scheduled_time).getTime() : null;
      
      // If we're within the scheduled window but status is 'expired', reset it
      const isWithinWindow = (!scheduledStartTime || currentTime >= scheduledStartTime) && currentTime <= scheduledEndTime;
      
      if (isWithinWindow && session.status === 'expired') {
        const { updateInterviewSession } = await import('@/lib/postgres-data-store');
        await updateInterviewSession(session.id, { status: 'pending' });
        // Refresh session data after update
        const updatedSession = await getInterviewSessionByToken(token);
        if (updatedSession) {
          Object.assign(session, updatedSession);
          console.log('Reset expired session to pending - within scheduled window:', {
            token,
            sessionId: session.id,
            scheduledStartTime: scheduledStartTime ? new Date(scheduledStartTime).toISOString() : null,
            scheduledEndTime: new Date(scheduledEndTime).toISOString(),
            currentTime: new Date().toISOString()
          });
        }
      }
    }
    
    if (session.scheduled_time) {
      const scheduledStartTime = new Date(session.scheduled_time).getTime();
      
      // Check if interview window hasn't started yet
      if (currentTime < scheduledStartTime) {
        const timeUntilStart = scheduledStartTime - currentTime;
        const hoursUntilStart = Math.floor(timeUntilStart / (1000 * 60 * 60));
        const minutesUntilStart = Math.floor((timeUntilStart % (1000 * 60 * 60)) / (1000 * 60));
        
        let timeMessage = '';
        if (hoursUntilStart > 0) {
          timeMessage = `in ${hoursUntilStart} hour${hoursUntilStart > 1 ? 's' : ''}`;
          if (minutesUntilStart > 0) {
            timeMessage += ` and ${minutesUntilStart} minute${minutesUntilStart > 1 ? 's' : ''}`;
          }
        } else if (minutesUntilStart > 0) {
          timeMessage = `in ${minutesUntilStart} minute${minutesUntilStart > 1 ? 's' : ''}`;
        } else {
          timeMessage = 'soon';
        }
        
        return res.status(400).json({ 
          success: false, 
          error: `This interview is not yet available. It will be available ${timeMessage}.`,
          scheduledTime: session.scheduled_time,
          scheduledEndTime: session.scheduled_end_time || null
        });
      }
    }
    
    // Determine the actual expiry time: use scheduled_end_time if set, otherwise expires_at
    // IMPORTANT: If scheduled_end_time exists, it takes precedence over expires_at
    // This ensures sessions with scheduled windows work correctly even if expires_at is outdated
    let actualExpiryTime: number;
    let expirySource: 'scheduled_end_time' | 'expires_at';
    
    if (session.scheduled_end_time) {
      // Use scheduled_end_time as the definitive expiry when it exists
      const scheduledEndTime = new Date(session.scheduled_end_time);
      if (isNaN(scheduledEndTime.getTime())) {
        console.error('Invalid scheduled_end_time:', session.scheduled_end_time);
        // Fall back to expires_at if scheduled_end_time is invalid
        actualExpiryTime = new Date(session.expires_at).getTime();
        expirySource = 'expires_at';
      } else {
        actualExpiryTime = scheduledEndTime.getTime();
        expirySource = 'scheduled_end_time';
      }
    } else {
      // Fall back to expires_at only if no scheduled_end_time
      actualExpiryTime = new Date(session.expires_at).getTime();
      expirySource = 'expires_at';
    }

    // Check if session has expired
    // Allow a small buffer (5 minutes) to account for timezone differences and clock skew
    const expiryBuffer = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    // Check if we're past the actual expiry time (with buffer)
    const isPastExpiry = actualExpiryTime + expiryBuffer < currentTime;
    
    if (isPastExpiry) {
      // Only auto-update status to expired if:
      // 1. Status is not already 'expired'
      // 2. We're actually past the expiry (not just within buffer)
      // 3. We're NOT within a scheduled window (scheduled_end_time takes precedence)
      const shouldAutoExpire = session.status !== 'expired' && 
                               actualExpiryTime < currentTime &&
                               expirySource === 'expires_at'; // Only auto-expire if using expires_at, not scheduled_end_time
      
      if (shouldAutoExpire) {
        const { updateInterviewSession } = await import('@/lib/postgres-data-store');
        await updateInterviewSession(session.id, { status: 'expired' });
        console.log('Auto-updated session status to expired:', {
          token,
          sessionId: session.id,
          expires_at: session.expires_at,
          currentTime: new Date().toISOString()
        });
      }
      
      console.log('Session expired:', {
        token,
        expires_at: session.expires_at,
        scheduled_end_time: session.scheduled_end_time,
        scheduled_time: session.scheduled_time,
        actualExpiryTime: new Date(actualExpiryTime).toISOString(),
        expirySource,
        currentTime: new Date().toISOString(),
        timeDifference: (currentTime - actualExpiryTime) / 1000 / 60, // minutes
        status: session.status,
        isPastExpiry,
        shouldAutoExpire
      });
      
      const errorMessage = expirySource === 'scheduled_end_time'
        ? 'The interview window has ended. Please contact the administrator to schedule a new interview.'
        : 'Interview session has expired';
      
      return res.status(400).json({ 
        success: false, 
        error: errorMessage,
        scheduledTime: session.scheduled_time,
        scheduledEndTime: session.scheduled_end_time
      });
    }
    
    // Log session validation for debugging
    console.log('Session validated successfully:', {
      token,
      status: session.status,
      expires_at: session.expires_at,
      scheduled_end_time: session.scheduled_end_time,
      scheduled_time: session.scheduled_time,
      actualExpiryTime: new Date(actualExpiryTime).toISOString(),
      expirySource,
      timeUntilExpiry: (actualExpiryTime - currentTime) / 1000 / 60, // minutes until expiry
      currentTime: new Date().toISOString(),
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

