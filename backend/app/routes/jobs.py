from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User, UserRole
from app.models.job import JobTemplate, Question
# (schemas can be added later; using simple dict payloads for now)
from app.tasks.ai_tasks import generate_questions_task
import uuid
from datetime import datetime

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


@router.get("")
async def list_job_templates(current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)):
    """List all job templates for the current user's company."""
    if current_user.role not in [UserRole.HR, UserRole.SYSTEM_ADMIN, UserRole.EMPLOYEE]:
        raise HTTPException(status_code=403, detail="Not allowed")
    query = select(JobTemplate).filter(JobTemplate.company_id == current_user.company_id)
    result = await session.execute(query)
    rows = result.scalars().all()
    return [{"id": str(r.id), "title": r.title, "description": r.description, "department": getattr(r, 'department', None), "created_at": str(r.created_at)} for r in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_job_template(payload: dict, current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)):
    # Only HR and Admin can create job templates
    if current_user.role not in [UserRole.HR, UserRole.SYSTEM_ADMIN]:
        raise HTTPException(status_code=403, detail="Not allowed")
    try:
        jt = JobTemplate(
            id=uuid.uuid4(),
            company_id=current_user.company_id,
            created_by=current_user.id,
            title=payload.get("title"),
            description=payload.get("description"),
            ai_prompt=payload.get("ai_prompt"),
            ai_model=payload.get("ai_model"),
            created_at=datetime.utcnow(),
        )
        session.add(jt)
        await session.commit()
        await session.refresh(jt)
        return {"id": str(jt.id), "title": jt.title}
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{job_id}/generate-questions")
async def generate_questions(job_id: str, current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)):
    # Validate permissions
    if current_user.role not in [UserRole.HR, UserRole.SYSTEM_ADMIN]:
        raise HTTPException(status_code=403, detail="Not allowed")
    # Ensure job exists
    jt = await session.get(JobTemplate, job_id)
    if not jt:
        raise HTTPException(status_code=404, detail="Job not found")

    # Enqueue Celery task
    generate_questions_task.delay(str(job_id), 10)
    return {"status": "queued"}


@router.get("/{job_id}/questions")
async def list_questions(job_id: str, current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)):
    jt = await session.get(JobTemplate, job_id)
    if not jt:
        raise HTTPException(status_code=404)
    # Only company members
    if jt.company_id != current_user.company_id:
        raise HTTPException(status_code=403)
    query = select(Question).filter(Question.job_template_id == job_id)
    result = await session.execute(query)
    rows = result.scalars().all()
    return [{"id": str(r.id), "text": r.text} for r in rows]


@router.delete("/{job_id}")
async def delete_job_template(job_id: str, current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)):
    """Delete a job template and its associated questions."""
    if current_user.role not in [UserRole.HR, UserRole.SYSTEM_ADMIN]:
        raise HTTPException(status_code=403, detail="Not allowed")
    
    try:
        jt = await session.get(JobTemplate, job_id)
        if not jt:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # Only allow deletion of own company's jobs
        if jt.company_id != current_user.company_id:
            raise HTTPException(status_code=403, detail="Not allowed")
        
        # Delete associated questions first
        from sqlalchemy import delete
        await session.execute(
            delete(Question).where(Question.job_template_id == uuid.UUID(job_id))
        )
        
        # Delete the job template
        await session.delete(jt)
        await session.commit()
        
        return {"status": "success", "message": "Job template deleted"}
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
