from app.core.celery_config import celery_app
from app.services.ai_service import generate_questions, generate_ats_report
from app.core.database import AsyncSessionLocal
from app.models.job import JobTemplate, Question
import asyncio
import logging
import uuid
from datetime import datetime, timezone
celery = celery_app
logger = logging.getLogger(__name__)


@celery.task(name="ai.generate_questions_task")
def generate_questions_task(job_template_id: str, max_questions: int = 10):
    """Celery task to generate questions for a job template and persist them."""
    # Run an async loop to call async ai_service
    async def _run():
        async with AsyncSessionLocal() as session:
            # fetch job template
            jt = await session.get(JobTemplate, job_template_id)
            if not jt:
                logger.error(f"JobTemplate not found: {job_template_id}")
                return
            result = await generate_questions(jt.ai_prompt or jt.description or jt.title, max_questions=max_questions, model=jt.ai_model)
            questions = result.get("questions", [])
            for q_text in questions:
                q = Question(
                    id=uuid.uuid4(),
                    job_template_id=jt.id,
                    text=q_text,
                    created_by=jt.created_by,
                    created_at=datetime.now(timezone.utc)
                )
                session.add(q)
            await session.commit()
            logger.info(f"Generated and persisted {len(questions)} questions for job_template {job_template_id}")

    asyncio.run(_run())


@celery.task(name="ai.generate_verdict_task")
def generate_verdict_task(interview_id: str, transcript_text: str, resume_text: str | None = None):
    """Generate verdict for an interview transcript and persist ai_report via services."""
    async def _run():
        # call generate_ats_report combining resume and transcript
        input_text = (resume_text or "") + "\n\nTranscript:\n" + transcript_text
        report = await generate_ats_report(input_text)
        # persist via direct DB insert into ai_reports table
        from app.models.ai_report import AIReport
        async with AsyncSessionLocal() as session:
            ar = AIReport(company_id=None, candidate_id=None, interview_id=interview_id, report_type="transcript_verdict", score=report.get("score"), summary=report.get("summary"), provider_response=report.get("raw"))
            session.add(ar)
            await session.commit()
            logger.info(f"Persisted ai_report for interview {interview_id}")

    asyncio.run(_run())


@celery.task(name="ai.send_notification_task")
def send_notification_task(email: str, subject: str, body: str):
    logger.info(f"Sending notification to {email}: {subject}")
    # For now, use console logging. In prod, integrate with SendGrid/SES.