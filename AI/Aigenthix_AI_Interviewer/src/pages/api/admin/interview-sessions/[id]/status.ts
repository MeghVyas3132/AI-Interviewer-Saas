import { NextApiRequest, NextApiResponse } from 'next';
import { 
  getInterviewSessionById,
  updateInterviewSession
} from '@/lib/postgres-data-store';
import { getAdminSession } from '@/lib/auth';

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
    const { status, expiresAt } = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ success: false, error: 'Session ID is required' });
    }

    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    const validStatuses = ['pending', 'in_progress', 'completed', 'expired', 'abandoned'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }

    const sessionId = parseInt(id);
    const session = await getInterviewSessionById(sessionId);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const updates: any = { status };

    // Update timestamps based on status
    if (status === 'in_progress' && !session.started_at) {
      updates.started_at = new Date().toISOString();
    }
    if (status === 'completed' && !session.completed_at) {
      updates.completed_at = new Date().toISOString();
    }
    if (status === 'expired') {
      updates.expires_at = expiresAt || new Date().toISOString();
    }

    // Allow extending expiry
    if (expiresAt && status !== 'expired') {
      updates.expires_at = expiresAt;
    }

    await updateInterviewSession(sessionId, updates);

    const updatedSession = await getInterviewSessionById(sessionId);
    res.status(200).json({ 
      success: true, 
      message: `Session status updated to ${status}`,
      data: updatedSession
    });

  } catch (error) {
    console.error('Update session status error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

