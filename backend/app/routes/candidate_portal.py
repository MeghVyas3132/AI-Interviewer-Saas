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
        company_name = company.name if company else "Unknown Company"

        return {
            "interviews": [
                {
                    "id": str(i.id),
                    "company_name": company_name,
                    "round": i.round.value if i.round else None,
                    "scheduled_time": i.scheduled_time.isoformat() if i.scheduled_time else None,
                    "timezone": i.timezone,
                    "status": i.status.value if i.status else None,
                    "meeting_link": i.meeting_link,
                    "ai_interview_token": i.ai_interview_token,
                }
                for i in interviews
            ],
            "mentor": mentor_info,
            "company": {
                "name": company_name,
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


@router.post("/login")
async def candidate_login(
    request_data: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Login for candidates using email only.
    Candidates don't have passwords - they're added by HR.
    Returns a token if the email exists as a candidate in any company.
    """
    from datetime import datetime, timedelta, timezone
    import jwt
    from app.core.config import settings
    
    email = request_data.get("email", "").strip().lower()
    
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is required"
        )
    
    # Find candidate by email
    candidate_query = select(Candidate).filter(Candidate.email == email)
    result = await db.execute(candidate_query)
    candidates = result.scalars().all()
    
    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No candidate found with this email. You can only login if a company has added you as a candidate."
        )
    
    # Get the first candidate (could be in multiple companies)
    candidate = candidates[0]
    
    # Get company info
    company_query = select(Company).filter(Company.id == candidate.company_id)
    company_result = await db.execute(company_query)
    company = company_result.scalars().first()
    
    # Check if a user account exists for this candidate
    user_query = select(User).filter(
        and_(
            User.email == email,
            User.role == UserRole.CANDIDATE
        )
    )
    user_result = await db.execute(user_query)
    user = user_result.scalars().first()
    
    # If no user account exists, create one
    if not user:
        from uuid import uuid4
        user = User(
            id=uuid4(),
            email=email,
            name=f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or email,
            password_hash="CANDIDATE_NO_PASSWORD",  # Candidates don't have passwords
            role=UserRole.CANDIDATE,
            company_id=candidate.company_id,
            is_active=True,
            email_verified=True,
            verification_attempts=0,
            created_at=datetime.now(timezone.utc),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    
    # Generate JWT token
    token_data = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "company_id": str(user.company_id) if user.company_id else None,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        "iat": datetime.now(timezone.utc),
    }
    
    access_token = jwt.encode(token_data, settings.secret_key, algorithm="HS256")
    
    # Get all companies where this email is a candidate
    companies_list = []
    for c in candidates:
        comp_query = select(Company).filter(Company.id == c.company_id)
        comp_result = await db.execute(comp_query)
        comp = comp_result.scalars().first()
        if comp:
            companies_list.append({
                "id": str(comp.id),
                "name": comp.name,
                "position": c.position,
                "status": c.status.value if c.status else None,
            })
    
    # Get interviews for this candidate
    interviews_list = []
    for c in candidates:
        interviews_query = select(Interview).filter(Interview.candidate_id == c.id)
        interviews_result = await db.execute(interviews_query)
        interviews = interviews_result.scalars().all()
        for i in interviews:
            comp_query = select(Company).filter(Company.id == c.company_id)
            comp_result = await db.execute(comp_query)
            comp = comp_result.scalars().first()
            interviews_list.append({
                "id": str(i.id),
                "company_name": comp.name if comp else None,
                "position": c.position,
                "round": i.round.value if i.round else None,
                "scheduled_time": i.scheduled_time.isoformat() if i.scheduled_time else None,
                "status": i.status.value if i.status else None,
                "meeting_link": i.meeting_link,
            })
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "role": user.role.value,
            "company_id": str(user.company_id) if user.company_id else None,
        },
        "companies": companies_list,
        "interviews": interviews_list,
    }


@router.get("/my-results")
async def get_my_results(
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_db),
):
    """
    Get interview results for the candidate.
    Returns completed interviews with scores and feedback.
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
                "results": [],
                "company_name": None,
                "position": None,
                "total_completed": 0,
                "message": "No candidate profile found"
            }

        # Get company info
        company_query = select(Company).filter(Company.id == current_user.company_id)
        company_result = await db.execute(company_query)
        company = company_result.scalars().first()

        # Get all interviews (completed ones will have results)
        interviews_query = select(Interview).filter(
            Interview.candidate_id == candidate.id
        ).order_by(Interview.scheduled_time.desc())
        interviews_result = await db.execute(interviews_query)
        interviews = interviews_result.scalars().all()

        # Format results - include completed interviews with any available scores
        results = []
        for interview in interviews:
            # Only include completed interviews or those with results
            status_value = interview.status.value.upper() if interview.status else ""
            if status_value == 'COMPLETED':
                # Parse ai_verdict JSON if available
                verdict_data = {}
                if interview.ai_verdict:
                    try:
                        import json
                        verdict_data = json.loads(interview.ai_verdict)
                    except:
                        pass
                
                results.append({
                    "interview_id": str(interview.id),
                    "round": interview.round.value if interview.round else None,
                    "completed_at": interview.updated_at.isoformat() if interview.updated_at else None,
                    "verdict": interview.ai_recommendation,  # HIRE, REJECT, NEUTRAL
                    "score": verdict_data.get("overall_score") or interview.answer_score,
                    "summary": verdict_data.get("summary"),
                    "behavior_score": interview.behavior_score,
                    "confidence_score": interview.confidence_score,
                    "answer_score": interview.answer_score,
                    "feedback": verdict_data.get("detailed_feedback"),
                    "employee_verdict": interview.employee_verdict,
                    "strengths": verdict_data.get("strengths", []),
                    "weaknesses": verdict_data.get("weaknesses", []),
                    "hiring_risk": verdict_data.get("hiring_risk"),
                })

        return {
            "results": results,
            "company_name": company.name if company else None,
            "position": candidate.position,
            "total_completed": len(results),
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching results: {str(e)}"
        )
