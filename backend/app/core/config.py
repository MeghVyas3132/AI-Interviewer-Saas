"""
Application configuration using Pydantic Settings.
Follows 12-factor app principles.
"""

from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_name: str = "AI Interviewer Platform"
    app_version: str = "1.0.0"
    debug: bool = False
    log_level: str = "INFO"

    # Database
    database_url: str = "postgresql://ai_interviewer_user:ai_interviewer_password@localhost:5432/ai_interviewer_db"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    secret_key: str = "your-super-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # CORS (Backend only)
    cors_origins: List[str] = [
        "http://localhost:8000",
    ]

    # Pagination
    default_page_size: int = 20
    max_page_size: int = 100

    class Config:
        """Pydantic settings config."""

        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


settings = Settings()
