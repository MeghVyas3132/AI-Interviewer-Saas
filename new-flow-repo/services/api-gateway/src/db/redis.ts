import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

// Create Redis client
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (times > 3) {
      logger.error('Redis connection failed after 3 retries');
      return null; // Stop retrying
    }
    return Math.min(times * 200, 2000); // Exponential backoff
  },
});

redis.on('connect', () => {
  logger.info('Connected to Redis');
});

redis.on('error', (err: Error) => {
  logger.error('Redis error', { error: err.message });
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

// Pub/Sub clients (separate connections required for pub/sub)
export const redisPub = redis.duplicate();
export const redisSub = redis.duplicate();

// Health check
export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed', { error });
    return false;
  }
};

// Graceful shutdown
export const closeRedis = async (): Promise<void> => {
  await redis.quit();
  await redisPub.quit();
  await redisSub.quit();
  logger.info('Redis connections closed');
};

// Channel names for real-time insights
export const REDIS_CHANNELS = {
  // Per-interview channels
  interviewInsights: (roundId: string) => `interview:${roundId}:insights`,
  interviewTranscript: (roundId: string) => `interview:${roundId}:transcript`,
  interviewAlerts: (roundId: string) => `interview:${roundId}:alerts`,
  
  // Service channels
  speechAnalysis: 'service:speech:results',
  videoAnalysis: 'service:video:results',
  fraudDetection: 'service:fraud:results',
  nlpAnalysis: 'service:nlp:results',
};
