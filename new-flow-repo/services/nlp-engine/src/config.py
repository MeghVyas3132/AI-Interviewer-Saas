"""
NLP Engine Configuration
"""
from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings"""
    
    # Service
    service_name: str = "nlp-engine"
    environment: str = "development"
    debug: bool = False
    
    # Redis
    redis_url: str = "redis://localhost:6379"
    
    # LLM Configuration
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    
    # Default LLM to use
    default_llm: str = "openai"  # or "anthropic"
    
    # Model settings
    openai_model: str = "gpt-4o"
    anthropic_model: str = "claude-3-sonnet-20240229"
    
    # Rate limiting
    max_tokens_per_minute: int = 10000
    
    # Analysis settings
    contradiction_confidence_threshold: float = 0.8
    skill_mismatch_threshold: float = 0.7
    
    # Question generation
    max_followup_questions: int = 5
    
    class Config:
        env_file = ".env"


settings = Settings()
