"""
Candidate-related Celery tasks
"""
import logging
from app.core.celery_config import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="tasks.delete_rejected_candidate")
def delete_rejected_candidate(candidate_id: str):
    """
    Delete a rejected candidate after scheduled delay.
    This task is called after 10 minutes when a candidate is rejected/failed.
    """
    import asyncio
    from uuid import UUID
    from sqlalchemy import select, delete
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from app.core.config import settings
    from app.models.candidate import Candidate, CandidateStatus, Interview
    from app.models.ai_report import AIReport
    
    async def _delete_candidate():
        # Create async engine and session
        engine = create_async_engine(
            settings.database_url.replace("postgresql://", "postgresql+asyncpg://"),
            echo=False,
            pool_pre_ping=True,
        )
        async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        
        async with async_session() as db:
            try:
                candidate_uuid = UUID(candidate_id)
                
                # Verify candidate still exists and is still rejected/failed
                query = select(Candidate).filter(Candidate.id == candidate_uuid)
                result = await db.execute(query)
                candidate = result.scalars().first()
                
                if not candidate:
                    logger.info(f"Candidate {candidate_id} not found - may have already been deleted")
                    return {"status": "skipped", "reason": "Candidate not found"}
                
                # Only delete if still in a rejection status (user might have un-rejected them)
                rejection_statuses = [CandidateStatus.REJECTED, CandidateStatus.FAILED, CandidateStatus.AUTO_REJECTED]
                if candidate.status not in rejection_statuses:
                    logger.info(f"Candidate {candidate_id} is no longer rejected (status: {candidate.status}), skipping deletion")
                    return {"status": "skipped", "reason": f"Status is now {candidate.status.value}"}
                
                # Delete related AI reports first
                await db.execute(
                    delete(AIReport).where(AIReport.candidate_id == candidate_uuid)
                )
                
                # Delete related interviews
                await db.execute(
                    delete(Interview).where(Interview.candidate_id == candidate_uuid)
                )
                
                # Delete the candidate
                await db.delete(candidate)
                await db.commit()
                
                logger.info(f"Successfully deleted rejected candidate {candidate_id}")
                return {"status": "deleted", "candidate_id": candidate_id}
                
            except Exception as e:
                logger.error(f"Error deleting candidate {candidate_id}: {str(e)}")
                await db.rollback()
                return {"status": "error", "error": str(e)}
            finally:
                await engine.dispose()
    
    # Run the async function
    return asyncio.run(_delete_candidate())
