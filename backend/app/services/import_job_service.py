"""
Service for managing bulk import jobs
Handles job creation, status tracking, and rate limiting
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.import_job import ImportJob, ImportJobStatus
from app.tasks.bulk_import import process_bulk_import

logger = logging.getLogger(__name__)


class ImportJobService:
    """Service for managing bulk import jobs"""

    @staticmethod
    async def create_import_job(
        session: AsyncSession,
        company_id: UUID,
        created_by: UUID,
        filename: str,
        file_size_bytes: int,
        file_format: str,
        total_records: int,
        send_invitations: bool = True,
        default_domain: Optional[str] = None,
    ) -> ImportJob:
        """
        Create a new import job in QUEUED status
        
        Args:
            session: Database session
            company_id: Company ID
            created_by: User ID creating the import
            filename: Name of uploaded file
            file_size_bytes: Size of file in bytes
            file_format: File format (csv, xlsx, xls)
            total_records: Total records in file
            send_invitations: Whether to send invitation emails
            default_domain: Default domain for candidates
        
        Returns:
            ImportJob record
        """
        import_job = ImportJob(
            company_id=company_id,
            created_by=created_by,
            filename=filename,
            file_size_bytes=file_size_bytes,
            file_format=file_format,
            total_records=total_records,
            send_invitations=send_invitations,
            default_domain=default_domain,
            status=ImportJobStatus.QUEUED,
        )
        session.add(import_job)
        await session.flush()
        
        logger.info(
            f"Created import job {import_job.id} for company {company_id} "
            f"with {total_records} records"
        )
        
        return import_job

    @staticmethod
    async def get_import_job(
        session: AsyncSession,
        import_job_id: UUID,
        company_id: UUID,
    ) -> Optional[ImportJob]:
        """
        Get import job by ID (with company scoping)
        
        Args:
            session: Database session
            import_job_id: ID of import job
            company_id: Company ID (for multi-tenant isolation)
        
        Returns:
            ImportJob record or None
        """
        stmt = select(ImportJob).where(
            and_(
                ImportJob.id == import_job_id,
                ImportJob.company_id == company_id,
            )
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def get_active_import_count(
        session: AsyncSession,
        company_id: UUID,
    ) -> int:
        """
        Get number of active (processing or queued) import jobs for a company
        
        Used for rate limiting: max 2 concurrent imports per company
        
        Args:
            session: Database session
            company_id: Company ID
        
        Returns:
            Count of active imports
        """
        stmt = select(func.count(ImportJob.id)).where(
            and_(
                ImportJob.company_id == company_id,
                ImportJob.status.in_(
                    [ImportJobStatus.QUEUED, ImportJobStatus.PROCESSING]
                ),
            )
        )
        result = await session.execute(stmt)
        return result.scalar() or 0

    @staticmethod
    async def check_rate_limit(
        session: AsyncSession,
        company_id: UUID,
        max_concurrent: int = 2,
    ) -> tuple[bool, str]:
        """
        Check if company has hit rate limit for concurrent imports
        
        Args:
            session: Database session
            company_id: Company ID
            max_concurrent: Maximum concurrent imports allowed (default: 2)
        
        Returns:
            Tuple of (allowed: bool, message: str)
        """
        active_count = await ImportJobService.get_active_import_count(
            session=session,
            company_id=company_id,
        )
        
        if active_count >= max_concurrent:
            return False, (
                f"Rate limit exceeded: {active_count} imports already in progress. "
                f"Maximum {max_concurrent} concurrent imports allowed."
            )
        
        return True, ""

    @staticmethod
    async def queue_bulk_import_task(
        session: AsyncSession,
        import_job: ImportJob,
        file_content: bytes,
        created_by: UUID,
    ) -> str:
        """
        Queue bulk import task to Celery
        
        Args:
            session: Database session
            import_job: ImportJob record
            file_content: Raw file content bytes
            created_by: User ID
        
        Returns:
            Celery task ID
        """
        # Queue the task
        task = process_bulk_import.apply_async(
            kwargs={
                "import_job_id": str(import_job.id),
                "company_id": str(import_job.company_id),
                "file_content": file_content,
                "filename": import_job.filename,
                "created_by": str(created_by),
                "send_invitations": import_job.send_invitations,
                "default_domain": import_job.default_domain,
            },
            queue="default",
            countdown=1,  # Start immediately
        )
        
        logger.info(f"Queued bulk import task {task.id} for job {import_job.id}")
        
        return task.id

    @staticmethod
    async def get_recent_import_jobs(
        session: AsyncSession,
        company_id: UUID,
        limit: int = 10,
    ) -> list[ImportJob]:
        """
        Get recent import jobs for a company (sorted by newest first)
        
        Args:
            session: Database session
            company_id: Company ID
            limit: Number of jobs to return
        
        Returns:
            List of ImportJob records
        """
        stmt = (
            select(ImportJob)
            .where(ImportJob.company_id == company_id)
            .order_by(desc(ImportJob.created_at))
            .limit(limit)
        )
        result = await session.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def cancel_import_job(
        session: AsyncSession,
        import_job_id: UUID,
        company_id: UUID,
    ) -> bool:
        """
        Cancel a queued or processing import job
        
        Only cancels if job is QUEUED or PROCESSING
        
        Args:
            session: Database session
            import_job_id: ID of import job
            company_id: Company ID
        
        Returns:
            True if cancelled, False otherwise
        """
        import_job = await ImportJobService.get_import_job(
            session=session,
            import_job_id=import_job_id,
            company_id=company_id,
        )
        
        if not import_job:
            return False
        
        if import_job.status not in (ImportJobStatus.QUEUED, ImportJobStatus.PROCESSING):
            logger.warning(
                f"Cannot cancel import job {import_job_id} with status {import_job.status}"
            )
            return False
        
        import_job.status = ImportJobStatus.CANCELLED
        import_job.updated_at = datetime.now(timezone.utc)
        await session.commit()
        
        logger.info(f"Cancelled import job {import_job_id}")
        return True

    @staticmethod
    async def get_import_stats_by_company(
        session: AsyncSession,
        company_id: UUID,
        days: int = 30,
    ) -> dict:
        """
        Get import statistics for a company (last N days)
        
        Args:
            session: Database session
            company_id: Company ID
            days: Number of days to look back
        
        Returns:
            Dictionary with statistics
        """
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        stmt = select(ImportJob).where(
            and_(
                ImportJob.company_id == company_id,
                ImportJob.created_at >= cutoff_date,
            )
        )
        result = await session.execute(stmt)
        import_jobs = result.scalars().all()
        
        total_jobs = len(import_jobs)
        completed_jobs = sum(1 for j in import_jobs if j.status == ImportJobStatus.COMPLETED)
        failed_jobs = sum(1 for j in import_jobs if j.status == ImportJobStatus.FAILED)
        total_candidates = sum(j.created_count for j in import_jobs)
        total_errors = sum(j.failed_count for j in import_jobs)
        total_skipped = sum(j.skipped_count for j in import_jobs)
        
        avg_duration = 0
        if completed_jobs > 0:
            durations = [
                j.processing_duration_seconds
                for j in import_jobs
                if j.processing_duration_seconds
            ]
            avg_duration = sum(durations) / len(durations) if durations else 0
        
        return {
            "total_jobs": total_jobs,
            "completed_jobs": completed_jobs,
            "failed_jobs": failed_jobs,
            "total_candidates_imported": total_candidates,
            "total_errors": total_errors,
            "total_skipped": total_skipped,
            "average_duration_seconds": int(avg_duration),
            "success_rate": (
                (completed_jobs / total_jobs * 100) if total_jobs > 0 else 0
            ),
        }
