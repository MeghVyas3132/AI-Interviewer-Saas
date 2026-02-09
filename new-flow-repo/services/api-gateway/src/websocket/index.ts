import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { redis, redisPub, redisSub, REDIS_CHANNELS } from '../db/redis';
import { pool } from '../db';
import { config } from '../config';
import { logger } from '../utils/logger';
import { serviceBreakers } from '../utils/circuitBreaker';

interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    email: string;
    role: 'ADMIN' | 'HR' | 'EMPLOYEE' | 'CANDIDATE';
  };
  roundId?: string;
}

/**
 * Initialize WebSocket server with Redis adapter for scaling
 */
export const initializeWebSocket = (io: SocketIOServer): void => {
  // Use Redis adapter for horizontal scaling
  io.adapter(createAdapter(redisPub, redisSub));

  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token as string, config.jwtSecret) as any;
      socket.user = {
        id: decoded.sub,
        email: decoded.email,
        role: decoded.role,
      };
      next();
    } catch (error) {
      return next(new Error('Invalid token'));
    }
  });

  // Connection handler
  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info('WebSocket client connected', { 
      userId: socket.user?.id, 
      role: socket.user?.role 
    });

    // Join interview room (support both naming conventions)
    socket.on('join-interview', handleJoinInterview);
    socket.on('interview:join', handleJoinInterview);
    
    async function handleJoinInterview(data: { roundId: string }) {
      const { roundId } = data;

      // Verify access to this interview
      const hasAccess = await verifyInterviewAccess(socket.user!, roundId);
      if (!hasAccess) {
        socket.emit('error', { message: 'Access denied to this interview' });
        return;
      }

      // Leave any previous room
      if (socket.roundId) {
        socket.leave(`interview:${socket.roundId}`);
      }

      // Join new room
      socket.roundId = roundId;
      socket.join(`interview:${roundId}`);

      logger.info('User joined interview room', { 
        userId: socket.user?.id, 
        roundId 
      });

      socket.emit('joined-interview', { roundId });

      // Send recent insights if any (last 30 seconds)
      const recentInsights = await getRecentInsights(roundId, 30000);
      if (recentInsights.length > 0) {
        socket.emit('insights-batch', recentInsights);
      }
    }

    // Leave interview room (support both naming conventions)
    socket.on('leave-interview', handleLeaveInterview);
    socket.on('interview:leave', handleLeaveInterview);
    
    function handleLeaveInterview() {
      if (socket.roundId) {
        socket.leave(`interview:${socket.roundId}`);
        logger.info('User left interview room', { 
          userId: socket.user?.id, 
          roundId: socket.roundId 
        });
        socket.roundId = undefined;
      }
    }

    // Handle audio stream from candidate (forwarded to speech service)
    // Support both naming conventions
    socket.on('audio-chunk', handleAudioChunk);
    socket.on('audio:chunk', handleAudioChunk);
    
    async function handleAudioChunk(data: { roundId: string; chunk: ArrayBuffer | string; timestamp: number }) {
      if (socket.user?.role !== 'CANDIDATE') {
        return;
      }

      try {
        // Forward to speech analysis service via Redis
        const chunkData = typeof data.chunk === 'string' ? data.chunk : Buffer.from(data.chunk).toString('base64');
        await redis.xadd(
          `stream:audio:${data.roundId}`,
          '*',
          'chunk', chunkData,
          'timestamp', data.timestamp.toString(),
          'candidateId', socket.user.id
        );
      } catch (error) {
        logger.error('Error forwarding audio chunk', { error });
      }
    }

    // Handle video frame from candidate (forwarded to video service)
    // Support both naming conventions
    socket.on('video-frame', handleVideoFrame);
    socket.on('video:frame', handleVideoFrame);
    
    async function handleVideoFrame(data: { roundId: string; frame: string; timestamp: number }) {
      // Allow both candidate and others in dev mode for testing
      try {
        // Forward to video analysis service via Redis
        await redis.xadd(
          `stream:video:${data.roundId}`,
          '*',
          'frame', data.frame, // base64 encoded frame
          'timestamp', data.timestamp.toString(),
          'candidateId', socket.user?.id || 'unknown'
        );
        
        // DEV MODE: Generate simulated insights for testing UI
        if (config.nodeEnv === 'development') {
          await generateDevInsights(io, data.roundId, 'video');
        }
      } catch (error) {
        logger.error('Error forwarding video frame', { error });
      }
    }

    // Handle tab visibility change (support both naming conventions)
    socket.on('tab-visibility', handleTabVisibility);
    socket.on('tab:visibility', handleTabVisibility);
    
    async function handleTabVisibility(data: { roundId: string; visible: boolean; timestamp: number }) {
      if (socket.user?.role !== 'CANDIDATE') {
        return;
      }

      if (!data.visible) {
        // Tab switched - this is a potential fraud indicator
        const insight = {
          roundId: data.roundId,
          timestampMs: data.timestamp,
          insightType: 'TAB_SWITCH',
          severity: 'MEDIUM',
          value: { visible: data.visible, duration: null },
          explanation: 'Candidate switched away from interview tab',
        };

        // Save to database
        await saveInsight(insight);

        // Create fraud alert
        await createFraudAlert(data.roundId, insight);

        // Broadcast to interviewer
        io.to(`interview:${data.roundId}`).emit('insight', insight);
        io.to(`interview:${data.roundId}`).emit('fraud-alert', {
          type: 'TAB_SWITCH',
          severity: 'MEDIUM',
          timestamp: data.timestamp,
          message: 'Candidate switched away from interview tab',
        });
      }
    }

    // ========== WebRTC Signaling for Peer-to-Peer Video ==========
    // These events allow candidate and interviewer to establish a direct video connection
    
    // Send WebRTC offer to the other participant
    socket.on('webrtc:offer', (data: { roundId: string; offer: any }) => {
      logger.info('WebRTC offer received', { userId: socket.user?.id, roundId: data.roundId });
      // Broadcast to all other users in the room
      socket.to(`interview:${data.roundId}`).emit('webrtc:offer', {
        offer: data.offer,
        fromUserId: socket.user?.id,
        fromRole: socket.user?.role,
      });
    });

    // Send WebRTC answer back
    socket.on('webrtc:answer', (data: { roundId: string; answer: any }) => {
      logger.info('WebRTC answer received', { userId: socket.user?.id, roundId: data.roundId });
      socket.to(`interview:${data.roundId}`).emit('webrtc:answer', {
        answer: data.answer,
        fromUserId: socket.user?.id,
        fromRole: socket.user?.role,
      });
    });

    // Exchange ICE candidates for NAT traversal
    socket.on('webrtc:ice-candidate', (data: { roundId: string; candidate: any }) => {
      socket.to(`interview:${data.roundId}`).emit('webrtc:ice-candidate', {
        candidate: data.candidate,
        fromUserId: socket.user?.id,
      });
    });

    // Notify when user is ready for WebRTC connection
    socket.on('webrtc:ready', (data: { roundId: string }) => {
      logger.info('User ready for WebRTC', { userId: socket.user?.id, role: socket.user?.role, roundId: data.roundId });
      socket.to(`interview:${data.roundId}`).emit('webrtc:peer-ready', {
        userId: socket.user?.id,
        role: socket.user?.role,
      });
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      logger.info('WebSocket client disconnected', { 
        userId: socket.user?.id 
      });
    });
  });

  // Subscribe to insight channels from ML services
  subscribeToInsightChannels(io);
};

