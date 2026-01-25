import { NextApiRequest, NextApiResponse } from 'next';
import { query } from '@/lib/postgres';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        // 1. Total Interviews
        const totalResult = await query('SELECT COUNT(*) FROM interview_sessions WHERE is_active = true');
        const totalInterviews = parseInt(totalResult.rows[0].count);

        // 2. Average Score
        const avgResult = await query(`
      SELECT AVG(CAST(results_json->>'overallScore' AS FLOAT)) as avg_score 
      FROM interview_sessions 
      WHERE status = 'completed' AND results_json IS NOT NULL AND is_active = true
    `);
        const averageScore = parseFloat(avgResult.rows[0].avg_score || '0');

        // 3. Completion Rate
        const completedResult = await query("SELECT COUNT(*) FROM interview_sessions WHERE status = 'completed' AND is_active = true");
        const completedCount = parseInt(completedResult.rows[0].count);
        const completionRate = totalInterviews > 0 ? (completedCount / totalInterviews) * 100 : 0;

        // 4. Top Performers
        const topResult = await query(`
      SELECT 
        candidate_id as "candidateId", 
        CAST(results_json->>'overallScore' AS FLOAT) as score, 
        completed_at as date
      FROM interview_sessions
      WHERE status = 'completed' AND results_json IS NOT NULL AND is_active = true
      ORDER BY score DESC
      LIMIT 10
    `);

        res.status(200).json({
            success: true,
            metrics: {
                totalInterviews,
                averageScore: Math.round(averageScore * 10) / 10,
                completionRate: Math.round(completionRate * 10) / 10,
                topPerformers: topResult.rows.map(row => ({
                    ...row,
                    date: row.date ? new Date(row.date).toISOString().split('T')[0] : 'N/A'
                }))
            }
        });
    } catch (error) {
        console.error('Error fetching analytics metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch analytics metrics'
        });
    }
}
