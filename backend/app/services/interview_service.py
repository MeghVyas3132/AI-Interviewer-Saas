"""
Interview service for interview management operations.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.candidate import Interview, InterviewStatus
from app.schemas.interview_schema import InterviewCreate, InterviewUpdate


class InterviewService:
    """Service for interview management operations."""

    @staticmethod
    async def create_interview(
        session: AsyncSession,
        company_id: UUID,
        candidate_id: UUID,
        scheduled_by: UUID,
        interview_data: InterviewCreate,
    ) -> Interview:
        """
        Create a new interview.

        Args:
            session: Database session
            company_id: Company ID
            candidate_id: Candidate user ID
            scheduled_by: User ID who scheduled the interview
            interview_data: Interview creation data

        Returns:
            Created interview
        """
        interview = Interview(
            company_id=company_id,
            candidate_id=candidate_id,
            scheduled_by=scheduled_by,
            interviewer_id=interview_data.interviewer_id,
            scheduled_at=interview_data.scheduled_at,
            notes=interview_data.notes,
        )

        session.add(interview)
        await session.flush()
        return interview

    @staticmethod
    async def get_interview_by_id(
        session: AsyncSession,
        interview_id: UUID,
    ) -> Optional[Interview]:
        """
        Get interview by ID.

        Args:
            session: Database session
            interview_id: Interview ID

        Returns:
            Interview or None if not found
        """
        result = await session.execute(
            select(Interview).where(Interview.id == interview_id),
        )
        return result.scalars().first()

    @staticmethod
    async def get_company_interviews(
        session: AsyncSession,
        company_id: UUID,
        skip: int = 0,
        limit: int = 20,
        status: Optional[InterviewStatus] = None,
        candidate_id: Optional[UUID] = None,
    ) -> List[Interview]:
        """
        Get interviews for a company.

        Args:
            session: Database session
            company_id: Company ID
            skip: Number of records to skip
            limit: Maximum number of records to return
            status: Optional status filter
            candidate_id: Optional candidate filter

        Returns:
            List of interviews
        """
        query = select(Interview).where(Interview.company_id == company_id)

        if status:
            query = query.where(Interview.status == status)

        if candidate_id:
            query = query.where(Interview.candidate_id == candidate_id)

        query = query.order_by(Interview.scheduled_at.desc())
        query = query.offset(skip).limit(limit)

        result = await session.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_candidate_interviews(
        session: AsyncSession,
        candidate_id: UUID,
        skip: int = 0,
        limit: int = 20,
    ) -> List[Interview]:
        """
        Get interviews for a specific candidate.

        Args:
            session: Database session
            candidate_id: Candidate ID
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            List of interviews
        """
        query = select(Interview).where(Interview.candidate_id == candidate_id)
        query = query.order_by(Interview.scheduled_at.desc())
        query = query.offset(skip).limit(limit)

        result = await session.execute(query)
        return result.scalars().all()

    @staticmethod
    async def update_interview(
        session: AsyncSession,
        interview_id: UUID,
        interview_data: InterviewUpdate,
    ) -> Optional[Interview]:
        """
        Update interview information.

        Args:
            session: Database session
            interview_id: Interview ID
            interview_data: Update data

        Returns:
            Updated interview or None if not found
        """
        interview = await InterviewService.get_interview_by_id(session, interview_id)
        if not interview:
            return None

        # Update fields if provided
        if interview_data.interviewer_id is not None:
            interview.interviewer_id = interview_data.interviewer_id
        if interview_data.scheduled_at is not None:
            interview.scheduled_at = interview_data.scheduled_at
        if interview_data.status is not None:
            interview.status = interview_data.status
        if interview_data.notes is not None:
            interview.notes = interview_data.notes
        if interview_data.recording_url is not None:
            interview.recording_url = interview_data.recording_url
        if interview_data.transcript_url is not None:
            interview.transcript_url = interview_data.transcript_url

        await session.flush()
        return interview

    @staticmethod
    async def cancel_interview(
        session: AsyncSession,
        interview_id: UUID,
    ) -> bool:
        """
        Cancel an interview.

        Args:
            session: Database session
            interview_id: Interview ID

        Returns:
            True if successful
        """
        interview = await InterviewService.get_interview_by_id(session, interview_id)
        if not interview:
            return False

        interview.status = InterviewStatus.CANCELLED
        await session.flush()
        return True

    @staticmethod
    async def start_interview(
        session: AsyncSession,
        interview_id: UUID,
    ) -> bool:
        """
        Mark interview as in progress.

        Args:
            session: Database session
            interview_id: Interview ID

        Returns:
            True if successful
        """
        interview = await InterviewService.get_interview_by_id(session, interview_id)
        if not interview:
            return False

        interview.status = InterviewStatus.IN_PROGRESS
        await session.flush()
        return True

    @staticmethod
    async def complete_interview(
        session: AsyncSession,
        interview_id: UUID,
        recording_url: Optional[str] = None,
        transcript_url: Optional[str] = None,
    ) -> bool:
        """
        Mark interview as completed.

        Args:
            session: Database session
            interview_id: Interview ID
            recording_url: Optional recording URL
            transcript_url: Optional transcript URL

        Returns:
            True if successful
        """
        interview = await InterviewService.get_interview_by_id(session, interview_id)
        if not interview:
            return False

        interview.status = InterviewStatus.COMPLETED
        if recording_url:
            interview.recording_url = recording_url
        if transcript_url:
            interview.transcript_url = transcript_url

        await session.flush()
        return True
