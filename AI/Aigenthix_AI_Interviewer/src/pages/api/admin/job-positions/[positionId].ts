import { NextApiRequest, NextApiResponse } from 'next';
import { 
  getJobPositionById, 
  updateJobPosition, 
  deleteJobPosition 
} from '@/lib/postgres-data-store';
import { getAdminSession } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const user = await getAdminSession(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const { positionId } = req.query;

    if (!positionId || typeof positionId !== 'string') {
      return res.status(400).json({ success: false, error: 'Position ID is required' });
    }

    const id = parseInt(positionId);

    switch (req.method) {
      case 'GET':
        const jobPosition = await getJobPositionById(id);
        if (!jobPosition) {
          return res.status(404).json({ success: false, error: 'Job position not found' });
        }
        res.status(200).json({ success: true, data: jobPosition });
        break;

      case 'PUT':
        await updateJobPosition(id, req.body);
        const updated = await getJobPositionById(id);
        res.status(200).json({ success: true, data: updated });
        break;

      case 'DELETE':
        await deleteJobPosition(id);
        res.status(200).json({ success: true, message: 'Job position deleted successfully' });
        break;

      default:
        res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
        res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Job position API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ success: false, error: errorMessage });
  }
}

