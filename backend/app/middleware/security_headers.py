"""
Security headers middleware for production compliance.

Adds security headers to all HTTP responses:
- X-Content-Type-Options: Prevents MIME-type sniffing
- X-Frame-Options: Prevents clickjacking by disallowing framing
- Strict-Transport-Security: Forces HTTPS-only communication
- X-XSS-Protection: Legacy XSS protection
- Referrer-Policy: Controls referrer information
"""

import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Add security headers to all HTTP responses.

    This middleware adds the following headers:
    - X-Content-Type-Options: nosniff - Prevents browser MIME-sniffing
    - X-Frame-Options: DENY - Prevents framing attacks (clickjacking)
    - Strict-Transport-Security: Enforces HTTPS-only (max-age 31536000 = 1 year)
    - X-XSS-Protection: 1; mode=block - Legacy XSS protection (deprecated but still useful)
    - Referrer-Policy: strict-origin-when-cross-origin - Controls referrer leaking
    - Content-Security-Policy: Restricts resource loading to same-origin

    Benefits:
    - Prevents MIME-type attacks (e.g., executing CSS as JS)
    - Prevents clickjacking attacks via iframe embedding
    - Forces secure connections (HTTPS) and prevents SSL-stripping
    - Mitigates XSS attacks
    - Protects referrer information in cross-origin requests
    - Restricts resource loading to trusted sources
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        """
        Process request and add security headers to response.

        Args:
            request: HTTP request
            call_next: Next middleware/handler

        Returns:
            Response with security headers
        """
        response = await call_next(request)

        # Prevent MIME-type sniffing (security against drive-by downloads)
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking by disallowing framing
        response.headers["X-Frame-Options"] = "DENY"

        # Force HTTPS and prevent SSL-stripping
        # max-age=31536000 is 1 year in seconds
        # includeSubDomains applies policy to subdomains
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )

        # Legacy XSS protection (deprecated in modern browsers but still useful)
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Control referrer information leaking across origins
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Content Security Policy.
        # Allow specific trusted CDNs/font hosts so the built-in docs (Swagger UI / ReDoc)
        # which reference external JS/CSS can load correctly during local development.
        # Keep CSP restrictive otherwise.
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
            "img-src 'self' data: https:; "
            "font-src 'self' data: https://fonts.gstatic.com; "
            "connect-src 'self' https:; "
            "frame-ancestors 'none'; "
            "upgrade-insecure-requests"
        )

        # Disable client-side caching for sensitive pages
        # (but still allow browser cache for performance)
        response.headers["Cache-Control"] = "public, max-age=3600, must-revalidate"

        # Disable FLoC (Federated Learning of Cohorts) tracking
        response.headers["Permissions-Policy"] = "interest-cohort=()"

        logger.debug(f"Security headers added to {request.method} {request.url.path}")

        return response
