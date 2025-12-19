import { NextApiRequest, NextApiResponse } from 'next';
import { 
  getCandidateById,
  restoreCandidate
} from '@/lib/postgres-data-store';
import { getAdminSession } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const user = await getAdminSession(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ success: false, error: 'Candidate ID is required' });
    }

    const candidateId = parseInt(id);

    // Check if candidate exists (including soft-deleted)
    // Use a direct query since getCandidateById filters by is_active
    const { query } = await import('@/lib/postgres');
    const checkResult = await query(
      'SELECT * FROM candidates WHERE candidate_id = $1',
      [candidateId]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Candidate not found' });
    }

    // Restore the candidate
    await restoreCandidate(candidateId);

    const restoredCandidate = await getCandidateById(candidateId);
    res.status(200).json({ 
      success: true, 
      message: 'Candidate restored successfully',
      data: restoredCandidate
    });

  } catch (error) {
    console.error('Restore candidate error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

