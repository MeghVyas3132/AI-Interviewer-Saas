"""
FastAPI application factory and initialization.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

    return app


app = create_app()
