import { NextApiRequest, NextApiResponse } from 'next';
import { 
  getResumeById, 
  updateResume, 
  deleteResume 
} from '@/lib/postgres-data-store';
import { getAdminSession } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const user = await getAdminSession(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const { resumeId } = req.query;

    if (!resumeId || typeof resumeId !== 'string') {
      return res.status(400).json({ success: false, error: 'Resume ID is required' });
    }

    const id = parseInt(resumeId);

    switch (req.method) {
      case 'GET':
        const resume = await getResumeById(id);
        if (!resume) {
          return res.status(404).json({ success: false, error: 'Resume not found' });
        }
        res.status(200).json({ success: true, data: resume });
        break;

      case 'PUT':
        await updateResume(id, req.body);
        const updated = await getResumeById(id);
        res.status(200).json({ success: true, data: updated });
        break;

      case 'DELETE':
        await deleteResume(id);
        res.status(200).json({ success: true, message: 'Resume deleted successfully' });
        break;

      default:
        res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
        res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Resume API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ success: false, error: errorMessage });
  }
}

