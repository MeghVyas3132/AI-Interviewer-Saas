"""
AI reports model - stores ATS/verdict/transcript responses from the AI provider
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AIReport(Base):
    __tablename__ = "ai_reports"
    __table_args__ = (
        Index("idx_ai_reports_company_id", "company_id"),
        Index("idx_ai_reports_candidate_id", "candidate_id"),
    )

    id: Mapped[str] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )

    company_id: Mapped[str] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )

    candidate_id: Mapped[Optional[str]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("candidates.id", ondelete="CASCADE"), nullable=True
    )

    interview_id: Mapped[Optional[str]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("interviews.id", ondelete="SET NULL"), nullable=True
    )

    report_type: Mapped[str] = mapped_column(String(100), nullable=False)
    score: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    provider_response: Mapped[Optional[dict]] = mapped_column(JSONB(), nullable=True)

    created_by: Mapped[Optional[str]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<AIReport {self.report_type} {self.id} for candidate {self.candidate_id}>"
