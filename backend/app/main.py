"""
FastAPI application factory and initialization.

Backend-only API application for AI Interviewer Platform.
Optimized for production with compression, connection pooling, and async patterns.
"""

from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI, status, Request
from fastapi.responses import JSONResponse, ORJSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.openapi.utils import get_openapi
from sqlalchemy import text

from app.core.config import settings
from app.core.database import close_db, init_db, AsyncSessionLocal
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.middleware.logging import RequestLoggingMiddleware
from app.routes import auth, admin, company, interviews, interview_rounds, logs, roles, scores, hr, users, email, register, candidates, employee, candidate_portal, ai, jobs, realtime
from app.utils.redis_client import redis_client

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application lifecycle: startup and shutdown.
    Initializes all connections and cleanly shuts them down.
    """
    # Startup - initialize all connections
    logger.info("Starting application...")
    await init_db()
    await redis_client.connect()
    logger.info("Database and Redis connected")
    
    yield

    # Shutdown - clean up all connections gracefully
    logger.info("Shutting down application...")
    try:
        from app.services.ai_service import close_http_client
        await close_http_client()
    except Exception as e:
        logger.warning(f"Error closing HTTP client: {e}")
    
    await redis_client.disconnect()
    await close_db()
    logger.info("All connections closed")


def create_app() -> FastAPI:
    """
    Create and configure FastAPI application with production optimizations.

    Returns:
        Configured FastAPI application
    """
    # Use ORJSON for faster JSON serialization (2-3x faster than stdlib json)
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
        default_response_class=ORJSONResponse,
        # Disable docs in production for security
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
        openapi_url="/openapi.json" if settings.debug else None,
    )

    # === MIDDLEWARE ORDER MATTERS ===
    # Middleware is processed in REVERSE order (last added = first executed)
    
    # 1. GZip compression (innermost - compresses responses)
    app.add_middleware(GZipMiddleware, minimum_size=500)
    
    # 2. Request logging (logs all requests with timing)
    app.add_middleware(RequestLoggingMiddleware)

    # 3. Security headers (add security headers to all responses)
    app.add_middleware(SecurityHeadersMiddleware)

    # 4. Rate limiting - DISABLED for testing phase
    # Uncomment for production deployment:
    # if settings.environment == "production":
    #     app.add_middleware(RateLimitMiddleware)

    # 5. CORS (outermost - handles preflight requests first)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        max_age=86400,  # Cache preflight for 24 hours
    )

    # Include routers with tags for better organization
    app.include_router(admin.router)
    app.include_router(auth.router)
    app.include_router(hr.router)
    app.include_router(employee.router)
    app.include_router(candidate_portal.router)
    app.include_router(company.router)
    app.include_router(register.router)
    app.include_router(users.router)
    app.include_router(roles.router)
    app.include_router(interviews.router)
    app.include_router(interview_rounds.router)
    app.include_router(scores.router)
    app.include_router(logs.router)
    app.include_router(email.router)
    app.include_router(candidates.router)
    app.include_router(ai.router)
    app.include_router(jobs.router)
    app.include_router(realtime.router)

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
