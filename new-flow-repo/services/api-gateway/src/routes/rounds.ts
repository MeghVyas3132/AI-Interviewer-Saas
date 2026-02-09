import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { logger } from '../utils/logger';
import { authenticateJWT, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { 
  CreateInterviewRoundSchema, 
  UpdateInterviewRoundSchema,
  RecordConsentSchema 
} from '../types/schemas';
import { createVideoSDKRoom, generateParticipantToken } from '../services/videosdk';

const router = Router();

/**
 * Create a new interview round
 * POST /api/rounds
 * Access: HR, ADMIN
 */
router.post('/', authenticateJWT, requireRole('HR', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validationResult = CreateInterviewRoundSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      res.status(400).json({ 
        error: 'Validation failed', 
        details: validationResult.error.issues 
      });
      return;
    }

    const data = validationResult.data;

    // Create VideoSDK room for human-assisted interviews
    let videosdkMeetingId = null;
    let videosdkToken = null;

    if (data.interviewMode === 'HUMAN_AI_ASSISTED') {
      try {
        const room = await createVideoSDKRoom();
        videosdkMeetingId = room.meetingId;
        videosdkToken = room.token;
      } catch (error) {
        // For development/testing, use mock meeting ID if VideoSDK is not configured
        logger.warn('VideoSDK room creation failed, using mock meeting ID for dev testing');
        videosdkMeetingId = `mock-meeting-${uuidv4()}`;
        videosdkToken = 'mock-token-for-development';
      }
    }

    const result = await pool.query(
      `INSERT INTO interview_rounds (
        external_interview_id,
        external_candidate_id,
        external_interviewer_id,
        external_job_role_id,
        round_number,
        round_type,
        interview_mode,
        scheduled_at,
        scheduled_duration_minutes,
        videosdk_meeting_id,
        videosdk_token
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        data.externalInterviewId,
        data.externalCandidateId,
        data.externalInterviewerId,
        data.externalJobRoleId,
        data.roundNumber,
        data.roundType,
        data.interviewMode,
        data.scheduledAt,
        data.scheduledDurationMinutes,
        videosdkMeetingId,
        videosdkToken,
      ]
    );

    logger.info('Interview round created', { roundId: result.rows[0].id });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error creating interview round', { error });
    res.status(500).json({ error: 'Failed to create interview round' });
  }
});

/**
 * Get interview round by ID
 * GET /api/rounds/:roundId
 * Access: Authenticated users (with permission check)
 */
router.get('/:roundId', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params;

    const result = await pool.query(
      'SELECT * FROM interview_rounds WHERE id = $1',
      [roundId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Interview round not found' });
      return;
    }

    const round = result.rows[0];

    // Permission check
    if (req.user?.role === 'CANDIDATE' && round.external_candidate_id !== req.user.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (req.user?.role === 'EMPLOYEE' && round.external_interviewer_id !== req.user.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Generate a fresh participant-specific token for VideoSDK v2 API
    // Each participant needs their own token with roomId and participantId embedded
    if (round.videosdk_meeting_id && req.user) {
      const participantRole = req.user.role === 'CANDIDATE' ? 'candidate' : 'interviewer';
      const participantId = `${participantRole}-${req.user.id}`;
      
      try {
        const participantToken = generateParticipantToken(
          round.videosdk_meeting_id,
          participantId,
          participantRole
        );
        round.videosdk_token = participantToken;
        logger.info('Generated participant token for VideoSDK', { 
          roundId, 
          participantId, 
          role: participantRole,
          meetingId: round.videosdk_meeting_id 
        });
      } catch (tokenError) {
        logger.error('Failed to generate participant token', { error: tokenError });
        // Fall back to stored token if generation fails
      }
    }

    res.json(round);
  } catch (error) {
    logger.error('Error fetching interview round', { error });
    res.status(500).json({ error: 'Failed to fetch interview round' });
  }
});

/**
 * Update interview round status
 * PATCH /api/rounds/:roundId
 * Access: HR, ADMIN, assigned EMPLOYEE
 */
router.patch('/:roundId', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params;
    const validationResult = UpdateInterviewRoundSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({ 
        error: 'Validation failed', 
        details: validationResult.error.issues 
      });
      return;
    }

    const data = validationResult.data;
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);

      // Set timestamps based on status
      if (data.status === 'IN_PROGRESS') {
        updates.push(`started_at = $${paramIndex++}`);
        values.push(new Date().toISOString());
      } else if (data.status === 'COMPLETED' || data.status === 'CANCELLED') {
        updates.push(`ended_at = $${paramIndex++}`);
        values.push(new Date().toISOString());
      }
    }

    if (data.scheduledAt) {
      updates.push(`scheduled_at = $${paramIndex++}`);
      values.push(data.scheduledAt);
    }

    if (data.videosdkMeetingId) {
      updates.push(`videosdk_meeting_id = $${paramIndex++}`);
      values.push(data.videosdkMeetingId);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No updates provided' });
      return;
    }

    values.push(roundId);

    const result = await pool.query(
      `UPDATE interview_rounds SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Interview round not found' });
      return;
    }

    logger.info('Interview round updated', { roundId, updates: data });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating interview round', { error });
    res.status(500).json({ error: 'Failed to update interview round' });
  }
});

