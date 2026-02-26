"""
Score schemas for request/response validation.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ScoreBase(BaseModel):
    """Base score schema."""

    communication: Optional[int] = Field(None, ge=0, le=100)
    technical: Optional[int] = Field(None, ge=0, le=100)
    behaviour: Optional[int] = Field(None, ge=0, le=100)
    evaluator_notes: Optional[str] = Field(None, max_length=500)


class ScoreCreate(ScoreBase):
    """Schema for creating a score."""

    pass


class ScoreUpdate(BaseModel):
    """Schema for updating a score."""

    communication: Optional[int] = Field(None, ge=0, le=100)
    technical: Optional[int] = Field(None, ge=0, le=100)
    behaviour: Optional[int] = Field(None, ge=0, le=100)
    pass_recommendation: Optional[bool] = None
    evaluator_notes: Optional[str] = Field(None, max_length=500)


class ScoreResponse(ScoreBase):
    """Schema for score response."""

    id: UUID
    interview_id: UUID
    overall: Optional[float] = None
    pass_recommendation: Optional[bool] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        """Pydantic config."""

        from_attributes = True
