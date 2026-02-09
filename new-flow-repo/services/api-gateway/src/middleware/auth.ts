import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';

// Extended request with user info
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: 'ADMIN' | 'HR' | 'EMPLOYEE' | 'CANDIDATE';
    companyId?: string;
  };
}

// JWT payload structure
interface JWTPayload {
  sub: string; // user id
  email: string;
  role: 'ADMIN' | 'HR' | 'EMPLOYEE' | 'CANDIDATE';
  companyId?: string;
  iat: number;
  exp: number;
}

/**
 * Middleware to verify JWT token from Authorization header
 */
export const authenticateJWT = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Authorization header missing' });
    return;
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;
    
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      companyId: decoded.companyId,
    };
    
    next();
  } catch (error) {
    logger.warn('JWT verification failed', { error });
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Middleware to check internal API key for service-to-service communication
 */
export const authenticateInternalAPI = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const apiKey = req.headers['x-internal-api-key'];

  if (!apiKey || apiKey !== config.internalApiKey) {
    res.status(401).json({ error: 'Invalid internal API key' });
    return;
  }

  next();
};

/**
 * Middleware to check if user has required role
 */
export const requireRole = (...allowedRoles: Array<'ADMIN' | 'HR' | 'EMPLOYEE' | 'CANDIDATE'>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};

/**
 * Middleware to check if user is the interviewer for a specific round
 */
export const requireInterviewer = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Admins and HR can access any interview
  if (req.user.role === 'ADMIN' || req.user.role === 'HR') {
    next();
    return;
  }

  const roundId = req.params.roundId;
  if (!roundId) {
    res.status(400).json({ error: 'Round ID required' });
    return;
  }

  // Check if user is the interviewer for this round
  // This would be a database check in production
  // For now, we'll let the route handler do this check
  next();
};
