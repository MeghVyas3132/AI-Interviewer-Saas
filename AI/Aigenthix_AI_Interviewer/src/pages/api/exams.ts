import { NextApiRequest, NextApiResponse } from 'next';
import { query } from '@/lib/postgres';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const result = await query(
      'SELECT id, name, description FROM exams WHERE is_active = true ORDER BY created_at DESC'
    );
    
    res.status(200).json({ 
      success: true, 
      exams: result.rows 
    });
  } catch (error) {
    console.error('Error fetching exams:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch exams' 
    });
  }
}
