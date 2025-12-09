"""
Import Job model for tracking bulk candidate imports
Supports async Celery-based processing with status tracking
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from sqlalchemy import (
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ImportJobStatus(str, Enum):
    """Status of a bulk import job"""
    QUEUED = "queued"  # Waiting to be processed
    PROCESSING = "processing"  # Currently being processed
    COMPLETED = "completed"  # Successfully completed
    FAILED = "failed"  # Failed to complete
    CANCELLED = "cancelled"  # Cancelled by user


class ImportJob(Base):
    """
    Track bulk candidate import jobs for async Celery processing
    
    Workflow:
    1. User uploads file → ImportJob created with status=QUEUED
    2. Celery task picked up → status=PROCESSING
    3. Candidates created → status=COMPLETED (with stats)
    4. On error → status=FAILED (with error details)
    
    Multi-tenant: scoped to company_id
    """
    __tablename__ = "import_jobs"
    __table_args__ = (
        Index("idx_import_jobs_company_id", "company_id"),
        Index("idx_import_jobs_status", "status"),
        Index("idx_import_jobs_created_at", "created_at"),
        Index("idx_import_jobs_celery_task_id", "celery_task_id"),
        Index("idx_import_jobs_created_by", "created_by"),
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
    created_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # File information
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer(), nullable=False)
    file_format: Mapped[str] = mapped_column(String(50), nullable=False)  # csv, xlsx, xls

    # Job status tracking
    status: Mapped[ImportJobStatus] = mapped_column(
        SQLEnum(ImportJobStatus),
        nullable=False,
        default=ImportJobStatus.QUEUED,
    )
    celery_task_id: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        unique=True,
    )

    # Processing options
    send_invitations: Mapped[bool] = mapped_column(
        nullable=False,
        default=True,
    )
    default_domain: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    # Import statistics
    total_records: Mapped[int] = mapped_column(Integer(), nullable=False)
    created_count: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    failed_count: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)

    # Error tracking
    error_message: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    detailed_errors: Mapped[Optional[list]] = mapped_column(
        JSONB(),
        nullable=True,
    )

    # Progress tracking
    processing_start: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    processing_end: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    processing_duration_seconds: Mapped[Optional[int]] = mapped_column(
        Integer(),
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

    def __repr__(self) -> str:
        return (
            f"<ImportJob {self.id} - {self.filename} "
            f"({self.status}) - {self.created_count}/{self.total_records}>"
        )

    @property
    def success_rate(self) -> float:
        """Calculate success rate percentage"""
        if self.total_records == 0:
            return 0.0
        return (self.created_count / self.total_records) * 100

    @property
    def is_processing(self) -> bool:
        """Check if job is currently processing"""
        return self.status == ImportJobStatus.PROCESSING

    @property
    def is_complete(self) -> bool:
        """Check if job is complete (success or failure)"""
        return self.status in (ImportJobStatus.COMPLETED, ImportJobStatus.FAILED)
