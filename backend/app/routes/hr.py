"""
HR routes for company-specific operations.

HR capabilities:
- View company metrics (candidates, employees, interviews)
- Manage employees in the company
- Access company-specific data
"""

import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.candidate import Candidate, CandidateStatus, Interview, InterviewStatus
from app.models.user import User, UserRole

router = APIRouter(prefix="/api/v1/hr", tags=["hr"])
logger = logging.getLogger(__name__)


def require_hr(current_user: User = Depends(get_current_user)) -> User:
    """
    Dependency to require HR or SYSTEM_ADMIN role.
    """
    if current_user.role not in [UserRole.HR, UserRole.SYSTEM_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only HR users can access this resource",
        )
    return current_user


@router.get("/metrics")
async def get_hr_metrics(
    current_user: User = Depends(require_hr),
    db: AsyncSession = Depends(get_db),
):
    """
    Get company-specific metrics for HR dashboard.
    Returns: total_candidates, active_candidates, total_employees, pending_interviews
    """
    try:
        company_id = current_user.company_id

        # Count total candidates in company
        total_candidates_query = select(func.count()).select_from(Candidate).filter(
            Candidate.company_id == company_id
        )
        total_candidates_result = await db.execute(total_candidates_query)
        total_candidates = total_candidates_result.scalar() or 0

        # Count active candidates (selected, offer, or accepted)
        active_candidates_query = select(func.count()).select_from(Candidate).filter(
            and_(
                Candidate.company_id == company_id,
                Candidate.status.in_([
                    CandidateStatus.APPLIED,
                    CandidateStatus.SCREENING,
                    CandidateStatus.ASSESSMENT,
                    CandidateStatus.INTERVIEW,
                    CandidateStatus.SELECTED,
                    CandidateStatus.OFFER,
                    CandidateStatus.ACCEPTED
                ])
            )
        )
        active_candidates_result = await db.execute(active_candidates_query)
        active_candidates = active_candidates_result.scalar() or 0

        # Count total employees in company (EMPLOYEE role)
        total_employees_query = select(func.count()).select_from(User).filter(
            and_(
                User.company_id == company_id,
                User.role == UserRole.EMPLOYEE,
                User.is_active == True
            )
        )
        total_employees_result = await db.execute(total_employees_query)
        total_employees = total_employees_result.scalar() or 0

        # Count pending interviews (SCHEDULED status)
        pending_interviews_query = select(func.count()).select_from(Interview).filter(
            and_(
                Interview.company_id == company_id,
                Interview.status == InterviewStatus.SCHEDULED
            )
        )
        pending_interviews_result = await db.execute(pending_interviews_query)
        pending_interviews = pending_interviews_result.scalar() or 0

        return {
            "total_candidates": total_candidates,
            "active_candidates": active_candidates,
            "total_employees": total_employees,
            "pending_interviews": pending_interviews,
        }
    except Exception as e:
        logger.exception("Unexpected error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching metrics"
        )


