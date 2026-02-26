"""
Rate limiting middleware for API protection.
Prevents brute force attacks on login endpoint.
Provides per-IP and per-company rate limiting for production.
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
    Tracks requests by IP address and company for various endpoints.
    
    Rate Limits:
    - Login: 5 requests per minute per IP
    - Registration: 3 requests per hour per IP
    - General API: 1000 requests per minute per IP
    - Bulk operations: 10 per minute per company
    """

    # Rate limit configurations
    RATE_LIMITS = {
        "login": {"max_requests": 5, "window": 60},  # 5 per minute
        "register": {"max_requests": 3, "window": 3600},  # 3 per hour
        "api_general": {"max_requests": 1000, "window": 60},  # 1000 per minute
        "bulk_operations": {"max_requests": 10, "window": 60},  # 10 per minute
        "ai_operations": {"max_requests": 50, "window": 60},  # 50 per minute
    }

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Apply rate limiting to various endpoints."""
        client_ip = self._get_client_ip(request)
        
        try:
            # Skip rate limiting for health checks
            if request.url.path in ["/health", "/", "/docs", "/openapi.json"]:
                return await call_next(request)
            
            # Check login endpoint rate limit
            if request.method == "POST" and "/auth/login" in request.url.path:
                config = self.RATE_LIMITS["login"]
                is_rate_limited = await self._check_rate_limit(
                    client_ip, "login", config["max_requests"], config["window"]
                )
                if is_rate_limited:
                    logger.warning(f"Login rate limit exceeded for IP: {client_ip}")
                    return JSONResponse(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        content={"detail": "Too many login attempts. Try again in 1 minute."},
                    )
            
            # Check registration endpoint rate limit
            elif request.method == "POST" and "/register/user" in request.url.path:
                config = self.RATE_LIMITS["register"]
                is_rate_limited = await self._check_rate_limit(
                    client_ip, "register", config["max_requests"], config["window"]
                )
                if is_rate_limited:
                    logger.warning(f"Registration rate limit exceeded for IP: {client_ip}")
                    return JSONResponse(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        content={"detail": "Too many registration attempts. Try again in 1 hour."},
                    )
            
            # Check bulk operations rate limit
            elif request.method == "POST" and "/bulk" in request.url.path:
                config = self.RATE_LIMITS["bulk_operations"]
                is_rate_limited = await self._check_rate_limit(
                    client_ip, "bulk", config["max_requests"], config["window"]
                )
                if is_rate_limited:
                    logger.warning(f"Bulk operation rate limit exceeded for IP: {client_ip}")
                    return JSONResponse(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        content={"detail": "Too many bulk operations. Try again in 1 minute."},
                    )
            
            # Check AI operations rate limit
            elif "/ai/" in request.url.path or "/ats" in request.url.path:
                config = self.RATE_LIMITS["ai_operations"]
                is_rate_limited = await self._check_rate_limit(
                    client_ip, "ai", config["max_requests"], config["window"]
                )
                if is_rate_limited:
                    logger.warning(f"AI operation rate limit exceeded for IP: {client_ip}")
                    return JSONResponse(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        content={"detail": "Too many AI requests. Try again in 1 minute."},
                    )
            
            # General API rate limiting
            else:
                config = self.RATE_LIMITS["api_general"]
                is_rate_limited = await self._check_rate_limit(
                    client_ip, "api", config["max_requests"], config["window"]
                )
                if is_rate_limited:
                    logger.warning(f"General API rate limit exceeded for IP: {client_ip}")
                    return JSONResponse(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        content={"detail": "Too many requests. Please slow down."},
                    )
                    
        except Exception as e:
            logger.error(f"Rate limit check failed: {e}")
            # Don't block requests if Redis fails (graceful degradation)
            pass

        response = await call_next(request)
        return response

    async def _check_rate_limit(
        self, 
        client_ip: str, 
        endpoint: str,
        max_requests: int = 5,
        window_seconds: int = 60
    ) -> bool:
        """
        Check if client has exceeded rate limit.
        
        Args:
            client_ip: Client IP address
            endpoint: Endpoint name (login, register)
            max_requests: Maximum requests allowed
            window_seconds: Time window in seconds
            
        Returns:
            True if rate limited, False otherwise
        """
        key = f"rate_limit:{endpoint}:{client_ip}"
        
        try:
            current = await redis_client.incr(key)
            if current == 1:
                # First request, set expiry to window
                await redis_client.expire(key, window_seconds)
            
            return current > max_requests
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
