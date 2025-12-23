"""
Proxy endpoints for AI Interviewer microservice integration.
These endpoints forward requests to the AI service (Node.js/Genkit) and return responses to the frontend.
"""

import os
import logging
import httpx
from fastapi import APIRouter, Request, HTTPException, status, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import select
from app.models.ai_report import AIReport
from app.core.config import settings
from app.middleware.auth import get_current_user
from app.core.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.ai_report_service import AIReportService
import httpx
import base64
from fastapi import UploadFile, File

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ai", tags=["AI Interviewer"])

# AI service base URL (internal Docker network or env var)
# The AI service runs as Genkit embedded in the Next.js app or as a separate service
# For now, we point to the Next.js app which has Genkit API routes
AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://ai-service:3000/api")

async def proxy_to_ai_service(path: str, method: str = "POST", data=None, params=None, headers=None):
    url = f"{AI_SERVICE_URL}{path}"
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            response = await client.request(
                method,
                url,
                json=data,
                params=params,
                headers=headers,
            )
            response.raise_for_status()
            return JSONResponse(status_code=response.status_code, content=response.json())
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

# Example: Proxy for AI Interview Session Generation
@router.post("/interview-session")
async def create_interview_session(request: Request, user=Depends(get_current_user)):
    body = await request.json()
    return await proxy_to_ai_service("/interview/sessions", method="POST", data=body)

# Example: Proxy for Resume Analysis
@router.post("/resume-analysis")
async def resume_analysis(request: Request, user=Depends(get_current_user)):
    body = await request.json()
    return await proxy_to_ai_service("/interview/{token}/get-resume-analysis", method="POST", data=body)

@router.post("/ats-check")
async def ats_check(
    request: Request,
    user=Depends(get_current_user),
):
    """Simple ATS check without saving - for quick candidate self-check.
    
    Expected body: { resume_text, job_description (optional) }
    Returns: { score, summary, highlights, improvements, keywords_found, keywords_missing }
    """
    try:
        payload = await request.json()
        resume_text = payload.get("resume_text", "")
        job_description = payload.get("job_description", "")
        
        if not resume_text:
            raise HTTPException(status_code=400, detail="Missing resume_text")
        
        # Use AI service to generate ATS report
        from app.services.ai_service import generate_ats_report_enhanced
        
        result = await generate_ats_report_enhanced(resume_text, job_description)
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ATS check failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"ATS check failed: {str(e)}")


