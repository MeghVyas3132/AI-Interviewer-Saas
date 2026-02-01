from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Server
    port: int = 8001
    debug: bool = False
    
    # Redis
    redis_url: str = "redis://localhost:6379"
    
    # Internal API Key
    internal_api_key: str = "dev-internal-key"
    
    # Deepgram (Primary STT)
    deepgram_api_key: Optional[str] = None
    
    # Whisper (Fallback STT)
    whisper_model_size: str = "base"  # tiny, base, small, medium, large
    
    # Analysis settings
    confidence_window_seconds: int = 10  # Rolling window for confidence calculation
    hesitation_pause_threshold_ms: int = 2000  # Pause longer than this = hesitation
    filler_words: list = ["um", "uh", "like", "you know", "basically", "actually", "literally"]
    
    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
