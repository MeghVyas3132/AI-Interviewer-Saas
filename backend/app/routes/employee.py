"""
Employee routes for viewing assigned candidates and managing interviews.

Employee capabilities:
- View assigned candidates only
- View candidate details
- Schedule interviews for assigned candidates
- Update candidate status
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.candidate import Candidate, CandidateStatus, Interview, InterviewStatus, InterviewRound
from app.models.user import User, UserRole

router = APIRouter(prefix="/api/v1/employee", tags=["employee"])


def require_employee(current_user: User = Depends(get_current_user)) -> User:
    """
    Dependency to require EMPLOYEE role.
    """
    if current_user.role != UserRole.EMPLOYEE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only employees can access this resource",
        )
    return current_user


@router.get("/my-candidates")
async def get_my_candidates(
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all candidates assigned to the current employee.
    """
    try:
        print(f"DEBUG: current_user.id = {current_user.id}")
        print(f"DEBUG: current_user.company_id = {current_user.company_id}")
        print(f"DEBUG: current_user.email = {current_user.email}")
        
        query = select(Candidate).filter(
            and_(
                Candidate.company_id == current_user.company_id,
                Candidate.assigned_to == current_user.id
            )
        )
        result = await db.execute(query)
        candidates = result.scalars().all()
        
        print(f"DEBUG: Found {len(candidates)} candidates")

        return [
            {
                "id": str(c.id),
                "email": c.email,
                "first_name": c.first_name,
                "last_name": c.last_name,
                "full_name": f"{c.first_name or ''} {c.last_name or ''}".strip() or c.email,
                "phone": c.phone,
                "position": c.position,
                "domain": c.domain,
                "experience_years": c.experience_years,
                "status": c.status.value if c.status else None,
                "job_role_id": str(c.job_template_id) if c.job_template_id else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in candidates
        ]
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching assigned candidates: {str(e)}"
        )


