"""
Production-grade Pydantic schemas for Phase 2
Comprehensive validation with docstrings and examples
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


# ============================================================================
# CANDIDATE SCHEMAS
# ============================================================================


class CandidateBase(BaseModel):
    """Base candidate schema with common fields"""
    email: EmailStr = Field(..., description="Candidate email address")
    first_name: Optional[str] = Field(None, max_length=255, description="First name")
    last_name: Optional[str] = Field(None, max_length=255, description="Last name")
    phone: Optional[str] = Field(None, max_length=20, description="Phone number")
    domain: Optional[str] = Field(None, max_length=255, description="Domain/Department")
    position: Optional[str] = Field(None, max_length=255, description="Target position")
    experience_years: Optional[int] = Field(None, ge=0, le=80, description="Years of experience")
    qualifications: Optional[str] = Field(None, description="Qualifications summary")


class CandidateCreate(CandidateBase):
    """Schema for creating a new candidate"""
    
    @field_validator("first_name", "last_name", mode="before")
    @classmethod
    def validate_names(cls, v):
        if v is not None:
            v = v.strip()
            if len(v) == 0:
                return None
        return v

    @field_validator("email", mode="before")
    @classmethod
    def validate_email_format(cls, v):
        if v:
            v = v.strip().lower()
        return v


class CandidateBulkImport(BaseModel):
    """Schema for bulk candidate import from Excel"""
    email: str = Field(..., description="Candidate email")
    first_name: Optional[str] = Field(None, description="First name")
    last_name: Optional[str] = Field(None, description="Last name")
    phone: Optional[str] = Field(None, description="Phone number")
    domain: Optional[str] = Field(None, description="Domain/Department")
    position: Optional[str] = Field(None, description="Position")
    experience_years: Optional[int] = Field(None, description="Years of experience")
    qualifications: Optional[str] = Field(None, description="Qualifications")


class CandidateUpdate(BaseModel):
    """Schema for updating candidate"""
    first_name: Optional[str] = Field(None, max_length=255)
    last_name: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)
    domain: Optional[str] = Field(None, max_length=255)
    position: Optional[str] = Field(None, max_length=255)
    experience_years: Optional[int] = Field(None, ge=0, le=80)
    qualifications: Optional[str] = Field(None)
    status: Optional[str] = Field(None, description="New status")


class CandidateResponse(CandidateBase):
    """Response schema for candidate"""
    id: UUID
    company_id: UUID
    status: str
    source: str
    created_by: Optional[UUID]
    resume_url: Optional[str]
    assigned_to: Optional[UUID] = Field(None, description="Assigned employee ID")
    assigned_employee_name: Optional[str] = Field(None, description="Assigned employee name")
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CandidateListResponse(BaseModel):
    """Paginated candidate list response"""
    candidates: List[CandidateResponse]
    total: int
    page: int
    page_size: int
    
    @property
    def total_pages(self) -> int:
        return (self.total + self.page_size - 1) // self.page_size


class CandidateBulkImportRequest(BaseModel):
    """Request for bulk candidate import"""
    candidates: List[CandidateBulkImport]
    send_invitations: bool = Field(True, description="Send invitation emails")
    domain: Optional[str] = Field(None, description="Default domain for all candidates")


class CandidateBulkImportResponse(BaseModel):
    """Response for bulk import operation"""
    total: int
    created: int
    failed: int
    errors: List[str] = Field(default_factory=list)
    created_candidates: List[CandidateResponse] = Field(default_factory=list)
    message: str


# ============================================================================
# INTERVIEW SCHEMAS
# ============================================================================


class InterviewBase(BaseModel):
    """Base interview schema"""
    round: str = Field(..., description="Interview round (screening, technical, hr, final)")
    scheduled_time: datetime = Field(..., description="Interview scheduled time")
    timezone: str = Field("UTC", description="Timezone")
    interviewer_id: Optional[UUID] = Field(None, description="Interviewer ID")
    meeting_link: Optional[str] = Field(None, description="Meeting link (Zoom, Google Meet)")


class InterviewCreate(InterviewBase):
    """Schema for creating an interview"""
    candidate_id: UUID = Field(..., description="Candidate ID")


class InterviewUpdate(BaseModel):
    """Schema for updating interview"""
    round: Optional[str] = None
    scheduled_time: Optional[datetime] = None
    timezone: Optional[str] = None
    interviewer_id: Optional[UUID] = None
    meeting_link: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class InterviewResponse(InterviewBase):
    """Response schema for interview"""
    id: UUID
    company_id: UUID
    candidate_id: UUID
    status: str
    notes: Optional[str]
    recording_url: Optional[str]
    transcription_url: Optional[str]
    created_by: Optional[UUID]
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class InterviewBulkScheduleRequest(BaseModel):
    """Request for bulk scheduling interviews"""
    candidate_ids: List[UUID] = Field(..., description="List of candidate IDs")
    round: str = Field(..., description="Interview round")
    scheduled_date: str = Field(..., description="Date (YYYY-MM-DD)")
    scheduled_time: str = Field(..., description="Time (HH:MM)")
    timezone: str = Field("UTC", description="Timezone")
    interviewer_id: Optional[UUID] = None


# ============================================================================
# EMAIL QUEUE SCHEMAS
# ============================================================================


class EmailQueueResponse(BaseModel):
    """Response schema for email queue status"""
    id: UUID
    recipient_email: str
    subject: str
    email_type: str
    status: str
    priority: str
    retry_count: int
    created_at: datetime
    sent_at: Optional[datetime]
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EmailStatusResponse(BaseModel):
    """Response for email send status"""
    email_id: UUID
    status: str
    message: str
    created_at: datetime


# ============================================================================
# BULK ACTION SCHEMAS
# ============================================================================


class BulkSendEmailRequest(BaseModel):
    """Request for bulk sending emails to candidates"""
    candidate_ids: List[UUID] = Field(..., min_items=1, description="Candidate IDs to email")
    template_id: str = Field(..., description="Email template ID")
    subject: Optional[str] = Field(None, description="Email subject (overrides template)")
    body: Optional[str] = Field(None, description="Email body (overrides template)")
    send_immediately: bool = Field(True, description="Send now or schedule")


class BulkActionResponse(BaseModel):
    """Response for bulk action"""
    job_id: UUID
    status: str
    queued_count: int
    estimated_completion: datetime
    message: str


class BulkActionStatusResponse(BaseModel):
    """Response for bulk action status check"""
    job_id: UUID
    status: str  # processing, completed, failed
    total: int
    sent: int
    failed: int
    pending: int
    started_at: datetime
    estimated_completion: Optional[datetime]
    percentage_complete: float


# ============================================================================
# FEEDBACK SCHEMAS
# ============================================================================


class CandidateFeedbackCreate(BaseModel):
    """Schema for creating candidate feedback"""
    interview_id: Optional[UUID] = None
    score: Optional[float] = Field(None, ge=0, le=100)
    feedback: str = Field(..., min_length=10, max_length=5000)
    recommendation: Optional[str] = Field(None, description="proceed, reject, or hold")


class CandidateFeedbackResponse(BaseModel):
    """Response schema for feedback"""
    id: UUID
    candidate_id: UUID
    interview_id: Optional[UUID]
    created_by: UUID
    score: Optional[float]
    feedback: str
    recommendation: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================================
# DASHBOARD SCHEMAS (Phase 2)
# ============================================================================


class DashboardStatsResponse(BaseModel):
    """HR Dashboard statistics response"""
    total_candidates: int
    total_active_interviews: int
    total_pending_feedback: int
    candidates_by_status: dict
    candidates_by_domain: dict
    recent_activities: List[dict]
    

class CandidateSummaryResponse(BaseModel):
    """Summary view of candidate for dashboard"""
    id: UUID
    email: str
    full_name: str
    position: str
    status: str
    domain: str
    created_at: datetime
    last_updated: datetime
    interview_count: int
    feedback_count: int
