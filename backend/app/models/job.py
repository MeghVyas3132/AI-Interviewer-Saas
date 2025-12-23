from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class JobTemplate(Base):
    """Job / Interview template containing role description and AI settings"""
    __tablename__ = "job_templates"
    __table_args__ = (
        Index("idx_job_templates_company_id", "company_id"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    company_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    created_by: Mapped[Optional[UUID]] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    ai_prompt: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    ai_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    questions: Mapped[list["Question"]] = relationship("Question", back_populates="job_template", cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (
        Index("idx_questions_job_template_id", "job_template_id"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    job_template_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("job_templates.id", ondelete="CASCADE"), nullable=False)
    text: Mapped[str] = mapped_column(Text(), nullable=False)
    created_by: Mapped[Optional[UUID]] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    weight: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    job_template: Mapped[JobTemplate] = relationship("JobTemplate", back_populates="questions")
