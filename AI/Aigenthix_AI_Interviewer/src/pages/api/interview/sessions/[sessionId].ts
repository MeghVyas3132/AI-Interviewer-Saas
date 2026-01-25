import { NextApiRequest, NextApiResponse } from 'next';
import { getInterviewSessionById, updateInterviewSession, getCandidateById } from '@/lib/postgres-data-store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', ['PUT']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Session ID is required' 
      });
    }

    // Get the interview session
    const session = await getInterviewSessionById(Number(sessionId));
    
    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'Interview session not found' 
      });
    }

    // Check if session is still active
    if (!session.is_active) {
      return res.status(400).json({ 
        success: false, 
        error: 'Interview session is no longer active' 
      });
    }

    // Update the session
    const updates = req.body;
    
    // Auto-update started_at if status changes to in_progress
    // Only set started_at if not already set (allows retry scenarios after resume re-upload)
    if (updates?.status === 'in_progress' && !session.started_at) {
      updates.started_at = new Date().toISOString();
    }
    
    await updateInterviewSession(Number(sessionId), updates);

    res.status(200).json({ 
      success: true, 
      message: 'Interview session updated successfully'
    });

  } catch (error) {
    console.error('Update interview session error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}

