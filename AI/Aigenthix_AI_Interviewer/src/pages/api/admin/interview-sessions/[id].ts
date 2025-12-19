import { NextApiRequest, NextApiResponse } from 'next';
import { 
  getInterviewSessionById, 
  updateInterviewSession, 
  deleteInterviewSession,
  getCandidateById,
  getExamById,
  getSubcategoryById
} from '@/lib/postgres-data-store';
import { emailService } from '@/lib/email-service';
import { getAdminSession } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const user = await getAdminSession(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ success: false, error: 'Session ID is required' });
    }

    const sessionId = parseInt(id);

    switch (req.method) {
      case 'GET':
        const session = await getInterviewSessionById(sessionId);
        
        if (!session) {
          return res.status(404).json({ success: false, error: 'Session not found' });
        }

        // Enrich with related data
        const candidate = await getCandidateById(session.candidate_id);
        const exam = session.exam_id ? await getExamById(session.exam_id) : null;
        const subcategory = session.subcategory_id ? await getSubcategoryById(session.subcategory_id) : null;

        res.status(200).json({ 
          success: true, 
          data: {
            ...session,
            candidate_name: candidate ? `${candidate.first_name} ${candidate.last_name}` : 'Unknown',
            candidate_email: candidate?.email || '',
            exam_name: exam?.name || null,
            subcategory_name: subcategory?.name || null
          }
        });
        break;

      case 'PUT':
        const updates = req.body;
        
        // Validate status if provided
        if (updates.status && !['pending', 'in_progress', 'completed', 'expired', 'abandoned'].includes(updates.status)) {
          return res.status(400).json({ 
            success: false, 
            error: 'Invalid status. Must be: pending, in_progress, completed, expired, or abandoned' 
          });
        }

        // Update timestamps based on status
        if (updates.status === 'in_progress' && !updates.started_at) {
          updates.started_at = new Date().toISOString();
        }
        if (updates.status === 'completed' && !updates.completed_at) {
          updates.completed_at = new Date().toISOString();
        }
        if (updates.status === 'expired') {
          // Ensure expires_at is in the past
          const session = await getInterviewSessionById(sessionId);
          if (session && new Date(session.expires_at) > new Date()) {
            updates.expires_at = new Date().toISOString();
          }
        }

        await updateInterviewSession(sessionId, updates);
        
        const updatedSession = await getInterviewSessionById(sessionId);
        res.status(200).json({ success: true, data: updatedSession });
        break;

      case 'DELETE':
        await deleteInterviewSession(sessionId);
        res.status(200).json({ success: true, message: 'Session deleted successfully' });
        break;

      default:
        res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
        res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Interview session API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

