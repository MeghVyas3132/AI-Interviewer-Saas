import { Router, Response } from 'express';
import { pool } from '../db';
import { logger } from '../utils/logger';
import { authenticateJWT, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { SubmitVerdictSchema } from '../types/schemas';

const router = Router();

/**
 * Submit interviewer verdict for a round
 * POST /api/verdicts/:roundId
 * Access: EMPLOYEE (interviewer), HR, ADMIN
 */
router.post('/:roundId', authenticateJWT, requireRole('EMPLOYEE', 'HR', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params;
    const validationResult = SubmitVerdictSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({ 
        error: 'Validation failed', 
        details: validationResult.error.issues 
      });
      return;
    }

    const data = validationResult.data;

    // Check if round exists and is completed
    const roundResult = await pool.query(
      'SELECT * FROM interview_rounds WHERE id = $1',
      [roundId]
    );

    if (roundResult.rows.length === 0) {
      res.status(404).json({ error: 'Interview round not found' });
      return;
    }

    const round = roundResult.rows[0];

    // Verify interviewer
    if (req.user?.role === 'EMPLOYEE' && round.external_interviewer_id !== req.user.id) {
      res.status(403).json({ error: 'You are not the interviewer for this round' });
      return;
    }

    // Insert or update verdict
    const result = await pool.query(
      `INSERT INTO human_verdicts (
        round_id,
        external_interviewer_id,
        decision,
        overall_rating,
        criteria_scores,
        notes,
        ai_insights_helpful,
        ai_feedback_notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (round_id) 
      DO UPDATE SET
        decision = EXCLUDED.decision,
        overall_rating = EXCLUDED.overall_rating,
        criteria_scores = EXCLUDED.criteria_scores,
        notes = EXCLUDED.notes,
        ai_insights_helpful = EXCLUDED.ai_insights_helpful,
        ai_feedback_notes = EXCLUDED.ai_feedback_notes,
        submitted_at = NOW()
      RETURNING *`,
      [
        roundId,
        req.user?.id,
        data.decision,
        data.overallRating || null,
        data.criteriaScores ? JSON.stringify(data.criteriaScores) : null,
        data.notes || null,
        data.aiInsightsHelpful,
        data.aiFeedbackNotes || null,
      ]
    );

    logger.info('Verdict submitted', { roundId, decision: data.decision, interviewerId: req.user?.id });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error submitting verdict', { error });
    res.status(500).json({ error: 'Failed to submit verdict' });
  }
});

/**
 * Get verdict for a round
 * GET /api/verdicts/:roundId
 * Access: HR, ADMIN, assigned EMPLOYEE
 */
router.get('/:roundId', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params;

    const result = await pool.query(
      `SELECT v.*, r.external_candidate_id, r.round_type, r.round_number
       FROM human_verdicts v
       JOIN interview_rounds r ON v.round_id = r.id
       WHERE v.round_id = $1`,
      [roundId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Verdict not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching verdict', { error });
    res.status(500).json({ error: 'Failed to fetch verdict' });
  }
});

export default router;
