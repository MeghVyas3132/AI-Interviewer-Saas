"""
Candidate portal routes - for candidates to view their interview info.

Candidate capabilities (read-only):
- View their interview schedule
- See assigned mentor (employee) details
- View company name and role applied for
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.candidate import Candidate, Interview
from app.models.user import User, UserRole
from app.models.company import Company

router = APIRouter(prefix="/api/v1/candidate-portal", tags=["candidate-portal"])


def require_candidate(current_user: User = Depends(get_current_user)) -> User:
    """
    Dependency to require CANDIDATE role.
    """
    if current_user.role != UserRole.CANDIDATE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only candidates can access this resource",
        )
    return current_user


@router.get("/my-info")
async def get_my_info(
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_db),
):
    """
    Get candidate's own information including company, role applied for, and mentor.
    """
    try:
        # Get candidate record by email
        candidate_query = select(Candidate).filter(
            and_(
                Candidate.email == current_user.email,
                Candidate.company_id == current_user.company_id
            )
        )
        result = await db.execute(candidate_query)
        candidate = result.scalars().first()

        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate profile not found"
            )

        # Get company info
        company_query = select(Company).filter(Company.id == current_user.company_id)
        company_result = await db.execute(company_query)
        company = company_result.scalars().first()

        # Get mentor (assigned employee) info
        mentor_info = None
        if candidate.assigned_to:
            mentor_query = select(User).filter(User.id == candidate.assigned_to)
            mentor_result = await db.execute(mentor_query)
            mentor = mentor_result.scalars().first()
            if mentor:
                mentor_info = {
                    "id": str(mentor.id),
                    "name": mentor.name,
                    "email": mentor.email,
                    "department": mentor.department,
                }

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
            },
            "company": {
                "id": str(company.id) if company else None,
                "name": company.name if company else None,
            } if company else None,
            "mentor": mentor_info,
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching candidate info: {str(e)}"
        )


@router.get("/my-interviews")
async def get_my_interviews(
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all interviews scheduled for the candidate.
    """
    try:
        # Get candidate record by email
        candidate_query = select(Candidate).filter(
            and_(
                Candidate.email == current_user.email,
                Candidate.company_id == current_user.company_id
            )
        )
        result = await db.execute(candidate_query)
        candidate = result.scalars().first()

        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate profile not found"
            )

        # Get interviews
        interviews_query = select(Interview).filter(
            Interview.candidate_id == candidate.id
        ).order_by(Interview.scheduled_time.asc())
        interviews_result = await db.execute(interviews_query)
        interviews = interviews_result.scalars().all()

        # Get mentor info if assigned
        mentor_info = None
        if candidate.assigned_to:
            mentor_query = select(User).filter(User.id == candidate.assigned_to)
            mentor_result = await db.execute(mentor_query)
            mentor = mentor_result.scalars().first()
            if mentor:
                mentor_info = {
                    "id": str(mentor.id),
                    "name": mentor.name,
                    "email": mentor.email,
                }

        # Get company info
        company_query = select(Company).filter(Company.id == current_user.company_id)
        company_result = await db.execute(company_query)
        company = company_result.scalars().first()

        return {
            "interviews": [
                {
                    "id": str(i.id),
                    "round": i.round.value if i.round else None,
                    "scheduled_time": i.scheduled_time.isoformat() if i.scheduled_time else None,
                    "timezone": i.timezone,
                    "status": i.status.value if i.status else None,
                    "meeting_link": i.meeting_link,
                }
                for i in interviews
            ],
            "mentor": mentor_info,
            "company": {
                "name": company.name if company else None,
            } if company else None,
            "position_applied": candidate.position,
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching interviews: {str(e)}"
        )


@router.get("/dashboard")
async def get_candidate_dashboard(
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_db),
):
    """
    Get candidate dashboard - overview of their application.
    """
    try:
        # Get candidate record by email
        candidate_query = select(Candidate).filter(
            and_(
                Candidate.email == current_user.email,
                Candidate.company_id == current_user.company_id
            )
        )
        result = await db.execute(candidate_query)
        candidate = result.scalars().first()

        if not candidate:
            return {
                "message": "Your candidate profile is being set up. Please check back later.",
                "status": "pending"
            }

        # Get company info
        company_query = select(Company).filter(Company.id == current_user.company_id)
        company_result = await db.execute(company_query)
        company = company_result.scalars().first()

        # Get interviews
        interviews_query = select(Interview).filter(
            Interview.candidate_id == candidate.id
        ).order_by(Interview.scheduled_time.asc())
        interviews_result = await db.execute(interviews_query)
        interviews = interviews_result.scalars().all()

        # Get next scheduled interview
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        upcoming_interviews = [i for i in interviews if i.scheduled_time and i.scheduled_time > now and i.status.value == "scheduled"]
        next_interview = upcoming_interviews[0] if upcoming_interviews else None

        # Get mentor info if assigned
        mentor_info = None
        if candidate.assigned_to:
            mentor_query = select(User).filter(User.id == candidate.assigned_to)
            mentor_result = await db.execute(mentor_query)
            mentor = mentor_result.scalars().first()
            if mentor:
                mentor_info = {
                    "name": mentor.name,
                    "email": mentor.email,
                }

        return {
            "candidate_name": f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or candidate.email,
            "company_name": company.name if company else None,
            "position_applied": candidate.position,
            "application_status": candidate.status.value if candidate.status else None,
            "total_interviews": len(interviews),
            "completed_interviews": len([i for i in interviews if i.status.value == "completed"]),
            "upcoming_interviews": len(upcoming_interviews),
            "next_interview": {
                "round": next_interview.round.value if next_interview and next_interview.round else None,
                "scheduled_time": next_interview.scheduled_time.isoformat() if next_interview else None,
                "meeting_link": next_interview.meeting_link if next_interview else None,
            } if next_interview else None,
            "mentor": mentor_info,
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching dashboard: {str(e)}"
        )
