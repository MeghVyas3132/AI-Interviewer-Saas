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
    cors_origins: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:9002",
        "http://127.0.0.1:9002",
        "http://localhost:9004",
        "http://127.0.0.1:9004",
    ]

    @field_validator('cors_origins', mode='before')
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS origins from JSON string if provided as environment variable."""
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                logger.warning(f"Failed to parse CORS_ORIGINS as JSON, using defaults")
                return [
                    "http://localhost:3000",
                    "http://127.0.0.1:3000",
                    "http://localhost:9002",
                    "http://127.0.0.1:9002",
                    "http://localhost:9004",
                    "http://127.0.0.1:9004",
                ]
        return v

    # Pagination
    default_page_size: int = 20
    max_page_size: int = 100

    # Rate Limiting
    rate_limit_login: str = "5/minute"  # 5 login attempts per minute
    rate_limit_api: str = "100/minute"  # 100 requests per minute

    # Email Configuration (Phase 1)
    email_provider: str = "console"  # sendgrid, ses, console
    email_from_address: str = "noreply@aiinterviewer.com"
    email_from_name: str = "AI Interviewer"
    sendgrid_api_key: str = ""  # Optional: Set for SendGrid
    
    # Celery & Redis Configuration (Phase 2 - Async Email)
    celery_broker_url: str = ""  # Redis URL for task queue (can use REDIS_URL)
    celery_result_backend_url: str = ""  # Redis URL for results
    celery_worker_prefetch_multiplier: int = 4
    celery_task_max_retries: int = 3
    celery_task_default_retry_delay: int = 60  # seconds
    email_rate_limit: str = "100/minute"  # Max emails per minute to provider
    email_batch_size: int = 50  # Send emails in batches
    email_send_timeout: int = 30  # Seconds to wait for email provider
    
    # AWS Configuration (Phase 4)
    aws_region: str = "us-east-1"
    aws_access_key_id: str = ""  # Optional: Set for AWS SES
    aws_secret_access_key: str = ""  # Optional: Set for AWS SES

    # Security
    bcrypt_rounds: int = 12
    password_min_length: int = 8
    
    # AI Service Integration
    ai_service_url: str = "http://localhost:9004"
    ai_service_api_key: str = ""  # Optional: For future security

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

    @field_validator("celery_broker_url", mode="before")
    @classmethod
    def set_celery_broker_url(cls, v: str, info) -> str:
        """Set Celery broker URL (defaults to REDIS_URL if not set)"""
        if v:
            return v
        # Use redis_url as fallback
        redis_url = info.data.get("redis_url")
        if redis_url:
            return redis_url
        raise ValueError("CELERY_BROKER_URL or REDIS_URL must be set")

    @field_validator("celery_result_backend_url", mode="before")
    @classmethod
    def set_celery_result_backend_url(cls, v: str, info) -> str:
        """Set Celery result backend URL (defaults to REDIS_URL if not set)"""
        if v:
            return v
        # Use redis_url as fallback
        redis_url = info.data.get("redis_url")
        if redis_url:
            return redis_url
        raise ValueError("CELERY_RESULT_BACKEND_URL or REDIS_URL must be set")

    class Config:
        """Pydantic settings config."""
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "forbid"  # Reject unknown environment variables


# Lazy initialization with validation
settings = Settings()
