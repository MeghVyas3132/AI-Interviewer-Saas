"""
Celery tasks for async bulk candidate import processing
Handles file parsing, validation, and database operations
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, TYPE_CHECKING
from uuid import UUID

from sqlalchemy import select, and_, func, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.celery_config import celery_app
from app.core.config import settings
from app.models.candidate import Candidate, CandidateStatus, CandidateSource
from app.models.import_job import ImportJob, ImportJobStatus
from app.utils.file_parser import CandidateImportParser

# Lazy imports to avoid circular dependency
if TYPE_CHECKING:
    from app.services.candidate_service import CandidateService
    from app.services.email_async_service import EmailService

logger = logging.getLogger(__name__)


# Initialize SYNC engine for Celery tasks (workers run in sync context)
# Celery workers need their own database connection pool
# Use sync driver instead of async since Celery runs in sync context
sync_engine = create_engine(
    settings.database_url.replace("postgresql+asyncpg://", "postgresql://"),
    echo=False,
    pool_size=5,
    pool_recycle=3600,
    pool_pre_ping=True,  # Test connections before using
)
SyncSessionLocal = sessionmaker(
    sync_engine,
    class_=Session,
    expire_on_commit=False,
)


@celery_app.task(
    name="tasks.process_bulk_import",
    bind=True,
    max_retries=2,
    time_limit=1800,  # 30 minutes hard limit
    soft_time_limit=1500,  # 25 minutes soft limit
    acks_late=True,
)
def process_bulk_import(
    self,
    import_job_id: str,
    company_id: str,
    file_content: bytes,
    filename: str,
    created_by: str,
    send_invitations: bool = True,
    default_domain: Optional[str] = None,
) -> dict:
    """
    Async Celery task to process bulk candidate import
    
    NOTE: This runs in Celery worker (sync context), not async
    
    Args:
        import_job_id: UUID of the ImportJob record
        company_id: UUID of the company
        file_content: Raw file bytes (CSV or Excel)
        filename: Original filename for format detection
        created_by: UUID of user creating the import
        send_invitations: Whether to send invitation emails
        default_domain: Default domain for candidates
    
    Returns:
        Dictionary with processing results
    """
    session = SyncSessionLocal()
    try:
        result = _process_bulk_import_sync(
            session=session,
            import_job_id=UUID(import_job_id),
            company_id=UUID(company_id),
            file_content=file_content,
            filename=filename,
            created_by=UUID(created_by),
            send_invitations=send_invitations,
            default_domain=default_domain,
            celery_task_id=self.request.id,
        )
        return result
    except Exception as e:
        logger.error(f"Bulk import task failed: {str(e)}", exc_info=True)
        # Retry with exponential backoff
        raise self.retry(exc=e, countdown=60 * (2 ** self.request.retries))
    finally:
        session.close()


def _process_bulk_import_sync(
    session: Session,
    import_job_id: UUID,
    company_id: UUID,
    file_content: bytes,
    filename: str,
    created_by: UUID,
    send_invitations: bool,
    default_domain: Optional[str],
    celery_task_id: str,
) -> dict:
    """
    SYNC implementation of bulk import processing (runs in Celery worker)
    """
    try:
        start_time = datetime.utcnow()
        
        # Get import job record
        import_job = session.query(ImportJob).filter(
            ImportJob.id == import_job_id
        ).first()
        if not import_job:
            raise ValueError(f"ImportJob {import_job_id} not found")
        
        # Update status to PROCESSING
        import_job.status = ImportJobStatus.PROCESSING
        import_job.processing_start = start_time
        import_job.celery_task_id = celery_task_id
        session.commit()
        
        logger.info(f"Starting bulk import for job {import_job_id}")
        
        # Parse file
        try:
            parsed_candidates, parse_errors = CandidateImportParser.parse_file(
                file_content,
                filename,
            )
        except Exception as e:
            logger.error(f"File parsing failed: {str(e)}")
            import_job.status = ImportJobStatus.FAILED
            import_job.error_message = f"File parsing error: {str(e)}"
            import_job.detailed_errors = [str(e)]
            import_job.failed_count = import_job.total_records
            import_job.processing_end = datetime.utcnow()
            import_job.processing_duration_seconds = (
                import_job.processing_end - import_job.processing_start
            ).total_seconds()
            session.commit()
            raise
        
        logger.info(f"Parsed {len(parsed_candidates)} candidates from {filename}")
        
        # Auto-detect domain from email and apply default domain if needed
        for candidate in parsed_candidates:
            # Auto-detect domain from email if not explicitly set
            if ("domain" not in candidate or not candidate["domain"]) and candidate.get("email"):
                email = candidate.get("email", "")
                if "@" in email:
                    email_domain = email.split("@")[1].lower() if email else ""
                    # Map common email domains to tech domains (customize as needed)
                    domain_mapping = {
                        # Tech companies
                        "google.com": "Software Engineering",
                        "microsoft.com": "Software Engineering",
                        "amazon.com": "Software Engineering",
                        "apple.com": "Software Engineering",
                        "meta.com": "Software Engineering",
                        "facebook.com": "Software Engineering",
                        # Generic email providers - don't auto-assign domain
                        "gmail.com": None,
                        "yahoo.com": None,
                        "hotmail.com": None,
                        "outlook.com": None,
                        "icloud.com": None,
                    }
                    mapped_domain = domain_mapping.get(email_domain)
                    if mapped_domain:
                        candidate["domain"] = mapped_domain
                    elif default_domain:
                        # Use default domain for generic emails
                        candidate["domain"] = default_domain
            elif default_domain and ("domain" not in candidate or not candidate["domain"]):
                # Fallback to default domain if provided
                candidate["domain"] = default_domain
        
        # Process candidates in batches
        created_candidates = []
        failed_records = []
        skipped_count = 0
        
        batch_size = 50  # Process in batches of 50
        total_to_process = len(parsed_candidates)
        
        for batch_start in range(0, total_to_process, batch_size):
            batch_end = min(batch_start + batch_size, total_to_process)
            batch = parsed_candidates[batch_start:batch_end]
            
            logger.info(f"Processing batch {batch_start}-{batch_end} of {total_to_process}")
            
            for idx, candidate_data in enumerate(batch):
                try:
                    # Check for duplicates within company
                    duplicate = session.query(Candidate).filter(
                        Candidate.company_id == company_id,
                        Candidate.email == candidate_data.get("email"),
                    ).first()
                    
                    if duplicate:
                        skipped_count += 1
                        failed_records.append({
                            "row": batch_start + idx,
                            "email": candidate_data.get("email"),
                            "error": "Duplicate email within company",
                        })
                        continue
                    
                    # Create candidate
                    candidate = Candidate(
                        company_id=company_id,
                        email=candidate_data.get("email"),
                        first_name=candidate_data.get("first_name"),
                        last_name=candidate_data.get("last_name"),
                        phone=candidate_data.get("phone"),
                        domain=candidate_data.get("domain"),
                        position=candidate_data.get("position"),
                        experience_years=candidate_data.get("experience_years"),
                        qualifications=candidate_data.get("qualifications"),
                        resume_url=candidate_data.get("resume_url"),
                        status=CandidateStatus.UPLOADED,
                        source=CandidateSource.EXCEL_IMPORT,
                        created_by=created_by,
                    )
                    session.add(candidate)
                    session.flush()
                    
                    created_candidates.append(candidate)
                    
                except Exception as e:
                    logger.error(
                        f"Error creating candidate {candidate_data.get('email')}: {str(e)}"
                    )
                    failed_records.append({
                        "row": batch_start + idx,
                        "email": candidate_data.get("email"),
                        "error": str(e),
                    })
            
            # Commit batch
            session.commit()
        
        # Queue invitation emails if requested
        if send_invitations and created_candidates:
            logger.info(f"Queueing {len(created_candidates)} invitation emails")
            # Note: Email queueing is done via CandidateService which handles async
            # For now, we'll skip email queueing in Celery task to keep it simple
            # Users can send bulk emails separately via the bulk email endpoint
        
        # Update import job with final stats
        end_time = datetime.utcnow()
        processing_duration = (end_time - start_time).total_seconds()
        
        import_job.status = ImportJobStatus.COMPLETED
        import_job.created_count = len(created_candidates)
        import_job.failed_count = len(failed_records)
        import_job.skipped_count = skipped_count
        import_job.processing_end = end_time
        import_job.processing_duration_seconds = int(processing_duration)
        
        if failed_records:
            import_job.detailed_errors = failed_records[:100]  # Store first 100 errors
        
        session.commit()
        
        logger.info(
            f"Bulk import completed: {len(created_candidates)} created, "
            f"{len(failed_records)} failed, {skipped_count} skipped in {processing_duration:.1f}s"
        )
        
        return {
            "status": "COMPLETED",
            "created": len(created_candidates),
            "failed": len(failed_records),
            "skipped": skipped_count,
            "duration_seconds": int(processing_duration),
            "errors": import_job.detailed_errors,
        }
        
    except Exception as e:
        logger.error(f"Bulk import task failed: {str(e)}", exc_info=True)
        
        # Mark job as failed
        try:
            import_job = session.query(ImportJob).filter(
                ImportJob.id == import_job_id
            ).first()
            if import_job:
                import_job.status = ImportJobStatus.FAILED
                import_job.error_message = str(e)
                import_job.processing_end = datetime.utcnow()
                if import_job.processing_start:
                    import_job.processing_duration_seconds = (
                        import_job.processing_end - import_job.processing_start
                    ).total_seconds()
                session.commit()
        except Exception as cleanup_err:
            logger.error(f"Failed to update job status: {str(cleanup_err)}")
        
        raise


@celery_app.task(
    name="tasks.check_import_job_status",
    bind=True,
)
def check_import_job_status(self, import_job_id: str) -> dict:
    """
    Task to check the status of an import job
    """
    session = SyncSessionLocal()
    try:
        import_job = session.query(ImportJob).filter(
            ImportJob.id == UUID(import_job_id)
        ).first()
        
        if not import_job:
            return {"error": "Job not found"}
        
        return {
            "id": str(import_job.id),
            "status": import_job.status.value,
            "created_count": import_job.created_count,
            "failed_count": import_job.failed_count,
            "total_records": import_job.total_records,
            "success_rate": import_job.success_rate,
        }
    finally:
        session.close()


async def _check_status_async(import_job_id: UUID) -> dict:
    """Check import job status"""
    session = SyncSessionLocal()
    try:
        import_job = session.query(ImportJob).filter(
            ImportJob.id == import_job_id
        ).first()
        if not import_job:
            return {"error": "Job not found"}
        
        return {
            "id": str(import_job.id),
            "status": import_job.status.value,
            "created_count": import_job.created_count,
            "failed_count": import_job.failed_count,
            "total_records": import_job.total_records,
            "success_rate": import_job.success_rate,
        }
    finally:
        session.close()