@router.get("/my-candidates/{candidate_id}")
async def get_candidate_details(
    candidate_id: UUID,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Get details of a specific candidate assigned to the employee.
    """
    try:
        query = select(Candidate).filter(
            and_(
                Candidate.id == candidate_id,
                Candidate.company_id == current_user.company_id,
                Candidate.assigned_to == current_user.id
            )
        )
        result = await db.execute(query)
        candidate = result.scalars().first()

        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found or not assigned to you"
            )

        # Get interviews for this candidate
        interviews_query = select(Interview).filter(
            Interview.candidate_id == candidate_id
        ).order_by(Interview.scheduled_time.desc())
        interviews_result = await db.execute(interviews_query)
        interviews = interviews_result.scalars().all()

        return {
            "id": str(candidate.id),
            "email": candidate.email,
            "first_name": candidate.first_name,
            "last_name": candidate.last_name,
            "full_name": f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or candidate.email,
            "phone": candidate.phone,
            "position": candidate.position,
            "domain": candidate.domain,
            "experience_years": candidate.experience_years,
            "qualifications": candidate.qualifications,
            "resume_url": candidate.resume_url,
            "status": candidate.status.value if candidate.status else None,
            "source": candidate.source.value if candidate.source else None,
            "created_at": candidate.created_at.isoformat() if candidate.created_at else None,
            "interviews": [
                {
                    "id": str(i.id),
                    "round": i.round.value if i.round else None,
                    "scheduled_time": i.scheduled_time.isoformat() if i.scheduled_time else None,
                    "status": i.status.value if i.status else None,
                    "meeting_link": i.meeting_link,
                    "notes": i.notes,
                }
                for i in interviews
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching candidate details: {str(e)}"
        )


@router.get("/candidate-profile/{candidate_id}")
async def get_candidate_detailed_profile(
    candidate_id: UUID,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Get detailed candidate profile including interview transcript, Q&A breakdown,
    scores, verdict, and resume. Used for clicking candidate name to view details.
    """
    from app.models.ai_report import AIReport
    from app.models.company import Company
    
    try:
        # Get candidate (must be assigned to employee or employee has access via company)
        query = select(Candidate).filter(
            and_(
                Candidate.id == candidate_id,
                Candidate.company_id == current_user.company_id
            )
        )
        result = await db.execute(query)
        candidate = result.scalars().first()

        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found"
            )

        # Get all interviews for this candidate
        interviews_query = select(Interview).filter(
            Interview.candidate_id == candidate.id
        ).order_by(Interview.scheduled_time.desc())
        interviews_result = await db.execute(interviews_query)
        interviews = interviews_result.scalars().all()

        # Get AI reports for these interviews
        interview_ids = [i.id for i in interviews]
        reports = []
        
        if interview_ids:
            reports_query = select(AIReport).filter(
                and_(
                    AIReport.interview_id.in_(interview_ids),
                    AIReport.report_type == "interview_verdict"
                )
            )
            reports_result = await db.execute(reports_query)
            reports = reports_result.scalars().all()

        # Map reports to interviews
        reports_by_interview = {r.interview_id: r for r in reports}

        # Build detailed interview data with Q&A breakdown
        interview_details = []
        for interview in interviews:
            report = reports_by_interview.get(interview.id)
            provider_response = report.provider_response if report else {}
            transcript = provider_response.get("transcript", [])
            
            # Extract Q&A pairs from transcript
            qa_pairs = []
            current_question = None
            for msg in transcript:
                if msg.get("role") == "ai":
                    current_question = msg.get("content", "")
                elif msg.get("role") == "user" and current_question:
                    qa_pairs.append({
                        "question": current_question,
                        "answer": msg.get("content", ""),
                        "timestamp": msg.get("timestamp", "")
                    })
                    current_question = None
            
            # Calculate verdict from score if not present
            verdict = provider_response.get("verdict") if report else None
            if not verdict and report and report.score is not None:
                if report.score >= 70:
                    verdict = "PASS"
                elif report.score >= 50:
                    verdict = "REVIEW"
                else:
                    verdict = "FAIL"
            
            interview_details.append({
                "interview_id": str(interview.id),
                "round": interview.round.value if interview.round else "unknown",
                "scheduled_time": interview.scheduled_time.isoformat() if interview.scheduled_time else None,
                "status": interview.status.value if interview.status else None,
                "verdict": verdict,
                "overall_score": report.score if report else None,
                "behavior_score": provider_response.get("behavior_score") if report else None,
                "confidence_score": provider_response.get("confidence_score") if report else None,
                "answer_score": provider_response.get("answer_score") if report else None,
                "strengths": provider_response.get("strengths", []) if report else [],
                "weaknesses": provider_response.get("weaknesses", []) if report else [],
                "detailed_feedback": provider_response.get("detailed_feedback", "") if report else "",
                "key_answers": provider_response.get("key_answers", []) if report else [],
                "summary": report.summary if report else None,
                "duration_seconds": provider_response.get("duration_seconds"),
                "total_questions": provider_response.get("total_questions"),
                "total_answers": provider_response.get("total_answers"),
                "qa_pairs": qa_pairs,
                "resume_text": provider_response.get("resume_text", ""),
                "resume_filename": provider_response.get("resume_filename", ""),
                "ats_score": getattr(interview, 'ats_score', None),
                "employee_verdict": getattr(interview, 'employee_verdict', None),
            })

        return {
            "candidate": {
                "id": str(candidate.id),
                "email": candidate.email,
                "first_name": candidate.first_name,
                "last_name": candidate.last_name,
                "full_name": f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or candidate.email,
                "phone": candidate.phone,
                "position": candidate.position,
                "domain": candidate.domain,
                "status": candidate.status.value if candidate.status else None,
                "experience_years": candidate.experience_years,
                "qualifications": candidate.qualifications,
            },
            "interviews": interview_details,
            "total_interviews": len(interviews),
            "completed_interviews": len([i for i in interviews if i.status == InterviewStatus.COMPLETED]),
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching candidate profile: {str(e)}"
        )


class EmployeeVerdictRequest(BaseModel):
    verdict: str  # APPROVE, REJECT, or custom


@router.post("/interviews/{interview_id}/verdict")
async def submit_employee_verdict(
    interview_id: UUID,
    request: EmployeeVerdictRequest,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit employee's verdict for an interview.
    Used when AI verdict is NEUTRAL and requires human review.
    """
    try:
        # Get interview
        query = select(Interview).filter(
            and_(
                Interview.id == interview_id,
                Interview.company_id == current_user.company_id
            )
        )
        result = await db.execute(query)
        interview = result.scalars().first()
        
        if not interview:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found"
            )
        
        # Update employee verdict
        interview.employee_verdict = request.verdict
        await db.commit()
        
        return {
            "status": "success",
            "message": "Verdict submitted successfully",
            "interview_id": str(interview_id),
            "employee_verdict": request.verdict
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error submitting verdict: {str(e)}"
        )


class UpdateCandidateStatusRequest(BaseModel):
    status: str


@router.put("/my-candidates/{candidate_id}/status")
async def update_candidate_status(
    candidate_id: UUID,
    request: UpdateCandidateStatusRequest,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Update status of a candidate assigned to the employee.
    """
    try:
        # Verify candidate is assigned to this employee
        query = select(Candidate).filter(
            and_(
                Candidate.id == candidate_id,
                Candidate.company_id == current_user.company_id,
                Candidate.assigned_to == current_user.id
            )
        )
        result = await db.execute(query)
        candidate = result.scalars().first()

        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found or not assigned to you"
            )

        # Validate status
        try:
            new_status = CandidateStatus(request.status)
        except ValueError:
            valid_statuses = [s.value for s in CandidateStatus]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status. Must be one of: {valid_statuses}"
            )

        candidate.status = new_status
        await db.commit()

        return {
            "message": f"Candidate status updated to {new_status.value}",
            "candidate_id": str(candidate_id),
            "status": new_status.value
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating candidate status: {str(e)}"
        )


