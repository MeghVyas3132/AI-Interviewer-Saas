"""
Real-time AI Insights models for Human-AI-Assisted interviews.

These models support:
- Live speech/video analysis insights
- Fraud detection alerts
- Interview transcripts
- Human verdicts
- Interview summaries
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional, Dict, Any, List
from uuid import UUID

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    BigInteger,
    func,
    CheckConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class InterviewModeType(str, Enum):
    """Interview mode for rounds."""
    AI_CONDUCTED = "AI_CONDUCTED"
    HUMAN_AI_ASSISTED = "HUMAN_AI_ASSISTED"
    HUMAN_ONLY = "HUMAN_ONLY"


class InsightType(str, Enum):
    """Types of real-time insights."""
    SPEECH_CONFIDENCE = "SPEECH_CONFIDENCE"
    HESITATION = "HESITATION"
    RESPONSE_LATENCY = "RESPONSE_LATENCY"
    HEAD_MOVEMENT = "HEAD_MOVEMENT"
    VIDEO_QUALITY = "VIDEO_QUALITY"
    MULTIPLE_FACES = "MULTIPLE_FACES"
    FACE_SWITCH = "FACE_SWITCH"
    TAB_SWITCH = "TAB_SWITCH"
    BACKGROUND_VOICE = "BACKGROUND_VOICE"
    RESUME_CONTRADICTION = "RESUME_CONTRADICTION"


class AlertSeverity(str, Enum):
    """Severity levels for alerts."""
    INFO = "INFO"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class VerdictDecision(str, Enum):
    """Human verdict decisions."""
    ADVANCE = "ADVANCE"
    REJECT = "REJECT"
    HOLD = "HOLD"
    REASSESS = "REASSESS"


class SpeakerType(str, Enum):
    """Speaker types in transcripts."""
    CANDIDATE = "CANDIDATE"
    INTERVIEWER = "INTERVIEWER"


class CandidateResume(Base):
    """Structured resume data for contradiction detection."""
    __tablename__ = "candidate_resumes"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    candidate_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("candidates.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    resume_json: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False)
    key_facts: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<CandidateResume candidate_id={self.candidate_id}>"


class LiveInsight(Base):
    """Real-time AI insights during interview."""
    __tablename__ = "live_insights"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    round_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("interview_rounds.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    timestamp_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    insight_type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, server_default="INFO")
    value: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False)
    explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    model_version: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    processing_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    fraud_alerts: Mapped[List["FraudAlert"]] = relationship(
        "FraudAlert",
        back_populates="insight",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<LiveInsight {self.insight_type} severity={self.severity}>"


class FraudAlert(Base):
    """Fraud detection alerts."""
    __tablename__ = "fraud_alerts"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    round_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("interview_rounds.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    insight_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("live_insights.id", ondelete="CASCADE"),
        nullable=False,
    )
    alert_type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    detected_at_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    confidence: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)
    evidence: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    acknowledged: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    acknowledged_by: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    false_positive_marked: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    insight: Mapped["LiveInsight"] = relationship("LiveInsight", back_populates="fraud_alerts")

    def __repr__(self) -> str:
        return f"<FraudAlert {self.alert_type} severity={self.severity}>"


class InterviewTranscript(Base):
    """Speech-to-text transcripts."""
    __tablename__ = "interview_transcripts"
    __table_args__ = (
        CheckConstraint("speaker IN ('CANDIDATE', 'INTERVIEWER')", name="valid_speaker"),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    round_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("interview_rounds.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    speaker: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    start_time_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    end_time_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    word_timestamps: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(JSONB, nullable=True)
    stt_provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    stt_confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<InterviewTranscript speaker={self.speaker} round={self.round_id}>"


class HumanVerdict(Base):
    """Human interviewer verdicts."""
    __tablename__ = "human_verdicts"
    __table_args__ = (
        CheckConstraint("decision IN ('ADVANCE', 'REJECT', 'HOLD', 'REASSESS')", name="valid_verdict_decision"),
        CheckConstraint("overall_rating BETWEEN 1 AND 5", name="valid_overall_rating"),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    round_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("interview_rounds.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    interviewer_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
    )
    decision: Mapped[str] = mapped_column(String(20), nullable=False)
    overall_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    criteria_scores: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_insights_helpful: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    ai_feedback_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<HumanVerdict decision={self.decision} round={self.round_id}>"


class InterviewSummary(Base):
    """Post-interview aggregated summary for HR."""
    __tablename__ = "interview_summaries"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    round_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("interview_rounds.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    avg_speech_confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4), nullable=True)
    total_hesitations: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    avg_response_latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fraud_alerts_count: Mapped[Optional[int]] = mapped_column(Integer, server_default="0", nullable=True)
    critical_alerts_count: Mapped[Optional[int]] = mapped_column(Integer, server_default="0", nullable=True)
    resume_contradictions_found: Mapped[Optional[int]] = mapped_column(Integer, server_default="0", nullable=True)
    contradiction_details: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    ai_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    key_observations: Mapped[Optional[List[str]]] = mapped_column(JSONB, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<InterviewSummary round={self.round_id}>"


class AIAuditLog(Base):
    """Audit logs for AI decisions (compliance)."""
    __tablename__ = "ai_audit_logs"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    round_id: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("interview_rounds.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    service_name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    input_summary: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    output_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    model_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    model_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    processing_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    def __repr__(self) -> str:
        return f"<AIAuditLog service={self.service_name} action={self.action_type}>"
