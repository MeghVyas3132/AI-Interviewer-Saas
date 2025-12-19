import { NextApiRequest, NextApiResponse } from 'next';
import { query } from '@/lib/postgres';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { sessionId } = req.query;

    if (!sessionId) {
        return res.status(400).json({ success: false, error: 'Session ID is required' });
    }

    try {
        const result = await query(
            'SELECT results_json FROM interview_sessions WHERE (id::text = $1 OR token = $1) AND is_active = true',
            [sessionId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Interview session not found' });
        }

        const resultsJson = result.rows[0].results_json;
        const transcript = resultsJson?.transcript || '';

        // The frontend expects the data field or direct transcript field
        res.status(200).json({
            success: true,
            data: {
                transcript
            }
        });
    } catch (error) {
        console.error('Error fetching transcript:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch interview transcript'
        });
    }
}
