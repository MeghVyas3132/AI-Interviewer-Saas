"""
Request logging middleware for production observability.

Logs all HTTP requests with:
- Method, path, status code, response time
- Request headers (sanitized for sensitive data)
- Response size
- Client IP address

Structured JSON logging for easy parsing and monitoring.
"""

import json
import logging
import time
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Log all HTTP requests and responses with structured JSON format.

    Log Output:
    {
        "timestamp": "2024-01-15T10:30:45.123Z",
        "method": "POST",
        "path": "/api/v1/auth/login",
        "status_code": 200,
        "response_time_ms": 150.25,
        "client_ip": "192.168.1.100",
        "user_agent": "Mozilla/5.0...",
        "request_size_bytes": 256,
        "response_size_bytes": 512
    }
    """

    # Sensitive headers that should not be logged
    SENSITIVE_HEADERS = {
        "authorization",
        "cookie",
        "x-api-key",
        "x-auth-token",
        "password",
        "secret",
    }

    # Paths that should not be logged (noisy health checks)
    EXCLUDED_PATHS = {"/health", "/healthz", "/readiness", "/liveness"}

    async def dispatch(self, request: Request, call_next) -> Response:
        """
        Process request, measure response time, and log structured data.

        Args:
            request: HTTP request
            call_next: Next middleware/handler

        Returns:
            Response with logging
        """
        # Skip logging for excluded paths
        if request.url.path in self.EXCLUDED_PATHS:
            return await call_next(request)

        # Record start time
        start_time = time.time()

        # Get client IP (with proxy support)
        client_ip = self._get_client_ip(request)

        try:
            # Process request and get response
            response = await call_next(request)

            # Calculate response time
            duration_ms = (time.time() - start_time) * 1000

            # Log request/response
            self._log_request(
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_ms=duration_ms,
                client_ip=client_ip,
                user_agent=request.headers.get("user-agent", "unknown"),
                request_size=self._get_request_size(request),
                response_size=response.headers.get("content-length", 0),
            )

            return response

        except Exception as exc:
            # Log error and re-raise
            duration_ms = (time.time() - start_time) * 1000
            self._log_error(
                method=request.method,
                path=request.url.path,
                duration_ms=duration_ms,
                client_ip=client_ip,
                error=str(exc),
            )
            raise

    def _get_client_ip(self, request: Request) -> str:
        """
        Get client IP address with proxy support.

        Checks in order:
        1. X-Forwarded-For header (for proxied requests)
        2. X-Real-IP header (alternative proxy header)
        3. request.client.host (direct connection)

        Args:
            request: HTTP request

        Returns:
            Client IP address
        """
        # Check for proxied IP first
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            # X-Forwarded-For can contain multiple IPs; take the first
            return forwarded_for.split(",")[0].strip()

        # Check alternative proxy header
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip

        # Fallback to direct connection
        if request.client:
            return request.client.host

        return "unknown"

    def _get_request_size(self, request: Request) -> int:
        """
        Get request size in bytes.

        Args:
            request: HTTP request

        Returns:
            Request size in bytes
        """
        size = 0

        # Add method + path + HTTP version (~50 bytes typical)
        size += len(request.method) + len(request.url.path) + 20

        # Add headers
        for header_name, header_value in request.headers.items():
            size += len(header_name) + len(header_value) + 4  # ": \r\n"

        return size

    def _log_request(
        self,
        method: str,
        path: str,
        status_code: int,
        duration_ms: float,
        client_ip: str,
        user_agent: str,
        request_size: int,
        response_size: Optional[int] = None,
    ) -> None:
        """
        Log HTTP request with structured JSON format.

        Args:
            method: HTTP method
            path: Request path
            status_code: HTTP status code
            duration_ms: Response time in milliseconds
            client_ip: Client IP address
            user_agent: User-Agent header
            request_size: Request size in bytes
            response_size: Response size in bytes
        """
        log_data = {
            "method": method,
            "path": path,
            "status_code": status_code,
            "response_time_ms": round(duration_ms, 2),
            "client_ip": client_ip,
            "user_agent": user_agent[:100],  # Limit to 100 chars
            "request_size_bytes": request_size,
            "response_size_bytes": int(response_size or 0),
        }

        # Determine log level based on status code
        if status_code >= 500:
            logger.error(json.dumps(log_data))
        elif status_code >= 400:
            logger.warning(json.dumps(log_data))
        else:
            logger.info(json.dumps(log_data))

    def _log_error(
        self,
        method: str,
        path: str,
        duration_ms: float,
        client_ip: str,
        error: str,
    ) -> None:
        """
        Log HTTP request error.

        Args:
            method: HTTP method
            path: Request path
            duration_ms: Response time in milliseconds
            client_ip: Client IP address
            error: Error message
        """
        log_data = {
            "method": method,
            "path": path,
            "status_code": 500,
            "response_time_ms": round(duration_ms, 2),
            "client_ip": client_ip,
            "error": error,
        }

        logger.error(json.dumps(log_data))
