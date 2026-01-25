import { NextApiRequest, NextApiResponse } from 'next';
import { 
  getJobPositions, 
  createJobPosition, 
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
    switch (req.method) {
      case 'GET':
        const jobPositions = await getJobPositions();
        res.status(200).json({ success: true, data: jobPositions });
        break;

      case 'POST':
        const newJobPosition = await createJobPosition(req.body);
        res.status(201).json({ success: true, data: newJobPosition });
        break;

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Job positions API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ success: false, error: errorMessage });
  }
}

