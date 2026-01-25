import { NextApiRequest, NextApiResponse } from 'next';
import { 
  getResumeById, 
  updateResume 
} from '@/lib/postgres-data-store';
import { getAdminSession } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const user = await getAdminSession(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { resumeId } = req.query;
    const { analysis } = req.body;

    if (!resumeId || typeof resumeId !== 'string') {
      return res.status(400).json({ success: false, error: 'Resume ID is required' });
    }

    if (!analysis) {
      return res.status(400).json({ success: false, error: 'Analysis data is required' });
    }

    const id = parseInt(resumeId);
    const resume = await getResumeById(id);

    if (!resume) {
      return res.status(404).json({ success: false, error: 'Resume not found' });
    }

    // Update parsed_data with new analysis
    await updateResume(id, {
      parsed_data: {
        ...resume.parsed_data,
        ...analysis,
        updatedAt: new Date().toISOString()
      }
    });

    const updated = await getResumeById(id);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('Update resume analysis error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ success: false, error: errorMessage });
  }
}

