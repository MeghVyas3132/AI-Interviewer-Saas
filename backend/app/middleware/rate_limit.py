"""
Rate limiting middleware for API protection.
Prevents brute force attacks on login endpoint.
"""

import logging
from typing import Callable

from fastapi import Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.utils.redis_client import redis_client

logger = logging.getLogger(__name__)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware using Redis counters.
    Tracks requests by IP address for login endpoint.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Apply rate limiting to login endpoint."""
        # Only rate limit POST /api/v1/auth/login
        if request.method == "POST" and "/auth/login" in request.url.path:
            client_ip = self._get_client_ip(request)
            
            try:
                # Check rate limit
                is_rate_limited = await self._check_rate_limit(client_ip)
                if is_rate_limited:
                    logger.warning(f"Rate limit exceeded for IP: {client_ip}")
                    return JSONResponse(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        content={"detail": "Too many login attempts. Try again in 1 minute."},
                    )
            except Exception as e:
                logger.error(f"Rate limit check failed: {e}")
                # Don't block requests if Redis fails (graceful degradation)
                pass

        response = await call_next(request)
        return response

    async def _check_rate_limit(self, client_ip: str) -> bool:
        """
        Check if client has exceeded rate limit (5 attempts per minute).
        Returns True if rate limited, False otherwise.
        """
        key = f"rate_limit:login:{client_ip}"
        
        try:
            current = await redis_client.incr(key)
            if current == 1:
                # First request, set expiry to 60 seconds
                await redis_client.expire(key, 60)
            
            # Allow 5 requests per minute
            return current > 5
        except Exception as e:
            logger.error(f"Redis rate limit error: {e}")
            raise

    @staticmethod
    def _get_client_ip(request: Request) -> str:
        """Extract client IP from request, handling proxies."""
        # Try X-Forwarded-For first (for proxies)
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        
        # Fall back to direct connection
        if request.client:
            return request.client.host
        
        return "unknown"
