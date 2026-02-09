"""
Interview round schemas for request/response validation.
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, validator


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


class InterviewRoundCreate(BaseModel):
    """Schema for creating an interview round."""

    candidate_id: UUID = Field(..., description="Candidate ID")
    round_type: RoundType = Field(default=RoundType.SCREENING, description="Type of interview round")
    interviewer_id: Optional[UUID] = Field(None, description="Assigned interviewer")
    scheduled_at: datetime = Field(..., description="Scheduled datetime (should be timezone-aware)")
    timezone: str = Field(default="UTC", description="Candidate's timezone (e.g., 'America/New_York')")
    duration_minutes: int = Field(default=60, ge=15, le=480, description="Duration in minutes")
    notes: Optional[str] = Field(None, description="Round notes/description")

    @validator("scheduled_at")
    def validate_future_datetime(cls, v):
        """Ensure scheduled time is in the future."""
        if v <= datetime.now(v.tzinfo) if v.tzinfo else datetime.utcnow():
            raise ValueError("Scheduled time must be in the future")
        return v

    class Config:
        """Pydantic config."""

        json_schema_extra = {
            "example": {
                "candidate_id": "550e8400-e29b-41d4-a716-446655440000",
                "round_type": "SCREENING",
                "interviewer_id": "550e8400-e29b-41d4-a716-446655440001",
                "scheduled_at": "2025-11-20T14:00:00+00:00",
                "timezone": "America/New_York",
                "duration_minutes": 60,
                "notes": "Initial screening round",
            }
        }


class InterviewRoundUpdate(BaseModel):
    """Schema for updating an interview round."""

    round_type: Optional[RoundType] = None
    interviewer_id: Optional[UUID] = None
    scheduled_at: Optional[datetime] = None
    timezone: Optional[str] = None
    duration_minutes: Optional[int] = Field(None, ge=15, le=480)
    status: Optional[RoundStatus] = None
    notes: Optional[str] = None

    class Config:
        """Pydantic config."""

        json_schema_extra = {
            "example": {
                "scheduled_at": "2025-11-21T10:00:00+00:00",
                "timezone": "America/Los_Angeles",
                "notes": "Rescheduled due to interviewer conflict",
            }
        }


class InterviewRoundResponse(BaseModel):
    """Schema for interview round response."""

    id: UUID
    company_id: UUID
    candidate_id: UUID
    round_type: RoundType
    interviewer_id: Optional[UUID]
    scheduled_at: datetime
    timezone: str
    duration_minutes: int
    status: RoundStatus
    notes: Optional[str]
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440002",
                "company_id": "550e8400-e29b-41d4-a716-446655440003",
                "candidate_id": "550e8400-e29b-41d4-a716-446655440000",
                "round_type": "SCREENING",
                "interviewer_id": "550e8400-e29b-41d4-a716-446655440001",
                "scheduled_at": "2025-11-20T14:00:00-05:00",
                "timezone": "America/New_York",
                "duration_minutes": 60,
                "status": "SCHEDULED",
                "notes": "Initial screening round",
                "created_by": "550e8400-e29b-41d4-a716-446655440004",
                "created_at": "2025-11-16T10:00:00+00:00",
                "updated_at": "2025-11-16T10:00:00+00:00",
            }
        }


class InterviewRoundListResponse(BaseModel):
    """Schema for listing interview rounds."""

    id: UUID
    candidate_id: UUID
    round_type: RoundType
    interviewer_id: Optional[UUID]
    scheduled_at: datetime
    timezone: str
    duration_minutes: int
    status: RoundStatus
    created_at: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True


class RoundScheduleRequest(BaseModel):
    """Schema for batch scheduling multiple rounds."""

    candidate_id: UUID = Field(..., description="Candidate ID")
    rounds: List[InterviewRoundCreate] = Field(..., description="List of rounds to schedule", min_items=1)

    class Config:
        """Pydantic config."""

        json_schema_extra = {
            "example": {
                "candidate_id": "550e8400-e29b-41d4-a716-446655440000",
                "rounds": [
                    {
                        "round_type": "SCREENING",
                        "interviewer_id": "550e8400-e29b-41d4-a716-446655440001",
                        "scheduled_at": "2025-11-20T14:00:00+00:00",
                        "timezone": "America/New_York",
                        "duration_minutes": 60,
                    },
                    {
                        "round_type": "TECHNICAL",
                        "interviewer_id": "550e8400-e29b-41d4-a716-446655440005",
                        "scheduled_at": "2025-11-22T10:00:00+00:00",
                        "timezone": "America/New_York",
                        "duration_minutes": 90,
                    },
                ],
            }
        }


class BatchRoundResponse(BaseModel):
    """Response for batch round scheduling."""

    scheduled: List[InterviewRoundResponse] = Field(..., description="Successfully scheduled rounds")
    failed: List[dict] = Field(default_factory=list, description="Failed scheduling attempts")
    total_scheduled: int = Field(..., description="Total successfully scheduled")
    total_failed: int = Field(..., description="Total failed")

    class Config:
        """Pydantic config."""

        json_schema_extra = {
            "example": {
                "scheduled": [],
                "failed": [],
                "total_scheduled": 2,
                "total_failed": 0,
            }
        }


class CandidateRoundProgressResponse(BaseModel):
    """Response showing candidate's interview round progress."""

    candidate_id: UUID
    total_rounds: int
    completed_rounds: int
    pending_rounds: int
    cancelled_rounds: int
    rounds: List[InterviewRoundListResponse]
    next_round: Optional[InterviewRoundResponse]

    class Config:
        """Pydantic config."""

        from_attributes = True


class RescheduleRoundRequest(BaseModel):
    """Schema for rescheduling an interview round."""

    scheduled_at: datetime = Field(..., description="New scheduled datetime")
    timezone: Optional[str] = Field(None, description="New timezone")
    reason: Optional[str] = Field(None, description="Reason for rescheduling")

    class Config:
        """Pydantic config."""

        json_schema_extra = {
            "example": {
                "scheduled_at": "2025-11-21T15:00:00+00:00",
                "timezone": "America/New_York",
                "reason": "Interviewer not available at original time",
            }
        }
