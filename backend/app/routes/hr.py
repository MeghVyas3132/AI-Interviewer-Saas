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
from sqlalchemy import and_, func, select, not_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.candidate import Candidate, CandidateStatus, Interview, InterviewStatus, InterviewRound
from app.models.user import User, UserRole
from app.models.interview_session import InterviewSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/hr", tags=["hr"])


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
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching metrics: {str(e)}"
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
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching employees: {str(e)}"
        )


@router.get("/candidate-profile/{candidate_id}")
async def get_candidate_detailed_profile_hr(
    candidate_id: UUID,
    current_user: User = Depends(require_hr),
    db: AsyncSession = Depends(get_db),
):
    """
    Get detailed candidate profile including interview transcript, Q&A breakdown,
    scores, verdict, and resume. HR version with full access to all candidates.
    """
    from app.models.ai_report import AIReport
    
    try:
        # Get candidate (HR can see all candidates in their company)
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

        # Get AI reports for these interviews (also check by candidate_id for reports without interview link)
        interview_ids = [i.id for i in interviews]
        reports = []
        
        if interview_ids:
            reports_query = select(AIReport).filter(
                and_(
                    or_(
                        AIReport.interview_id.in_(interview_ids),
                        and_(
                            AIReport.candidate_id == candidate.id,
                            AIReport.interview_id.is_(None)
                        )
                    ),
                    AIReport.report_type == "interview_verdict"
                )
            )
            reports_result = await db.execute(reports_query)
            reports = reports_result.scalars().all()
        else:
            # No interviews exist, but check for reports by candidate_id
            reports_query = select(AIReport).filter(
                and_(
                    AIReport.candidate_id == candidate.id,
                    AIReport.report_type == "interview_verdict"
                )
            )
            reports_result = await db.execute(reports_query)
            reports = reports_result.scalars().all()

        # Map reports to interviews (and track reports without interview_id)
        reports_by_interview = {r.interview_id: r for r in reports if r.interview_id is not None}
        reports_without_interview = [r for r in reports if r.interview_id is None]

        # Build detailed interview data with Q&A breakdown
        import json as json_module
        
        interview_details = []
        for interview in interviews:
            report = reports_by_interview.get(interview.id)
            # If no report linked to interview, try to use an unlinked report for this candidate
            if not report and reports_without_interview:
                report = reports_without_interview.pop(0)  # Use first available unlinked report
            provider_response = report.provider_response if report else {}
            transcript = provider_response.get("transcript", [])
            
            # If no report exists, try to get data from interview's ai_verdict field
            interview_verdict_data = {}
            if not report and hasattr(interview, 'ai_verdict') and interview.ai_verdict:
                try:
                    if isinstance(interview.ai_verdict, str):
                        interview_verdict_data = json_module.loads(interview.ai_verdict)
                    elif isinstance(interview.ai_verdict, dict):
                        interview_verdict_data = interview.ai_verdict
                except:
                    pass
            
            # Merge provider_response with interview_verdict_data (report takes precedence)
            if interview_verdict_data and not provider_response:
                provider_response = interview_verdict_data
            
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
            
            # Calculate verdict from various sources
            verdict = provider_response.get("verdict") if provider_response else None
            if not verdict and hasattr(interview, 'ai_recommendation') and interview.ai_recommendation:
                verdict = interview.ai_recommendation
            if not verdict and report and report.score is not None:
                if report.score >= 70:
                    verdict = "PASS"
                elif report.score >= 50:
                    verdict = "REVIEW"
                else:
                    verdict = "FAIL"
            
            # Get overall score from multiple sources
            overall_score = report.score if report else provider_response.get("overall_score")
            if not overall_score and interview_verdict_data:
                overall_score = interview_verdict_data.get("overall_score")
            
            interview_details.append({
                "interview_id": str(interview.id),
                "round": interview.round.value if interview.round else "unknown",
                "scheduled_time": interview.scheduled_time.isoformat() if interview.scheduled_time else None,
                "status": interview.status.value if interview.status else None,
                "verdict": verdict,
                "overall_score": overall_score,
                "behavior_score": provider_response.get("behavior_score"),
                "confidence_score": provider_response.get("confidence_score"),
                "answer_score": provider_response.get("answer_score"),
                "strengths": provider_response.get("strengths", []),
                "weaknesses": provider_response.get("weaknesses", []),
                "detailed_feedback": provider_response.get("detailed_feedback", ""),
                "key_answers": provider_response.get("key_answers", []),
                "summary": report.summary if report else provider_response.get("summary"),
                "duration_seconds": provider_response.get("duration_seconds"),
                "total_questions": provider_response.get("total_questions"),
                "total_answers": provider_response.get("total_answers"),
                "qa_pairs": qa_pairs,
                "resume_text": provider_response.get("resume_text", "") or getattr(candidate, 'resume_text', "") or "",
                "resume_filename": provider_response.get("resume_filename", ""),
                "ats_score": getattr(interview, 'ats_score', None) or candidate.ats_score,
                "employee_verdict": getattr(interview, 'employee_verdict', None),
            })

        # Add any remaining reports that weren't linked to interviews
        for remaining_report in reports_without_interview:
            provider_response = remaining_report.provider_response if remaining_report else {}
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
            
            verdict = provider_response.get("verdict")
            if not verdict and remaining_report.score is not None:
                if remaining_report.score >= 70:
                    verdict = "PASS"
                elif remaining_report.score >= 50:
                    verdict = "REVIEW"
                else:
                    verdict = "FAIL"
            
            interview_details.append({
                "interview_id": str(remaining_report.id),  # Use report ID as fallback
                "round": "ai_interview",
                "scheduled_time": remaining_report.created_at.isoformat() if remaining_report.created_at else None,
                "status": "completed",
                "verdict": verdict,
                "overall_score": remaining_report.score,
                "behavior_score": provider_response.get("behavior_score"),
                "confidence_score": provider_response.get("confidence_score"),
                "answer_score": provider_response.get("answer_score"),
                "strengths": provider_response.get("strengths", []),
                "weaknesses": provider_response.get("weaknesses", []),
                "detailed_feedback": provider_response.get("detailed_feedback", ""),
                "key_answers": provider_response.get("key_answers", []),
                "summary": remaining_report.summary,
                "duration_seconds": provider_response.get("duration_seconds"),
                "total_questions": provider_response.get("total_questions"),
                "total_answers": provider_response.get("total_answers"),
                "qa_pairs": qa_pairs,
                "resume_text": provider_response.get("resume_text", "") or getattr(candidate, 'resume_text', "") or "",
                "resume_filename": provider_response.get("resume_filename", ""),
                "ats_score": candidate.ats_score,
                "employee_verdict": None,
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

        # Check if candidate is already assigned
        if candidate.assigned_to is not None:
            # Get current assignee name for better error message
            current_assignee_query = select(User).filter(User.id == candidate.assigned_to)
            result = await db.execute(current_assignee_query)
            current_assignee = result.scalars().first()
            assignee_name = current_assignee.name if current_assignee else "another employee"
            
            if candidate.assigned_to == employee_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Candidate is already assigned to this employee"
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Candidate is already assigned to {assignee_name}. Please unassign first."
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

        # Assign candidate and update status
        candidate.assigned_to = employee_id
        candidate.status = CandidateStatus.ASSIGNED
        await db.commit()
        await db.refresh(candidate)

        # Invalidate candidate cache so HR dashboard shows updated assignment
        from app.utils.cache import invalidate_cache
        await invalidate_cache(f"candidates:list:{company_id}*")
        await invalidate_cache(f"cache:candidates:*:{company_id}*")

        return {
            "message": f"Candidate assigned to {employee.name} successfully",
            "candidate_id": str(candidate_id),
            "employee_id": str(employee_id),
            "employee_name": employee.name,
            "candidate_status": candidate.status.value
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error assigning candidate: {str(e)}"
        )


@router.delete("/candidates/{candidate_id}/assign")
async def unassign_candidate(
    candidate_id: UUID,
    current_user: User = Depends(require_hr),
    db: AsyncSession = Depends(get_db),
):
    """
    Unassign candidate from employee (HR only).
    This endpoint matches the frontend expectation for DELETE /hr/candidates/{id}/assign.
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

        # Unassign candidate and revert status to uploaded
        candidate.assigned_to = None
        candidate.status = CandidateStatus.UPLOADED
        await db.commit()

        # Invalidate candidate cache so HR dashboard shows updated assignment
        from app.utils.cache import invalidate_cache
        await invalidate_cache(f"candidates:list:{company_id}*")
        await invalidate_cache(f"cache:candidates:*:{company_id}*")

        return {
            "message": "Candidate assignment removed successfully",
            "candidate_id": str(candidate_id)
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error removing assignment: {str(e)}"
        )


@router.post("/candidates/{candidate_id}/revoke")
async def revoke_candidate_assignment(
    candidate_id: UUID,
    current_user: User = Depends(require_hr),
    db: AsyncSession = Depends(get_db),
):
    """
    Revoke candidate assignment from employee (HR only).
    DEPRECATED: Use DELETE /candidates/{candidate_id}/assign instead.
    """
    # Redirect to unassign endpoint for backward compatibility
    return await unassign_candidate(candidate_id, current_user, db)


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

        # Check for already assigned candidates
        already_assigned = [c for c in candidates if c.assigned_to is not None]
        if already_assigned:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{len(already_assigned)} candidate(s) are already assigned. Please unassign them first."
            )

        # Assign all candidates and update their status
        for candidate in candidates:
            candidate.assigned_to = employee_id
            candidate.status = CandidateStatus.ASSIGNED
        
        await db.commit()

        # Invalidate candidate cache so HR dashboard shows updated assignments
        from app.utils.cache import invalidate_cache
        await invalidate_cache(f"candidates:list:{company_id}*")
        await invalidate_cache(f"cache:candidates:*:{company_id}*")

        return {
            "message": f"{len(candidates)} candidates assigned to {employee.name} successfully",
            "candidate_ids": [str(c) for c in candidate_ids],
            "employee_id": str(employee_id),
            "employee_name": employee.name
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error assigning candidates: {str(e)}"
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
        )
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
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching assigned candidates: {str(e)}"
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


@router.post("/interviews/generate-ai-token/{candidate_id}")
async def generate_ai_interview_token(
    candidate_id: UUID,
    current_user: User = Depends(require_hr),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate an AI interview token for a candidate.
    This token will be used by the candidate to access the AI interview room.
    Also returns the interview questions based on the candidate's assigned job role.
    Syncs the session to the AI Interview Service for the actual interview.
    """
    import secrets
    import httpx
    from datetime import datetime, timedelta
    from app.models.job import JobTemplate, Question
    from app.core.config import settings
    
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

        # Generate a secure token
        token = secrets.token_urlsafe(32)
        
        # Get questions for the candidate's job role if assigned
        questions = []
        if candidate.job_template_id:
            questions_query = select(Question).filter(
                Question.job_template_id == candidate.job_template_id
            )
            questions_result = await db.execute(questions_query)
            questions = [{"id": str(q.id), "text": q.text} for q in questions_result.scalars().all()]
        
        # Create or update an interview record with this token
        # Check if an interview already exists for this candidate
        interview_query = select(Interview).filter(
            and_(
                Interview.candidate_id == candidate_id,
                Interview.company_id == company_id,
                Interview.status == InterviewStatus.SCHEDULED
            )
        )
        result = await db.execute(interview_query)
        interview = result.scalars().first()
        
        scheduled_time = None
        scheduled_end_time = None
        
        if interview:
            interview.ai_interview_token = token
            scheduled_time = interview.scheduled_time
            # Calculate end time (1 hour after scheduled time)
            if scheduled_time:
                scheduled_end_time = scheduled_time + timedelta(hours=1)
        else:
            # Create a new interview record
            scheduled_time = datetime.utcnow() + timedelta(days=1)
            scheduled_end_time = scheduled_time + timedelta(hours=1)
            interview = Interview(
                candidate_id=candidate_id,
                company_id=company_id,
                status=InterviewStatus.SCHEDULED,
                round=InterviewRound.SCREENING,
                scheduled_time=scheduled_time,
                timezone="UTC",
                ai_interview_token=token,
                created_by=current_user.id
            )
            db.add(interview)
            
        await db.commit()
        await db.refresh(interview)
        
        # Sync session to AI Interview Service
        ai_service_url = getattr(settings, 'ai_interview_service_url', 'http://localhost:3001')
        sync_api_key = getattr(settings, 'sync_api_key', 'ai-interviewer-sync-key-2024')
        
        # Build candidate name
        candidate_name = f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or candidate.email
        
        sync_payload = {
            "token": token,
            "candidate_name": candidate_name,
            "candidate_email": candidate.email,
            "job_role": candidate.position,
            "questions": questions,
            "scheduled_time": scheduled_time.isoformat() if scheduled_time else None,
            "scheduled_end_time": scheduled_end_time.isoformat() if scheduled_end_time else None,
            "expires_at": (datetime.utcnow() + timedelta(days=7)).isoformat(),
        }
        
        # Call AI service to create/sync the interview session
        interview_url = None
        sync_success = False
        sync_error = None
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{ai_service_url}/api/sync/create-session",
                    json=sync_payload,
                    headers={"X-API-Key": sync_api_key}
                )
                if response.status_code in [200, 201]:
                    sync_data = response.json()
                    interview_url = sync_data.get("interview_url", f"{ai_service_url}/interview/{token}")
                    sync_success = True
                    print(f"Session synced to AI service: {interview_url}")
                else:
                    sync_error = f"AI service returned {response.status_code}: {response.text}"
                    print(f"Warning: Failed to sync session: {sync_error}")
        except Exception as sync_ex:
            sync_error = str(sync_ex)
            print(f"Warning: Could not sync to AI service: {sync_error}")
        
        # Generate fallback URL if sync failed
        if not interview_url:
            interview_url = f"{ai_service_url}/interview/{token}"

        return {
            "token": token,
            "candidate_id": str(candidate_id),
            "interview_id": str(interview.id),
            "job_role": candidate.position,
            "questions": questions,
            "interview_url": f"http://localhost:3000/interview/{token}",  # Use main frontend URL
            "sync_status": "success" if sync_success else "failed",
            "sync_error": sync_error
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating AI token: {str(e)}"
        )


@router.get("/interviews/by-token/{token}")
async def get_interview_by_token(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Get interview session details by AI interview token.
    This is a public endpoint for candidates to access their interview.
    """
    from app.models.company import Company
    from app.models.job import JobTemplate, Question
    
    try:
        # Find interview by token
        interview_query = select(Interview).filter(
            Interview.ai_interview_token == token
        )
        result = await db.execute(interview_query)
        interview = result.scalars().first()
        
        if not interview:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview session not found"
            )
        
        # Get candidate details
        candidate_query = select(Candidate).filter(Candidate.id == interview.candidate_id)
        result = await db.execute(candidate_query)
        candidate = result.scalars().first()
        
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found"
            )
        
        # Get company details
        company_query = select(Company).filter(Company.id == interview.company_id)
        result = await db.execute(company_query)
        company = result.scalars().first()
        
        # Get questions for the candidate's job role
        questions = []
        if candidate.job_template_id:
            questions_query = select(Question).filter(
                Question.job_template_id == candidate.job_template_id
            )
            questions_result = await db.execute(questions_query)
            all_questions = [q.text for q in questions_result.scalars().all()]
            
            # Limit to 10 questions - random selection if more than 10
            import random
            MAX_QUESTIONS = 10
            if len(all_questions) > MAX_QUESTIONS:
                questions = random.sample(all_questions, MAX_QUESTIONS)
            else:
                questions = all_questions
        
        candidate_name = f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or candidate.email
        
        # Parse ATS report if available
        ats_report = None
        if candidate.ats_report:
            try:
                import json
                ats_report = json.loads(candidate.ats_report)
            except (json.JSONDecodeError, TypeError):
                pass
        
        return {
            "id": str(interview.id),
            "candidate_id": str(candidate.id),
            "candidate_name": candidate_name,
            "candidate_email": candidate.email,
            "position": candidate.position or "Not specified",
            "company_name": company.name if company else "Company",
            "scheduled_time": interview.scheduled_time.isoformat() if interview.scheduled_time else None,
            "duration_minutes": 60,  # Default 60 minutes
            "status": interview.status.value if interview.status else "SCHEDULED",
            "questions_generated": questions,
            "ats_score": candidate.ats_score,
            "ats_report": ats_report,
            "resume_text": candidate.resume_text
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching interview: {str(e)}"
        )


@router.post("/interviews/{interview_id}/resume")
async def save_interview_resume(
    interview_id: str,
    resume_data: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Save resume uploaded at the start of interview.
    """
    from uuid import UUID
    
    try:
        interview_uuid = UUID(interview_id)
        
        # Find interview
        interview_query = select(Interview).filter(Interview.id == interview_uuid)
        result = await db.execute(interview_query)
        interview = result.scalars().first()
        
        if not interview:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found"
            )
        
        # Store resume in interview metadata or a dedicated field
        # For now, we'll use the notes field with a prefix, or add to candidate
        resume_text = resume_data.get("resume_text", "")
        resume_filename = resume_data.get("filename", "resume.txt")
        
        # Get candidate and update their resume
        candidate_query = select(Candidate).filter(Candidate.id == interview.candidate_id)
        result = await db.execute(candidate_query)
        candidate = result.scalars().first()
        
        if candidate:
            # Store resume text in candidate's notes or a resume field
            candidate.resume_text = resume_text  # Assuming this field exists
            await db.commit()
        
        return {
            "status": "success",
            "message": "Resume saved successfully",
            "interview_id": interview_id,
            "filename": resume_filename
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        # Don't fail if resume saving fails
        return {
            "status": "warning",
            "message": "Resume could not be saved, but interview can continue",
            "interview_id": interview_id
        }


@router.post("/interviews/ai-complete/{token}")
async def ai_interview_complete_by_token(
    token: str,
    transcript_data: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Complete an AI interview and create an AIReport.
    Called by the AI service when an interview finishes.
    Uses token to find the interview session.
    """
    from uuid import UUID
    from app.models.company import Company
    from app.models.ai_report import AIReport
    from app.models.interview_session import InterviewSession
    import json
    
    # Helper function to sanitize strings - removes null characters that PostgreSQL cannot store
    def sanitize_for_postgres(obj):
        """Recursively clean data of null characters that break PostgreSQL text fields"""
        if obj is None:
            return None
        if isinstance(obj, str):
            return obj.replace('\u0000', '').replace('\x00', '')
        elif isinstance(obj, dict):
            return {k: sanitize_for_postgres(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [sanitize_for_postgres(item) for item in obj]
        return obj
    
    # Sanitize all incoming data before processing
    transcript_data = sanitize_for_postgres(transcript_data)
    
    try:
        # Find interview session by token
        session_query = select(InterviewSession).filter(InterviewSession.token == token)
        result = await db.execute(session_query)
        session = result.scalars().first()
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview session not found"
            )
        
        # Get candidate and interview from session
        candidate_query = select(Candidate).filter(Candidate.ai_candidate_id == session.candidate_id)
        result = await db.execute(candidate_query)
        candidate = result.scalars().first()
        
        if not candidate:
            # Try to find by id match
            candidate_query = select(Candidate).filter(Candidate.id == session.candidate_id)
            result = await db.execute(candidate_query)
            candidate = result.scalars().first()
        
        # Extract data from request
        transcript = transcript_data.get("transcript", [])
        duration = transcript_data.get("duration_seconds", 0)
        resume_text = transcript_data.get("resume_text", "")
        resume_filename = transcript_data.get("resume_filename", "")
        pre_calculated = transcript_data.get("pre_calculated_scores", {})
        
        # Use pre-calculated scores if available (from AI service)
        if pre_calculated:
            overall_score = pre_calculated.get("overall_score", 50)
            behavior_score = pre_calculated.get("behavioral_score", pre_calculated.get("behavior_score", 50))
            confidence_score = pre_calculated.get("communication_score", pre_calculated.get("confidence_score", 50))
            answer_score = pre_calculated.get("technical_score", pre_calculated.get("answer_score", 50))
            verdict = pre_calculated.get("verdict", "REVIEW")
            verdict_summary = pre_calculated.get("summary", f"Interview completed with score {overall_score}%.")
            
            ai_verdict = {
                "recommendation": verdict,
                "behavior_score": behavior_score,
                "confidence_score": confidence_score,
                "answer_score": answer_score,
                "overall_score": overall_score,
                "summary": verdict_summary,
                "strengths": pre_calculated.get("strengths", []),
                "weaknesses": pre_calculated.get("weaknesses", []),
                "detailed_feedback": "Scores calculated by AI interview system."
            }
            logger.info(f"Using pre-calculated scores for token {token}: overall={overall_score}")
        else:
            # Generate scores using AI (fallback)
            logger.info(f"No pre-calculated scores, generating verdict for token {token}")
            try:
                from app.services.ai_service import generate_interview_verdict
                
                ai_verdict = await generate_interview_verdict(
                    transcript=transcript,
                    resume_text=resume_text,
                    position=candidate.position if candidate else ""
                )
                
                verdict = ai_verdict.get("recommendation", "NEUTRAL")
                if verdict == "HIRE":
                    verdict = "PASS"
                elif verdict == "REJECT":
                    verdict = "FAIL"
                else:
                    verdict = "REVIEW"
                    
                verdict_summary = ai_verdict.get("summary", "")
                overall_score = ai_verdict.get("overall_score", 50)
                behavior_score = ai_verdict.get("behavior_score", 50)
                confidence_score = ai_verdict.get("confidence_score", 50)
                answer_score = ai_verdict.get("answer_score", 50)
                
            except Exception as e:
                logger.warning(f"AI verdict generation failed for {token}: {e}")
                overall_score = 50
                behavior_score = 50
                confidence_score = 50
                answer_score = 50
                verdict = "REVIEW"
                verdict_summary = "Manual review required - AI analysis unavailable."
                ai_verdict = {
                    "recommendation": verdict,
                    "overall_score": overall_score,
                    "summary": verdict_summary,
                }
        
        # Get company ID from candidate
        company_id = candidate.company_id if candidate else None
        
        # Find or create interview record
        interview = None
        if candidate:
            interview_query = select(Interview).filter(
                and_(
                    Interview.candidate_id == candidate.id,
                    Interview.status.in_([InterviewStatus.SCHEDULED, InterviewStatus.IN_PROGRESS, InterviewStatus.COMPLETED])
                )
            ).order_by(Interview.scheduled_time.desc())
            result = await db.execute(interview_query)
            interview = result.scalars().first()
        
        # Create AI Report 
        user_messages = [msg for msg in transcript if msg.get('role') == 'user']
        ai_messages = [msg for msg in transcript if msg.get('role') == 'ai']
        total_questions = len([m for m in ai_messages if '?' in m.get('content', '')])
        total_answers = len(user_messages)
        
        ai_report = AIReport(
            company_id=company_id,
            candidate_id=candidate.id if candidate else None,
            interview_id=interview.id if interview else None,
            report_type="interview_verdict",
            score=overall_score,
            summary=verdict_summary,
            provider_response={
                "verdict": verdict,
                "overall_score": overall_score,
                "behavior_score": behavior_score,
                "confidence_score": confidence_score,
                "answer_score": answer_score,
                "strengths": ai_verdict.get("strengths", []),
                "weaknesses": ai_verdict.get("weaknesses", []),
                "detailed_feedback": ai_verdict.get("detailed_feedback", ""),
                "total_questions": total_questions,
                "total_answers": total_answers,
                "duration_seconds": duration,
                "transcript": transcript,
                "resume_text": resume_text,
                "resume_filename": resume_filename,
                "candidate_name": f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() if candidate else "",
                "candidate_email": candidate.email if candidate else "",
                "position": candidate.position if candidate else "",
                "token": token,
            }
        )
        db.add(ai_report)
        
        # Update interview status if found
        if interview:
            interview.status = InterviewStatus.COMPLETED
            if hasattr(interview, 'ai_verdict'):
                interview.ai_verdict = json.dumps(ai_verdict)
            if hasattr(interview, 'ai_recommendation'):
                interview.ai_recommendation = verdict
        
        # Update candidate status based on AI verdict
        scheduled_deletion = False
        if candidate:
            if verdict == "PASS":
                candidate.status = CandidateStatus.PASSED
            elif verdict == "FAIL":
                candidate.status = CandidateStatus.FAILED
                # Schedule deletion for failed/auto-rejected candidates
                try:
                    from app.core.celery_config import celery_app
                    celery_app.send_task(
                        "tasks.delete_rejected_candidate",
                        args=[str(candidate.id)],
                        countdown=600  # 10 minutes
                    )
                    scheduled_deletion = True
                    logger.info(f"Scheduled deletion for auto-rejected candidate {candidate.id}")
                except Exception as task_error:
                    logger.warning(f"Failed to schedule deletion for candidate {candidate.id}: {task_error}")
            else:  # REVIEW or NEUTRAL
                candidate.status = CandidateStatus.REVIEW
        
        await db.commit()
        
        logger.info(f"AIReport created for token {token}: score={overall_score}, verdict={verdict}, scheduled_deletion={scheduled_deletion}")
        
        return {
            "status": "success",
            "message": "AI interview completed and report created",
            "token": token,
            "score": overall_score,
            "verdict": verdict
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        logger.error(f"Error completing AI interview for token {token}: {e}")
        return {
            "status": "error",
            "message": str(e),
            "token": token
        }


@router.post("/interviews/{interview_id}/transcript")
async def save_interview_transcript(
    interview_id: str,
    transcript_data: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Save interview transcript and optionally send to HR and assigned employee.
    This is called when the AI interview ends.
    """
    from uuid import UUID
    from app.models.company import Company
    from app.models.ai_report import AIReport
    import json
    
    # Helper function to sanitize strings - removes null characters that PostgreSQL cannot store
    def sanitize_for_postgres(obj):
        """Recursively clean data of null characters that break PostgreSQL text fields"""
        if obj is None:
            return None
        if isinstance(obj, str):
            # Remove null bytes and null unicode characters
            return obj.replace('\u0000', '').replace('\x00', '')
        elif isinstance(obj, dict):
            return {k: sanitize_for_postgres(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [sanitize_for_postgres(item) for item in obj]
        return obj
    
    # Sanitize all incoming data before processing
    transcript_data = sanitize_for_postgres(transcript_data)
    
    try:
        interview_uuid = UUID(interview_id)
        
        # Find interview
        interview_query = select(Interview).filter(Interview.id == interview_uuid)
        result = await db.execute(interview_query)
        interview = result.scalars().first()
        
        if not interview:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found"
            )
        
        # Save transcript to interview notes
        transcript = transcript_data.get("transcript", [])
        duration = transcript_data.get("duration_seconds", 0)
        resume_text = transcript_data.get("resume_text", "")
        resume_filename = transcript_data.get("resume_filename", "")
        
        # Format transcript for storage
        transcript_text = "\n\n".join([
            f"[{msg.get('role', 'unknown').upper()}] {msg.get('content', '')}"
            for msg in transcript
        ])
        
        interview.notes = f"AI Interview Transcript (Duration: {duration // 60}m {duration % 60}s):\n\n{transcript_text}"
        interview.status = InterviewStatus.COMPLETED
        
        await db.commit()
        
        # Get candidate and HR info for email notification
        candidate_query = select(Candidate).filter(Candidate.id == interview.candidate_id)
        result = await db.execute(candidate_query)
        candidate = result.scalars().first()
        
        # Get company info
        company_query = select(Company).filter(Company.id == interview.company_id)
        result = await db.execute(company_query)
        company = result.scalars().first()
        
        # Generate AI-powered verdict with detailed scoring
        from app.services.ai_service import generate_interview_verdict
        
        user_messages = [msg for msg in transcript if msg.get('role') == 'user']
        ai_messages = [msg for msg in transcript if msg.get('role') == 'ai']
        total_questions = len([m for m in ai_messages if '?' in m.get('content', '')])
        total_answers = len(user_messages)
        
        try:
            # Get ATS score if stored on interview
            ats_score = getattr(interview, 'ats_score', None)
            
            ai_verdict = await generate_interview_verdict(
                transcript=transcript,
                resume_text=resume_text,
                ats_score=ats_score,
                position=candidate.position if candidate else ""
            )
            
            verdict = ai_verdict.get("recommendation", "NEUTRAL")
            verdict_summary = ai_verdict.get("summary", "")
            overall_score = ai_verdict.get("overall_score", 50)
            behavior_score = ai_verdict.get("behavior_score", 50)
            confidence_score = ai_verdict.get("confidence_score", 50)
            answer_score = ai_verdict.get("answer_score", 50)
            
            # Map AI recommendation to our verdict format
            if verdict == "HIRE":
                verdict = "PASS"
            elif verdict == "REJECT":
                verdict = "FAIL"
            else:
                verdict = "REVIEW"
                
        except Exception as e:
            logger.warning(f"AI verdict generation failed, using fallback: {e}")
            # Fallback to simple scoring
            avg_answer_length = sum(len(m.get('content', '')) for m in user_messages) / max(total_answers, 1)
            completion_score = min(100, (total_answers / max(total_questions, 1)) * 100) if total_questions > 0 else 50
            detail_score = min(100, (avg_answer_length / 200) * 100)
            overall_score = round((completion_score + detail_score) / 2, 1)
            behavior_score = 50
            confidence_score = 50
            answer_score = int(detail_score)
            
            if overall_score >= 70:
                verdict = "PASS"
                verdict_summary = f"The candidate completed the interview successfully with a score of {overall_score}%."
            elif overall_score >= 50:
                verdict = "REVIEW"
                verdict_summary = f"The candidate completed the interview with a score of {overall_score}%. Manual review recommended."
            else:
                verdict = "FAIL"
                verdict_summary = f"The candidate's interview performance was below expectations with a score of {overall_score}%."
            
            ai_verdict = {
                "recommendation": verdict,
                "behavior_score": behavior_score,
                "confidence_score": confidence_score,
                "answer_score": answer_score,
                "overall_score": overall_score,
                "summary": verdict_summary,
                "strengths": [],
                "weaknesses": [],
                "detailed_feedback": "Fallback scoring used - AI analysis unavailable."
            }
        
        # Store detailed scores on interview record
        interview.transcript = transcript_text
        interview.ai_verdict = json.dumps(ai_verdict)
        interview.ai_recommendation = verdict
        interview.behavior_score = behavior_score
        interview.confidence_score = confidence_score
        interview.answer_score = answer_score
        await db.commit()
        
        # Create AI Report with detailed verdict
        ai_report = AIReport(
            company_id=interview.company_id,
            candidate_id=interview.candidate_id,
            interview_id=interview.id,
            report_type="interview_verdict",
            score=overall_score,
            summary=verdict_summary,
            provider_response={
                "verdict": verdict,
                "overall_score": overall_score,
                "behavior_score": behavior_score,
                "confidence_score": confidence_score,
                "answer_score": answer_score,
                "strengths": ai_verdict.get("strengths", []),
                "weaknesses": ai_verdict.get("weaknesses", []),
                "detailed_feedback": ai_verdict.get("detailed_feedback", ""),
                "key_answers": ai_verdict.get("key_answers", []),
                "total_questions": total_questions,
                "total_answers": total_answers,
                "duration_seconds": duration,
                "transcript": transcript,
                "resume_text": resume_text,
                "resume_filename": resume_filename,
                "candidate_name": f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() if candidate else "",
                "candidate_email": candidate.email if candidate else "",
                "position": candidate.position if candidate else "",
            }
        )
        db.add(ai_report)
        await db.commit()
        
        # === AUTO-REJECTION / AUTO-UPDATE CANDIDATE STATUS BASED ON AI CONFIG ===
        from app.models.company_ai_config import CompanyAIConfig
        
        # Get company AI config
        config_query = select(CompanyAIConfig).filter(CompanyAIConfig.company_id == interview.company_id)
        config_result = await db.execute(config_query)
        ai_config = config_result.scalars().first()
        
        auto_rejected = False
        new_status = None
        
        if candidate:
            # Determine new candidate status based on verdict and config
            if ai_config and ai_config.auto_reject_below and overall_score < ai_config.auto_reject_below:
                # Auto-reject: score below threshold
                new_status = CandidateStatus.AUTO_REJECTED
                auto_rejected = True
                logger.info(f"Auto-rejecting candidate {candidate.id}: score {overall_score} < threshold {ai_config.auto_reject_below}")
            elif verdict == "FAIL":
                # AI says FAIL
                new_status = CandidateStatus.FAILED
            elif verdict == "PASS":
                # AI says PASS
                if ai_config and ai_config.require_employee_review:
                    # Needs employee review even if passed
                    new_status = CandidateStatus.REVIEW
                else:
                    new_status = CandidateStatus.PASSED
            else:  # REVIEW
                new_status = CandidateStatus.REVIEW
            
            # Update candidate status
            if new_status:
                candidate.status = new_status
                await db.commit()
                logger.info(f"Updated candidate {candidate.id} status to {new_status.value}")
        
        return {
            "status": "success",
            "message": "Transcript saved successfully",
            "interview_id": interview_id,
            "verdict": verdict,
            "score": overall_score,
            "report_id": str(ai_report.id),
            "auto_rejected": auto_rejected,
            "candidate_status": new_status.value if new_status else None
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error saving transcript: {str(e)}"
        )
