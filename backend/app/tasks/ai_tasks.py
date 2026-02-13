from app.core.celery_config import celery_app
from app.services.ai_service import generate_questions, generate_ats_report
from app.models.job import JobTemplate, Question
from app.core.config import settings
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
import asyncio
import json
import logging
import uuid as uuid_module
from uuid import UUID
from datetime import datetime, timezone
celery = celery_app
logger = logging.getLogger(__name__)


def get_fresh_async_session():
    """Create a fresh database engine and session for Celery tasks to avoid connection pool issues."""
    engine = create_async_engine(
        settings.database_url.replace("postgresql://", "postgresql+asyncpg://"),
        echo=False,
        pool_pre_ping=True,
    )
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return async_session, engine


@celery.task(name="ai.generate_questions_task", bind=True, max_retries=3)
def generate_questions_task(self, job_template_id: str, max_questions: int = 10):
    """Celery task to generate questions for a job template and persist them."""
    # Run an async loop to call async ai_service
    async def _run():
        async_session, engine = get_fresh_async_session()
        async with async_session() as session:
            try:
                # Convert string ID to UUID
                try:
                    jt_uuid = UUID(job_template_id)
                except ValueError:
                    logger.error(f"Invalid UUID format for job_template_id: {job_template_id}")
                    return
                
                # Fetch job template with retry logic
                jt = await session.get(JobTemplate, jt_uuid)
                if not jt:
                    logger.error(f"JobTemplate not found: {job_template_id}")
                    return
                
                logger.info(f"Generating questions for job: {jt.title} (ID: {job_template_id})")
                
                result = await generate_questions(jt.ai_prompt or jt.description or jt.title, max_questions=max_questions, model=jt.ai_model)
                questions = result.get("questions", [])
                
                # Handle case where questions might be returned as a single JSON string
                if len(questions) == 1 and isinstance(questions[0], str):
                    try:
                        # Try to parse if it's a JSON string
                        parsed = json.loads(questions[0])
                        if isinstance(parsed, dict) and "questions" in parsed:
                            questions = parsed["questions"]
                        elif isinstance(parsed, list):
                            questions = parsed
                    except (json.JSONDecodeError, TypeError):
                        pass  # Keep original questions list
                
                logger.info(f"Processing {len(questions)} questions for job_template {job_template_id}")
                
                for q_text in questions:
                    # Skip if q_text is not a valid question string
                    if not isinstance(q_text, str) or len(q_text) < 10:
                        continue
                    # Skip if it looks like JSON
                    if q_text.strip().startswith('{') or q_text.strip().startswith('['):
                        continue
                        
                    q = Question(
                        id=uuid_module.uuid4(),
                        job_template_id=jt.id,
                        text=q_text,
                        created_by=jt.created_by,
                        created_at=datetime.now(timezone.utc)
                    )
                    session.add(q)
                await session.commit()
                logger.info(f"Generated and persisted {len(questions)} questions for job_template {job_template_id}")
            finally:
                await session.close()
        await engine.dispose()

    try:
        asyncio.run(_run())
    except Exception as e:
        logger.error(f"Failed to generate questions for {job_template_id}: {e}")
        # Retry with exponential backoff
        raise self.retry(exc=e, countdown=2 ** self.request.retries)


@celery.task(name="ai.generate_verdict_task")
def generate_verdict_task(interview_id: str, transcript_text: str, resume_text: str | None = None):
    """Generate verdict for an interview transcript and persist ai_report via services."""
    async def _run():
        from app.models.ai_report import AIReport
        from app.models.candidate import Interview

        # call generate_ats_report combining resume and transcript
        input_text = (resume_text or "") + "\n\nTranscript:\n" + transcript_text
        report = await generate_ats_report(input_text)

        # persist via direct DB insert into ai_reports table
        async_session, engine = get_fresh_async_session()
        async with async_session() as session:
            try:
                # Fetch interview to get company_id and candidate_id (company_id is NOT NULL)
                interview = await session.get(Interview, interview_id)
                if not interview:
                    logger.error(f"Interview {interview_id} not found — cannot persist verdict")
                    return

                ar = AIReport(
                    company_id=interview.company_id,
                    candidate_id=interview.candidate_id,
                    interview_id=interview_id,
                    report_type="transcript_verdict",
                    score=report.get("score"),
                    summary=report.get("summary"),
                    provider_response=report.get("raw"),
                )
                session.add(ar)
                await session.commit()
                logger.info(f"Persisted ai_report for interview {interview_id}")
            finally:
                await session.close()
        await engine.dispose()

    asyncio.run(_run())


@celery.task(name="ai.send_notification_task")
def send_notification_task(email: str, subject: str, body: str):
    logger.info(f"Sending notification to {email}: {subject}")
    # For now, use console logging. In prod, integrate with SendGrid/SES.