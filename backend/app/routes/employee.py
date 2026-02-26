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
    Includes latest scheduled interview info for each candidate.
    """
    try:
        query = select(Candidate).filter(
            and_(
                Candidate.company_id == current_user.company_id,
                Candidate.assigned_to == current_user.id
            )
        )
        result = await db.execute(query)
        candidates = result.scalars().all()

        # Batch-fetch the latest SCHEDULED interview for each candidate
        candidate_ids = [c.id for c in candidates]
        scheduled_interviews = {}
        if candidate_ids:
            interviews_query = select(Interview).filter(
                and_(
                    Interview.candidate_id.in_(candidate_ids),
                    Interview.status == InterviewStatus.SCHEDULED,
                )
            ).order_by(Interview.scheduled_time.desc())
            interviews_result = await db.execute(interviews_query)
            for interview in interviews_result.scalars().all():
                # Keep the first (latest) scheduled interview per candidate
                if interview.candidate_id not in scheduled_interviews:
                    scheduled_interviews[interview.candidate_id] = interview

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
                # Include scheduled interview info so the UI knows immediately
                "scheduled_at": scheduled_interviews[c.id].scheduled_time.isoformat()
                    if c.id in scheduled_interviews and scheduled_interviews[c.id].scheduled_time
                    else None,
                "interview_id": str(scheduled_interviews[c.id].id)
                    if c.id in scheduled_interviews else None,
                "interview_token": scheduled_interviews[c.id].ai_interview_token
                    if c.id in scheduled_interviews else None,
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
            
            # Fallback: derive verdict from interview's ai_recommendation
            if not verdict and interview.ai_recommendation:
                rec = interview.ai_recommendation.upper()
                if rec in ("HIRE", "PASS"):
                    verdict = "PASS"
                elif rec in ("REJECT", "FAIL"):
                    verdict = "FAIL"
                else:
                    verdict = "REVIEW"
            
            # Parse ai_verdict JSON from interview table if available
            interview_ai_data = {}
            if interview.ai_verdict:
                try:
                    import json as _json
                    interview_ai_data = _json.loads(interview.ai_verdict) if isinstance(interview.ai_verdict, str) else interview.ai_verdict
                except:
                    pass
            
            # Build scores with fallback: AIReport → interview table → ai_verdict JSON
            overall = (report.score if report else None) or interview_ai_data.get("overall_score")
            behavior = (provider_response.get("behavior_score") if report else None) or interview.behavior_score
            confidence = (provider_response.get("confidence_score") if report else None) or interview.confidence_score
            answer = (provider_response.get("answer_score") if report else None) or interview.answer_score
            
            # Compute overall_score from component scores if still missing
            if overall is None and any(s is not None for s in [behavior, confidence, answer]):
                scores = [s for s in [behavior, confidence, answer] if s is not None]
                overall = round(sum(scores) / len(scores)) if scores else None
            
            interview_details.append({
                "interview_id": str(interview.id),
                "round": interview.round.value if interview.round else "unknown",
                "scheduled_time": interview.scheduled_time.isoformat() if interview.scheduled_time else None,
                "status": interview.status.value if interview.status else None,
                "verdict": verdict,
                "overall_score": overall,
                "behavior_score": behavior,
                "confidence_score": confidence,
                "answer_score": answer,
                "strengths": (provider_response.get("strengths", []) if report else []) or interview_ai_data.get("strengths", []),
                "weaknesses": (provider_response.get("weaknesses", []) if report else []) or interview_ai_data.get("weaknesses", []),
                "detailed_feedback": (provider_response.get("detailed_feedback", "") if report else "") or interview_ai_data.get("detailed_feedback", ""),
                "key_answers": provider_response.get("key_answers", []) if report else [],
                "summary": (report.summary if report else None) or interview_ai_data.get("summary"),
                "duration_seconds": provider_response.get("duration_seconds"),
                "total_questions": provider_response.get("total_questions"),
                "total_answers": provider_response.get("total_answers"),
                "qa_pairs": qa_pairs,
                "resume_text": provider_response.get("resume_text", "") or getattr(candidate, 'resume_text', "") or "",
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
    Used when AI verdict is NEUTRAL/REVIEW and requires human review.
    
    For multi-round flow:
    - APPROVE: Promotes candidate to eligible_round_2 (or next round)
    - REJECT: Marks candidate as failed
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
        
        # Update candidate status based on verdict - MULTI-ROUND FLOW
        if interview.candidate_id:
            from sqlalchemy import text
            from datetime import datetime
            
            verdict_upper = request.verdict.upper()
            
            if verdict_upper in ["APPROVE", "PASS", "ACCEPTED", "HIRE"]:
                # APPROVE - Promote to eligible for Round 2
                new_status = "eligible_round_2"
                
                await db.execute(
                    text("""
                        UPDATE candidates 
                        SET status = :status, 
                            current_round = 2,
                            promoted_at = NOW(),
                            updated_at = NOW()
                        WHERE id = :id
                    """),
                    {"status": new_status, "id": str(interview.candidate_id)}
                )
                print(f"[Employee Verdict] APPROVED - Candidate promoted to eligible_round_2")
                
            elif verdict_upper in ["REJECT", "FAIL", "REJECTED"]:
                # REJECT - Mark as failed
                new_status = "failed"
                await db.execute(
                    text("UPDATE candidates SET status = :status, updated_at = NOW() WHERE id = :id"),
                    {"status": new_status, "id": str(interview.candidate_id)}
                )
                print(f"[Employee Verdict] REJECTED - Candidate marked as failed")
                
            else:
                # Keep in review for further consideration
                new_status = "review"
                await db.execute(
                    text("UPDATE candidates SET status = :status, updated_at = NOW() WHERE id = :id"),
                    {"status": new_status, "id": str(interview.candidate_id)}
                )
            
            # Also update interview with review metadata
            await db.execute(
                text("""
                    UPDATE interviews 
                    SET reviewed_by = :reviewed_by,
                        reviewed_at = NOW(),
                        updated_at = NOW()
                    WHERE id = :interview_id
                """),
                {"reviewed_by": str(current_user.id), "interview_id": str(interview_id)}
            )
        
        await db.commit()
        
        return {
            "status": "success",
            "message": "Verdict submitted successfully",
            "interview_id": str(interview_id),
            "employee_verdict": request.verdict,
            "candidate_status": new_status if interview.candidate_id else None,
            "promoted_to_round_2": new_status == "eligible_round_2"
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error submitting verdict: {str(e)}"
        )


@router.get("/candidates-for-review")
async def get_candidates_for_review(
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all candidates that need manual review (ai_review status).
    These are candidates where AI verdict was NEUTRAL/REVIEW.
    Employee can APPROVE (promote to Round 2) or REJECT these candidates.
    """
    try:
        # Get candidates with ai_review status assigned to this employee
        query = select(Candidate, Interview).join(
            Interview, Interview.candidate_id == Candidate.id
        ).filter(
            and_(
                Candidate.company_id == current_user.company_id,
                Candidate.assigned_to == current_user.id,
                Candidate.status == "ai_review"
            )
        ).order_by(Interview.updated_at.desc())
        
        result = await db.execute(query)
        rows = result.fetchall()
        
        candidates_for_review = []
        for candidate, interview in rows:
            # Parse AI verdict for display
            ai_verdict_data = {}
            if interview.ai_verdict:
                import json
                try:
                    ai_verdict_data = json.loads(interview.ai_verdict)
                except:
                    pass
            
            candidates_for_review.append({
                "candidate_id": str(candidate.id),
                "interview_id": str(interview.id),
                "name": f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or candidate.email,
                "email": candidate.email,
                "position": candidate.position,
                "domain": candidate.domain,
                "interview_date": interview.scheduled_time.isoformat() if interview.scheduled_time else None,
                "completed_at": interview.updated_at.isoformat() if interview.updated_at else None,
                # Scores
                "overall_score": ai_verdict_data.get("overall_score"),
                "behavior_score": interview.behavior_score,
                "confidence_score": interview.confidence_score,
                "answer_score": interview.answer_score,
                "ats_score": interview.ats_score,
                # AI Analysis
                "ai_recommendation": interview.ai_recommendation,
                "summary": ai_verdict_data.get("summary"),
                "strengths": ai_verdict_data.get("strengths", []),
                "weaknesses": ai_verdict_data.get("weaknesses", []),
                "hiring_risk": ai_verdict_data.get("hiring_risk"),
                "detailed_feedback": ai_verdict_data.get("detailed_feedback"),
            })
        
        return {
            "candidates": candidates_for_review,
            "total": len(candidates_for_review)
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching candidates for review: {str(e)}"
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

        # If candidate is rejected/failed, schedule deletion after 10 minutes
        scheduled_deletion = False
        rejection_statuses = [CandidateStatus.REJECTED, CandidateStatus.FAILED, CandidateStatus.AUTO_REJECTED]
        if new_status in rejection_statuses:
            try:
                from app.core.celery_config import celery_app
                # Schedule deletion task to run after 10 minutes (600 seconds)
                celery_app.send_task(
                    "tasks.delete_rejected_candidate",
                    args=[str(candidate_id)],
                    countdown=600  # 10 minutes
                )
                scheduled_deletion = True
            except Exception as task_error:
                import traceback
                traceback.print_exc()
                # Don't fail the status update if task scheduling fails
                pass

        return {
            "message": f"Candidate status updated to {new_status.value}",
            "candidate_id": str(candidate_id),
            "status": new_status.value,
            "scheduled_deletion": scheduled_deletion,
            "deletion_in_minutes": 10 if scheduled_deletion else None
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
        # Validate job_id is not empty
        if not request.job_id or request.job_id.strip() == '':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Please select a valid job role"
            )

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
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"Schedule interview request for candidate {candidate_id}")
        logger.info(f"Request data: scheduled_time={request.scheduled_time}, round={request.round}, timezone={request.timezone}")

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

        # Require job role for AI interview to work properly
        if not candidate.job_template_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Please assign a job role to this candidate before scheduling an interview. The AI interviewer requires a job role to ask relevant questions."
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

        # Flag to track if we're rescheduling
        is_reschedule = existing_interview is not None
        
        if existing_interview:
            old_time_str = existing_interview.scheduled_time.isoformat() if existing_interview.scheduled_time else "unknown time"
            logger.info(f"Rescheduling existing interview {existing_interview.id} from {old_time_str} for candidate {candidate_id}")
        else:
            logger.info(f"No existing scheduled interview found for candidate {candidate_id}, creating new one")

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

        # Validate round - convert to uppercase to support lowercase input from frontend
        round_value = request.round.upper() if request.round else "SCREENING"
        try:
            interview_round = InterviewRound(round_value)
        except ValueError:
            valid_rounds = [r.value for r in InterviewRound]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid round. Must be one of: {valid_rounds}"
            )

        # Generate AI interview token (new one for security)
        token = secrets.token_urlsafe(32)

        if is_reschedule and existing_interview:
            # Update existing interview instead of creating new one
            existing_interview.scheduled_time = scheduled_time
            existing_interview.timezone = request.timezone
            existing_interview.round = interview_round
            existing_interview.notes = request.notes
            existing_interview.ai_interview_token = token  # Generate new token for security
            existing_interview.interviewer_id = current_user.id
            
            interview = existing_interview
            message = "Interview rescheduled successfully"
            logger.info(f"Rescheduled interview {interview.id} to {scheduled_time}")
        else:
            # Create new interview with AI token
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
            message = "Interview scheduled successfully"
            logger.info(f"Created new interview for candidate {candidate_id}")
        
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
            "message": message,
            "interview": {
                "id": str(interview.id),
                "candidate_id": str(candidate_id),
                "round": interview_round.value,
                "scheduled_time": scheduled_time.isoformat(),
                "status": "scheduled",
                "ai_interview_token": token,
                "interview_url": f"http://localhost:3000/interview/{token}",
                "is_reschedule": is_reschedule
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

        # Helper to get verdict from interview or report
        def get_interview_verdict(interview, reports_dict):
            # First check AIReport
            report_data = reports_dict.get(interview.id, {})
            if report_data.get("verdict"):
                return report_data
            
            # Fall back to Interview table fields (set by ai-complete endpoint)
            verdict = None
            score = None
            summary = None
            
            if interview.ai_recommendation:
                # Map ai_recommendation to PASS/REVIEW/FAIL
                if interview.ai_recommendation in ["HIRE", "PASS"]:
                    verdict = "PASS"
                elif interview.ai_recommendation == "REJECT":
                    verdict = "FAIL"
                else:
                    verdict = "REVIEW"
            
            # Get score from answer_score or calculate from ai_verdict JSON
            if interview.answer_score:
                score = interview.answer_score
            elif interview.ai_verdict:
                import json
                try:
                    ai_data = json.loads(interview.ai_verdict)
                    score = ai_data.get("overall_score") or ai_data.get("answer_score")
                    summary = ai_data.get("summary")
                except:
                    pass
            
            if verdict:
                return {
                    "verdict": verdict,
                    "score": score,
                    "summary": summary,
                }
            
            return {}

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
                # Include verdict data for completed interviews - check both AIReport and Interview table
                "verdict": get_interview_verdict(interview, reports_dict).get("verdict"),
                "score": get_interview_verdict(interview, reports_dict).get("score"),
                "verdict_summary": get_interview_verdict(interview, reports_dict).get("summary"),
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
        
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        interview_page_url = f"{frontend_url}/interview/{token}"
        
        return {
            "success": True,
            "token": token,
            "interview_url": interview_page_url,
            "ai_service_url": interview_page_url,  # Frontend reads this key
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


# ==============================================================================
# Round 2+ Human-Conducted Interview Scheduling
# ==============================================================================


class ScheduleHumanRoundRequest(BaseModel):
    """Request to schedule a human-conducted interview round."""
    candidate_id: str
    round_type: str = "TECHNICAL"  # TECHNICAL, BEHAVIORAL, FINAL, HR
    scheduled_at: str  # ISO format datetime
    timezone: str = "UTC"
    duration_minutes: int = 60
    notes: Optional[str] = None


@router.get("/ready-for-round-2")
async def get_candidates_ready_for_round_2(
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Get candidates who have completed AI interviews with PASS verdict
    and are ready for Round 2 (human-conducted interview).
    
    Returns candidates assigned to the current employee who:
    - Have completed at least one AI interview
    - Received PASS or REVIEW verdict
    - Haven't been scheduled for a human-conducted round yet
    """
    try:
        from app.models.ai_report import AIReport
        from app.models.interview_round import InterviewRound, RoundStatus, InterviewMode
        
        # Get all candidates assigned to this employee
        # Include both new statuses and legacy statuses for backwards compatibility
        candidates_query = select(Candidate).filter(
            and_(
                Candidate.company_id == current_user.company_id,
                Candidate.assigned_to == current_user.id,
                Candidate.status.in_([
                    # New multi-round statuses
                    CandidateStatus.AI_PASSED,
                    CandidateStatus.ELIGIBLE_ROUND_2,
                    # Legacy statuses for backwards compatibility
                    CandidateStatus.INTERVIEW_COMPLETED,
                    CandidateStatus.PASSED,
                    CandidateStatus.REVIEW
                ])
            )
        )
        candidates_result = await db.execute(candidates_query)
        candidates = candidates_result.scalars().all()
        
        ready_candidates = []
        
        for candidate in candidates:
            # Get completed interviews for this candidate
            interviews_query = select(Interview).filter(
                and_(
                    Interview.candidate_id == candidate.id,
                    Interview.status == InterviewStatus.COMPLETED
                )
            ).order_by(Interview.scheduled_time.desc())
            interviews_result = await db.execute(interviews_query)
            interviews = interviews_result.scalars().all()
            
            if not interviews:
                continue
            
            # Get AI reports for these interviews
            interview_ids = [i.id for i in interviews]
            reports_query = select(AIReport).filter(
                AIReport.interview_id.in_(interview_ids)
            )
            reports_result = await db.execute(reports_query)
            reports = reports_result.scalars().all()
            
            # Check if any interview passed
            passed_interviews = []
            for interview in interviews:
                report = next((r for r in reports if r.interview_id == interview.id), None)
                if report:
                    verdict = None
                    if report.provider_response:
                        verdict = report.provider_response.get("verdict")
                    if not verdict and report.score is not None:
                        if report.score >= 70:
                            verdict = "PASS"
                        elif report.score >= 50:
                            verdict = "REVIEW"
                    
                    if verdict in ["PASS", "REVIEW"]:
                        passed_interviews.append({
                            "interview_id": str(interview.id),
                            "scheduled_time": interview.scheduled_time.isoformat() if interview.scheduled_time else None,
                            "score": report.score,
                            "verdict": verdict,
                            "summary": report.summary,
                        })
            
            if not passed_interviews:
                continue
            
            # Check if human-conducted round already scheduled
            human_round_query = select(InterviewRound).filter(
                and_(
                    InterviewRound.candidate_id == candidate.id,
                    InterviewRound.interview_mode == InterviewMode.HUMAN_AI_ASSISTED,
                    InterviewRound.status.in_([RoundStatus.SCHEDULED, RoundStatus.IN_PROGRESS])
                )
            )
            human_round_result = await db.execute(human_round_query)
            existing_human_round = human_round_result.scalars().first()
            
            ready_candidates.append({
                "id": str(candidate.id),
                "email": candidate.email,
                "first_name": candidate.first_name,
                "last_name": candidate.last_name,
                "full_name": f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or candidate.email,
                "phone": candidate.phone,
                "position": candidate.position,
                "domain": candidate.domain,
                "status": candidate.status.value if candidate.status else None,
                "ai_interviews": passed_interviews,
                "best_score": max([i["score"] for i in passed_interviews if i["score"]]) if passed_interviews else None,
                "human_round_scheduled": existing_human_round is not None,
                "human_round_id": str(existing_human_round.id) if existing_human_round else None,
                "human_round_time": existing_human_round.scheduled_at.isoformat() if existing_human_round and existing_human_round.scheduled_at else None,
            })
        
        return {
            "candidates": ready_candidates,
            "total": len(ready_candidates),
            "message": f"Found {len(ready_candidates)} candidates ready for Round 2"
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching candidates ready for Round 2: {str(e)}"
        )


@router.get("/pending-review")
async def get_candidates_pending_review(
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Get candidates who need manual review after AI interview.
    
    These are candidates where:
    - AI gave a REVIEW/NEUTRAL verdict (unsure)
    - OR AI interview failed but needs employee verification
    
    Returns candidates with their AI interview results for employee to review and decide.
    """
    try:
        from app.models.ai_report import AIReport
        
        # Get candidates with ai_interview_review status assigned to this employee
        candidates_query = select(Candidate).filter(
            and_(
                Candidate.company_id == current_user.company_id,
                Candidate.assigned_to == current_user.id,
                Candidate.status.in_([
                    CandidateStatus.AI_REVIEW,  # AI unsure, needs review
                    CandidateStatus.AI_REJECTED,  # AI rejected, can override
                ])
            )
        )
        candidates_result = await db.execute(candidates_query)
        candidates = candidates_result.scalars().all()
        
        review_candidates = []
        
        for candidate in candidates:
            # Get the most recent completed interview for this candidate
            interview_query = select(Interview).filter(
                and_(
                    Interview.candidate_id == candidate.id,
                    Interview.status == InterviewStatus.COMPLETED
                )
            ).order_by(Interview.scheduled_time.desc())
            interview_result = await db.execute(interview_query)
            interview = interview_result.scalars().first()
            
            if not interview:
                continue
            
            # Get AI report for this interview
            report_query = select(AIReport).filter(
                AIReport.interview_id == interview.id
            )
            report_result = await db.execute(report_query)
            report = report_result.scalars().first()
            
            # Determine verdict and scores
            verdict = None
            score = None
            summary = None
            recommendation = None
            
            # Check interview table first (from ai-complete callback)
            if interview.ai_recommendation:
                recommendation = interview.ai_recommendation
            if interview.ai_verdict:
                verdict = interview.ai_verdict
            
            # Then check AIReport if available
            if report:
                score = report.score
                summary = report.summary
                if report.provider_response:
                    if not verdict:
                        verdict = report.provider_response.get("verdict")
                    recommendation = recommendation or report.provider_response.get("recommendation")
            
            # If no verdict yet, derive from score
            if not verdict and score is not None:
                if score >= 70:
                    verdict = "PASS"
                elif score >= 50:
                    verdict = "REVIEW"
                else:
                    verdict = "FAIL"
            
            review_candidates.append({
                "id": str(candidate.id),
                "email": candidate.email,
                "first_name": candidate.first_name,
                "last_name": candidate.last_name,
                "full_name": f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or candidate.email,
                "phone": candidate.phone,
                "position": candidate.position,
                "domain": candidate.domain,
                "status": candidate.status.value if candidate.status else None,
                "interview_id": str(interview.id),
                "interview_date": interview.scheduled_time.isoformat() if interview.scheduled_time else None,
                "ai_verdict": verdict,
                "ai_score": score,
                "ai_recommendation": recommendation,
                "ai_summary": summary,
                "can_override": candidate.status == CandidateStatus.AI_REJECTED,  # Employee can override AI rejection
            })
        
        return {
            "candidates": review_candidates,
            "total": len(review_candidates),
            "message": f"Found {len(review_candidates)} candidates pending review"
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching candidates pending review: {str(e)}"
        )


@router.post("/review-candidate/{candidate_id}")
async def review_candidate(
    candidate_id: str,
    decision: str = Query(..., description="APPROVE or REJECT"),
    notes: str = Query(None, description="Optional review notes"),
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Employee reviews a candidate that AI flagged for review or rejected.
    
    - APPROVE: Moves candidate to eligible_for_round_2 status
    - REJECT: Moves candidate to rejected status
    """
    try:
        # Get the candidate
        query = select(Candidate).filter(
            and_(
                Candidate.id == UUID(candidate_id),
                Candidate.company_id == current_user.company_id,
                Candidate.assigned_to == current_user.id,
            )
        )
        result = await db.execute(query)
        candidate = result.scalars().first()
        
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found or not assigned to you"
            )
        
        # Validate candidate is in reviewable status
        if candidate.status not in [CandidateStatus.AI_REVIEW, CandidateStatus.AI_REJECTED]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Candidate is not pending review. Current status: {candidate.status.value}"
            )
        
        decision = decision.upper()
        if decision == "APPROVE":
            candidate.status = CandidateStatus.ELIGIBLE_ROUND_2
            message = f"Candidate approved for Round 2 by {current_user.email}"
        elif decision == "REJECT":
            candidate.status = CandidateStatus.REJECTED
            message = f"Candidate rejected by {current_user.email}"
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Decision must be APPROVE or REJECT"
            )
        
        await db.commit()
        await db.refresh(candidate)
        
        return {
            "success": True,
            "message": message,
            "candidate_id": str(candidate.id),
            "new_status": candidate.status.value,
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error reviewing candidate: {str(e)}"
        )


@router.post("/schedule-human-round")
async def schedule_human_conducted_round(
    request: ScheduleHumanRoundRequest,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Schedule a human-conducted interview round (Round 2+) with AI assistance.
    
    This creates an InterviewRound with HUMAN_AI_ASSISTED mode, which will:
    - Generate a VideoSDK meeting room
    - Enable real-time AI insights during the interview
    - Allow the interviewer to see transcripts, fraud alerts, and recommendations
    """
    try:
        from datetime import datetime
        from zoneinfo import ZoneInfo
        from app.models.interview_round import InterviewRound, RoundStatus, RoundType, InterviewMode
        import logging
        logger = logging.getLogger(__name__)
        
        candidate_id = UUID(request.candidate_id)
        
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
        
        # Parse scheduled time
        try:
            # Handle different ISO format variations
            scheduled_time_str = request.scheduled_at
            if scheduled_time_str.endswith('Z'):
                scheduled_time_str = scheduled_time_str[:-1] + '+00:00'
            
            # Try to parse with timezone
            try:
                scheduled_dt = datetime.fromisoformat(scheduled_time_str)
            except ValueError:
                # If that fails, try parsing without timezone and apply the provided timezone
                scheduled_dt = datetime.fromisoformat(scheduled_time_str.replace('Z', ''))
                tz = ZoneInfo(request.timezone)
                scheduled_dt = scheduled_dt.replace(tzinfo=tz)
            
            # Convert to UTC for storage
            if scheduled_dt.tzinfo is None:
                tz = ZoneInfo(request.timezone)
                scheduled_dt = scheduled_dt.replace(tzinfo=tz)
            scheduled_dt_utc = scheduled_dt.astimezone(ZoneInfo('UTC'))
            
        except Exception as parse_error:
            logger.error(f"Error parsing scheduled time: {parse_error}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid scheduled time format: {request.scheduled_at}"
            )
        
        # Map round type
        round_type_map = {
            "SCREENING": RoundType.SCREENING,
            "TECHNICAL": RoundType.TECHNICAL,
            "BEHAVIORAL": RoundType.BEHAVIORAL,
            "FINAL": RoundType.FINAL,
            "HR": RoundType.HR,
            "CUSTOM": RoundType.CUSTOM,
        }
        round_type = round_type_map.get(request.round_type.upper(), RoundType.TECHNICAL)
        
        # Create the interview round
        interview_round = InterviewRound(
            company_id=current_user.company_id,
            candidate_id=candidate_id,
            interviewer_id=current_user.id,
            round_type=round_type,
            scheduled_at=scheduled_dt_utc,
            timezone=request.timezone,
            duration_minutes=request.duration_minutes,
            status=RoundStatus.SCHEDULED,
            interview_mode=InterviewMode.HUMAN_AI_ASSISTED,
            notes=request.notes,
            created_by=current_user.id,
        )
        
        db.add(interview_round)
        await db.commit()
        await db.refresh(interview_round)
        
        # Update candidate status
        candidate.status = CandidateStatus.INTERVIEW_SCHEDULED
        await db.commit()
        
        logger.info(f"Created human-AI-assisted interview round {interview_round.id} for candidate {candidate_id}")
        
        return {
            "success": True,
            "message": f"Human-conducted interview scheduled for {request.scheduled_at}",
            "round": {
                "id": str(interview_round.id),
                "candidate_id": str(candidate_id),
                "candidate_name": f"{candidate.first_name or ''} {candidate.last_name or ''}".strip(),
                "round_type": interview_round.round_type.value,
                "interview_mode": "HUMAN_AI_ASSISTED",
                "scheduled_at": interview_round.scheduled_at.isoformat(),
                "timezone": interview_round.timezone,
                "duration_minutes": interview_round.duration_minutes,
                "status": interview_round.status.value,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error scheduling human-conducted round: {str(e)}"
        )


@router.get("/my-human-rounds")
async def get_my_human_conducted_rounds(
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
    status_filter: Optional[str] = None,
):
    """
    Get all human-conducted interview rounds assigned to the current employee.
    """
    try:
        from app.models.interview_round import InterviewRound, RoundStatus, InterviewMode
        
        # Build query
        query = select(InterviewRound).filter(
            and_(
                InterviewRound.company_id == current_user.company_id,
                InterviewRound.interviewer_id == current_user.id,
                InterviewRound.interview_mode == InterviewMode.HUMAN_AI_ASSISTED
            )
        )
        
        if status_filter:
            try:
                status_enum = RoundStatus[status_filter.upper()]
                query = query.filter(InterviewRound.status == status_enum)
            except KeyError:
                pass  # Ignore invalid status filter
        
        query = query.order_by(InterviewRound.scheduled_at.desc())
        
        result = await db.execute(query)
        rounds = result.scalars().all()
        
        # Get candidate info for each round
        rounds_data = []
        for round_obj in rounds:
            # Get candidate
            candidate_query = select(Candidate).filter(Candidate.id == round_obj.candidate_id)
            candidate_result = await db.execute(candidate_query)
            candidate = candidate_result.scalars().first()
            
            rounds_data.append({
                "id": str(round_obj.id),
                "candidate_id": str(round_obj.candidate_id),
                "candidate_name": f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() if candidate else "Unknown",
                "candidate_email": candidate.email if candidate else None,
                "position": candidate.position if candidate else None,
                "round_type": round_obj.round_type.value,
                "interview_mode": "HUMAN_AI_ASSISTED",
                "scheduled_at": round_obj.scheduled_at.isoformat() if round_obj.scheduled_at else None,
                "timezone": round_obj.timezone,
                "duration_minutes": round_obj.duration_minutes,
                "status": round_obj.status.value,
                "started_at": round_obj.started_at.isoformat() if round_obj.started_at else None,
                "ended_at": round_obj.ended_at.isoformat() if round_obj.ended_at else None,
                "videosdk_meeting_id": round_obj.videosdk_meeting_id,
                "notes": round_obj.notes,
            })
        
        return {
            "rounds": rounds_data,
            "total": len(rounds_data),
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching human-conducted rounds: {str(e)}"
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