@router.get("/candidates")
async def get_hr_candidates(
    current_user: User = Depends(require_hr),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    assigned_to: Optional[str] = Query(None, description="Filter by assigned employee ID"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get list of candidates in the company (HR view).
    Returns: All candidates with their assignment status and interview information.
    """
    try:
        company_id = current_user.company_id
        
        # Base query for candidates in company
        query = select(Candidate).filter(Candidate.company_id == company_id)
        
        # Apply filters
        if status_filter:
            try:
                status_enum = CandidateStatus(status_filter.lower())
                query = query.filter(Candidate.status == status_enum)
            except ValueError:
                pass  # Invalid status, ignore filter
        
        if assigned_to:
            from uuid import UUID as PyUUID
            try:
                employee_uuid = PyUUID(assigned_to)
                query = query.filter(Candidate.assigned_to == employee_uuid)
            except ValueError:
                pass  # Invalid UUID, ignore filter
        
        # Order by created_at descending and apply pagination
        query = query.order_by(Candidate.created_at.desc()).offset(skip).limit(limit)
        
        result = await db.execute(query)
        candidates = result.scalars().all()
        
        # Get total count
        count_query = select(func.count()).select_from(Candidate).filter(
            Candidate.company_id == company_id
        )
        if status_filter:
            try:
                status_enum = CandidateStatus(status_filter.lower())
                count_query = count_query.filter(Candidate.status == status_enum)
            except ValueError:
                pass
        if assigned_to:
            try:
                employee_uuid = PyUUID(assigned_to)
                count_query = count_query.filter(Candidate.assigned_to == employee_uuid)
            except ValueError:
                pass
        
        count_result = await db.execute(count_query)
        total = count_result.scalar() or 0
        
        # Build response
        candidates_data = []
        for cand in candidates:
            # Get assigned employee name if assigned
            assigned_employee_name = None
            if cand.assigned_to:
                emp_result = await db.execute(
                    select(User).filter(User.id == cand.assigned_to)
                )
                emp = emp_result.scalars().first()
                if emp:
                    assigned_employee_name = emp.name
            
            candidates_data.append({
                "id": str(cand.id),
                "name": cand.name,
                "email": cand.email,
                "phone": cand.phone,
                "status": cand.status.value if cand.status else None,
                "assigned_to": str(cand.assigned_to) if cand.assigned_to else None,
                "assigned_employee_name": assigned_employee_name,
                "job_template_id": str(cand.job_template_id) if cand.job_template_id else None,
                "created_at": cand.created_at.isoformat() if cand.created_at else None,
                "updated_at": cand.updated_at.isoformat() if cand.updated_at else None,
            })
        
        return {
            "candidates": candidates_data,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching candidates"
        )


@router.get("/employees")
async def get_employees(
    current_user: User = Depends(require_hr),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """
    Get list of employees in the company.
    Returns: employee details including role, department, status and assigned candidate count
    """
    try:
        company_id = current_user.company_id

        query = select(User).filter(
            and_(
                User.company_id == company_id,
                User.role == UserRole.EMPLOYEE,
                User.is_active == True
            )
        ).offset(skip).limit(limit)

        result = await db.execute(query)
        employees = result.scalars().all()

        # Get assigned candidate count for each employee
        employee_data = []
        for emp in employees:
            count_query = select(func.count()).select_from(Candidate).filter(
                and_(
                    Candidate.company_id == company_id,
                    Candidate.assigned_to == emp.id
                )
            )
            count_result = await db.execute(count_query)
            assigned_count = count_result.scalar() or 0
            
            employee_data.append({
                "id": str(emp.id),
                "email": emp.email,
                "name": emp.name,
                "role": emp.role.value,
                "company_id": str(emp.company_id),
                "department": emp.department or "Not specified",
                "is_active": emp.is_active,
                "created_at": emp.created_at.isoformat() if emp.created_at else None,
                "assigned_count": assigned_count,
                "can_accept_more": assigned_count < 10,
                "available_slots": 10 - assigned_count
            })

        return employee_data
    except Exception as e:
        logger.exception("Unexpected error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching employees"
        )


@router.get("/candidate-profile/{candidate_id}")
async def get_candidate_profile_hr(
    candidate_id: UUID,
    current_user: User = Depends(require_hr),
    db: AsyncSession = Depends(get_db),
):
    """
    Get detailed candidate profile for HR view.
    Includes interview transcript, Q&A breakdown, scores, verdict, and resume.
    """
    from app.models.ai_report import AIReport

    try:
        # Get candidate (must belong to same company as HR)
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
        ).order_by(Interview.scheduled_time.desc()).limit(50)
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

        # Build detailed interview data
        interview_details = []
        for interview in interviews:
            report = reports_by_interview.get(interview.id)
            provider_response = report.provider_response if report else {}
            transcript = provider_response.get("transcript", [])

            # Extract Q&A pairs
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
        logger.exception("Unexpected error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching candidate profile"
        )


@router.post("/candidates/{candidate_id}/assign")
async def assign_candidate_to_employee(
    candidate_id: UUID,
    employee_id: UUID = Query(..., description="Employee ID to assign candidate to"),
    current_user: User = Depends(require_hr),
    db: AsyncSession = Depends(get_db),
):
    """
    Assign a candidate to an employee (HR only).
    Max 10 candidates per employee at a time.
    """
    try:
        company_id = current_user.company_id

        # Verify candidate exists and belongs to company
        candidate_query = select(Candidate).filter(
            and_(
                Candidate.id == candidate_id,
                Candidate.company_id == company_id
            )
        )
        result = await db.execute(candidate_query)
        candidate = result.scalars().first()
        
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found"
            )

        # Verify employee exists and belongs to company
        employee_query = select(User).filter(
            and_(
                User.id == employee_id,
                User.company_id == company_id,
                User.role == UserRole.EMPLOYEE,
                User.is_active == True
            )
        )
        result = await db.execute(employee_query)
        employee = result.scalars().first()
        
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found or not eligible for assignments"
            )

        # Check current assignment count for employee (max 10)
        count_query = select(func.count()).select_from(Candidate).filter(
            and_(
                Candidate.company_id == company_id,
                Candidate.assigned_to == employee_id
            )
        )
        result = await db.execute(count_query)
        current_count = result.scalar() or 0
        
        if current_count >= 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Employee already has maximum 10 candidates assigned"
            )

        # Assign candidate and update status to 'assigned' (new pipeline status)
        candidate.assigned_to = employee_id
        # Update status to reflect assignment in pipeline
        # Use 'assigned' for new pipeline stages or SCREENING for legacy compatibility
        from sqlalchemy import text
        await db.execute(
            text("UPDATE candidates SET status = :status, assigned_to = :emp_id, updated_at = now() WHERE id = :id"),
            {"status": "assigned", "emp_id": str(employee_id), "id": str(candidate_id)}
        )
        await db.commit()

        return {
            "message": f"Candidate assigned to {employee.name} successfully",
            "candidate_id": str(candidate_id),
            "employee_id": str(employee_id),
            "employee_name": employee.name
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error assigning candidate"
        )


@router.post("/candidates/{candidate_id}/revoke")
async def revoke_candidate_assignment(
    candidate_id: UUID,
    current_user: User = Depends(require_hr),
    db: AsyncSession = Depends(get_db),
):
    """
    Revoke candidate assignment from employee (HR only).
    """
    try:
        company_id = current_user.company_id

        # Verify candidate exists and belongs to company
        candidate_query = select(Candidate).filter(
            and_(
                Candidate.id == candidate_id,
                Candidate.company_id == company_id
            )
        )
        result = await db.execute(candidate_query)
        candidate = result.scalars().first()
        
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found"
            )

        if not candidate.assigned_to:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Candidate is not assigned to any employee"
            )

        # Revoke assignment and revert status to 'uploaded' (new pipeline status)
        candidate.assigned_to = None
        # Revert status if it was at assigned/SCREENING stage
        from sqlalchemy import text
        if candidate.status in [CandidateStatus.SCREENING, CandidateStatus.ASSIGNED]:
            await db.execute(
                text("UPDATE candidates SET status = :status, assigned_to = NULL, updated_at = now() WHERE id = :id"),
                {"status": "uploaded", "id": str(candidate_id)}
            )
        else:
            await db.execute(
                text("UPDATE candidates SET assigned_to = NULL, updated_at = now() WHERE id = :id"),
                {"id": str(candidate_id)}
            )
        await db.commit()

        return {
            "message": "Candidate assignment revoked successfully",
            "candidate_id": str(candidate_id)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error revoking assignment"
        )


# Alias for revoke endpoint to support DELETE method from frontend
@router.delete("/candidates/{candidate_id}/assign")
async def unassign_candidate(
    candidate_id: UUID,
    current_user: User = Depends(require_hr),
    db: AsyncSession = Depends(get_db),
):
    """
    Unassign candidate from employee (HR only).
    This is an alias for the revoke endpoint to support DELETE method.
    """
    return await revoke_candidate_assignment(candidate_id, current_user, db)


class GenerateAITokenRequest(BaseModel):
    """Request to generate AI interview token for a candidate."""
    job_id: Optional[UUID] = None


@router.post("/interviews/generate-ai-token/{candidate_id}")
async def generate_ai_interview_token(
    candidate_id: UUID,
    request: Optional[GenerateAITokenRequest] = None,
    current_user: User = Depends(require_hr),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate an AI interview token for a candidate.
    This creates an interview record with a token that the candidate can use to start their AI interview.
    """
    import secrets
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo
    
    try:
        company_id = current_user.company_id
        
        # Verify candidate exists and belongs to company
        candidate_query = select(Candidate).filter(
            and_(
                Candidate.id == candidate_id,
                Candidate.company_id == company_id
            )
        )
        result = await db.execute(candidate_query)
        candidate = result.scalars().first()
        
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found"
            )
        
        # If job_id is provided, assign it to candidate
        if request and request.job_id:
            candidate.job_template_id = request.job_id
        
        # Check for existing scheduled interview
        existing_query = select(Interview).filter(
            and_(
                Interview.candidate_id == candidate_id,
                Interview.status == InterviewStatus.SCHEDULED
            )
        )
        existing_result = await db.execute(existing_query)
        existing_interview = existing_result.scalars().first()
        
        # Generate secure token
        token = secrets.token_urlsafe(32)
        
        # Default scheduled time is now (immediate availability)
        scheduled_time = datetime.now(ZoneInfo('UTC'))
        
        if existing_interview:
            # Update existing interview with new token
            existing_interview.ai_interview_token = token
            existing_interview.scheduled_time = scheduled_time
            interview = existing_interview
        else:
            # Create new interview
            from app.models.candidate import InterviewRound
            interview = Interview(
                company_id=company_id,
                candidate_id=candidate_id,
                interviewer_id=current_user.id,
                created_by=current_user.id,
                round=InterviewRound.SCREENING,
                scheduled_time=scheduled_time,
                timezone="UTC",
                status=InterviewStatus.SCHEDULED,
                ai_interview_token=token,
            )
            db.add(interview)
        
        # Update candidate status to interview
        from sqlalchemy import text
        await db.execute(
            text("UPDATE candidates SET status = :status, updated_at = now() WHERE id = :id"),
            {"status": "interview_scheduled", "id": str(candidate_id)}
        )
        
        await db.commit()
        await db.refresh(interview)
        
        return {
            "message": "AI interview created successfully",
            "interview": {
                "id": str(interview.id),
                "candidate_id": str(candidate_id),
                "ai_interview_token": token,
                "interview_url": f"{settings.frontend_url}/interview/{token}",
                "scheduled_time": scheduled_time.isoformat(),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error creating AI interview"
        )


@router.post("/candidates/assign-bulk")
async def assign_candidates_bulk(
    candidate_ids: List[UUID] = Query(..., description="List of candidate IDs"),
    employee_id: UUID = Query(..., description="Employee ID to assign candidates to"),
    current_user: User = Depends(require_hr),
    db: AsyncSession = Depends(get_db),
):
    """
    Assign multiple candidates to an employee (HR only).
    Max 10 candidates per employee at a time.
    """
    try:
        company_id = current_user.company_id

        if len(candidate_ids) > 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot assign more than 10 candidates at once"
            )

        # Verify employee exists and belongs to company
        employee_query = select(User).filter(
            and_(
                User.id == employee_id,
                User.company_id == company_id,
                User.role == UserRole.EMPLOYEE,
                User.is_active == True
            )
        )
        result = await db.execute(employee_query)
        employee = result.scalars().first()
        
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found or not eligible for assignments"
            )

        # Check current assignment count for employee
        count_query = select(func.count()).select_from(Candidate).filter(
            and_(
                Candidate.company_id == company_id,
                Candidate.assigned_to == employee_id
            )
        )
        result = await db.execute(count_query)
        current_count = result.scalar() or 0
        
        if current_count + len(candidate_ids) > 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Employee has {current_count} candidates. Can only assign {10 - current_count} more."
            )

        # Verify all candidates exist and belong to company
        candidates_query = select(Candidate).filter(
            and_(
                Candidate.id.in_(candidate_ids),
                Candidate.company_id == company_id
            )
        )
        result = await db.execute(candidates_query)
        candidates = result.scalars().all()
        
        if len(candidates) != len(candidate_ids):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="One or more candidates not found"
            )

        # Assign all candidates and update status using raw SQL for correct enum handling
        from sqlalchemy import text
        for candidate in candidates:
            await db.execute(
                text("UPDATE candidates SET status = :status, assigned_to = :emp_id, updated_at = now() WHERE id = :id"),
                {"status": "assigned", "emp_id": str(employee_id), "id": str(candidate.id)}
            )
        
        await db.commit()

        return {
            "message": f"{len(candidates)} candidates assigned to {employee.name} successfully",
            "candidate_ids": [str(c) for c in candidate_ids],
            "employee_id": str(employee_id),
            "employee_name": employee.name
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error assigning candidates"
        )