/**
 * Subscribe to Redis channels for insights from ML services
 */
const subscribeToInsightChannels = (io: SocketIOServer): void => {
  const subscriber = redisSub;

  // Subscribe to all service result channels
  subscriber.subscribe(
    REDIS_CHANNELS.speechAnalysis,
    REDIS_CHANNELS.videoAnalysis,
    REDIS_CHANNELS.fraudDetection,
    REDIS_CHANNELS.nlpAnalysis
  );

  subscriber.on('message', async (channel: string, message: string) => {
    try {
      const data = JSON.parse(message);
      const { roundId, ...insight } = data;

      if (!roundId) {
        logger.warn('Received insight without roundId', { channel });
        return;
      }

      // Save insight to database
      await saveInsight({ roundId, ...insight });

      // If it's a fraud-related insight with high severity, create alert
      if (isFraudInsight(insight.insightType) && ['HIGH', 'CRITICAL'].includes(insight.severity)) {
        await createFraudAlert(roundId, insight);
        io.to(`interview:${roundId}`).emit('fraud-alert', {
          type: insight.insightType,
          severity: insight.severity,
          timestamp: insight.timestampMs,
          message: insight.explanation,
        });
      }

      // Broadcast to interview room (only interviewers will be in the room)
      io.to(`interview:${roundId}`).emit('insight', insight);

    } catch (error) {
      logger.error('Error processing insight from Redis', { error, channel });
    }
  });

  logger.info('Subscribed to insight channels');
};

