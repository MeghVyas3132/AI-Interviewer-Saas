from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Server
    port: int = 8003
    debug: bool = False
    
    # Redis
    redis_url: str = "redis://localhost:6379"
    
    # Internal API Key
    internal_api_key: str = "dev-internal-key"
    
    # Face Detection Settings
    min_detection_confidence: float = 0.7
    face_embedding_threshold: float = 0.6  # Distance threshold for same person
    
    # Multiple Face Detection
    multiple_face_frames_threshold: int = 3  # Consecutive frames with multiple faces
    
    # Face Switch Detection
    face_switch_duration_threshold_ms: int = 5000  # 5 seconds of different face
    
    # Background Voice Detection
    voice_energy_threshold: float = 0.01
    
    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
