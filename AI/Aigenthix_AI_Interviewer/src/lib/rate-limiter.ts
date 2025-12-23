/**
 * Rate limiting middleware for API routes
 * Prevents abuse and ensures fair resource distribution
 */

import { NextApiRequest, NextApiResponse } from 'next';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  max: number; // Maximum number of requests per window
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Get client identifier from request
   */
  private getClientId(req: NextApiRequest): string {
    // Try to get IP from various headers (for load balancer/proxy scenarios)
    const forwarded = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    const ip = forwarded 
      ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim())
      : realIp || req.socket.remoteAddress || 'unknown';
    
    // For authenticated users, use their ID instead of IP
    const userId = (req as any).user?.id;
    return userId ? `user:${userId}` : `ip:${ip}`;
  }

  /**
   * Check if request should be rate limited
   */
  check(config: RateLimitConfig, req: NextApiRequest): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
  } {
    const clientId = this.getClientId(req);
    const now = Date.now();
    const key = `${clientId}:${config.windowMs}`;

    let entry = this.store.get(key);

    // If entry doesn't exist or has expired, create new one
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + config.windowMs,
      };
    }

    // Increment count
    entry.count++;
    this.store.set(key, entry);

    const allowed = entry.count <= config.max;
    const remaining = Math.max(0, config.max - entry.count);

    return {
      allowed,
      remaining,
      resetTime: entry.resetTime,
    };
  }

  /**
   * Middleware function for Next.js API routes
   */
  middleware(config: RateLimitConfig) {
    return (req: NextApiRequest, res: NextApiResponse, next?: () => void) => {
      const result = this.check(config, req);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', config.max.toString());
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

      if (!result.allowed) {
        const message = config.message || 'Too many requests, please try again later.';
        res.status(429).json({
          success: false,
          error: message,
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        });
        return;
      }

      if (next) {
        next();
      }
    };
  }

  /**
   * Check rate limit and return result (for use in API handlers)
   */
  checkRateLimit(config: RateLimitConfig, req: NextApiRequest, res: NextApiResponse): boolean {
    const result = this.check(config, req);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', config.max.toString());
    res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
    res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

    if (!result.allowed) {
      const message = config.message || 'Too many requests, please try again later.';
      res.status(429).json({
        success: false,
        error: message,
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      });
      return false;
    }

    return true;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clear all rate limit entries (useful for testing)
   */
  clear(): void {
    this.store.clear();
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();

// Rate limit configurations
const rateLimitConfigs = {
  general: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    message: 'Too many requests. Please try again later.',
  },
  interview: {
    windowMs: parseInt(process.env.INTERVIEW_RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.INTERVIEW_RATE_LIMIT_MAX || '20', 10),
    message: 'Too many interview requests. Please wait before trying again.',
  },
  ai: {
    windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.AI_RATE_LIMIT_MAX || '10', 10),
    message: 'AI service rate limit exceeded. Please wait before trying again.',
  },
  admin: {
    windowMs: parseInt(process.env.ADMIN_RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.ADMIN_RATE_LIMIT_MAX || '200', 10),
    message: 'Admin API rate limit exceeded.',
  },
};

// Pre-configured rate limiters for different endpoints
export const rateLimiters = {
  // General API rate limit: 100 requests per minute
  general: rateLimiter.middleware(rateLimitConfigs.general),
  // Interview API rate limit: 20 requests per minute (more restrictive)
  interview: rateLimiter.middleware(rateLimitConfigs.interview),
  // AI API rate limit: 10 requests per minute (very restrictive due to cost)
  ai: rateLimiter.middleware(rateLimitConfigs.ai),
  // Admin API rate limit: 200 requests per minute
  admin: rateLimiter.middleware(rateLimitConfigs.admin),
};

// Helper functions for direct use in API handlers
export const checkRateLimit = {
  general: (req: NextApiRequest, res: NextApiResponse) => 
    rateLimiter.checkRateLimit(rateLimitConfigs.general, req, res),
  interview: (req: NextApiRequest, res: NextApiResponse) => 
    rateLimiter.checkRateLimit(rateLimitConfigs.interview, req, res),
  ai: (req: NextApiRequest, res: NextApiResponse) => 
    rateLimiter.checkRateLimit(rateLimitConfigs.ai, req, res),
  admin: (req: NextApiRequest, res: NextApiResponse) => 
    rateLimiter.checkRateLimit(rateLimitConfigs.admin, req, res),
};

