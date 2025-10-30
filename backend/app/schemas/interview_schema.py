"""
Interview schemas for request/response validation.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.interview import InterviewStatus


class InterviewBase(BaseModel):
    """Base interview schema."""

    candidate_id: UUID
    interviewer_id: Optional[UUID] = None
    scheduled_at: datetime
    notes: Optional[str] = None


class InterviewCreate(InterviewBase):
    """Schema for creating an interview."""

    pass


class InterviewUpdate(BaseModel):
    """Schema for updating an interview."""

    interviewer_id: Optional[UUID] = None
    scheduled_at: Optional[datetime] = None
    status: Optional[InterviewStatus] = None
    notes: Optional[str] = None
    recording_url: Optional[str] = None
    transcript_url: Optional[str] = None


class InterviewResponse(InterviewBase):
    """Schema for interview response."""

    id: UUID
    company_id: UUID
    scheduled_by: UUID
    status: InterviewStatus
    recording_url: Optional[str] = None
    transcript_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True


class InterviewListResponse(BaseModel):
    """Schema for interview list response."""

    id: UUID
    candidate_id: UUID
    interviewer_id: Optional[UUID] = None
    scheduled_at: datetime
    status: InterviewStatus
    created_at: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True
