import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

// Create PostgreSQL connection pool
export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
pool.on('connect', () => {
  logger.debug('New database connection established');
});

pool.on('error', (err) => {
  logger.error('Unexpected database error', { error: err });
});

// Health check for database
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    const result = await pool.query('SELECT 1');
    return result.rowCount === 1;
  } catch (error) {
    logger.error('Database health check failed', { error });
    return false;
  }
};

// Graceful shutdown
export const closeDatabasePool = async (): Promise<void> => {
  await pool.end();
  logger.info('Database pool closed');
};
