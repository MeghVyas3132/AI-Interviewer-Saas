import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { logger } from '../utils/logger';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Development users for testing
// In production, this would connect to the main AI Interviewer app's auth
const devUsers: Record<string, {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'HR' | 'EMPLOYEE' | 'CANDIDATE';
  companyId?: string;
}> = {
  'hr@test.com': {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    email: 'hr@test.com',
    name: 'Priya Singh',
    role: 'HR',
    companyId: 'company-001',
  },
  'interviewer@test.com': {
    id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    email: 'interviewer@test.com',
    name: 'Amit Kumar',
    role: 'EMPLOYEE',
    companyId: 'company-001',
  },
  'candidate@test.com': {
    id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    email: 'candidate@test.com',
    name: 'Rahul Sharma',
    role: 'CANDIDATE',
  },
  'admin@test.com': {
    id: 'd4e5f6a7-b8c9-0123-def0-234567890123',
    email: 'admin@test.com',
    name: 'Admin User',
    role: 'ADMIN',
    companyId: 'company-001',
  },
};

/**
 * Dev Login - For development/testing only
 * POST /api/auth/dev-login
 */
router.post('/dev-login', (req: Request, res: Response) => {
  if (config.nodeEnv === 'production') {
    res.status(403).json({ error: 'Dev login not available in production' });
    return;
  }

  const { email, role } = req.body;

  // Find user by email or create a temporary one based on role
  let user = devUsers[email];
  
  if (!user && role) {
    // Create temporary user for testing
    user = {
      id: uuidv4(),
      email: email || `${role.toLowerCase()}@test.com`,
      name: `Test ${role}`,
      role: role.toUpperCase() as 'ADMIN' | 'HR' | 'EMPLOYEE' | 'CANDIDATE',
      companyId: role !== 'CANDIDATE' ? 'company-001' : undefined,
    };
  }

  if (!user) {
    res.status(400).json({ error: 'Invalid email or role' });
    return;
  }

  // Generate JWT
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    },
    config.jwtSecret,
    { expiresIn: '24h' }
  );

  logger.info('Dev login successful', { userId: user.id, role: user.role });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      fullName: user.name,
      role: user.role.toLowerCase(),
      companyId: user.companyId,
    },
  });
});

/**
 * Get current user info
 * GET /api/auth/me
 */
router.get('/me', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  res.json({
    id: req.user.id,
    email: req.user.email,
    role: req.user.role.toLowerCase(),
    companyId: req.user.companyId,
  });
});

/**
 * Logout (client-side token removal)
 * POST /api/auth/logout
 */
router.post('/logout', (req: Request, res: Response) => {
  // In a real app, we might blacklist the token
  res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
