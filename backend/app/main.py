"""
FastAPI application factory and initialization.

Backend-only API application for AI Interviewer Platform.
"""

from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from sqlalchemy import text

from app.core.config import settings
from app.core.database import close_db, init_db, AsyncSessionLocal
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.middleware.logging import RequestLoggingMiddleware
from app.routes import auth, company, interviews, logs, roles, scores, users, email, register, candidates
from app.utils.redis_client import redis_client

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application lifecycle: startup and shutdown.
    """
    # Startup
    await init_db()
    await redis_client.connect()
    yield

    # Shutdown
    await redis_client.disconnect()
    await close_db()


def create_app() -> FastAPI:
    """
    Create and configure FastAPI application.

    Returns:
        Configured FastAPI application
    """
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
    )

    # Add request logging middleware (after security but before other middleware)
    app.add_middleware(RequestLoggingMiddleware)

    # Add security headers middleware (must be before CORS)
    app.add_middleware(SecurityHeadersMiddleware)

    # Add rate limiting middleware (must be before CORS)
    # TEMPORARILY DISABLED for heavy testing - will re-enable before production deployment
    # app.add_middleware(RateLimitMiddleware)

    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(auth.router)
    app.include_router(company.router)
    app.include_router(register.router)
    app.include_router(users.router)
    app.include_router(roles.router)
    app.include_router(interviews.router)
    app.include_router(scores.router)
    app.include_router(logs.router)
    app.include_router(email.router)
    app.include_router(candidates.router)  # Phase 2: Candidates

    @app.get("/health")
    async def health_check():
        """
        Comprehensive health check endpoint.

        Checks:
        1. API is running (always passes)
        2. PostgreSQL database connectivity
        3. Redis connectivity

        Returns:
            {
                "status": "healthy" | "degraded" | "unhealthy",
                "database": "healthy" | "unhealthy",
                "redis": "healthy" | "unhealthy",
                "timestamp": "2024-01-15T10:30:45Z"
            }

        Status Codes:
        - 200: Fully healthy (all services up)
        - 503: Degraded or unhealthy (one or more services down)
        """
        from datetime import datetime, timezone

        db_status = "unhealthy"
        redis_status = "unhealthy"
        overall_status = "healthy"

        # Check database connectivity
        try:
            async with AsyncSessionLocal() as session:
                await session.execute(text("SELECT 1"))
            db_status = "healthy"
            logger.debug("Database health check: OK")
        except Exception as e:
            db_status = "unhealthy"
            overall_status = "degraded"
            logger.error(f"Database health check failed: {str(e)}")

        # Check Redis connectivity
        try:
            await redis_client.ping()
            redis_status = "healthy"
            logger.debug("Redis health check: OK")
        except Exception as e:
            redis_status = "unhealthy"
            overall_status = "degraded"
            logger.error(f"Redis health check failed: {str(e)}")

        # If both are down, mark as unhealthy
        if db_status == "unhealthy" and redis_status == "unhealthy":
            overall_status = "unhealthy"

        response_data = {
            "status": overall_status,
            "database": db_status,
            "redis": redis_status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        # Return 503 if not fully healthy
        if overall_status != "healthy":
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content=response_data,
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=response_data,
        )

    # Add OpenAPI security scheme for Swagger UI
    def custom_openapi():
        """Add Bearer token security scheme to OpenAPI documentation."""
        if app.openapi_schema:
            return app.openapi_schema

        openapi_schema = get_openapi(
            title=settings.app_name,
            version=settings.app_version,
            description="AI Interviewer Platform - Backend API",
            routes=app.routes,
        )

        # Add security scheme
        openapi_schema["components"]["securitySchemes"] = {
            "Bearer": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": "Enter the JWT token obtained from /api/v1/auth/login",
            }
        }

        # Add security to paths that need it (exclude public endpoints)
        public_paths = [
            "/api/v1/auth/login",
            "/api/v1/auth/refresh",
            "/api/v1/company",  # POST to register company is public
            "/health",
        ]
        
        for path, methods in openapi_schema.get("paths", {}).items():
            # Check if this is a public path
            is_public = path in public_paths or path == "/api/v1/company"
            
            for method, operation in methods.items():
                if method == "parameters":  # Skip non-operation keys
                    continue
                    
                # For POST /api/v1/company (register), it's public
                # For GET /api/v1/company/{company_id}, it's protected
                if path == "/api/v1/company" and method != "post":
                    operation["security"] = [{"Bearer": []}]
                elif not is_public:
                    operation["security"] = [{"Bearer": []}]

        app.openapi_schema = openapi_schema
        return app.openapi_schema

    app.openapi = custom_openapi

    return app


app = create_app()