@router.get("/employees/{employee_id}/candidates")
async def get_employee_assigned_candidates(
    employee_id: UUID,
    current_user: User = Depends(require_hr),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all candidates assigned to a specific employee (HR only).
    """
    try:
        company_id = current_user.company_id

        # Verify employee exists
        employee_query = select(User).filter(
            and_(
                User.id == employee_id,
                User.company_id == company_id
            )
        )
        result = await db.execute(employee_query)
        employee = result.scalars().first()
        
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )

        # Get assigned candidates
        candidates_query = select(Candidate).filter(
            and_(
                Candidate.company_id == company_id,
                Candidate.assigned_to == employee_id
            )
        ).limit(500)
        result = await db.execute(candidates_query)
        candidates = result.scalars().all()

        return {
            "employee": {
                "id": str(employee.id),
                "name": employee.name,
                "email": employee.email
            },
            "candidates": [
                {
                    "id": str(c.id),
                    "email": c.email,
                    "first_name": c.first_name,
                    "last_name": c.last_name,
                    "position": c.position,
                    "status": c.status.value if c.status else None,
                    "domain": c.domain
                }
                for c in candidates
            ],
            "count": len(candidates)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching assigned candidates"
        )


@router.get("/interviews")
async def get_hr_interviews(
    current_user: User = Depends(require_hr),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all interviews for the HR user's company with candidate and interviewer details.
    """
    from sqlalchemy.orm import selectinload
    
    company_id = current_user.company_id
    
    # Query interviews with eager loading to avoid detached instance issues
    query = (
        select(Interview)
        .filter(Interview.company_id == company_id)
        .order_by(Interview.scheduled_time.desc())
        .offset(skip)
        .limit(limit)
    )
    
    result = await db.execute(query)
    interviews = result.scalars().all()
    
    # Build response with candidate and interviewer info
    response_list = []
    for interview in interviews:
        # Get candidate info
        candidate_query = select(Candidate).filter(Candidate.id == interview.candidate_id)
        candidate_result = await db.execute(candidate_query)
        candidate = candidate_result.scalar_one_or_none()
        
        # Get interviewer info
        interviewer_name = None
        if interview.interviewer_id:
            interviewer_query = select(User).filter(User.id == interview.interviewer_id)
            interviewer_result = await db.execute(interviewer_query)
            interviewer = interviewer_result.scalar_one_or_none()
            if interviewer:
                interviewer_name = interviewer.name
        
        response_list.append({
            "id": str(interview.id),
            "candidate_id": str(interview.candidate_id),
            "candidate_name": f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() if candidate else "Unknown",
            "candidate_email": candidate.email if candidate else "",
            "interviewer_id": str(interview.interviewer_id) if interview.interviewer_id else None,
            "interviewer_name": interviewer_name,
            "scheduled_time": interview.scheduled_time.isoformat() if interview.scheduled_time else None,
            "status": interview.status.value if interview.status else "SCHEDULED",
            "meeting_link": interview.meeting_link,
            "notes": interview.notes,
            "created_at": interview.created_at.isoformat() if interview.created_at else None,
        })
    
    return response_list


@router.post("/interviews/{interview_id}/transcript")
async def save_interview_transcript(
    interview_id: UUID,
    data: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Save interview transcript and mark interview as completed.
    This endpoint is called by the interview room when the interview ends.
    No auth required as the interview token serves as authentication.
    Triggers AI analysis to generate scores and verdict.
    """
    try:
        import json
        from sqlalchemy import text
        from app.services.ai_service import generate_interview_verdict
        
        # Find interview by ID
        interview_query = select(Interview).filter(Interview.id == interview_id)
        result = await db.execute(interview_query)
        interview = result.scalars().first()
        
        if not interview:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found"
            )
        
        # Get candidate info for position
        candidate = None
        position = ""
        if interview.candidate_id:
            candidate_query = select(Candidate).filter(Candidate.id == interview.candidate_id)
            candidate_result = await db.execute(candidate_query)
            candidate = candidate_result.scalars().first()
            if candidate:
                position = candidate.position or ""
        
        # Extract data from request
        transcript_data = data.get("transcript", [])
        duration_seconds = data.get("duration_seconds", 0)
        resume_text = data.get("resume_text", "")
        
        # Sanitize resume_text: strip null bytes and detect raw PDF binary
        if resume_text:
            resume_text = resume_text.replace("\x00", "")
            if resume_text.startswith("%PDF") or "\ufffd" in resume_text[:100]:
                logger.info(f"[Transcript] Resume text appears to be raw PDF binary, discarding")
                resume_text = ""
        
        # Update interview with transcript
        interview.transcript = json.dumps(transcript_data) if transcript_data else None
        interview.resume_text = resume_text if resume_text else interview.resume_text
        
        # Mark interview as completed using raw SQL to handle enum properly
        await db.execute(
            text("UPDATE interviews SET status = 'COMPLETED' WHERE id = :interview_id"),
            {"interview_id": str(interview_id)}
        )
        
        # Also update candidate status to interview_completed
        if interview.candidate_id:
            await db.execute(
                text("UPDATE candidates SET status = 'interview_completed' WHERE id = :candidate_id"),
                {"candidate_id": str(interview.candidate_id)}
            )
        
        await db.commit()
        
        # Trigger AI analysis asynchronously (non-blocking)
        ai_verdict = None
        if transcript_data and len(transcript_data) > 2:  # At least welcome + 1 Q&A
            try:
                ai_verdict = await generate_interview_verdict(
                    transcript=transcript_data,
                    resume_text=resume_text or (candidate.resume_text if candidate else ""),
                    ats_score=interview.ats_score,
                    position=position
                )
                
                # Update interview with AI scores
                if ai_verdict:
                    await db.execute(
                        text("""
                            UPDATE interviews SET 
                                behavior_score = :behavior_score,
                                confidence_score = :confidence_score,
                                answer_score = :answer_score,
                                ai_verdict = :ai_verdict,
                                ai_recommendation = :ai_recommendation
                            WHERE id = :interview_id
                        """),
                        {
                            "interview_id": str(interview_id),
                            "behavior_score": ai_verdict.get("behavior_score"),
                            "confidence_score": ai_verdict.get("confidence_score"),
                            "answer_score": ai_verdict.get("answer_score"),
                            "ai_verdict": json.dumps(ai_verdict),
                            "ai_recommendation": ai_verdict.get("recommendation"),
                        }
                    )
                    
                    # Update candidate status based on AI recommendation
                    if interview.candidate_id:
                        recommendation = ai_verdict.get("recommendation", "").upper()
                        if recommendation in ("PASS", "PASSED", "ADVANCE", "HIRE"):
                            candidate_status = "ai_passed"
                        elif recommendation in ("FAIL", "FAILED", "REJECT", "REJECTED"):
                            candidate_status = "ai_rejected"
                        else:
                            # NEUTRAL or unclear verdicts go to review
                            candidate_status = "ai_review"
                        
                        await db.execute(
                            text("UPDATE candidates SET status = :status WHERE id = :candidate_id"),
                            {"status": candidate_status, "candidate_id": str(interview.candidate_id)}
                        )
                        logger.info(f"[Transcript] Updated candidate {interview.candidate_id} status to {candidate_status} (recommendation: {recommendation})")
                    
                    await db.commit()
            except Exception as ai_error:
                # Don't fail the whole request if AI analysis fails
                logger.warning(f"AI analysis error (non-critical): {ai_error}")
        
        return {
            "success": True,
            "message": "Interview transcript saved and marked as completed",
            "interview_id": str(interview_id),
            "duration_seconds": duration_seconds,
            "ai_analysis": ai_verdict is not None,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error saving transcript"
        )


@router.post("/interviews/ai-complete/{token}")
async def ai_complete_interview(
    token: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Callback endpoint from AI service when interview is completed.
    This endpoint is called by the AI service (Aigenthix_AI_Interviewer) 
    after the candidate finishes their AI interview.
    
    This will:
    1. Find the interview by ai_interview_token
    2. Mark it as COMPLETED
    3. Update candidate status to interview_completed
    4. Generate AI verdict using the transcript
    5. Store all scores (behavior, confidence, answer, overall)
    
    No auth required as this is a server-to-server callback using the token.
    """
    try:
        import json
        from sqlalchemy import text
        from app.services.ai_service import generate_interview_verdict
        
        logger.info(f"[AI-Complete] Received callback for token: {token}")
        logger.info(f"[AI-Complete] Data: {json.dumps(data, default=str)[:500]}...")
        
        # Find interview by ai_interview_token
        interview_query = select(Interview).filter(Interview.ai_interview_token == token)
        result = await db.execute(interview_query)
        interview = result.scalars().first()
        
        if not interview:
            logger.info(f"[AI-Complete] Interview not found for token: {token}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found for this token"
            )
        
        logger.info(f"[AI-Complete] Found interview: {interview.id}, current status: {interview.status}")
        
        # Check if already completed
        if interview.status == InterviewStatus.COMPLETED:
            logger.info(f"[AI-Complete] Interview already completed, returning success")
            return {
                "success": True,
                "message": "Interview already completed",
                "interview_id": str(interview.id),
            }
        
        # Get candidate info for position
        candidate = None
        position = ""
        if interview.candidate_id:
            candidate_query = select(Candidate).filter(Candidate.id == interview.candidate_id)
            candidate_result = await db.execute(candidate_query)
            candidate = candidate_result.scalars().first()
            if candidate:
                position = candidate.position or ""
        
        # Extract data from request
        transcript_data = data.get("transcript", [])
        duration_seconds = data.get("duration_seconds", 0)
        resume_text = data.get("resume_text", "")
        pre_calculated_scores = data.get("pre_calculated_scores", {})
        
        # Sanitize resume_text: strip null bytes and detect raw PDF binary
        if resume_text:
            # Remove null bytes that PostgreSQL VARCHAR can't store
            resume_text = resume_text.replace("\x00", "")
            # If it's raw PDF binary (not extracted text), discard it
            if resume_text.startswith("%PDF") or "\ufffd" in resume_text[:100]:
                logger.info(f"[AI-Complete] Resume text appears to be raw PDF binary, discarding")
                resume_text = ""
        
        # Update interview with transcript
        interview.transcript = json.dumps(transcript_data) if transcript_data else None
        interview.resume_text = resume_text if resume_text else interview.resume_text
        
        # Mark interview as completed
        await db.execute(
            text("UPDATE interviews SET status = 'COMPLETED' WHERE id = :interview_id"),
            {"interview_id": str(interview.id)}
        )
        
        # NOTE: Don't update candidate status here - we'll set the final status
        # (ai_passed/ai_rejected/ai_review) after generating the AI verdict.
        # This prevents candidates from getting stuck at 'interview_completed'.
        
        await db.commit()
        logger.info(f"[AI-Complete] Marked interview as COMPLETED")
        
        # Generate AI verdict
        ai_verdict = None
        
        # First try to use pre-calculated scores from AI service
        if pre_calculated_scores:
            logger.info(f"[AI-Complete] Using pre-calculated scores from AI service")
            ai_verdict = {
                "recommendation": pre_calculated_scores.get("verdict", "NEUTRAL"),
                "behavior_score": pre_calculated_scores.get("behavioral_score", 50),
                "confidence_score": pre_calculated_scores.get("communication_score", 50),  # Map communication to confidence
                "answer_score": pre_calculated_scores.get("technical_score", 50),  # Map technical to answer
                "overall_score": pre_calculated_scores.get("overall_score", 50),
                "summary": pre_calculated_scores.get("summary", "Interview completed via AI service."),
                "strengths": pre_calculated_scores.get("strengths", []),
                "weaknesses": pre_calculated_scores.get("weaknesses", []),
            }
        
        # If no pre-calculated scores and we have sufficient transcript, generate verdict using AI
        if not ai_verdict and transcript_data and len(transcript_data) > 2:
            try:
                logger.info(f"[AI-Complete] Generating AI verdict from transcript ({len(transcript_data)} messages)...")
                ai_verdict = await generate_interview_verdict(
                    transcript=transcript_data,
                    resume_text=resume_text or (candidate.resume_text if candidate else ""),
                    ats_score=interview.ats_score,
                    position=position
                )
                logger.info(f"[AI-Complete] AI verdict generated: recommendation={ai_verdict.get('recommendation')}")
            except Exception as ai_error:
                logger.info(f"[AI-Complete] AI verdict generation failed (non-critical): {ai_error}")
                # FALLBACK: Generate basic result so UI never breaks
                ai_verdict = {
                    "recommendation": "NEUTRAL",
                    "behavior_score": 70,
                    "confidence_score": 70,
                    "answer_score": 70,
                    "overall_score": 70,
                    "summary": "Interview completed successfully. AI analysis unavailable - manual review recommended.",
                    "strengths": ["Completed interview"],
                    "weaknesses": [],
                    "ai_fallback": True,  # Flag indicating this is a fallback
                }
                logger.info(f"[AI-Complete] Using fallback verdict due to AI error")
        
        # FALLBACK: If transcript too short, still generate a basic verdict for stability
        if not ai_verdict and transcript_data and len(transcript_data) <= 2:
            logger.info(f"[AI-Complete] Transcript too short ({len(transcript_data)} messages) for AI analysis, using default verdict")
            ai_verdict = {
                "recommendation": "NEUTRAL",
                "behavior_score": 60,
                "confidence_score": 60,
                "answer_score": 60,
                "overall_score": 60,
                "summary": "Interview completed but transcript was too short for full AI analysis. Manual review recommended.",
                "strengths": [],
                "weaknesses": ["Insufficient conversation data for analysis"],
                "ai_fallback": True,
                "short_transcript": True,
            }
        
        # FALLBACK: If NO transcript at all, still provide a basic verdict
        if not ai_verdict and (not transcript_data or len(transcript_data) == 0):
            logger.info(f"[AI-Complete] No transcript data provided, using empty transcript fallback")
            ai_verdict = {
                "recommendation": "NEUTRAL",
                "behavior_score": 50,
                "confidence_score": 50,
                "answer_score": 50,
                "overall_score": 50,
                "summary": "Interview completed but no transcript data was received. Manual review required.",
                "strengths": [],
                "weaknesses": ["No interview transcript available"],
                "ai_fallback": True,
                "no_transcript": True,
            }
        
        # Update interview with AI scores if we have verdict
        if ai_verdict:
            recommendation = ai_verdict.get("recommendation", "NEUTRAL")
            # Map recommendation to ai_recommendation field
            if recommendation in ["PASS", "HIRE"]:
                ai_recommendation = "HIRE"
            elif recommendation in ["FAIL", "REJECT"]:
                ai_recommendation = "REJECT"
            else:
                ai_recommendation = "NEUTRAL"
                
            await db.execute(
                text("""
                    UPDATE interviews SET 
                        behavior_score = :behavior_score,
                        confidence_score = :confidence_score,
                        answer_score = :answer_score,
                        ai_verdict = :ai_verdict,
                        ai_recommendation = :ai_recommendation
                    WHERE id = :interview_id
                """),
                {
                    "interview_id": str(interview.id),
                    "behavior_score": ai_verdict.get("behavior_score", 50),
                    "confidence_score": ai_verdict.get("confidence_score", 50),
                    "answer_score": ai_verdict.get("answer_score", 50),
                    "ai_verdict": json.dumps(ai_verdict),
                    "ai_recommendation": ai_recommendation,
                }
            )
            await db.commit()
            logger.info(f"[AI-Complete] Updated interview with AI scores and verdict")
            
            # AUTO-PROMOTE CANDIDATE BASED ON VERDICT
            # This is the key logic for multi-round interview flow
            new_candidate_status = None
            if ai_recommendation == "HIRE":
                # PASS - Auto-promote to eligible for Round 2
                new_candidate_status = "ai_passed"
                logger.info(f"[AI-Complete] Candidate PASSED - promoting to ai_passed (eligible for Round 2)")
            elif ai_recommendation == "REJECT":
                # FAIL - Mark as AI rejected (employee can still override)
                new_candidate_status = "ai_rejected"
                logger.info(f"[AI-Complete] Candidate FAILED - marking as ai_rejected")
            else:
                # NEUTRAL/REVIEW - Needs employee review
                new_candidate_status = "ai_review"
                logger.info(f"[AI-Complete] Candidate needs REVIEW - marking as ai_review")
            
            if new_candidate_status and interview.candidate_id:
                await db.execute(
                    text("""
                        UPDATE candidates 
                        SET status = :status, 
                            updated_at = NOW()
                        WHERE id = :candidate_id
                    """),
                    {"status": new_candidate_status, "candidate_id": str(interview.candidate_id)}
                )
                await db.commit()
                logger.info(f"[AI-Complete] Updated candidate status to: {new_candidate_status}")
        
        # FALLBACK: If no ai_verdict was generated, still update candidate status
        # This ensures candidate doesn't get stuck at 'interview_completed'
        if not ai_verdict and interview.candidate_id:
            new_candidate_status = "ai_review"  # Default to review when no verdict
            logger.info(f"[AI-Complete] No AI verdict generated, defaulting to ai_review")
            await db.execute(
                text("""
                    UPDATE candidates 
                    SET status = :status, 
                        updated_at = NOW()
                    WHERE id = :candidate_id
                """),
                {"status": new_candidate_status, "candidate_id": str(interview.candidate_id)}
            )
            await db.commit()
            logger.info(f"[AI-Complete] Updated candidate status to: {new_candidate_status}")
        
        # Get final status for response
        final_verdict = "REVIEW"
        if ai_verdict:
            rec = ai_verdict.get("recommendation", "NEUTRAL")
            if rec in ["PASS", "HIRE"]:
                final_verdict = "PASS"
            elif rec in ["FAIL", "REJECT"]:
                final_verdict = "FAIL"
        
        return {
            "success": True,
            "message": "Interview completed and AI verdict generated",
            "interview_id": str(interview.id),
            "duration_seconds": duration_seconds,
            "ai_analysis": ai_verdict is not None,
            "recommendation": ai_verdict.get("recommendation") if ai_verdict else None,
            "verdict": final_verdict,
            "candidate_status": new_candidate_status if ai_verdict else "interview_completed",
            "auto_promoted": final_verdict == "PASS",
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error completing interview"
        )
