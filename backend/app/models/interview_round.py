"""
InterviewRound model - represents interview round scheduling with timezone support.
"""

from datetime import datetime, timedelta
from enum import Enum

from sqlalchemy import Column, DateTime, Enum as SQLEnum, Boolean
from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.core.database import Base
import uuid


class RoundType(str, Enum):
    """Interview round types."""

    SCREENING = "SCREENING"
    TECHNICAL = "TECHNICAL"
    BEHAVIORAL = "BEHAVIORAL"
    FINAL = "FINAL"
    HR = "HR"
    CUSTOM = "CUSTOM"


class RoundStatus(str, Enum):
    """Round status enumeration."""

    SCHEDULED = "SCHEDULED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    RESCHEDULED = "RESCHEDULED"


class InterviewMode(str, Enum):
    """Interview mode - AI-conducted or human with AI assistance."""
    
    AI_CONDUCTED = "AI_CONDUCTED"
    HUMAN_AI_ASSISTED = "HUMAN_AI_ASSISTED"


class InterviewRound(Base):
    """Interview round entity for tracking multi-round interview scheduling."""

    __tablename__ = "interview_rounds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    candidate_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    round_type = Column(
        SQLEnum(
            RoundType,
            values_callable=lambda x: [e.value for e in x],
            name='roundtype',
            create_type=False,
        ),
        default=RoundType.SCREENING,
        nullable=False
    )
    interviewer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    scheduled_at = Column(DateTime(timezone=True), nullable=False, index=True)
    timezone = Column(String(50), default="UTC", nullable=False)  # e.g., "America/New_York"
    duration_minutes = Column(Integer, default=60, nullable=False)
    status = Column(
        SQLEnum(
            RoundStatus,
            values_callable=lambda x: [e.value for e in x],
            name='roundstatus',
            create_type=False,
        ),
        default=RoundStatus.SCHEDULED,
        nullable=False,
        index=True
    )
    notes = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    # Human-AI-Assisted Interview fields
    interview_mode = Column(
        SQLEnum(
            InterviewMode,
            values_callable=lambda x: [e.value for e in x],
            name='interviewmodetype',
            create_type=False,
        ),
        default=InterviewMode.AI_CONDUCTED,
        nullable=False,
        index=True
    )
    videosdk_meeting_id = Column(String(255), nullable=True)
    videosdk_token = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    ai_consent_given = Column(Boolean, default=False, nullable=False)
    consent_timestamp = Column(DateTime(timezone=True), nullable=True)

    @property
    def end_time(self) -> datetime:
        """Calculate end time based on duration."""
        return self.scheduled_at + timedelta(minutes=self.duration_minutes)

    @property
    def is_upcoming(self) -> bool:
        """Check if round is upcoming."""
        return self.status == RoundStatus.SCHEDULED and self.scheduled_at > datetime.now(self.scheduled_at.tzinfo)

    @property
    def is_overdue(self) -> bool:
        """Check if scheduled time has passed but status not updated."""
        return self.status == RoundStatus.SCHEDULED and self.scheduled_at <= datetime.now(self.scheduled_at.tzinfo)
    
    @property
    def is_human_assisted(self) -> bool:
        """Check if this is a human-AI-assisted interview."""
        return self.interview_mode == InterviewMode.HUMAN_AI_ASSISTED

    def __repr__(self) -> str:
        """String representation of InterviewRound."""
        return f"<InterviewRound(id={self.id}, round_type={self.round_type}, mode={self.interview_mode}, status={self.status})>"
