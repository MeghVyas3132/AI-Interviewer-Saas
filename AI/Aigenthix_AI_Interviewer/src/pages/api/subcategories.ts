import { NextApiRequest, NextApiResponse } from 'next';
import { query } from '@/lib/postgres';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    let queryText = 'SELECT id, name, description FROM subcategories WHERE is_active = true ORDER BY created_at DESC';
    const result = await query(queryText, []);
    res.status(200).json({ 
      success: true, 
      subcategories: result.rows 
    });
  } catch (error) {
    console.error('Error fetching subcategories:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch subcategories' 
    });
  }
}
