"""
Interview score routes.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import (
    get_current_user,
    require_employee,
)
from app.models.user import User, UserRole
from app.schemas.score_schema import (
    ScoreCreate,
    ScoreResponse,
    ScoreUpdate,
)
from app.services.audit_log_service import AuditLogService
from app.services.interview_service import InterviewService
from app.services.score_service import ScoreService

router = APIRouter(prefix="/api/v1/scores", tags=["scores"])


@router.post(
    "",
    response_model=ScoreResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_score(
    score_data: ScoreCreate,
    interview_id: UUID,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
) -> ScoreResponse:
    """
    Create a score for an interview (Employee and above).

    Args:
        score_data: Score creation data
        interview_id: Interview ID
        current_user: Current authenticated user
        session: Database session

    Returns:
        Created score
    """
    interview = await InterviewService.get_interview_by_id(session, interview_id)
    if not interview or interview.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    # Check if score already exists for this interview
    existing_score = await ScoreService.get_score_by_interview_id(
        session,
        interview_id,
    )
    if existing_score:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Score already exists for this interview",
        )

    score = await ScoreService.create_score(
        session,
        interview_id,
        score_data,
    )

    # Log score creation
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "CREATE_SCORE",
        resource_type="score",
        resource_id=score.id,
    )

    await session.commit()
    return score


@router.get("/{interview_id}", response_model=ScoreResponse)
async def get_score(
    interview_id: UUID,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
) -> ScoreResponse:
    """
    Get score for an interview.

    Args:
        interview_id: Interview ID
        current_user: Current authenticated user
        session: Database session

    Returns:
        Score details
    """
    interview = await InterviewService.get_interview_by_id(session, interview_id)
    if not interview or interview.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    # Candidates can only view their own interview scores
    if current_user.role == UserRole.CANDIDATE and interview.candidate_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access score",
        )

    score = await ScoreService.get_score_by_interview_id(session, interview_id)
    if not score:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Score not found",
        )

    return score


@router.put("/{score_id}", response_model=ScoreResponse)
async def update_score(
    score_id: UUID,
    score_data: ScoreUpdate,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
) -> ScoreResponse:
    """
    Update score information (Employee and above).

    Args:
        score_id: Score ID
        score_data: Update data
        current_user: Current authenticated user
        session: Database session

    Returns:
        Updated score
    """
    score = await ScoreService.get_score_by_id(session, score_id)
    if not score:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Score not found",
        )

    # Verify interview belongs to user's company
    interview = await InterviewService.get_interview_by_id(
        session,
        score.interview_id,
    )
    if not interview or interview.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update score",
        )

    score = await ScoreService.update_score(session, score_id, score_data)

    # Log update action
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "UPDATE_SCORE",
        resource_type="score",
        resource_id=score_id,
    )

    await session.commit()
    return score
