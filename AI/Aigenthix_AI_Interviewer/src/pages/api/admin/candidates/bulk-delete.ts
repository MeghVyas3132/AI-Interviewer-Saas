import { NextApiRequest, NextApiResponse } from 'next';
import { 
  deleteCandidate,
  getCandidateById
} from '@/lib/postgres-data-store';
import { getAdminSession } from '@/lib/auth';

interface BulkDeleteResult {
  success: number;
  failed: number;
  errors: Array<{ candidateId: number; error: string }>;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const user = await getAdminSession(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.setHeader('Allow', ['POST']).status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const { candidateIds } = req.body;
    
    if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Candidate IDs array is required' 
      });
    }

    const result: BulkDeleteResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    // Process candidates in batches
    const batchSize = 50;
    for (let i = 0; i < candidateIds.length; i += batchSize) {
      const batch = candidateIds.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (candidateId: number) => {
          try {
            // Verify candidate exists
            const candidate = await getCandidateById(candidateId);
            if (!candidate) {
              result.failed++;
              result.errors.push({
                candidateId,
                error: 'Candidate not found'
              });
              return;
            }

            // Delete candidate (soft delete)
            await deleteCandidate(candidateId);
            result.success++;
          } catch (error) {
            result.failed++;
            result.errors.push({
              candidateId,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        })
      );
    }

    res.status(200).json({
      success: true,
      data: {
        total: candidateIds.length,
        ...result
      }
    });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}


