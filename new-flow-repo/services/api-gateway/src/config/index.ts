import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_interview_assistant',
  
  // Auth
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  internalApiKey: process.env.INTERNAL_API_KEY || 'dev-internal-key',
  
  // ML Services
  services: {
    speech: process.env.SPEECH_SERVICE_URL || 'http://localhost:8001',
    video: process.env.VIDEO_SERVICE_URL || 'http://localhost:8002',
    fraud: process.env.FRAUD_SERVICE_URL || 'http://localhost:8003',
    nlp: process.env.NLP_SERVICE_URL || 'http://localhost:8004',
  },
  
  // VideoSDK
  videoSdk: {
    apiKey: process.env.VIDEOSDK_API_KEY || '',
    secret: process.env.VIDEOSDK_SECRET || '',
    apiEndpoint: process.env.VIDEOSDK_API_ENDPOINT || 'https://api.videosdk.live/v2',
  },
  
  // Circuit Breaker
  circuitBreaker: {
    failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5', 10),
    successThreshold: parseInt(process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD || '3', 10),
    timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '30000', 10),
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  
  // CORS
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(','),
};