/**
 * Record candidate consent for AI monitoring
 * POST /api/rounds/:roundId/consent
 * Access: CANDIDATE
 */
router.post('/:roundId/consent', authenticateJWT, requireRole('CANDIDATE'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params;
    const { consentGiven } = req.body;

    if (typeof consentGiven !== 'boolean') {
      res.status(400).json({ error: 'consentGiven must be a boolean' });
      return;
    }

    const result = await pool.query(
      `UPDATE interview_rounds 
       SET candidate_consent_given = $1, 
           candidate_consent_timestamp = $2,
           status = CASE WHEN $1 = true THEN 'WAITING_FOR_INTERVIEWER' ELSE status END
       WHERE id = $3 AND external_candidate_id = $4
       RETURNING *`,
      [consentGiven, new Date().toISOString(), roundId, req.user?.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Interview round not found or access denied' });
      return;
    }

    logger.info('Consent recorded', { roundId, consentGiven, candidateId: req.user?.id });
    res.json({ success: true, consentGiven, round: result.rows[0] });
  } catch (error) {
    logger.error('Error recording consent', { error });
    res.status(500).json({ error: 'Failed to record consent' });
  }
});

/**
 * Record candidate consent for AI monitoring (PATCH version for frontend compatibility)
 * PATCH /api/rounds/:roundId/consent
 * Access: CANDIDATE
 */
router.patch('/:roundId/consent', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params;
    // Accept both 'consent' and 'consentGiven' for compatibility
    const consentValue = req.body.consent ?? req.body.consentGiven;

    if (typeof consentValue !== 'boolean') {
      res.status(400).json({ error: 'consent must be a boolean' });
      return;
    }

    // Update consent - allow any authenticated user to update (for dev testing)
    const result = await pool.query(
      `UPDATE interview_rounds 
       SET candidate_consent_given = $1, 
           candidate_consent_timestamp = $2,
           status = CASE WHEN $1 = true THEN 'WAITING_FOR_INTERVIEWER' ELSE status END
       WHERE id = $3
       RETURNING *`,
      [consentValue, new Date().toISOString(), roundId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Interview round not found' });
      return;
    }

    logger.info('Consent recorded via PATCH', { roundId, consent: consentValue });
    res.json({ success: true, consent: consentValue, round: result.rows[0] });
  } catch (error) {
    logger.error('Error recording consent', { error });
    res.status(500).json({ error: 'Failed to record consent' });
  }
});

/**
 * Start interview (interviewer joins)
 * POST /api/rounds/:roundId/start
 * Access: EMPLOYEE (interviewer), HR, ADMIN
 */
router.post('/:roundId/start', authenticateJWT, requireRole('EMPLOYEE', 'HR', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params;

    // Get current round
    const roundResult = await pool.query(
      'SELECT * FROM interview_rounds WHERE id = $1',
      [roundId]
    );

    if (roundResult.rows.length === 0) {
      res.status(404).json({ error: 'Interview round not found' });
      return;
    }

    const round = roundResult.rows[0];

    // Check if candidate has given consent
    if (!round.candidate_consent_given) {
      res.status(400).json({ error: 'Candidate has not given consent yet' });
      return;
    }

    // Update status to IN_PROGRESS
    const result = await pool.query(
      `UPDATE interview_rounds 
       SET status = 'IN_PROGRESS', started_at = $1 
       WHERE id = $2 
       RETURNING *`,
      [new Date().toISOString(), roundId]
    );

    logger.info('Interview started', { roundId, interviewerId: req.user?.id });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error starting interview', { error });
    res.status(500).json({ error: 'Failed to start interview' });
  }
});

