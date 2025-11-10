"""
Application configuration using Pydantic Settings.
Follows 12-factor app principles with production-grade security.
"""

import logging
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_name: str = "AI Interviewer Platform"
    app_version: str = "1.0.0"
    debug: bool = False  # MUST be False in production
    log_level: str = "INFO"
    environment: str = "development"  # development, staging, production

    # Database - use environment variables only in production
    database_url: str
    database_pool_size: int = 20
    database_max_overflow: int = 10
    database_pool_recycle: int = 3600
    database_query_timeout: int = 30

    # Redis
    redis_url: str
    redis_max_connections: int = 50

    # JWT - SECRET_KEY MUST be set via environment variable
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # CORS
    cors_origins: List[str] = ["http://localhost:3000"]

    # Pagination
    default_page_size: int = 20
    max_page_size: int = 100

    # Rate Limiting
    rate_limit_login: str = "5/minute"  # 5 login attempts per minute
    rate_limit_api: str = "100/minute"  # 100 requests per minute

    # Security
    bcrypt_rounds: int = 12
    password_min_length: int = 8

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        """Ensure secret_key is set and sufficiently long (CRITICAL)."""
        if not v or v == "your-super-secret-key-change-in-production":
            raise ValueError(
                "SECRET_KEY environment variable must be set to a secure 256-bit value. "
                "Generate with: python3 -c 'import secrets; print(secrets.token_urlsafe(32))'"
            )
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters (256-bit)")
        return v

    @field_validator("debug")
    @classmethod
    def validate_debug(cls, v: bool, info) -> bool:
        """Warn if debug is True in production."""
        if v and info.data.get("environment") == "production":
            raise ValueError("DEBUG must be False in production")
        return v

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        """Ensure database URL is set."""
        if not v:
            raise ValueError("DATABASE_URL environment variable must be set")
        if "postgresql" not in v and "postgres" not in v:
            raise ValueError("DATABASE_URL must be a PostgreSQL connection string")
        # Never log full URL (contains password)
        logger.info("Database URL configured")
        return v

    @field_validator("redis_url")
    @classmethod
    def validate_redis_url(cls, v: str) -> str:
        """Ensure Redis URL is set."""
        if not v:
            raise ValueError("REDIS_URL environment variable must be set")
        return v

    class Config:
        """Pydantic settings config."""
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "forbid"  # Reject unknown environment variables


# Lazy initialization with validation
settings = Settings()
