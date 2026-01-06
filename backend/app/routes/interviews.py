"""
Interview management routes for the AI Interviewer platform.

Handles interview creation, scheduling, status updates, and candidate feedback.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.middleware.auth import get_current_user
from app.models.candidate import Interview, InterviewStatus, Candidate, CandidateStatus
from app.models.user import User, UserRole
from app.services.ai_service import ai_service
from app.schemas.interview_schema import (
    InterviewListResponse,
    InterviewResponse,
    InterviewCreate,
    InterviewUpdate,
)

router = APIRouter(prefix="/api/v1/interviews", tags=["interviews"])


@router.post(
    "",
    response_model=InterviewResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_interview(
    interview_data: InterviewCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """
    Create a new interview.
    Only ADMIN and HR can create interviews.
    """
    if current_user.role not in [UserRole.SYSTEM_ADMIN, UserRole.HR]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators and HR can create interviews",
        )

    try:
        # Get candidate
        query = select(Candidate).filter(Candidate.id == interview_data.candidate_id)
        result = await session.execute(query)
        candidate = result.scalars().first()
        
        if not candidate:
             raise HTTPException(status_code=404, detail="Candidate not found")
        
        # Sync with AI Service
        try:
             ai_candidate_id = await ai_service.sync_candidate(candidate)
             candidate.ai_candidate_id = ai_candidate_id
             
             # Create session
             ai_session = await ai_service.create_interview_session(
                 ai_candidate_id=ai_candidate_id,
                 exam_id=interview_data.exam_id
             )
             
             ai_token = ai_session['token']
             meeting_link = f"{settings.ai_service_url}/interview/{ai_token}"
             
        except Exception as e:
             raise HTTPException(status_code=500, detail=f"AI Service error: {str(e)}")

        interview = Interview(
            company_id=current_user.company_id,
            candidate_id=interview_data.candidate_id,
            interviewer_id=interview_data.interviewer_id,
            round=interview_data.round,
            scheduled_time=interview_data.scheduled_time,
            status=InterviewStatus.SCHEDULED,
            exam_id=interview_data.exam_id,
            ai_interview_token=ai_token,
            meeting_link=meeting_link
        )
        session.add(interview)
        
        # Update candidate status using service method to handle enum correctly
        from app.services.candidate_service import CandidateService
        await CandidateService.update_candidate_status(
            session, candidate.id, CandidateStatus.INTERVIEW_SCHEDULED
        )
        
        await session.commit()
        await session.refresh(interview)
        return interview
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating interview: {str(e)}",
        )


@router.get("", response_model=List[InterviewListResponse])
async def get_interviews(
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: AsyncSession = Depends(get_db),
):
    """
    Get all interviews for the current user's company.
    """
    try:
        query = select(Interview).filter(
            Interview.company_id == current_user.company_id
        )
        query = query.offset(skip).limit(limit)
        result = await session.execute(query)
        interviews = result.scalars().all()
        return interviews
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching interviews: {str(e)}",
        )


@router.get("/assigned")
async def get_assigned_interviews(
    current_user: User = Depends(get_current_user),
    status_filter: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: AsyncSession = Depends(get_db),
):
    """
    Get interviews assigned to the current user (as interviewer).
    Only EMPLOYEE can access this.
    """
    if current_user.role != UserRole.EMPLOYEE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only employees can access assigned interviews"
        )

    try:
        query = select(Interview).filter(
            and_(
                Interview.interviewer_id == current_user.id,
                Interview.company_id == current_user.company_id,
            )
        )

        if status_filter:
            query = query.filter(Interview.status == status_filter)

        query = query.offset(skip).limit(limit)
        result = await session.execute(query)
        interviews = result.scalars().all()

        # Fetch candidate details for each interview
        response_interviews = []
        for interview in interviews:
            candidate_query = select(Candidate).filter(Candidate.id == interview.candidate_id)
            candidate_result = await session.execute(candidate_query)
            candidate = candidate_result.scalar_one_or_none()

            response_interviews.append({
                "id": str(interview.id),
                "candidate_id": str(interview.candidate_id),
                "candidate_name": candidate.name if candidate else "Unknown",
                "candidate_email": candidate.email if candidate else "N/A",
                "round_number": interview.round.value if interview.round else "Unknown",
                "scheduled_at": interview.scheduled_time.isoformat() if interview.scheduled_time else None,
                "status": interview.status.value if interview.status else "UNKNOWN",
                "interview_type": "Technical",
                "duration_minutes": 60,
            })

        return response_interviews

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching interviews: {str(e)}"
        )


@router.get("/{interview_id}", response_model=InterviewResponse)
async def get_interview(
    interview_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """
    Get a specific interview by ID.
    """
    try:
        query = select(Interview).filter(
            and_(
                Interview.id == interview_id,
                Interview.company_id == current_user.company_id,
            )
        )
        result = await session.execute(query)
        interview = result.scalar_one_or_none()

        if not interview:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found",
            )
        return interview
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching interview: {str(e)}",
        )


@router.put("/{interview_id}", response_model=InterviewResponse)
async def update_interview(
    interview_id: UUID,
    update_data: InterviewUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """
    Update an interview.
    Only the assigned interviewer or an admin can update.
    """
    if current_user.role not in [UserRole.SYSTEM_ADMIN, UserRole.HR]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators and HR can update interviews",
        )

    try:
        query = select(Interview).filter(
            and_(
                Interview.id == interview_id,
                Interview.company_id == current_user.company_id,
            )
        )
        result = await session.execute(query)
        interview = result.scalar_one_or_none()

        if not interview:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found",
            )

        if update_data.scheduled_time:
            interview.scheduled_time = update_data.scheduled_time
        if update_data.status:
            interview.status = update_data.status

        await session.commit()
        await session.refresh(interview)
        return interview
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating interview: {str(e)}",
        )


@router.post("/{interview_id}/cancel")
async def cancel_interview(
    interview_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """
    Cancel an interview.
    """
    try:
        query = select(Interview).filter(
            and_(
                Interview.id == interview_id,
                Interview.company_id == current_user.company_id,
            )
        )
        result = await session.execute(query)
        interview = result.scalar_one_or_none()

        if not interview:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found",
            )

        interview.status = InterviewStatus.CANCELED
        await session.commit()
        await session.refresh(interview)
        return {"status": "cancelled", "interview": interview}
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error cancelling interview: {str(e)}",
        )


@router.post("/{interview_id}/start")
async def start_interview(
    interview_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """
    Mark an interview as started.
    """
    try:
        query = select(Interview).filter(
            and_(
                Interview.id == interview_id,
                Interview.company_id == current_user.company_id,
            )
        )
        result = await session.execute(query)
        interview = result.scalar_one_or_none()

        if not interview:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found",
            )

        interview.status = InterviewStatus.IN_PROGRESS
        await session.commit()
        await session.refresh(interview)
        return {"status": "started", "interview": interview}
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error starting interview: {str(e)}",
        )


@router.post("/{interview_id}/complete")
async def complete_interview(
    interview_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """
    Mark an interview as completed.
    """
    try:
        query = select(Interview).filter(
            and_(
                Interview.id == interview_id,
                Interview.company_id == current_user.company_id,
            )
        )
        result = await session.execute(query)
        interview = result.scalar_one_or_none()

        if not interview:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found",
            )

        interview.status = InterviewStatus.COMPLETED
        await session.commit()
        await session.refresh(interview)
        return {"status": "completed", "interview": interview}
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error completing interview: {str(e)}",
        )