class AssignJobRoleRequest(BaseModel):
    job_id: str


@router.put("/my-candidates/{candidate_id}/assign-job")
async def assign_job_role(
    candidate_id: UUID,
    request: AssignJobRoleRequest,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Assign a job role to a candidate. This determines what questions the AI interviewer will ask.
    The job_id refers to a JobTemplate which contains the AI-generated interview questions.
    """
    try:
        # Verify candidate is assigned to this employee
        query = select(Candidate).filter(
            and_(
                Candidate.id == candidate_id,
                Candidate.company_id == current_user.company_id,
                Candidate.assigned_to == current_user.id
            )
        )
        result = await db.execute(query)
        candidate = result.scalars().first()

        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found or not assigned to you"
            )

        # Verify job template exists and belongs to the same company
        from app.models.job import JobTemplate
        job_query = select(JobTemplate).filter(
            and_(
                JobTemplate.id == request.job_id,
                JobTemplate.company_id == current_user.company_id
            )
        )
        job_result = await db.execute(job_query)
        job = job_result.scalars().first()

        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Job not found or not in your company"
            )

        # Update candidate's job role and link to job template
        candidate.position = job.title
        candidate.job_template_id = job.id
        await db.commit()

        return {
            "message": f"Job role '{job.title}' assigned to candidate",
            "candidate_id": str(candidate_id),
            "job_id": str(job.id),
            "job_title": job.title
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error assigning job role: {str(e)}"
        )


class ScheduleInterviewRequest(BaseModel):
    scheduled_time: str  # ISO format datetime (local time from browser)
    round: str = "screening"
    timezone: str = "UTC"
    notes: Optional[str] = None


@router.post("/my-candidates/{candidate_id}/schedule-interview")
async def schedule_interview(
    candidate_id: UUID,
    request: ScheduleInterviewRequest,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Schedule an interview for a candidate assigned to the employee.
    Automatically generates an AI interview token.
    """
    try:
        import secrets
        from datetime import datetime
        from zoneinfo import ZoneInfo

        # Verify candidate is assigned to this employee
        query = select(Candidate).filter(
            and_(
                Candidate.id == candidate_id,
                Candidate.company_id == current_user.company_id,
                Candidate.assigned_to == current_user.id
            )
        )
        result = await db.execute(query)
        candidate = result.scalars().first()

        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found or not assigned to you"
            )

        # Check for existing scheduled interview for this candidate
        existing_interview_query = select(Interview).filter(
            and_(
                Interview.candidate_id == candidate_id,
                Interview.status == InterviewStatus.SCHEDULED
            )
        )
        existing_result = await db.execute(existing_interview_query)
        existing_interview = existing_result.scalars().first()

        if existing_interview:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Candidate already has a scheduled interview for {existing_interview.scheduled_time.isoformat()}. Cancel or complete that interview first."
            )

        # Parse scheduled time - the browser sends local time without timezone info
        # We need to interpret it in the user's timezone
        try:
            # datetime-local gives us "YYYY-MM-DDTHH:MM" format (no timezone)
            naive_time = datetime.fromisoformat(request.scheduled_time.replace('Z', ''))
            
            # Interpret this time as being in the user's timezone
            try:
                user_tz = ZoneInfo(request.timezone)
                # Create timezone-aware datetime in user's timezone
                local_time = naive_time.replace(tzinfo=user_tz)
                # Convert to UTC for storage
                scheduled_time = local_time.astimezone(ZoneInfo('UTC'))
            except Exception:
                # If timezone parsing fails, treat as UTC
                scheduled_time = naive_time.replace(tzinfo=ZoneInfo('UTC'))
                
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid datetime format. Use ISO format (YYYY-MM-DDTHH:MM:SS)"
            )

        # Validate round
        try:
            interview_round = InterviewRound(request.round)
        except ValueError:
            valid_rounds = [r.value for r in InterviewRound]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid round. Must be one of: {valid_rounds}"
            )

        # Generate AI interview token
        token = secrets.token_urlsafe(32)

        # Create interview with AI token
        interview = Interview(
            company_id=current_user.company_id,
            candidate_id=candidate_id,
            interviewer_id=current_user.id,
            created_by=current_user.id,
            round=interview_round,
            scheduled_time=scheduled_time,
            timezone=request.timezone,
            status=InterviewStatus.SCHEDULED,
            notes=request.notes,
            ai_interview_token=token,
        )

        db.add(interview)
        
        # Update candidate status to interview_scheduled
        # Use .value to ensure lowercase value is sent to database
        from sqlalchemy import text
        await db.execute(
            text("UPDATE candidates SET status = :status, updated_at = now() WHERE id = :id"),
            {"status": "interview_scheduled", "id": str(candidate_id)}
        )
        
        await db.commit()
        await db.refresh(interview)

        return {
            "message": "Interview scheduled successfully",
            "interview": {
                "id": str(interview.id),
                "candidate_id": str(candidate_id),
                "round": interview_round.value,
                "scheduled_time": scheduled_time.isoformat(),
                "status": "scheduled",
                "ai_interview_token": token,
                "interview_url": f"http://localhost:3000/interview/{token}"
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error scheduling interview: {str(e)}"
        )


@router.delete("/my-candidates/{candidate_id}/interviews/{interview_id}")
async def cancel_interview(
    candidate_id: UUID,
    interview_id: UUID,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Cancel/delete a scheduled interview for a candidate assigned to the employee.
    """
    try:
        # Verify candidate is assigned to this employee
        candidate_query = select(Candidate).filter(
            and_(
                Candidate.id == candidate_id,
                Candidate.company_id == current_user.company_id,
                Candidate.assigned_to == current_user.id
            )
        )
        candidate_result = await db.execute(candidate_query)
        candidate = candidate_result.scalars().first()

        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found or not assigned to you"
            )

        # Find and delete the interview
        interview_query = select(Interview).filter(
            and_(
                Interview.id == interview_id,
                Interview.candidate_id == candidate_id
            )
        )
        interview_result = await db.execute(interview_query)
        interview = interview_result.scalars().first()

        if not interview:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found"
            )

        # Delete the interview
        await db.delete(interview)
        
        # Revert candidate status to assigned using service method
        from app.services.candidate_service import CandidateService
        await CandidateService.update_candidate_status(
            db, candidate.id, CandidateStatus.ASSIGNED
        )
        
        await db.commit()

        return {
            "message": "Interview cancelled successfully",
            "interview_id": str(interview_id),
            "candidate_id": str(candidate_id)
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error cancelling interview: {str(e)}"
        )


@router.get("/my-interviews")
async def get_my_interviews(
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all interviews for candidates assigned to the employee.
    Includes verdict and score for completed interviews.
    """
    from app.models.ai_report import AIReport
    
    try:
        # Get all candidate IDs assigned to this employee
        candidates_query = select(Candidate.id).filter(
            and_(
                Candidate.company_id == current_user.company_id,
                Candidate.assigned_to == current_user.id
            )
        )
        candidates_result = await db.execute(candidates_query)
        candidate_ids = [row[0] for row in candidates_result.fetchall()]

        if not candidate_ids:
            return []

        # Get interviews for these candidates
        interviews_query = select(Interview, Candidate).join(
            Candidate, Interview.candidate_id == Candidate.id
        ).filter(
            Interview.candidate_id.in_(candidate_ids)
        ).order_by(Interview.scheduled_time.desc())
        
        result = await db.execute(interviews_query)
        rows = result.fetchall()

        # Get AI reports for these interviews to include verdict
        interview_ids = [interview.id for interview, _ in rows]
        reports_dict = {}
        
        if interview_ids:
            reports_query = select(AIReport).filter(
                and_(
                    AIReport.interview_id.in_(interview_ids),
                    AIReport.report_type == "interview_verdict"
                )
            )
            reports_result = await db.execute(reports_query)
            reports = reports_result.scalars().all()
            
            for report in reports:
                provider_response = report.provider_response or {}
                # Calculate verdict from score if not present
                verdict = provider_response.get("verdict")
                if not verdict and report.score is not None:
                    if report.score >= 70:
                        verdict = "PASS"
                    elif report.score >= 50:
                        verdict = "REVIEW"
                    else:
                        verdict = "FAIL"
                
                reports_dict[report.interview_id] = {
                    "verdict": verdict,
                    "score": report.score,
                    "summary": report.summary,
                    "completion_score": provider_response.get("completion_score"),
                    "detail_score": provider_response.get("detail_score"),
                }

        return [
            {
                "id": str(interview.id),
                "candidate_id": str(interview.candidate_id),
                "candidate_name": f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or candidate.email,
                "candidate_email": candidate.email,
                "round": interview.round.value if interview.round else None,
                "scheduled_time": interview.scheduled_time.isoformat() if interview.scheduled_time else None,
                "status": interview.status.value if interview.status else None,
                "meeting_link": interview.meeting_link,
                "notes": interview.notes,
                # Include verdict data for completed interviews
                "verdict": reports_dict.get(interview.id, {}).get("verdict"),
                "score": reports_dict.get(interview.id, {}).get("score"),
                "verdict_summary": reports_dict.get(interview.id, {}).get("summary"),
            }
            for interview, candidate in rows
        ]
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching interviews: {str(e)}"
        )


@router.get("/dashboard")
async def get_employee_dashboard(
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Get employee dashboard metrics.
    """
    try:
        company_id = current_user.company_id
        employee_id = current_user.id

        # Count assigned candidates
        candidates_query = select(func.count()).select_from(Candidate).filter(
            and_(
                Candidate.company_id == company_id,
                Candidate.assigned_to == employee_id
            )
        )
        candidates_result = await db.execute(candidates_query)
        total_candidates = candidates_result.scalar() or 0

        # Get candidate IDs for interview queries
        candidate_ids_query = select(Candidate.id).filter(
            and_(
                Candidate.company_id == company_id,
                Candidate.assigned_to == employee_id
            )
        )
        candidate_ids_result = await db.execute(candidate_ids_query)
        candidate_ids = [row[0] for row in candidate_ids_result.fetchall()]

        scheduled_interviews = 0
        completed_interviews = 0

        if candidate_ids:
            # Count scheduled interviews
            scheduled_query = select(func.count()).select_from(Interview).filter(
                and_(
                    Interview.candidate_id.in_(candidate_ids),
                    Interview.status == InterviewStatus.SCHEDULED
                )
            )
            scheduled_result = await db.execute(scheduled_query)
            scheduled_interviews = scheduled_result.scalar() or 0

            # Count completed interviews
            completed_query = select(func.count()).select_from(Interview).filter(
                and_(
                    Interview.candidate_id.in_(candidate_ids),
                    Interview.status == InterviewStatus.COMPLETED
                )
            )
            completed_result = await db.execute(completed_query)
            completed_interviews = completed_result.scalar() or 0

        return {
            "total_assigned_candidates": total_candidates,
            "scheduled_interviews": scheduled_interviews,
            "completed_interviews": completed_interviews,
            "employee_name": current_user.name,
            "employee_email": current_user.email,
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching dashboard: {str(e)}"
        )


@router.post("/my-candidates/{candidate_id}/create-ai-interview")
async def create_ai_interview_for_candidate(
    candidate_id: UUID,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Create an AI interview session for an assigned candidate.
    Employee can create on-spot interviews for their assigned candidates.
    """
    import secrets
    import httpx
    from datetime import datetime, timedelta
    from app.models.job import JobTemplate, Question
    from app.core.config import settings
    
    try:
        company_id = current_user.company_id

        # Verify candidate exists and is assigned to this employee
        candidate_query = select(Candidate).filter(
            and_(
                Candidate.id == candidate_id,
                Candidate.company_id == company_id,
                Candidate.assigned_to == current_user.id
            )
        )
        result = await db.execute(candidate_query)
        candidate = result.scalars().first()
        
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found or not assigned to you"
            )

        # Generate a secure token
        token = secrets.token_urlsafe(32)
        
        # Get questions for the candidate's job role if assigned
        questions = []
        job_title = "General Interview"
        if candidate.job_template_id:
            # Get job template for title
            job_query = select(JobTemplate).filter(JobTemplate.id == candidate.job_template_id)
            job_result = await db.execute(job_query)
            job_template = job_result.scalars().first()
            if job_template:
                job_title = job_template.title
            
            questions_query = select(Question).filter(
                Question.job_template_id == candidate.job_template_id
            )
            questions_result = await db.execute(questions_query)
            all_questions = [{"id": str(q.id), "text": q.text} for q in questions_result.scalars().all()]
            
            # Limit to 10 questions - random selection if more than 10
            import random
            MAX_QUESTIONS = 10
            if len(all_questions) > MAX_QUESTIONS:
                questions = random.sample(all_questions, MAX_QUESTIONS)
            else:
                questions = all_questions
        
        # Create a new interview record (on-spot interview starts now)
        now = datetime.utcnow()
        scheduled_time = now
        scheduled_end_time = now + timedelta(hours=1)
        
        new_interview = Interview(
            company_id=company_id,
            candidate_id=candidate_id,
            interviewer_id=current_user.id,
            round=InterviewRound.SCREENING,
            scheduled_time=scheduled_time,
            status=InterviewStatus.SCHEDULED,
            ai_interview_token=token,
            notes=f"On-spot AI interview created by {current_user.name}"
        )
        db.add(new_interview)
        
        # Update candidate status using service method
        from app.services.candidate_service import CandidateService
        await CandidateService.update_candidate_status(
            db, candidate.id, CandidateStatus.INTERVIEW_SCHEDULED
        )
        
        await db.flush()
        
        # Sync to AI service
        ai_service_url = getattr(settings, 'AI_SERVICE_URL', 'http://ai-service:3000')
        
        sync_payload = {
            "candidate_id": str(candidate.id),
            "token": token,
            "first_name": candidate.first_name or "",
            "last_name": candidate.last_name or "",
            "email": candidate.email,
            "job_title": job_title,
            "questions": questions,
            "scheduled_time": scheduled_time.isoformat() + "Z",
            "scheduled_end_time": scheduled_end_time.isoformat() + "Z",
            "interview_mode": "voice",
            "is_proctored": True
        }
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                sync_response = await client.post(
                    f"{ai_service_url}/api/interview/sync-session",
                    json=sync_payload
                )
                if sync_response.status_code not in [200, 201]:
                    print(f"Warning: AI service sync returned {sync_response.status_code}")
        except Exception as sync_error:
            print(f"Warning: Failed to sync with AI service: {sync_error}")
        
        await db.commit()
        
        return {
            "success": True,
            "token": token,
            "interview_url": f"http://localhost:3000/interview/{token}",  # Use main frontend URL
            "message": "AI Interview created successfully. Candidate can start immediately.",
            "interview_id": str(new_interview.id),
            "questions_count": len(questions)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating AI interview: {str(e)}"
        )


# ==================== AVAILABILITY & AUTO-SCHEDULING ====================

class AvailabilitySlotRequest(BaseModel):
    day_of_week: str  # monday, tuesday, etc.
    start_time: str   # HH:MM format
    end_time: str     # HH:MM format
    slot_duration_minutes: int = 30
    max_interviews_per_slot: int = 1


class AutoScheduleConfigRequest(BaseModel):
    min_days_gap: int = 1
    max_days_ahead: int = 14
    passing_score_threshold: int = 60
    auto_schedule_enabled: bool = True
    notify_on_pass: bool = True
    notify_on_fail: bool = True


@router.get("/availability")
async def get_my_availability(
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Get employee's availability slots for auto-scheduling.
    """
    try:
        from app.models.employee_availability import EmployeeAvailability, AutoScheduleConfig
        
        # Get availability slots
        slots_query = select(EmployeeAvailability).filter(
            and_(
                EmployeeAvailability.employee_id == current_user.id,
                EmployeeAvailability.is_active == True
            )
        ).order_by(EmployeeAvailability.day_of_week)
        
        result = await db.execute(slots_query)
        slots = result.scalars().all()
        
        # Get auto-schedule config
        config_query = select(AutoScheduleConfig).filter(
            AutoScheduleConfig.employee_id == current_user.id
        )
        config_result = await db.execute(config_query)
        config = config_result.scalars().first()
        
        return {
            "slots": [
                {
                    "id": str(s.id),
                    "day_of_week": s.day_of_week.value,
                    "start_time": s.start_time.strftime("%H:%M"),
                    "end_time": s.end_time.strftime("%H:%M"),
                    "slot_duration_minutes": s.slot_duration_minutes,
                    "max_interviews_per_slot": s.max_interviews_per_slot,
                }
                for s in slots
            ],
            "config": {
                "min_days_gap": config.min_days_gap if config else 1,
                "max_days_ahead": config.max_days_ahead if config else 14,
                "passing_score_threshold": config.passing_score_threshold if config else 60,
                "auto_schedule_enabled": config.auto_schedule_enabled if config else False,
                "notify_on_pass": config.notify_on_pass if config else True,
                "notify_on_fail": config.notify_on_fail if config else True,
            } if config else None
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching availability: {str(e)}"
        )


@router.post("/availability/slots")
async def add_availability_slot(
    request: AvailabilitySlotRequest,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Add an availability slot for auto-scheduling interviews.
    """
    try:
        from app.models.employee_availability import EmployeeAvailability, DayOfWeek
        
        # Parse day of week
        day_mapping = {
            'monday': DayOfWeek.monday,
            'tuesday': DayOfWeek.tuesday,
            'wednesday': DayOfWeek.wednesday,
            'thursday': DayOfWeek.thursday,
            'friday': DayOfWeek.friday,
            'saturday': DayOfWeek.saturday,
            'sunday': DayOfWeek.sunday,
        }
        
        day = day_mapping.get(request.day_of_week.lower())
        if not day:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid day of week: {request.day_of_week}"
            )
        
        # Parse times
        from datetime import time
        start_parts = request.start_time.split(":")
        end_parts = request.end_time.split(":")
        
        start_time = time(int(start_parts[0]), int(start_parts[1]))
        end_time = time(int(end_parts[0]), int(end_parts[1]))
        
        # Create slot
        slot = EmployeeAvailability(
            employee_id=current_user.id,
            company_id=current_user.company_id,
            day_of_week=day,
            start_time=start_time,
            end_time=end_time,
            slot_duration_minutes=request.slot_duration_minutes,
            is_active=True,
        )
        
        db.add(slot)
        await db.commit()
        await db.refresh(slot)
        
        return {
            "message": "Availability slot added successfully",
            "slot": {
                "id": str(slot.id),
                "day_of_week": slot.day_of_week.value,
                "start_time": slot.start_time.strftime("%H:%M"),
                "end_time": slot.end_time.strftime("%H:%M"),
                "slot_duration_minutes": slot.slot_duration_minutes,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error adding availability slot: {str(e)}"
        )


# Also support POST /availability for frontend compatibility
@router.post("/availability")
async def add_availability_slot_alt(
    request: AvailabilitySlotRequest,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Add an availability slot for auto-scheduling interviews (alternate path).
    """
    try:
        from app.models.employee_availability import EmployeeAvailability, DayOfWeek
        
        # Parse day of week
        day_mapping = {
            'monday': DayOfWeek.monday,
            'tuesday': DayOfWeek.tuesday,
            'wednesday': DayOfWeek.wednesday,
            'thursday': DayOfWeek.thursday,
            'friday': DayOfWeek.friday,
            'saturday': DayOfWeek.saturday,
            'sunday': DayOfWeek.sunday,
        }
        
        day = day_mapping.get(request.day_of_week.lower())
        if not day:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid day of week: {request.day_of_week}"
            )
        
        # Parse times
        from datetime import time
        start_parts = request.start_time.split(":")
        end_parts = request.end_time.split(":")
        
        start_time = time(int(start_parts[0]), int(start_parts[1]))
        end_time = time(int(end_parts[0]), int(end_parts[1]))
        
        # Create slot
        slot = EmployeeAvailability(
            employee_id=current_user.id,
            company_id=current_user.company_id,
            day_of_week=day,
            start_time=start_time,
            end_time=end_time,
            slot_duration_minutes=request.slot_duration_minutes,
            is_active=True,
        )
        
        db.add(slot)
        await db.commit()
        await db.refresh(slot)
        
        return {
            "message": "Availability slot added successfully",
            "slot": {
                "id": str(slot.id),
                "day_of_week": slot.day_of_week.value,
                "start_time": slot.start_time.strftime("%H:%M"),
                "end_time": slot.end_time.strftime("%H:%M"),
                "slot_duration_minutes": slot.slot_duration_minutes,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error adding availability slot: {str(e)}"
        )


@router.get("/availability/config")
async def get_auto_schedule_config(
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Get auto-scheduling configuration.
    """
    try:
        from app.models.employee_availability import AutoScheduleConfig
        
        query = select(AutoScheduleConfig).filter(
            AutoScheduleConfig.employee_id == current_user.id
        )
        result = await db.execute(query)
        config = result.scalars().first()
        
        if not config:
            # Return defaults
            return {
                "min_days_gap": 1,
                "max_days_ahead": 14,
                "passing_score_threshold": 60,
                "auto_schedule_enabled": False,
                "notify_on_pass": True,
                "notify_on_fail": True,
            }
        
        return {
            "min_days_gap": config.min_days_gap,
            "max_days_ahead": config.max_days_ahead,
            "passing_score_threshold": config.passing_score_threshold,
            "auto_schedule_enabled": config.auto_schedule_enabled,
            "notify_on_pass": config.notify_on_pass,
            "notify_on_fail": config.notify_on_fail,
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching auto-schedule config: {str(e)}"
        )
        from datetime import time
        
        # Parse day of week
        try:
            day = DayOfWeek(request.day_of_week.lower())
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid day_of_week. Must be one of: {[d.value for d in DayOfWeek]}"
            )
        
        # Parse times
        try:
            start_parts = request.start_time.split(":")
            end_parts = request.end_time.split(":")
            start_time = time(int(start_parts[0]), int(start_parts[1]))
            end_time = time(int(end_parts[0]), int(end_parts[1]))
        except (ValueError, IndexError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid time format. Use HH:MM"
            )
        
        if start_time >= end_time:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Start time must be before end time"
            )
        
        # Check for overlapping slots
        existing_query = select(EmployeeAvailability).filter(
            and_(
                EmployeeAvailability.employee_id == current_user.id,
                EmployeeAvailability.day_of_week == day,
                EmployeeAvailability.is_active == True
            )
        )
        existing_result = await db.execute(existing_query)
        existing_slots = existing_result.scalars().all()
        
        for slot in existing_slots:
            if not (end_time <= slot.start_time or start_time >= slot.end_time):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Time slot overlaps with existing slot ({slot.start_time.strftime('%H:%M')} - {slot.end_time.strftime('%H:%M')})"
                )
        
        # Create new slot
        new_slot = EmployeeAvailability(
            employee_id=current_user.id,
            company_id=current_user.company_id,
            day_of_week=day,
            start_time=start_time,
            end_time=end_time,
            slot_duration_minutes=request.slot_duration_minutes,
            max_interviews_per_slot=request.max_interviews_per_slot,
        )
        
        db.add(new_slot)
        await db.commit()
        await db.refresh(new_slot)
        
        return {
            "message": "Availability slot added successfully",
            "slot": {
                "id": str(new_slot.id),
                "day_of_week": new_slot.day_of_week.value,
                "start_time": new_slot.start_time.strftime("%H:%M"),
                "end_time": new_slot.end_time.strftime("%H:%M"),
                "slot_duration_minutes": new_slot.slot_duration_minutes,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error adding availability slot: {str(e)}"
        )


@router.delete("/availability/slots/{slot_id}")
@router.delete("/availability/{slot_id}")
async def delete_availability_slot(
    slot_id: UUID,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete an availability slot.
    """
    try:
        from app.models.employee_availability import EmployeeAvailability
        
        query = select(EmployeeAvailability).filter(
            and_(
                EmployeeAvailability.id == slot_id,
                EmployeeAvailability.employee_id == current_user.id
            )
        )
        result = await db.execute(query)
        slot = result.scalars().first()
        
        if not slot:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Slot not found"
            )
        
        await db.delete(slot)
        await db.commit()
        
        return {"message": "Availability slot deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting availability slot: {str(e)}"
        )


@router.put("/availability/config")
async def update_auto_schedule_config(
    request: AutoScheduleConfigRequest,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Update auto-scheduling configuration.
    """
    try:
        from app.models.employee_availability import AutoScheduleConfig
        
        # Get or create config
        query = select(AutoScheduleConfig).filter(
            AutoScheduleConfig.employee_id == current_user.id
        )
        result = await db.execute(query)
        config = result.scalars().first()
        
        if not config:
            config = AutoScheduleConfig(
                employee_id=current_user.id,
                company_id=current_user.company_id,
            )
            db.add(config)
        
        # Update fields
        config.min_days_gap = request.min_days_gap
        config.max_days_ahead = request.max_days_ahead
        config.passing_score_threshold = request.passing_score_threshold
        config.auto_schedule_enabled = request.auto_schedule_enabled
        config.notify_on_pass = request.notify_on_pass
        config.notify_on_fail = request.notify_on_fail
        
        await db.commit()
        await db.refresh(config)
        
        return {
            "message": "Auto-schedule configuration updated successfully",
            "config": {
                "min_days_gap": config.min_days_gap,
                "max_days_ahead": config.max_days_ahead,
                "passing_score_threshold": config.passing_score_threshold,
                "auto_schedule_enabled": config.auto_schedule_enabled,
                "notify_on_pass": config.notify_on_pass,
                "notify_on_fail": config.notify_on_fail,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating auto-schedule config: {str(e)}"
        )