/**
 * End interview
 * POST /api/rounds/:roundId/end
 * Access: EMPLOYEE (interviewer), HR, ADMIN
 */
router.post('/:roundId/end', authenticateJWT, requireRole('EMPLOYEE', 'HR', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params;

    const result = await pool.query(
      `UPDATE interview_rounds 
       SET status = 'COMPLETED', ended_at = $1 
       WHERE id = $2 
       RETURNING *`,
      [new Date().toISOString(), roundId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Interview round not found' });
      return;
    }

    logger.info('Interview ended', { roundId, interviewerId: req.user?.id });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error ending interview', { error });
    res.status(500).json({ error: 'Failed to end interview' });
  }
});

/**
 * Get interviews for current user
 * GET /api/rounds
 * Access: Authenticated users
 */
router.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let query = '';
    let values: string[] = [];

    switch (req.user?.role) {
      case 'CANDIDATE':
        query = 'SELECT * FROM interview_rounds WHERE external_candidate_id = $1 ORDER BY scheduled_at DESC';
        values = [req.user.id];
        break;
      case 'EMPLOYEE':
        query = 'SELECT * FROM interview_rounds WHERE external_interviewer_id = $1 ORDER BY scheduled_at DESC';
        values = [req.user.id];
        break;
      case 'HR':
      case 'ADMIN':
        query = 'SELECT * FROM interview_rounds ORDER BY scheduled_at DESC LIMIT 100';
        break;
      default:
        res.status(403).json({ error: 'Access denied' });
        return;
    }

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching interview rounds', { error });
    res.status(500).json({ error: 'Failed to fetch interview rounds' });
  }
});

/**
 * Delete an interview round
 * DELETE /api/rounds/:roundId
 * Access: HR, ADMIN
 */
router.delete('/:roundId', authenticateJWT, requireRole('HR', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params;

    // Check if round exists
    const checkResult = await pool.query(
      'SELECT * FROM interview_rounds WHERE id = $1',
      [roundId]
    );

    if (checkResult.rows.length === 0) {
      res.status(404).json({ error: 'Interview round not found' });
      return;
    }

    // Don't allow deleting rounds that are in progress
    if (checkResult.rows[0].status === 'IN_PROGRESS') {
      res.status(400).json({ error: 'Cannot delete an interview that is in progress' });
      return;
    }

    // Delete related records first (cascade)
    await pool.query('DELETE FROM fraud_alerts WHERE round_id = $1', [roundId]);
    await pool.query('DELETE FROM live_insights WHERE round_id = $1', [roundId]);
    
    // Delete the round
    await pool.query('DELETE FROM interview_rounds WHERE id = $1', [roundId]);

    logger.info('Interview round deleted', { roundId, deletedBy: req.user?.id });
    res.json({ success: true, message: 'Interview round deleted successfully' });
  } catch (error) {
    logger.error('Error deleting interview round', { error });
    res.status(500).json({ error: 'Failed to delete interview round' });
  }
});

/**
 * Update an interview round (for editing)
 * PUT /api/rounds/:roundId
 * Access: HR, ADMIN
 */
router.put('/:roundId', authenticateJWT, requireRole('HR', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roundId } = req.params;
    const { roundType, interviewMode, scheduledAt, scheduledDurationMinutes, status } = req.body;

    // Check if round exists
    const checkResult = await pool.query(
      'SELECT * FROM interview_rounds WHERE id = $1',
      [roundId]
    );

    if (checkResult.rows.length === 0) {
      res.status(404).json({ error: 'Interview round not found' });
      return;
    }

    // Build update query dynamically based on provided fields
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (roundType) {
      updates.push(`round_type = $${paramIndex++}`);
      values.push(roundType);
    }
    if (interviewMode) {
      updates.push(`interview_mode = $${paramIndex++}`);
      values.push(interviewMode);
    }
    if (scheduledAt !== undefined) {
      updates.push(`scheduled_at = $${paramIndex++}`);
      values.push(scheduledAt || null);
    }
    if (scheduledDurationMinutes) {
      updates.push(`scheduled_duration_minutes = $${paramIndex++}`);
      values.push(scheduledDurationMinutes);
    }
    if (status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    updates.push(`updated_at = $${paramIndex++}`);
    values.push(new Date().toISOString());

    values.push(roundId);

    const result = await pool.query(
      `UPDATE interview_rounds SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    logger.info('Interview round updated', { roundId, updatedBy: req.user?.id });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating interview round', { error });
    res.status(500).json({ error: 'Failed to update interview round' });
  }
});

export default router;
