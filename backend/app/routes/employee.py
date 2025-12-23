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
    Dependency to require EMPLOYEE or TEAM_LEAD role.
    """
    if current_user.role not in [UserRole.EMPLOYEE, UserRole.TEAM_LEAD]:
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
    scheduled_time: str  # ISO format datetime
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
    """
    try:
        from datetime import datetime

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
            scheduled_time = datetime.fromisoformat(request.scheduled_time.replace('Z', '+00:00'))
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

        # Create interview
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
        )

        db.add(interview)
        await db.commit()
        await db.refresh(interview)

        return {
            "message": "Interview scheduled successfully",
            "interview": {
                "id": str(interview.id),
                "candidate_id": str(candidate_id),
                "round": interview_round.value,
                "scheduled_time": scheduled_time.isoformat(),
                "status": "scheduled"
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


@router.get("/my-interviews")
async def get_my_interviews(
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all interviews for candidates assigned to the employee.
    """
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