@router.post("/parse-resume")
async def parse_resume(
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    """Parse a resume file (PDF, Word, TXT) and extract text content.
    
    Returns: { text: string }
    """
    try:
        content = await file.read()
        filename = file.filename.lower() if file.filename else ""
        
        # Handle text files
        if filename.endswith('.txt') or file.content_type == 'text/plain':
            text = content.decode('utf-8', errors='ignore')
            return {"text": text}
        
        # Handle PDF files
        if filename.endswith('.pdf') or file.content_type == 'application/pdf':
            try:
                import PyPDF2
                import io
                pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
                text = ""
                for page in pdf_reader.pages:
                    text += page.extract_text() or ""
                return {"text": text.strip()}
            except ImportError:
                # Fallback: try pdfplumber
                try:
                    import pdfplumber
                    import io
                    with pdfplumber.open(io.BytesIO(content)) as pdf:
                        text = ""
                        for page in pdf.pages:
                            text += page.extract_text() or ""
                    return {"text": text.strip()}
                except ImportError:
                    raise HTTPException(
                        status_code=500, 
                        detail="PDF parsing not available. Please paste your resume text instead."
                    )
        
        # Handle Word files
        if filename.endswith('.docx') or file.content_type == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
            try:
                import docx
                import io
                doc = docx.Document(io.BytesIO(content))
                text = "\n".join([para.text for para in doc.paragraphs])
                return {"text": text.strip()}
            except ImportError:
                raise HTTPException(
                    status_code=500,
                    detail="Word document parsing not available. Please paste your resume text instead."
                )
        
        if filename.endswith('.doc'):
            raise HTTPException(
                status_code=400,
                detail="Legacy .doc format not supported. Please convert to .docx or paste the text."
            )
        
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Please upload PDF, Word (.docx), or text file."
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Resume parsing failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to parse resume: {str(e)}")


# Example: Proxy for ATS Checker
@router.post("/ats-checker")
async def ats_checker(request: Request, user=Depends(get_current_user)):
    body = await request.json()
    return await proxy_to_ai_service("/ats/check", method="POST", data=body)


@router.post("/ats-checker-file")
async def ats_checker_file(
    file: UploadFile = File(...),
    candidate_email: str | None = None,
    candidate_id: str | None = None,
    user=Depends(get_current_user),
):
    """Accept a resume upload (PDF/DOCX/TXT) and forward to AI service for ATS checking.

    Because some AI services expect JSON, we encode the file as base64 and send metadata.
    The AI service is expected to accept a JSON body: { file_name, file_b64, candidate_email, candidate_id }
    If your AI service accepts multipart/form-data, this can be adapted later.
    """
    try:
        content = await file.read()
        file_b64 = base64.b64encode(content).decode('ascii')

        payload = {
            "file_name": file.filename,
            "file_b64": file_b64,
            "candidate_email": candidate_email,
            "candidate_id": candidate_id,
        }

        # Forward to AI service
        return await proxy_to_ai_service("/ats/check", method="POST", data=payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ATS checker failed: {str(e)}")



@router.post("/ats-check-and-save")
async def ats_check_and_save(
    request: Request,
    session: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Forward ATS check to AI service, persist the report into ai_reports and return saved record.

    Expected body: { candidate_id (optional), candidate_email (optional), file_b64 or resume_url or other fields }
    """
    try:
        payload = await request.json()

        # Use internal AIService adapter to call the provider synchronously
        from app.services.ai_service import generate_ats_report

        candidate_id = payload.get("candidate_id")
        company_id = user.company_id
        report_type = "ats"

        ai_report = await generate_ats_report(payload.get("resume_text") or payload.get("file_b64") or "")

        score = ai_report.get("score")
        summary = ai_report.get("summary")

        report = await AIReportService.create_report(
            session=session,
            company_id=company_id,
            report_type=report_type,
            provider_response=ai_report.get("raw") or ai_report,
            candidate_id=candidate_id,
            score=score,
            summary=summary,
            created_by=user.id,
        )
        await session.commit()

        return {"report_id": str(report.id), "ai_response": ai_report}

    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=f"ATS check and save failed: {str(e)}")


@router.get("/reports")
async def list_ai_reports(
    limit: int = 20,
    offset: int = 0,
    session: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """List AI reports for the current user's company.

    Returns a simple JSON structure: { reports: [ ... ] }
    """
    try:
        stmt = select(AIReport).where(AIReport.company_id == user.company_id).order_by(AIReport.created_at.desc()).limit(limit).offset(offset)
        result = await session.execute(stmt)
        reports = result.scalars().all()

        # Simple serialization
        out = []
        for r in reports:
            out.append({
                "id": str(r.id),
                "report_type": r.report_type,
                "score": r.score,
                "summary": r.summary,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            })

        return {"reports": out}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list AI reports: {str(e)}")

# Example: Proxy for Transcript Fetching
@router.get("/transcript/{session_id}")
async def get_transcript(session_id: str, user=Depends(get_current_user)):
    return await proxy_to_ai_service(f"/reports/transcripts/{session_id}", method="GET")


@router.post("/transcript-callback")
async def transcript_callback(
    request: Request,
    session: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Endpoint for AI service (or AssemblyAI proxy) to POST final transcript.

    Expected JSON body: { session_id, candidate_id, interview_id, transcript_text }
    This will create an ai_report of type 'transcript_verdict' by calling the ATS/generative adapter.
    """
    try:
        payload = await request.json()
        transcript = payload.get("transcript_text") or payload.get("transcript")
        candidate_id = payload.get("candidate_id")
        interview_id = payload.get("interview_id")

        if not transcript:
            raise HTTPException(status_code=400, detail="Missing transcript_text in payload")

        # Use AI adapter to generate verdict based on transcript
        from app.services.ai_service import generate_ats_report

        ai_report = await generate_ats_report(transcript)

        report = await AIReportService.create_report(
            session=session,
            company_id=user.company_id,
            report_type="transcript_verdict",
            provider_response=ai_report.get("raw") or ai_report,
            candidate_id=candidate_id,
            interview_id=interview_id,
            score=ai_report.get("score"),
            summary=ai_report.get("summary"),
            created_by=user.id,
        )
        await session.commit()

        return {"report_id": str(report.id), "ai_response": ai_report}

    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=f"Transcript callback failed: {str(e)}")

# Add more proxy endpoints as needed for other AI features
