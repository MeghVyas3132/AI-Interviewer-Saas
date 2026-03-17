import { NextApiRequest, NextApiResponse } from 'next';
import { getInterviewSessionByToken, updateInterviewSession } from '@/lib/postgres-data-store';

/**
 * API endpoint to log proctoring events (non-blocking)
 * Called by the frontend when proctoring events occur (Escape key, tab switch, etc.)
 * This is for audit purposes and does not block the interview flow
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Accept POST requests only
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Parse body - can be from sendBeacon (Blob) or regular fetch (JSON)
    let body: any = {};
    
    if (req.body) {
      if (typeof req.body === 'string') {
        try {
          body = JSON.parse(req.body);
        } catch {
          // If parsing fails, body might already be an object
          body = req.body;
        }
      } else {
        body = req.body;
      }
    }

    const { token, event, reason, detail, timestamp } = body;

    if (!token || !event) {
      // Return success even if data is missing - logging is non-critical
      return res.status(200).json({ success: true, message: 'Event logged (incomplete data)' });
    }

    // Get session to verify token validity
    const session = await getInterviewSessionByToken(token);
    if (!session) {
      // Return success even if session not found - logging is non-critical
      return res.status(200).json({ success: true, message: 'Event logged (session not found)' });
    }

    // Log the event (in a real implementation, you might want to store this in a separate audit table)
    const eventTimestamp = timestamp || new Date().toISOString();

    console.log('[Proctor Event]', {
      token,
      sessionId: session.id,
      event,
      reason,
      detail,
      timestamp: eventTimestamp,
    });

    // Store in results_json for audit trail (best-effort)
    try {
      const rawResults = (session as any).results_json;
      const resultsJson = typeof rawResults === 'string'
        ? JSON.parse(rawResults || '{}')
        : (rawResults || {});

      const existingEvents = Array.isArray(resultsJson.proctoringEvents)
        ? resultsJson.proctoringEvents
        : [];

      const nextEvents = [
        ...existingEvents,
        { event, reason, detail, at: eventTimestamp },
      ];

      const proctoringSummary = {
        totalEvents: nextEvents.length,
        tabSwitches: nextEvents.filter(ev => ev.event === 'tab_switch').length,
        multipleFaces: nextEvents.filter(ev => ev.event === 'multiple_faces').length,
        profanityDetected: nextEvents.some(ev => ev.event === 'profanity_detected'),
      };

      await updateInterviewSession(session.id, {
        results_json: {
          ...resultsJson,
          proctoringEvents: nextEvents,
          proctoringSummary,
        },
      });
    } catch (persistError) {
      console.warn('Failed to persist proctor event to results_json:', persistError);
    }

    // Return success immediately (non-blocking)
    res.status(200).json({ 
      success: true, 
      message: 'Event logged',
      event: {
        token,
        event,
        reason,
        detail,
        timestamp: eventTimestamp,
      }
    });

  } catch (error) {
    // Log error but don't fail the request - logging is non-critical
    console.error('Error logging proctor event:', error);
    res.status(200).json({ 
      success: true, 
      message: 'Event logged (with errors)' 
    });
  }
}

