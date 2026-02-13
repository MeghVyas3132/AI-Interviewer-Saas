"""
Request body size limit middleware.
Prevents oversized payloads from consuming server resources.
"""

import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

# 10 MB default max body size
DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024  # 10 MB

# Routes that accept larger uploads (resume PDFs, Excel imports, etc.)
LARGE_UPLOAD_PATHS = {
    "/api/v1/candidates/import",
    "/api/v1/candidates/upload-resume",
    "/api/v1/ai/parse-resume",
    "/api/v1/ai/analyze-resume",
}
LARGE_UPLOAD_MAX = 50 * 1024 * 1024  # 50 MB for file uploads


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """
    Reject requests with bodies larger than the allowed maximum.
    
    Limits:
    - General API: 10 MB
    - File upload endpoints: 50 MB
    """

    async def dispatch(self, request: Request, call_next):
        # Only check body size for methods that have a body
        if request.method in ("POST", "PUT", "PATCH"):
            content_length = request.headers.get("content-length")
            
            # Determine the limit for this path
            path = request.url.path.rstrip("/")
            max_size = DEFAULT_MAX_BODY_SIZE
            for upload_path in LARGE_UPLOAD_PATHS:
                if path.startswith(upload_path):
                    max_size = LARGE_UPLOAD_MAX
                    break

            if content_length:
                try:
                    if int(content_length) > max_size:
                        logger.warning(
                            f"Request body too large: {content_length} bytes "
                            f"from {request.client.host if request.client else 'unknown'} "
                            f"on {request.url.path} (limit: {max_size})"
                        )
                        return JSONResponse(
                            status_code=413,
                            content={
                                "detail": f"Request body too large. Maximum allowed: {max_size // (1024*1024)} MB"
                            },
                        )
                except ValueError:
                    pass  # Non-numeric content-length, let the framework handle it

        return await call_next(request)
