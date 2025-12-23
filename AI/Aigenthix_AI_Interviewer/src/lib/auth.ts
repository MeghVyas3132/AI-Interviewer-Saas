import { NextApiRequest, NextApiResponse } from 'next';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = '12345';
const SESSION_COOKIE_NAME = 'admin_session';

export interface AdminUser {
  username: string;
  isAuthenticated: boolean;
}

export async function authenticateAdmin(username: string, password: string): Promise<boolean> {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

export async function createAdminSession(req: NextApiRequest, res: NextApiResponse): Promise<string> {
  const sessionId = generateSessionId();
  
  // Set session cookie
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${sessionId}; Path=/; Max-Age=${60 * 60 * 24}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  
  return sessionId;
}

export async function getAdminSession(req: NextApiRequest): Promise<AdminUser | null> {
  // Check for API Key first (for service-to-service communication)
  const apiKey = req.headers['x-api-key'];
  // TODO: Use environment variable in production
  if (apiKey === (process.env.AI_SERVICE_API_KEY || 'ai-interviewer-secret-key')) {
    return {
      username: 'system_admin',
      isAuthenticated: true
    };
  }

  const sessionId = req.cookies[SESSION_COOKIE_NAME];
  
  if (!sessionId) {
    return null;
  }
  
  // In a real app, you'd validate the session against a database
  // For simplicity, we'll just check if the session exists
  return {
    username: ADMIN_USERNAME,
    isAuthenticated: true
  };
}

export async function destroyAdminSession(res: NextApiResponse): Promise<void> {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

function generateSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
