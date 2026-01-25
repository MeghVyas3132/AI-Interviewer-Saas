import { NextApiRequest, NextApiResponse } from 'next';
import { 
  getCandidateById, 
  updateCandidate, 
  deleteCandidate,
  restoreCandidate
} from '@/lib/postgres-data-store';
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
      return res.status(400).json({ success: false, error: 'Candidate ID is required' });
    }

    const candidateId = parseInt(id);

    switch (req.method) {
      case 'GET':
        const candidate = await getCandidateById(candidateId);
        
        if (!candidate) {
          return res.status(404).json({ success: false, error: 'Candidate not found' });
        }

        res.status(200).json({ success: true, data: candidate });
        break;

      case 'PUT':
        const updates = req.body;
        await updateCandidate(candidateId, updates);
        
        const updatedCandidate = await getCandidateById(candidateId);
        res.status(200).json({ success: true, data: updatedCandidate });
        break;

      case 'DELETE':
        await deleteCandidate(candidateId);
        res.status(200).json({ success: true, message: 'Candidate deleted successfully' });
        break;

      default:
        res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
        res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Candidate API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

