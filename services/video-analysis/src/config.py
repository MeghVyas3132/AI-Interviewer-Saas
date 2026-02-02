from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Server
    port: int = 8002
    debug: bool = False
    environment: str = "development"
    
    # Redis
    redis_url: str = "redis://localhost:6379"
    
    # Internal API Key - REQUIRED in production
    internal_api_key: str = ""  # Must be set via environment variable
    
    # CORS - Allowed origins (comma-separated in env)
    allowed_origins: List[str] = ["http://localhost:3000", "http://localhost:8000"]
    
    # Analysis settings
    frame_analysis_interval_ms: int = 2000  # Analyze every 2 seconds
    head_movement_sensitivity: float = 0.3  # Higher = more sensitive
    video_quality_brightness_min: int = 50  # Minimum brightness (0-255)
    video_quality_brightness_max: int = 200  # Maximum brightness
    
    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
