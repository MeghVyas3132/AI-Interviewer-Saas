"""
Import Job schemas for API responses
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.import_job import ImportJobStatus


class ImportJobStatusResponse(BaseModel):
    """Response for import job status"""
    id: UUID
    filename: str
    status: ImportJobStatus
    total_records: int
    created_count: int
    failed_count: int
    skipped_count: int
    success_rate: float = Field(..., description="Percentage of successful imports")
    processing_start: Optional[datetime] = None
    processing_end: Optional[datetime] = None
    processing_duration_seconds: Optional[int] = None
    error_message: Optional[str] = None
    detailed_errors: Optional[list] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ImportJobResponse(BaseModel):
    """Response when creating an import job"""
    job_id: UUID
    status: ImportJobStatus
    message: str
    total_records: int
    celery_task_id: Optional[str] = None

    class Config:
        from_attributes = True
