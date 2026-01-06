"""
Phase 2 Models: Candidates, Interviews, Email Queue
Production-grade with comprehensive validation and relationships
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SQLEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSON, JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CandidateStatus(str, Enum):
    """Candidate status throughout the hiring pipeline
    
    NOTE: Values must match EXACTLY what's in the PostgreSQL enum.
    The database has mixed case - legacy UPPERCASE and new lowercase.
    """
    # New simplified pipeline stages (lowercase in DB)
    UPLOADED = "uploaded"           # Candidate just uploaded/added
    ASSIGNED = "assigned"           # Assigned to an employee/interviewer
    INTERVIEW_SCHEDULED = "interview_scheduled"  # Interview has been scheduled
    INTERVIEW_COMPLETED = "interview_completed"  # Interview taken, awaiting result
    PASSED = "passed"               # AI verdict: PASS or manually approved
    FAILED = "failed"               # AI verdict: FAIL or manually rejected
    REVIEW = "review"               # AI verdict: REVIEW - needs manual review
    AUTO_REJECTED = "auto_rejected" # Auto-rejected due to low score
    
    # Legacy statuses (UPPERCASE in DB - for backward compatibility)
    APPLIED = "APPLIED"
    SCREENING = "SCREENING"
    ASSESSMENT = "ASSESSMENT"
    INTERVIEW = "INTERVIEW"
    SELECTED = "SELECTED"
    OFFER = "OFFER"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    WITHDRAWN = "WITHDRAWN"
    ON_HOLD = "ON_HOLD"


class InterviewStatus(str, Enum):
    """Interview status tracking"""
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELED = "canceled"
    RESCHEDULED = "rescheduled"
    NO_SHOW = "no_show"
    EXPIRED = "expired"
    ABANDONED = "abandoned"


class InterviewRound(str, Enum):
    """Interview round types"""
    SCREENING = "screening"
    TECHNICAL = "technical"
    HR_ROUND = "hr_round"
    FINAL = "final"
    ASSESSMENT = "assessment"


class EmailStatus(str, Enum):
    """Email queue status"""
    QUEUED = "queued"
    SENDING = "sending"
    SENT = "sent"
    FAILED = "failed"
    BOUNCED = "bounced"
    INVALID = "invalid"


class EmailPriority(str, Enum):
    """Email priority levels"""
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class EmailType(str, Enum):
    """Types of emails sent"""
    WELCOME = "WELCOME"
    CANDIDATE_INVITE = "CANDIDATE_INVITE"
    STATUS_UPDATE = "STATUS_UPDATE"
    PASSWORD_RESET = "PASSWORD_RESET"
    INTERVIEW_SCHEDULED = "INTERVIEW_SCHEDULED"
    INTERVIEW_REMINDER = "INTERVIEW_REMINDER"
    ASSESSMENT_ASSIGNED = "ASSESSMENT_ASSIGNED"
    ASSESSMENT_REMINDER = "ASSESSMENT_REMINDER"
    OFFER_LETTER = "OFFER_LETTER"
    OFFER_ACCEPTED = "OFFER_ACCEPTED"
    REJECTION = "REJECTION"
    FEEDBACK_SUBMITTED = "FEEDBACK_SUBMITTED"


class CandidateSource(str, Enum):
    """Source of candidate origin - values match database enum"""
    LINKEDIN = "LINKEDIN"
    REFERRAL = "REFERRAL"
    JOB_PORTAL = "JOB_PORTAL"
    EXCEL_IMPORT = "EXCEL_IMPORT"
    DIRECT = "DIRECT"
    RECRUITER = "RECRUITER"


class Candidate(Base):
    """
    Candidate model for tracking job applicants
    Multi-tenant: scoped to company_id
    """
    __tablename__ = "candidates"
    __table_args__ = (
        UniqueConstraint("company_id", "email", name="uq_candidate_company_email"),
        Index("idx_candidates_company_id", "company_id"),
        Index("idx_candidates_email", "email"),
        Index("idx_candidates_status", "status"),
        Index("idx_candidates_domain", "domain"),
        Index("idx_candidates_created_at", "created_at"),
    )

    # Primary key
    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )

    # Foreign keys
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_by: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    assigned_to: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    
    # Job template for interview questions
    job_template_id: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("job_templates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Core fields
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Job-related fields
    domain: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    position: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    experience_years: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    qualifications: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

    # File references
    resume_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # ATS Score from dashboard check (synced with interview)
    ats_score: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    ats_report: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # JSON string with full ATS report
    resume_text: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # Extracted text from resume

    # AI Service Integration
    ai_candidate_id: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)

    # Status and metadata
    # Use values_callable to match database values (lowercase) instead of enum names (UPPERCASE)
    status: Mapped[CandidateStatus] = mapped_column(
        SQLEnum(
            CandidateStatus,
            values_callable=lambda x: [e.value for e in x],
            name='candidatestatus',
            create_type=False,  # Type already exists in DB
        ),
        nullable=False,
        default=CandidateStatus.APPLIED,
    )
    source: Mapped[Optional[CandidateSource]] = mapped_column(
        SQLEnum(
            CandidateSource,
            values_callable=lambda x: [e.value for e in x],
            name='candidatesource',
            create_type=False,
        ),
        nullable=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    interviews: Mapped[list["Interview"]] = relationship(
        "Interview",
        back_populates="candidate",
        cascade="all, delete-orphan",
    )
    feedback: Mapped[list["CandidateFeedback"]] = relationship(
        "CandidateFeedback",
        back_populates="candidate",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Candidate {self.email} ({self.status})>"

    @property
    def full_name(self) -> str:
        """Get candidate full name"""
        parts = [self.first_name, self.last_name]
        return " ".join(p for p in parts if p)


class Interview(Base):
    """
    Interview model for tracking scheduled interviews
    Supports multiple rounds per candidate
    """
    __tablename__ = "interviews"
    __table_args__ = (
        Index("idx_interviews_company_id", "company_id"),
        Index("idx_interviews_candidate_id", "candidate_id"),
        Index("idx_interviews_scheduled_time", "scheduled_time"),
        Index("idx_interviews_status", "status"),
        Index("idx_interviews_interviewer_id", "interviewer_id"),
    )

    # Primary key
    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )

    # Foreign keys
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    candidate_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("candidates.id", ondelete="CASCADE"),
        nullable=False,
    )
    interviewer_id: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Interview details
    round: Mapped[InterviewRound] = mapped_column(
        SQLEnum(
            InterviewRound,
            values_callable=lambda x: [e.value for e in x],
            name='interviewround',
            create_type=False,
        ),
        nullable=False,
    )
    scheduled_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    timezone: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="UTC",
    )
    meeting_link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # AI Service Integration
    ai_interview_token: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    exam_id: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)

    # Interview execution
    status: Mapped[InterviewStatus] = mapped_column(
        SQLEnum(
            InterviewStatus,
            values_callable=lambda x: [e.value for e in x],
            name='interviewstatus',
            create_type=False,
        ),
        nullable=False,
        default=InterviewStatus.SCHEDULED,
    )
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

    # Recording and transcription
    recording_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    transcription_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # ATS and Verdict fields
    ats_score: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    resume_text: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    transcript: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    ai_verdict: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # JSON string with scores
    ai_recommendation: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # HIRE, REJECT, NEUTRAL
    behavior_score: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    confidence_score: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    answer_score: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    employee_verdict: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # APPROVED, REJECTED

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    candidate: Mapped["Candidate"] = relationship(
        "Candidate",
        back_populates="interviews",
    )

    def __repr__(self) -> str:
        return f"<Interview {self.candidate_id} - {self.round} ({self.status})>"


class EmailQueue(Base):
    """
    Email queue for async email processing via Celery
    All emails are queued here before being sent
    """
    __tablename__ = "email_queue"
    __table_args__ = (
        Index("idx_email_queue_status", "status"),
        Index("idx_email_queue_company_id", "company_id"),
        Index("idx_email_queue_created_at", "created_at"),
        Index("idx_email_queue_priority", "priority"),
        Index("idx_email_queue_recipient", "recipient_email"),
    )

    # Primary key
    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )

    # Foreign key
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    recipient_id: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
    )

    # Email content
    recipient_email: Mapped[str] = mapped_column(String(255), nullable=False)
    template_id: Mapped[str] = mapped_column(String(100), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text(), nullable=False)
    variables: Mapped[Optional[dict]] = mapped_column(JSONB(), nullable=True)

    # Email metadata
    email_type: Mapped[EmailType] = mapped_column(
        SQLEnum(
            EmailType,
            values_callable=lambda x: [e.value for e in x],
            name='emailtype',
            create_type=False,
        ),
        nullable=False,
    )
    priority: Mapped[EmailPriority] = mapped_column(
        SQLEnum(
            EmailPriority,
            values_callable=lambda x: [e.value for e in x],
            name='emailpriority',
            create_type=False,
        ),
        nullable=False,
        default=EmailPriority.MEDIUM,
    )
    status: Mapped[EmailStatus] = mapped_column(
        SQLEnum(
            EmailStatus,
            values_callable=lambda x: [e.value for e in x],
            name='emailstatus',
            create_type=False,
        ),
        nullable=False,
        default=EmailStatus.QUEUED,
    )

    # Retry logic
    retry_count: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    max_retries: Mapped[int] = mapped_column(Integer(), nullable=False, default=3)
    error_message: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

    # Provider tracking
    email_provider_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    tracking: Mapped[list["EmailTracking"]] = relationship(
        "EmailTracking",
        back_populates="email_queue",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<EmailQueue {self.email_type} to {self.recipient_email} ({self.status})>"


class EmailTracking(Base):
    """
    Email tracking for monitoring delivery and engagement
    Tracks opens, clicks, bounces, etc.
    """
    __tablename__ = "email_tracking"
    __table_args__ = (
        Index("idx_email_tracking_event_type", "event_type"),
        Index("idx_email_tracking_email_queue_id", "email_queue_id"),
    )

    # Primary key
    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )

    # Foreign key
    email_queue_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("email_queue.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Event details
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    event_data: Mapped[Optional[dict]] = mapped_column(JSONB(), nullable=True)

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    email_queue: Mapped["EmailQueue"] = relationship(
        "EmailQueue",
        back_populates="tracking",
    )

    def __repr__(self) -> str:
        return f"<EmailTracking {self.event_type} on {self.created_at}>"


class CandidateFeedback(Base):
    """
    Candidate feedback from interviewers and evaluators
    Supports collaborative hiring decisions
    """
    __tablename__ = "candidate_feedback"
    __table_args__ = (
        Index("idx_candidate_feedback_company_id", "company_id"),
        Index("idx_candidate_feedback_candidate_id", "candidate_id"),
        Index("idx_candidate_feedback_created_by", "created_by"),
    )

    # Primary key
    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )

    # Foreign keys
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    candidate_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("candidates.id", ondelete="CASCADE"),
        nullable=False,
    )
    interview_id: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("interviews.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Feedback details
    score: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    feedback: Mapped[str] = mapped_column(Text(), nullable=False)
    recommendation: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    candidate: Mapped["Candidate"] = relationship(
        "Candidate",
        back_populates="feedback",
    )

    def __repr__(self) -> str:
        return f"<CandidateFeedback from {self.created_by} on {self.candidate_id}>"
