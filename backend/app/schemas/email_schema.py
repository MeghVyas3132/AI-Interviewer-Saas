"""
Pydantic schemas for email requests and responses.
Validates email payload structure and template variables.
"""

from typing import Optional, List, Dict, Any
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field


class EmailBase(BaseModel):
    """Base schema for email requests"""
    to_email: EmailStr = Field(..., description="Recipient email address")
    to_name: str = Field(..., description="Recipient full name")
    subject: str = Field(..., description="Email subject line")


class EmailSendRequest(EmailBase):
    """Request to send a custom email"""
    template: str = Field(..., description="Email template name")
    variables: Dict[str, Any] = Field(default_factory=dict, description="Template variables")
    cc_emails: Optional[List[EmailStr]] = Field(None, description="CC recipients")
    bcc_emails: Optional[List[EmailStr]] = Field(None, description="BCC recipients")
    reply_to: Optional[EmailStr] = Field(None, description="Reply-to address")


class EmailResponse(BaseModel):
    """Response after sending email"""
    success: bool = Field(..., description="Whether email was sent successfully")
    message: str = Field(..., description="Status message")
    recipient: str = Field(..., description="Recipient email address")
    template: Optional[str] = Field(None, description="Template used")


class WelcomeEmailRequest(EmailBase):
    """Request to send welcome email"""
    company_name: str = Field(..., description="Company name")
    verification_link: str = Field(..., description="Email verification link")


class EmailVerificationRequest(EmailBase):
    """Request to send email verification"""
    verification_link: str = Field(..., description="Email verification link")
    expiry_minutes: int = Field(default=1440, description="Link expiry time in minutes")


class PasswordResetRequest(EmailBase):
    """Request to send password reset email"""
    reset_link: str = Field(..., description="Password reset link")
    expiry_minutes: int = Field(default=60, description="Link expiry time in minutes")


class InterviewScheduledRequest(EmailBase):
    """Request to send interview scheduled notification"""
    candidate_name: str = Field(..., description="Candidate full name")
    position: str = Field(..., description="Job position title")
    scheduled_time: str = Field(..., description="Interview scheduled time (formatted)")
    interview_link: Optional[str] = Field(None, description="Interview video call link")
    interviewer_name: Optional[str] = Field(None, description="Interviewer name")


class InterviewReminderRequest(EmailBase):
    """Request to send interview reminder (24h before)"""
    candidate_name: str = Field(..., description="Candidate full name")
    position: str = Field(..., description="Job position title")
    scheduled_time: str = Field(..., description="Interview scheduled time (formatted)")
    interview_link: Optional[str] = Field(None, description="Interview video call link")


class InterviewCompletedRequest(EmailBase):
    """Request to send interview completed notification"""
    candidate_name: str = Field(..., description="Candidate full name")
    position: str = Field(..., description="Job position title")
    next_steps: str = Field(default="You will hear from us soon.", description="Next steps message")


class CandidateRejectionRequest(EmailBase):
    """Request to send candidate rejection email"""
    candidate_name: str = Field(..., description="Candidate full name")
    position: str = Field(..., description="Job position title")
    feedback: Optional[str] = Field(None, description="Rejection feedback for candidate")


class BulkImportCompleteRequest(EmailBase):
    """Request to send bulk import completion summary"""
    total_count: int = Field(..., ge=0, description="Total candidates in import")
    success_count: int = Field(..., ge=0, description="Successfully imported count")
    failed_count: int = Field(..., ge=0, description="Failed import count")
    import_summary_link: Optional[str] = Field(None, description="Link to import report")


class EmailTemplateListResponse(BaseModel):
    """Response listing available email templates"""
    templates: List[str] = Field(..., description="List of available template names")
    count: int = Field(..., description="Total number of templates")


class EmailStatusResponse(BaseModel):
    """Response with email system status"""
    provider: str = Field(..., description="Email provider (sendgrid, ses, console)")
    is_configured: bool = Field(..., description="Whether email provider is configured")
    from_email: str = Field(..., description="From email address")
    from_name: str = Field(..., description="From name")
