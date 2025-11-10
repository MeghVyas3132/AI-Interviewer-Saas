"""
Score model - represents interview scores and AI evaluation results.
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.core.database import Base
import uuid


class Score(Base):
    """Score entity for storing interview evaluation results."""

    __tablename__ = "scores"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    interview_id = Column(UUID(as_uuid=True), ForeignKey("interviews.id"), nullable=False, index=True)
    communication = Column(Integer, nullable=True)
    technical = Column(Integer, nullable=True)
    behaviour = Column(Integer, nullable=True)
    overall = Column(Float, nullable=True)
    pass_recommendation = Column(Boolean, nullable=True)
    evaluator_notes = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        """String representation of Score."""
        return f"<Score(id={self.id}, interview_id={self.interview_id})>"
