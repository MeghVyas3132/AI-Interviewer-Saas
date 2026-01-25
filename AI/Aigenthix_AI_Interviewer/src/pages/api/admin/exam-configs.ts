import type { NextApiRequest, NextApiResponse } from 'next';

// This file will route to either postgres or local based on environment
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check if we should use PostgreSQL or local storage
    const usePostgres = process.env.USE_POSTGRES !== 'false';
    
    if (usePostgres) {
      const { default: postgresHandler } = await import('./exam-configs-postgres');
      return postgresHandler(req, res);
    } else {
      const { default: localHandler } = await import('./exam-configs-local');
      return localHandler(req, res);
    }
  } catch (error: any) {
    console.error('Exam configs router error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}

