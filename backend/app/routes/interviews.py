"""
Interview management routes.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import (
    get_current_user,
    require_employee,
    require_team_lead,
)
from app.models.user import User, UserRole
from app.schemas.interview_schema import (
    InterviewCreate,
    InterviewListResponse,
    InterviewResponse,
    InterviewUpdate,
)
from app.services.audit_log_service import AuditLogService
from app.services.interview_service import InterviewService

router = APIRouter(prefix="/api/v1/interviews", tags=["interviews"])


@router.post(
    "",
    response_model=InterviewResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_interview(
    interview_data: InterviewCreate,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
) -> InterviewResponse:
    """
    Create a new interview (Employee and above).

    Args:
        interview_data: Interview creation data
        current_user: Current authenticated user
        session: Database session

    Returns:
        Created interview
    """
    interview = await InterviewService.create_interview(
        session,
        current_user.company_id,
        interview_data.candidate_id,
        current_user.id,
        interview_data,
    )

    # Log interview creation
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "CREATE_INTERVIEW",
        resource_type="interview",
        resource_id=interview.id,
    )

    await session.commit()
    return interview


@router.get("", response_model=List[InterviewListResponse])
async def list_interviews(
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> List[InterviewListResponse]:
    """
    List interviews.

    Candidates see only their own, others see company's interviews.

    Args:
        current_user: Current authenticated user
        session: Database session
        skip: Number of records to skip
        limit: Maximum number of records

    Returns:
        List of interviews
    """
    # Candidates see only their own interviews
    if current_user.role == UserRole.CANDIDATE:
        interviews = await InterviewService.get_candidate_interviews(
            session,
            current_user.id,
            skip=skip,
            limit=limit,
        )
    else:
        # Employees and above see all company interviews
        interviews = await InterviewService.get_company_interviews(
            session,
            current_user.company_id,
            skip=skip,
            limit=limit,
        )

    return interviews


@router.get("/{interview_id}", response_model=InterviewResponse)
async def get_interview(
    interview_id: UUID,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
) -> InterviewResponse:
    """
    Get interview by ID.

    Args:
        interview_id: Interview ID
        current_user: Current authenticated user
        session: Database session

    Returns:
        Interview details
    """
    interview = await InterviewService.get_interview_by_id(session, interview_id)
    if not interview or interview.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    # Candidates can only view their own interviews
    if current_user.role == UserRole.CANDIDATE and interview.candidate_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access interview",
        )

    return interview


@router.put("/{interview_id}", response_model=InterviewResponse)
async def update_interview(
    interview_id: UUID,
    interview_data: InterviewUpdate,
    current_user: User = Depends(require_team_lead),
    session: AsyncSession = Depends(get_db),
) -> InterviewResponse:
    """
    Update interview information (Team Lead and above).

    Args:
        interview_id: Interview ID
        interview_data: Update data
        current_user: Current authenticated user
        session: Database session

    Returns:
        Updated interview
    """
    interview = await InterviewService.get_interview_by_id(session, interview_id)
    if not interview or interview.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    interview = await InterviewService.update_interview(
        session,
        interview_id,
        interview_data,
    )

    # Log update action
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "UPDATE_INTERVIEW",
        resource_type="interview",
        resource_id=interview_id,
    )

    await session.commit()
    return interview


@router.post("/{interview_id}/cancel")
async def cancel_interview(
    interview_id: UUID,
    current_user: User = Depends(require_team_lead),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """
    Cancel an interview (Team Lead and above).

    Args:
        interview_id: Interview ID
        current_user: Current authenticated user
        session: Database session

    Returns:
        Success message
    """
    interview = await InterviewService.get_interview_by_id(session, interview_id)
    if not interview or interview.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    await InterviewService.cancel_interview(session, interview_id)

    # Log cancellation
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "CANCEL_INTERVIEW",
        resource_type="interview",
        resource_id=interview_id,
    )

    await session.commit()
    return {"message": "Interview cancelled successfully"}


@router.post("/{interview_id}/start")
async def start_interview(
    interview_id: UUID,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """
    Start an interview.

    Args:
        interview_id: Interview ID
        current_user: Current authenticated user
        session: Database session

    Returns:
        Success message
    """
    interview = await InterviewService.get_interview_by_id(session, interview_id)
    if not interview or interview.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    await InterviewService.start_interview(session, interview_id)

    # Log start action
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "START_INTERVIEW",
        resource_type="interview",
        resource_id=interview_id,
    )

    await session.commit()
    return {"message": "Interview started"}


@router.post("/{interview_id}/complete")
async def complete_interview(
    interview_id: UUID,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """
    Mark interview as complete.

    Args:
        interview_id: Interview ID
        current_user: Current authenticated user
        session: Database session

    Returns:
        Success message
    """
    interview = await InterviewService.get_interview_by_id(session, interview_id)
    if not interview or interview.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    await InterviewService.complete_interview(session, interview_id)

    # Log complete action
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "COMPLETE_INTERVIEW",
        resource_type="interview",
        resource_id=interview_id,
    )

    await session.commit()
    return {"message": "Interview marked as complete"}
