"""
Company AI Configuration model - stores AI settings per company.
"""

from datetime import datetime
import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class CompanyAIConfig(Base):
    """AI configuration settings for a company."""

    __tablename__ = "company_ai_config"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey('companies.id', ondelete='CASCADE'), nullable=False, unique=True)
    
    # Scoring thresholds
    min_passing_score = Column(Integer, nullable=False, default=70)  # Min score to pass AI interview
    min_ats_score = Column(Integer, nullable=False, default=60)  # Min ATS score for resume
    auto_reject_below = Column(Integer, nullable=True)  # Auto reject candidates below this score
    
    # Feature flags
    require_employee_review = Column(Boolean, default=True)  # Require employee to review AI decision
    ats_enabled = Column(Boolean, default=True)  # Enable ATS checking
    ai_verdict_enabled = Column(Boolean, default=True)  # Enable AI verdict generation
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<CompanyAIConfig(company_id={self.company_id}, min_passing={self.min_passing_score})>"
    
    def to_dict(self):
        return {
            "id": str(self.id),
            "company_id": str(self.company_id),
            "min_passing_score": self.min_passing_score,
            "min_ats_score": self.min_ats_score,
            "auto_reject_below": self.auto_reject_below,
            "require_employee_review": self.require_employee_review,
            "ats_enabled": self.ats_enabled,
            "ai_verdict_enabled": self.ai_verdict_enabled,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }
