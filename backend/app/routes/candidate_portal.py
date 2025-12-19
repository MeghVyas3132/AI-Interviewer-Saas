"""
Candidate portal routes - for candidates to view their interview info.

Candidate capabilities (read-only):
- View their interview schedule
- See assigned mentor (employee) details
- View company name and role applied for
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
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
                    "ai_interview_token": i.ai_interview_token,
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
                "ai_interview_token": next_interview.ai_interview_token if next_interview else None,
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
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """
    Candidate login using email only (backward compatibility endpoint).
    
    NOTE: This endpoint is maintained for backward compatibility.
    New implementations should use /api/v1/auth/candidate-login instead.
    
    This endpoint now uses the same logic as /auth/candidate-login to ensure
    consistency and proper token handling including refresh_token.
    """
    from app.schemas.auth_schema import CandidateLoginRequest, UserLoginResponse
    from app.services.auth_service import AuthService
    
    try:
        email = request_data.get("email", "").strip().lower()
        
        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email is required"
            )
        
        # Find all candidates by email (across all companies)
        candidate_query = select(Candidate).filter(Candidate.email == email)
        result = await db.execute(candidate_query)
        candidates = result.scalars().all()
        
        if not candidates:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No candidate found with this email. Please check your email or contact HR.",
            )
        
        # Get the first candidate for user creation
        candidate = candidates[0]
        
        # Check if user already exists for this candidate
        user_query = select(User).filter(
            and_(
                User.email == email,
                User.role == UserRole.CANDIDATE
            )
        )
        user_result = await db.execute(user_query)
        user = user_result.scalars().first()
        
        if not user:
            # Create a candidate user account (no password)
            user = User(
                email=email,
                name=f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or email,
                password_hash="CANDIDATE_NO_PASSWORD",
                company_id=candidate.company_id,
                role=UserRole.CANDIDATE,
                is_active=True,
                email_verified=True,
            )
            db.add(user)
            await db.flush()
        
        # Generate JWT tokens using AuthService
        from app.services.auth_service import AuthService
        tokens = AuthService.create_tokens(user.id, user.company_id)
        
        # Set secure HTTP-only cookie for refresh token
        response.set_cookie(
            key="refresh_token",
            value=tokens.refresh_token,
            httponly=True,
            secure=True,
            samesite="strict",
            max_age=7 * 24 * 60 * 60,
        )
        
        # Build company data with interviews
        companies_data = []
        all_interviews = []
        
        from app.schemas.auth_schema import UserLoginResponse
        
        for cand in candidates:
            # Get company info
            company_query = select(Company).filter(Company.id == cand.company_id)
            company_result = await db.execute(company_query)
            company = company_result.scalars().first()
            
            # Get interviews for this candidate
            interviews_query = select(Interview).filter(Interview.candidate_id == cand.id)
            interviews_result = await db.execute(interviews_query)
            interviews = interviews_result.scalars().all()
            
            company_interviews = []
            for interview in interviews:
                interviewer_info = None
                if interview.interviewer_id:
                    interviewer_result = await db.execute(
                        select(User).where(User.id == interview.interviewer_id)
                    )
                    interviewer = interviewer_result.scalars().first()
                    if interviewer:
                        interviewer_info = {
                            "id": str(interviewer.id),
                            "name": interviewer.name,
                            "email": interviewer.email,
                        }
                
                interview_data = {
                    "id": str(interview.id),
                    "company_name": company.name if company else "Unknown",
                    "company_id": str(cand.company_id),
                    "position": cand.position,
                    "round": interview.round.value if interview.round and hasattr(interview.round, 'value') else interview.round,
                    "scheduled_time": interview.scheduled_time.isoformat() if interview.scheduled_time else None,
                    "timezone": interview.timezone,
                    "status": interview.status.value if interview.status and hasattr(interview.status, 'value') else interview.status,
                    "meeting_link": interview.meeting_link,
                    "ai_interview_token": interview.ai_interview_token,
                    "interviewer": interviewer_info,
                }
                company_interviews.append(interview_data)
                all_interviews.append(interview_data)
            
            # Add company data regardless of whether there are interviews
            companies_data.append({
                "company_id": str(cand.company_id),
                "company_name": company.name if company else "Unknown",
                "position": cand.position,
                "domain": cand.domain,
                "status": cand.status.value if cand.status and hasattr(cand.status, 'value') else cand.status,
                "applied_at": cand.created_at.isoformat() if cand.created_at else None,
                "interviews": company_interviews,
            })
        
        await db.commit()
        
        # Fetch company name for user
        user_company_result = await db.execute(
            select(Company).where(Company.id == user.company_id)
        )
        user_company = user_company_result.scalars().first()
        
        return {
            "access_token": tokens.access_token,
            "refresh_token": tokens.refresh_token,
            "token_type": tokens.token_type,
            "user": UserLoginResponse(
                id=str(user.id),
                email=user.email,
                full_name=user.name,
                role=user.role,
                company_id=str(user.company_id),
                company_name=user_company.name if user_company else None,
                is_active=user.is_active,
                department=user.department,
                created_at=user.created_at.isoformat() if user.created_at else "",
            ),
            "companies": companies_data,
            "interviews": all_interviews,
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"CANDIDATE LOGIN ERROR: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Candidate login failed: {str(e)}"
        )
