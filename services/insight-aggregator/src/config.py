"""
Insight Aggregator Configuration
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings"""
    
    # Service
    service_name: str = "insight-aggregator"
    environment: str = "development"
    debug: bool = False
    
    # Redis
    redis_url: str = "redis://localhost:6379"
    
    # Database
    database_url: str = "postgresql://postgres:postgres@localhost:5432/interview_ai"
    
    # Aggregation settings
    insight_window_seconds: int = 30  # Aggregate insights within this window
    min_confidence_threshold: float = 0.7
    max_insights_per_batch: int = 10
    
    # Alert thresholds
    fraud_alert_confidence: float = 0.85
    contradiction_alert_confidence: float = 0.80
    
    # Rate limiting for alerts
    min_alert_interval_seconds: int = 60  # Minimum time between similar alerts
    
    # Recommendation generation
    generate_recommendations: bool = True
    max_recommendations_per_round: int = 5
    
    class Config:
        env_file = ".env"


settings = Settings()
