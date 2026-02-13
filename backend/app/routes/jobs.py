from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User, UserRole
from app.models.job import JobTemplate, Question
from app.services.ai_service import generate_questions as ai_generate_questions
import uuid
import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


@router.get("")
async def list_job_templates(current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)):
    """List all job templates for the current user's company."""
    if current_user.role not in [UserRole.HR, UserRole.SYSTEM_ADMIN, UserRole.EMPLOYEE]:
        raise HTTPException(status_code=403, detail="Not allowed")
    query = select(JobTemplate).filter(JobTemplate.company_id == current_user.company_id).limit(200)
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
            created_at=datetime.now(timezone.utc),
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
    """Generate AI interview questions for a job template.
    
    Calls the Groq API directly (inline) to generate questions and saves them
    to the database. This avoids the need for a running Celery worker.
    Falls back to Celery task dispatch if available.
    """
    # Validate permissions
    if current_user.role not in [UserRole.HR, UserRole.SYSTEM_ADMIN]:
        raise HTTPException(status_code=403, detail="Not allowed")
    # Ensure job exists
    jt = await session.get(JobTemplate, job_id)
    if not jt:
        raise HTTPException(status_code=404, detail="Job not found")

    max_questions = 10

    try:
        # Call AI service directly (inline) - no Celery dependency
        logger.info(f"Generating questions inline for job: {jt.title} (ID: {job_id})")
        result = await ai_generate_questions(
            jt.ai_prompt or jt.description or jt.title,
            max_questions=max_questions,
            model=jt.ai_model,
        )
        questions_list = result.get("questions", [])

        # Handle case where questions might be a nested JSON string
        if len(questions_list) == 1 and isinstance(questions_list[0], str):
            try:
                parsed = json.loads(questions_list[0])
                if isinstance(parsed, dict) and "questions" in parsed:
                    questions_list = parsed["questions"]
                elif isinstance(parsed, list):
                    questions_list = parsed
            except (json.JSONDecodeError, TypeError):
                pass

        # Delete old questions for this job template before inserting new ones
        from sqlalchemy import delete as sql_delete
        await session.execute(
            sql_delete(Question).where(Question.job_template_id == uuid.UUID(job_id))
        )

        saved_count = 0
        for q_text in questions_list:
            if not isinstance(q_text, str) or len(q_text.strip()) < 10:
                continue
            # Skip JSON artifacts
            stripped = q_text.strip()
            if stripped.startswith('{') or stripped.startswith('['):
                continue

            q = Question(
                id=uuid.uuid4(),
                job_template_id=jt.id,
                text=q_text.strip(),
                created_by=current_user.id,
                created_at=datetime.now(timezone.utc),
            )
            session.add(q)
            saved_count += 1

        await session.commit()
        logger.info(f"Generated and saved {saved_count} questions for job {job_id}")

        return {"status": "completed", "questions_count": saved_count}

    except Exception as e:
        await session.rollback()
        logger.error(f"Failed to generate questions for {job_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Question generation failed: {str(e)}",
        )


@router.get("/{job_id}/questions")
async def list_questions(job_id: str, current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)):
    jt = await session.get(JobTemplate, job_id)
    if not jt:
        raise HTTPException(status_code=404)
    # Only company members
    if jt.company_id != current_user.company_id:
        raise HTTPException(status_code=403)
    query = select(Question).filter(Question.job_template_id == job_id).limit(100)
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
