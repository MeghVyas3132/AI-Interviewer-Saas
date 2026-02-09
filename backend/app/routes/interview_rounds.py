"""
Interview round scheduling routes with timezone support.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import get_current_user, require_employee, require_hr_or_employee
from app.models.user import User, UserRole
from app.schemas.interview_round_schema import (
    BatchRoundResponse,
    CandidateRoundProgressResponse,
    InterviewRoundCreate,
    InterviewRoundListResponse,
    InterviewRoundResponse,
    InterviewRoundUpdate,
    RescheduleRoundRequest,
    RoundScheduleRequest,
    RoundStatus,
    RoundType,
)
from app.services.audit_log_service import AuditLogService
from app.services.interview_round_service import InterviewRoundService

router = APIRouter(prefix="/api/v1/interview-rounds", tags=["interview-rounds"])


@router.post(
    "",
    response_model=InterviewRoundResponse,
    status_code=status.HTTP_201_CREATED,
)
async def schedule_interview_round(
    round_data: InterviewRoundCreate,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
) -> InterviewRoundResponse:
    """
    Schedule a new interview round with timezone support.

    Args:
        round_data: Round scheduling data (includes timezone)
        current_user: Current authenticated user
        session: Database session

    Returns:
        Created interview round
    """
    # Verify candidate belongs to the company
    from app.services.candidate_service import CandidateService

    # Use the CandidateService method that validates company scoping.
    # Previously this called a non-existent method `get_candidate_by_user_id`.
    candidate = await CandidateService.get_candidate_by_id(
        session, round_data.candidate_id, current_user.company_id
    )
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    round_obj = await InterviewRoundService.create_round(
        session,
        current_user.company_id,
        round_data.candidate_id,
        current_user.id,
        round_data,
    )

    # Log action
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "SCHEDULE_INTERVIEW_ROUND",
        resource_type="interview_round",
        resource_id=round_obj.id,
    )

    await session.commit()
    return round_obj


@router.post(
    "/batch-schedule",
    response_model=BatchRoundResponse,
    status_code=status.HTTP_201_CREATED,
)
async def batch_schedule_rounds(
    batch_data: RoundScheduleRequest,
    current_user: User = Depends(require_hr_or_employee),
    session: AsyncSession = Depends(get_db),
) -> BatchRoundResponse:
    """
    Schedule multiple interview rounds for a candidate.

    Args:
        batch_data: Batch scheduling data
        current_user: Current authenticated user
        session: Database session

    Returns:
        Batch scheduling results
    """
    # Verify candidate
    from app.services.candidate_service import CandidateService

    candidate = await CandidateService.get_candidate_by_user_id(session, batch_data.candidate_id)
    if not candidate or candidate.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    scheduled = []
    failed = []

    for round_data in batch_data.rounds:
        try:
            round_obj = await InterviewRoundService.create_round(
                session,
                current_user.company_id,
                batch_data.candidate_id,
                current_user.id,
                round_data,
            )
            scheduled.append(round_obj)
        except Exception as e:
            failed.append(
                {
                    "round_type": round_data.round_type,
                    "error": str(e),
                },
            )

    # Log batch action
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "BATCH_SCHEDULE_ROUNDS",
        resource_type="interview_round",
        details={"total": len(batch_data.rounds), "scheduled": len(scheduled), "failed": len(failed)},
    )

    await session.commit()

    return BatchRoundResponse(
        scheduled=scheduled,
        failed=failed,
        total_scheduled=len(scheduled),
        total_failed=len(failed),
    )


@router.get("", response_model=List[InterviewRoundListResponse])
async def list_rounds(
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
    round_type: str = Query(None, description="Filter by round type"),
    status_filter: str = Query(None, alias="status", description="Filter by status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> List[InterviewRoundListResponse]:
    """
    List interview rounds for the company.

    Args:
        current_user: Current authenticated user
        session: Database session
        round_type: Optional round type filter
        status_filter: Optional status filter
        skip: Records to skip
        limit: Max records to return

    Returns:
        List of interview rounds
    """
    # Parse filters
    rt = RoundType[round_type] if round_type else None
    st = RoundStatus[status_filter] if status_filter else None

    # Candidates see only their own rounds
    if current_user.role == UserRole.CANDIDATE:
        rounds = await InterviewRoundService.get_candidate_rounds(
            session,
            current_user.company_id,
            current_user.id,
            skip=skip,
            limit=limit,
            status=st,
        )
    else:
        rounds = await InterviewRoundService.get_company_rounds(
            session,
            current_user.company_id,
            skip=skip,
            limit=limit,
            round_type=rt,
            status=st,
        )

    return rounds


@router.get("/candidate/{candidate_id}/progress", response_model=CandidateRoundProgressResponse)
async def get_candidate_progress(
    candidate_id: UUID,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
) -> CandidateRoundProgressResponse:
    """
    Get candidate's interview round progress.

    Args:
        candidate_id: Candidate ID
        current_user: Current authenticated user
        session: Database session

    Returns:
        Candidate progress
    """
    # Verify candidate
    from app.services.candidate_service import CandidateService

    candidate = await CandidateService.get_candidate_by_user_id(session, candidate_id)
    if not candidate or candidate.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    progress = await InterviewRoundService.get_candidate_round_progress(
        session,
        current_user.company_id,
        candidate_id,
    )

    return CandidateRoundProgressResponse(**progress)


@router.get("/{round_id}", response_model=InterviewRoundResponse)
async def get_round(
    round_id: UUID,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
) -> InterviewRoundResponse:
    """
    Get interview round details.

    Args:
        round_id: Round ID
        current_user: Current authenticated user
        session: Database session

    Returns:
        Interview round details
    """
    round_obj = await InterviewRoundService.get_round_by_id(session, round_id)
    if not round_obj or round_obj.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Round not found",
        )

    # Candidates can only view their own rounds
    if current_user.role == UserRole.CANDIDATE and round_obj.candidate_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access round",
        )

    return round_obj


@router.put("/{round_id}", response_model=InterviewRoundResponse)
async def update_round(
    round_id: UUID,
    round_data: InterviewRoundUpdate,
    current_user: User = Depends(require_hr_or_employee),
    session: AsyncSession = Depends(get_db),
) -> InterviewRoundResponse:
    """
    Update interview round details.

    Args:
        round_id: Round ID
        round_data: Update data
        current_user: Current authenticated user
        session: Database session

    Returns:
        Updated round
    """
    round_obj = await InterviewRoundService.get_round_by_id(session, round_id)
    if not round_obj or round_obj.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Round not found",
        )

    updated_round = await InterviewRoundService.update_round(session, round_id, round_data)

    # Log update
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "UPDATE_INTERVIEW_ROUND",
        resource_type="interview_round",
        resource_id=round_id,
    )

    await session.commit()
    return updated_round


@router.post("/{round_id}/reschedule", response_model=InterviewRoundResponse)
async def reschedule_round(
    round_id: UUID,
    reschedule_data: RescheduleRoundRequest,
    current_user: User = Depends(require_hr_or_employee),
    session: AsyncSession = Depends(get_db),
) -> InterviewRoundResponse:
    """
    Reschedule an interview round with timezone support.

    Args:
        round_id: Round ID
        reschedule_data: Reschedule data (new datetime and timezone)
        current_user: Current authenticated user
        session: Database session

    Returns:
        Rescheduled round
    """
    round_obj = await InterviewRoundService.get_round_by_id(session, round_id)
    if not round_obj or round_obj.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Round not found",
        )

    rescheduled_round = await InterviewRoundService.reschedule_round(
        session,
        round_id,
        reschedule_data.scheduled_at,
        reschedule_data.timezone,
    )

    # Log action
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "RESCHEDULE_INTERVIEW_ROUND",
        resource_type="interview_round",
        resource_id=round_id,
        details={"reason": reschedule_data.reason},
    )

    await session.commit()
    return rescheduled_round


@router.post("/{round_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_round(
    round_id: UUID,
    current_user: User = Depends(require_hr_or_employee),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """
    Cancel an interview round.

    Args:
        round_id: Round ID
        current_user: Current authenticated user
        session: Database session

    Returns:
        Success message
    """
    round_obj = await InterviewRoundService.get_round_by_id(session, round_id)
    if not round_obj or round_obj.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Round not found",
        )

    await InterviewRoundService.cancel_round(session, round_id)

    # Log action
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "CANCEL_INTERVIEW_ROUND",
        resource_type="interview_round",
        resource_id=round_id,
    )

    await session.commit()
    return {"message": "Interview round cancelled successfully"}


@router.post("/{round_id}/start", status_code=status.HTTP_200_OK)
async def start_round(
    round_id: UUID,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """
    Mark an interview round as in progress.

    Args:
        round_id: Round ID
        current_user: Current authenticated user
        session: Database session

    Returns:
        Success message
    """
    round_obj = await InterviewRoundService.get_round_by_id(session, round_id)
    if not round_obj or round_obj.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Round not found",
        )

    # Update status
    from app.schemas.interview_round_schema import InterviewRoundUpdate

    await InterviewRoundService.update_round(
        session,
        round_id,
        InterviewRoundUpdate(status=RoundStatus.IN_PROGRESS),
    )

    # Log action
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "START_INTERVIEW_ROUND",
        resource_type="interview_round",
        resource_id=round_id,
    )

    await session.commit()
    return {"message": "Interview round started"}


@router.post("/{round_id}/complete", status_code=status.HTTP_200_OK)
async def complete_round(
    round_id: UUID,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """
    Mark an interview round as completed.

    Args:
        round_id: Round ID
        current_user: Current authenticated user
        session: Database session

    Returns:
        Success message
    """
    round_obj = await InterviewRoundService.get_round_by_id(session, round_id)
    if not round_obj or round_obj.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Round not found",
        )

    await InterviewRoundService.complete_round(session, round_id)

    # Log action
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "COMPLETE_INTERVIEW_ROUND",
        resource_type="interview_round",
        resource_id=round_id,
    )

    await session.commit()
    return {"message": "Interview round marked as complete"}


@router.get("/interviewer/{interviewer_id}/schedule", response_model=List[InterviewRoundListResponse])
async def get_interviewer_schedule(
    interviewer_id: UUID,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
) -> List[InterviewRoundListResponse]:
    """
    Get interview schedule for an interviewer.

    Args:
        interviewer_id: Interviewer user ID
        current_user: Current authenticated user
        session: Database session

    Returns:
        List of scheduled rounds for interviewer
    """
    schedule = await InterviewRoundService.get_interviewer_schedule(
        session,
        current_user.company_id,
        interviewer_id,
    )

    return schedule


@router.get("/company/upcoming", response_model=List[InterviewRoundListResponse])
async def get_upcoming_rounds(
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
    days_ahead: int = Query(7, ge=1, le=90),
) -> List[InterviewRoundListResponse]:
    """
    Get upcoming interview rounds for the company.

    Args:
        current_user: Current authenticated user
        session: Database session
        days_ahead: Number of days to look ahead

    Returns:
        List of upcoming rounds
    """
    rounds = await InterviewRoundService.get_upcoming_rounds(
        session,
        current_user.company_id,
        days_ahead,
    )

    return rounds
