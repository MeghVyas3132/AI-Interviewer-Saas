"""
Database configuration and session management.
SQLAlchemy 2.0 async setup with production-grade connection pooling and error handling.
"""

import logging
from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import QueuePool

from .config import settings

logger = logging.getLogger(__name__)

# Create async engine with production-optimized settings
engine = create_async_engine(
    settings.database_url.replace("postgresql://", "postgresql+asyncpg://"),
    echo=settings.debug,
    echo_pool=settings.debug,
    # Connection pooling - optimized for low latency
    poolclass=QueuePool,
    pool_size=settings.database_pool_size,  # 20 concurrent connections
    max_overflow=settings.database_max_overflow,  # 10 overflow under load
    pool_pre_ping=True,  # Verify connection health before use
    pool_recycle=settings.database_pool_recycle,  # Recycle connections periodically
    pool_timeout=getattr(settings, 'database_pool_timeout', 10),  # Fail fast if pool exhausted
    # Connection settings optimized for performance
    connect_args={
        "timeout": 10,  # Fast connection timeout (reduced from 30)
        "command_timeout": settings.database_query_timeout,  # Query timeout
        "server_settings": {
            "jit": "off",  # Disable JIT for consistent performance
            "statement_timeout": f"{settings.database_query_timeout * 1000}",  # Timeout in ms
        },
    },
)

# Create async session factory with optimized settings
async_session_maker = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,  # Don't refetch objects after commit
    autocommit=False,
    autoflush=False,  # Manual flush for better control
)

# Export for use in other modules (e.g., health checks)
AsyncSessionLocal = async_session_maker

# Base class for all models
Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency injection for database session.
    Yields an async session and handles cleanup.
    """
    session = async_session_maker()
    try:
        yield session
    except Exception as e:
        logger.error(f"Database session error: {e}")
        await session.rollback()
        raise
    finally:
        await session.close()


async def init_db() -> None:
    """
    Initialize database tables and verify connection.
    Raises RuntimeError if database is unreachable.
    """
    try:
        async with engine.begin() as conn:
            logger.info("Testing database connection...")
            # Test connection with simple query
            await conn.execute(text("SELECT 1"))
            logger.info("Database connection successful")
            
            # Create all tables (checkfirst=True to avoid conflicts with existing schema)
            logger.info("Creating database tables if not exist...")
            await conn.run_sync(
                Base.metadata.create_all, 
                checkfirst=True
            )
            logger.info("Database tables initialized successfully")
    except Exception as e:
        # If it's just a duplicate enum error, that's okay - schema already exists
        error_msg = str(e).lower()
        if "duplicate" in error_msg and "userrole" in error_msg:
            logger.info("Database schema already exists, skipping creation")
            return
        logger.error(f"Database initialization failed: {e}")
        raise RuntimeError(
            f"Failed to initialize database: {e}. "
            f"Ensure DATABASE_URL is set correctly and database is running."
        ) from e


async def close_db() -> None:
    """
    Gracefully close database connections.
    """
    try:
        logger.info("Closing database connections...")
        await engine.dispose()
        logger.info("Database connections closed successfully")
    except Exception as e:
        logger.error(f"Error closing database connections: {e}")
