"""
FastAPI application factory and initialization.

Backend-only API application for AI Interviewer Platform.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from app.core.config import settings
from app.core.database import close_db, init_db
from app.routes import auth, company, interviews, logs, roles, scores, users
from app.utils.redis_client import redis_client


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
    app.include_router(users.router)
    app.include_router(roles.router)
    app.include_router(interviews.router)
    app.include_router(scores.router)
    app.include_router(logs.router)

    @app.get("/health")
    async def health_check() -> dict:
        """Health check endpoint."""
        return {"status": "healthy"}

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
