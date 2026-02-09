import express, { Application, Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import { logger } from './utils/logger';
import { pool, checkDatabaseHealth, closeDatabasePool } from './db';
import { redis, checkRedisHealth, closeRedis } from './db/redis';
import { getCircuitBreakerStatus } from './utils/circuitBreaker';
import { initializeWebSocket } from './websocket';

// Routes
import roundsRouter from './routes/rounds';
import insightsRouter from './routes/insights';
import verdictsRouter from './routes/verdicts';
import resumesRouter from './routes/resumes';
import authRouter from './routes/auth';

// Create Express app
const app: Application = express();
const httpServer = createServer(app);

// Create Socket.IO server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// =============================================================================
// Middleware
// =============================================================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API
  crossOriginEmbedderPolicy: false, // Allow embedding in iframes
  frameguard: false, // Disable X-Frame-Options to allow resume PDF in iframe
}));

// CORS
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
    });
  });
  next();
});

// =============================================================================
// Health Checks
// =============================================================================

// Basic health check
app.get('/health', async (req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  const redisHealthy = await checkRedisHealth();

  const status = dbHealthy && redisHealthy ? 'healthy' : 'degraded';
  const statusCode = status === 'healthy' ? 200 : 503;

  res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealthy ? 'up' : 'down',
      redis: redisHealthy ? 'up' : 'down',
    },
  });
});

// Detailed health check (internal use)
app.get('/health/detailed', async (req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  const redisHealthy = await checkRedisHealth();
  const circuitBreakers = getCircuitBreakerStatus();

  res.json({
    status: dbHealthy && redisHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: dbHealthy ? 'up' : 'down',
      redis: redisHealthy ? 'up' : 'down',
    },
    circuitBreakers,
    memory: process.memoryUsage(),
  });
});

// Readiness probe (for Kubernetes)
app.get('/ready', async (req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  const redisHealthy = await checkRedisHealth();

  if (dbHealthy && redisHealthy) {
    res.status(200).json({ ready: true });
  } else {
    res.status(503).json({ ready: false });
  }
});

// Liveness probe (for Kubernetes)
app.get('/live', (req: Request, res: Response) => {
  res.status(200).json({ alive: true });
});

// =============================================================================
// API Routes
// =============================================================================

app.use('/api/auth', authRouter);
app.use('/api/rounds', roundsRouter);
app.use('/api/insights', insightsRouter);
app.use('/api/verdicts', verdictsRouter);
app.use('/api/resumes', resumesRouter);

// =============================================================================
// Error Handling
// =============================================================================

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', { 
    error: err.message, 
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({ 
    error: 'Internal server error',
    message: config.nodeEnv === 'development' ? err.message : undefined,
  });
});

// =============================================================================
// WebSocket Initialization
// =============================================================================

initializeWebSocket(io);

// =============================================================================
// Graceful Shutdown
// =============================================================================

const shutdown = async (signal: string): Promise<void> => {
  logger.info(`Received ${signal}, starting graceful shutdown`);

  // Stop accepting new connections
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });

  // Close database connections
  await closeDatabasePool();

  // Close Redis connections
  await closeRedis();

  logger.info('Graceful shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// =============================================================================
// Start Server
// =============================================================================

httpServer.listen(config.port, () => {
  logger.info(`API Gateway started`, {
    port: config.port,
    env: config.nodeEnv,
  });
});

export { app, io };
