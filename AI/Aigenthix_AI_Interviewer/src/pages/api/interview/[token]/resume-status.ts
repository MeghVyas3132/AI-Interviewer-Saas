import { NextApiRequest, NextApiResponse } from 'next';
import { determineResumeReadiness } from '@/lib/interview-readiness';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: 'Interview token is required' });
    }

    const readiness = await determineResumeReadiness(token);

    // Prevent caching to ensure fresh status checks
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).json({
      success: true,
      data: {
        ready: readiness.ready,
        state: readiness.status?.state ?? null,
        message: readiness.status?.message ?? null,
        resumeId: readiness.status?.resumeId ?? null,
        fileName: readiness.status?.fileName ?? null,
        uploadedAt: readiness.status?.uploadedAt ?? null,
        processedAt: readiness.status?.processedAt ?? null,
        source: readiness.status?.source ?? null,
        error: readiness.status?.error ?? null,
      }
    });

  } catch (error) {
    console.error('Resume status check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check resume status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