/**
 * Verify user has access to interview
 */
const verifyInterviewAccess = async (
  user: { id: string; role: string },
  roundId: string
): Promise<boolean> => {
  try {
    const result = await pool.query(
      'SELECT * FROM interview_rounds WHERE id = $1',
      [roundId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const round = result.rows[0];

    // Admins and HR can access any interview
    if (user.role === 'ADMIN' || user.role === 'HR') {
      return true;
    }

    // Employees can only access interviews they're conducting
    if (user.role === 'EMPLOYEE') {
      return round.external_interviewer_id === user.id;
    }

    // Candidates can only access their own interviews
    if (user.role === 'CANDIDATE') {
      return round.external_candidate_id === user.id;
    }

    return false;
  } catch (error) {
    logger.error('Error verifying interview access', { error });
    return false;
  }
};

/**
 * Get recent insights for an interview
 */
const getRecentInsights = async (roundId: string, windowMs: number): Promise<any[]> => {
  try {
    const result = await pool.query(
      `SELECT * FROM live_insights 
       WHERE round_id = $1 
       AND created_at > NOW() - INTERVAL '${windowMs} milliseconds'
       ORDER BY timestamp_ms ASC`,
      [roundId]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error fetching recent insights', { error });
    return [];
  }
};

/**
 * Save insight to database
 */
const saveInsight = async (insight: any): Promise<void> => {
  try {
    await pool.query(
      `INSERT INTO live_insights (
        round_id, timestamp_ms, insight_type, severity, value, explanation, model_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        insight.roundId,
        insight.timestampMs,
        insight.insightType,
        insight.severity || 'INFO',
        JSON.stringify(insight.value),
        insight.explanation,
        insight.modelVersion,
      ]
    );
  } catch (error) {
    logger.error('Error saving insight', { error });
  }
};

/**
 * Create fraud alert
 */
const createFraudAlert = async (roundId: string, insight: any): Promise<void> => {
  try {
    // First get the insight ID
    const insightResult = await pool.query(
      `SELECT id FROM live_insights 
       WHERE round_id = $1 AND timestamp_ms = $2 AND insight_type = $3
       ORDER BY created_at DESC LIMIT 1`,
      [roundId, insight.timestampMs, insight.insightType]
    );

    if (insightResult.rows.length === 0) {
      return;
    }

    await pool.query(
      `INSERT INTO fraud_alerts (
        round_id, insight_id, alert_type, severity, detected_at_ms, confidence, evidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        roundId,
        insightResult.rows[0].id,
        insight.insightType,
        insight.severity,
        insight.timestampMs,
        insight.value?.confidence || 0.8,
        JSON.stringify(insight.value),
      ]
    );
  } catch (error) {
    logger.error('Error creating fraud alert', { error });
  }
};

/**
 * Check if insight type is fraud-related
 */
const isFraudInsight = (insightType: string): boolean => {
  return ['MULTIPLE_FACES', 'FACE_SWITCH', 'TAB_SWITCH', 'BACKGROUND_VOICE'].includes(insightType);
};

// Track last insight time per round to throttle dev insights
const lastDevInsightTime: Map<string, number> = new Map();

/**
 * Generate simulated insights for development/testing
 * This helps test the UI when ML services aren't fully configured
 */
const generateDevInsights = async (
  io: SocketIOServer,
  roundId: string,
  source: 'video' | 'audio'
): Promise<void> => {
  const now = Date.now();
  const lastTime = lastDevInsightTime.get(roundId) || 0;
  
  // Only generate insights every 3 seconds to avoid flooding
  if (now - lastTime < 3000) {
    return;
  }
  lastDevInsightTime.set(roundId, now);

  // Random chance to generate insight (30%)
  if (Math.random() > 0.3) {
    return;
  }

  // Sample insights for testing
  const sampleInsights: Array<{
    insightType: string;
    category: string;
    severity: string;
    value: Record<string, any>;
    explanation: string;
  }> = [
    {
      insightType: 'SPEECH_CONFIDENCE',
      category: 'speech',
      severity: 'INFO',
      value: { score: 0.72 + Math.random() * 0.2, avgPitch: 180, tempo: 'moderate' },
      explanation: 'Candidate speaking with moderate confidence',
    },
    {
      insightType: 'HEAD_MOVEMENT',
      category: 'video',
      severity: 'INFO',
      value: { stability: 0.75 + Math.random() * 0.2, pattern: 'stable' },
      explanation: 'Head movement is stable, indicating engagement',
    },
    {
      insightType: 'RESPONSE_LATENCY',
      category: 'speech',
      severity: Math.random() > 0.7 ? 'MEDIUM' : 'LOW',
      value: { latencyMs: 1500 + Math.random() * 3000, avgLatency: 2000 },
      explanation: 'Response time is within normal range',
    },
    {
      insightType: 'VIDEO_QUALITY',
      category: 'video',
      severity: 'INFO',
      value: { quality: 'good', brightness: 0.7, blur: 0.1 },
      explanation: 'Video quality is good for analysis',
    },
    {
      insightType: 'HESITATION',
      category: 'speech',
      severity: 'LOW',
      value: { count: Math.floor(Math.random() * 3), type: 'filler_words' },
      explanation: 'Minor hesitation detected in speech',
    },
  ];

  // Occasionally add a fraud-type insight (10% chance)
  if (Math.random() < 0.1) {
    sampleInsights.push({
      insightType: 'TAB_SWITCH',
      category: 'fraud',
      severity: 'MEDIUM',
      value: { detected: true, duration: null },
      explanation: 'Tab switch detected - candidate may have navigated away',
    });
  }

  const randomInsight = sampleInsights[Math.floor(Math.random() * sampleInsights.length)];
  
  const insight = {
    id: `dev-${now}-${Math.random().toString(36).slice(2)}`,
    roundId,
    timestampMs: now,
    ...randomInsight,
    sourceServices: ['dev-simulator'],
  };

  // Save to database
  try {
    await saveInsight(insight);
  } catch (error) {
    // Ignore save errors in dev mode
  }

  // Broadcast to interview room
  io.to(`interview:${roundId}`).emit('insight', insight);
  
  // Also emit as insight-aggregated format for frontend compatibility
  io.to(`interview:${roundId}`).emit('insight:aggregated', {
    insights: [insight],
    recommendations: [],
    summary: {
      totalInsights: 1,
      alertCount: randomInsight.severity === 'MEDIUM' || randomInsight.severity === 'HIGH' ? 1 : 0,
      topCategory: randomInsight.category,
    },
  });

  // If it's a fraud insight, also emit fraud alert
  if (randomInsight.category === 'fraud') {
    io.to(`interview:${roundId}`).emit('fraud-alert', {
      type: randomInsight.insightType,
      severity: randomInsight.severity,
      timestamp: now,
      message: randomInsight.explanation,
    });
  }

  logger.debug('Generated dev insight', { roundId, type: randomInsight.insightType });
};
