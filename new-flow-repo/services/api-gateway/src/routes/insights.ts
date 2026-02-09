import { Router, Response } from 'express';
import { pool } from '../db';
import { logger } from '../utils/logger';
import { authenticateJWT, AuthenticatedRequest, requireRole } from '../middleware/auth';

const router = Router();

/**
 * Get live insights for an interview round
 * GET /api/insights/:roundId
 * Access: EMPLOYEE (interviewer), HR, ADMIN
 */
router.get('/:roundId', authenticateJWT, requireRole('EMPLOYEE', 'HR', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params;
    const { since } = req.query; // Optional: get insights since timestamp

    let query = `
      SELECT * FROM live_insights 
      WHERE round_id = $1
    `;
    const values: any[] = [roundId];

    if (since) {
      query += ` AND timestamp_ms > $2`;
      values.push(parseInt(since as string, 10));
    }

    query += ` ORDER BY timestamp_ms ASC`;

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching insights', { error });
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

/**
 * Get fraud alerts for an interview round
 * GET /api/insights/:roundId/alerts
 * Access: EMPLOYEE (interviewer), HR, ADMIN
 */
router.get('/:roundId/alerts', authenticateJWT, requireRole('EMPLOYEE', 'HR', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params;

    const result = await pool.query(
      `SELECT * FROM fraud_alerts 
       WHERE round_id = $1 
       ORDER BY detected_at_ms ASC`,
      [roundId]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching fraud alerts', { error });
    res.status(500).json({ error: 'Failed to fetch fraud alerts' });
  }
});

/**
 * Acknowledge a fraud alert
 * POST /api/insights/alerts/:alertId/acknowledge
 * Access: EMPLOYEE (interviewer), HR, ADMIN
 */
router.post('/alerts/:alertId/acknowledge', authenticateJWT, requireRole('EMPLOYEE', 'HR', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { alertId } = req.params;
    const { falsePositive } = req.body;

    const result = await pool.query(
      `UPDATE fraud_alerts 
       SET acknowledged = true,
           acknowledged_by = $1,
           acknowledged_at = NOW(),
           false_positive_marked = $2
       WHERE id = $3
       RETURNING *`,
      [req.user?.id, falsePositive === true, alertId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    logger.info('Fraud alert acknowledged', { alertId, acknowledgedBy: req.user?.id, falsePositive });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error acknowledging alert', { error });
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

/**
 * Get interview summary (for HR)
 * GET /api/insights/:roundId/summary
 * Access: HR, ADMIN
 */
router.get('/:roundId/summary', authenticateJWT, requireRole('HR', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params;

    // Get or generate summary
    let result = await pool.query(
      'SELECT * FROM interview_summaries WHERE round_id = $1',
      [roundId]
    );

    if (result.rows.length === 0) {
      // Generate summary if not exists
      const summary = await generateInterviewSummary(roundId);
      res.json(summary);
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching interview summary', { error });
    res.status(500).json({ error: 'Failed to fetch interview summary' });
  }
});

/**
 * Generate interview summary from insights
 */
async function generateInterviewSummary(roundId: string) {
  // Get all insights for the round
  const insightsResult = await pool.query(
    'SELECT * FROM live_insights WHERE round_id = $1',
    [roundId]
  );

  const insights = insightsResult.rows;

  // Calculate aggregated metrics
  const speechConfidenceInsights = insights.filter(i => i.insight_type === 'SPEECH_CONFIDENCE');
  const avgSpeechConfidence = speechConfidenceInsights.length > 0
    ? speechConfidenceInsights.reduce((sum, i) => sum + (i.value.score || 0), 0) / speechConfidenceInsights.length
    : null;

  const hesitationCount = insights.filter(i => i.insight_type === 'HESITATION').length;

  const responseLatencyInsights = insights.filter(i => i.insight_type === 'RESPONSE_LATENCY');
  const avgResponseLatency = responseLatencyInsights.length > 0
    ? responseLatencyInsights.reduce((sum, i) => sum + (i.value.latency_ms || 0), 0) / responseLatencyInsights.length
    : null;

  // Get fraud alerts
  const alertsResult = await pool.query(
    'SELECT * FROM fraud_alerts WHERE round_id = $1',
    [roundId]
  );

  const fraudAlertsCount = alertsResult.rows.length;
  const criticalAlertsCount = alertsResult.rows.filter(a => a.severity === 'CRITICAL').length;

  // Get resume contradictions
  const contradictions = insights.filter(i => i.insight_type === 'RESUME_CONTRADICTION');

  // Generate key observations
  const keyObservations: string[] = [];
  
  if (avgSpeechConfidence !== null) {
    if (avgSpeechConfidence > 0.7) {
      keyObservations.push('Demonstrated strong verbal confidence');
    } else if (avgSpeechConfidence < 0.4) {
      keyObservations.push('Showed signs of low confidence in responses');
    }
  }

  if (hesitationCount > 10) {
    keyObservations.push('Frequent hesitations detected during responses');
  }

  if (fraudAlertsCount > 0) {
    keyObservations.push(`${fraudAlertsCount} potential integrity concern(s) flagged`);
  }

  if (contradictions.length > 0) {
    keyObservations.push(`${contradictions.length} potential resume discrepancy(ies) detected`);
  }

  // Insert summary
  const summaryResult = await pool.query(
    `INSERT INTO interview_summaries (
      round_id,
      avg_speech_confidence,
      total_hesitations,
      avg_response_latency_ms,
      fraud_alerts_count,
      critical_alerts_count,
      resume_contradictions_found,
      contradiction_details,
      key_observations
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (round_id) DO UPDATE SET
      avg_speech_confidence = EXCLUDED.avg_speech_confidence,
      total_hesitations = EXCLUDED.total_hesitations,
      avg_response_latency_ms = EXCLUDED.avg_response_latency_ms,
      fraud_alerts_count = EXCLUDED.fraud_alerts_count,
      critical_alerts_count = EXCLUDED.critical_alerts_count,
      resume_contradictions_found = EXCLUDED.resume_contradictions_found,
      contradiction_details = EXCLUDED.contradiction_details,
      key_observations = EXCLUDED.key_observations,
      generated_at = NOW()
    RETURNING *`,
    [
      roundId,
      avgSpeechConfidence,
      hesitationCount,
      avgResponseLatency ? Math.round(avgResponseLatency) : null,
      fraudAlertsCount,
      criticalAlertsCount,
      contradictions.length,
      JSON.stringify(contradictions.map(c => c.value)),
      JSON.stringify(keyObservations),
    ]
  );

  return summaryResult.rows[0];
}

export default router;
