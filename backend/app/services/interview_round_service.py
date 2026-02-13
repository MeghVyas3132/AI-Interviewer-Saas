"""
Interview round service with timezone-aware scheduling.
"""

from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID
from zoneinfo import ZoneInfo
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.sql import and_

from app.models.interview_round import InterviewRound, RoundStatus, RoundType
from app.schemas.interview_round_schema import InterviewRoundCreate, InterviewRoundUpdate


class InterviewRoundService:
    """Service for interview round scheduling with timezone support."""

    @staticmethod
    def convert_to_utc(dt: datetime, timezone_str: str) -> datetime:
        """
        Convert datetime from specific timezone to UTC.

        Args:
            dt: Datetime to convert
            timezone_str: Timezone string (e.g., 'America/New_York')

        Returns:
            UTC datetime
        """
        try:
            # If dt is naive, localize it to the given timezone first
            if dt.tzinfo is None:
                tz = ZoneInfo(timezone_str)
                dt = dt.replace(tzinfo=tz)
            else:
                # If dt is already aware, convert to specified timezone first, then to UTC
                tz = ZoneInfo(timezone_str)
                dt = dt.astimezone(tz)

            # Convert to UTC
            return dt.astimezone(timezone.utc)
        except Exception as e:
            raise ValueError(f"Invalid timezone: {timezone_str}. Error: {str(e)}")

    @staticmethod
    def convert_from_utc(dt: datetime, timezone_str: str) -> datetime:
        """
        Convert datetime from UTC to specific timezone.

        Args:
            dt: UTC datetime
            timezone_str: Target timezone string

        Returns:
            Datetime in specified timezone
        """
        try:
            tz = ZoneInfo(timezone_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(tz)
        except Exception as e:
            raise ValueError(f"Invalid timezone: {timezone_str}. Error: {str(e)}")

    @staticmethod
    async def create_round(
        session: AsyncSession,
        company_id: UUID,
        candidate_id: UUID,
        created_by: UUID,
        round_data: InterviewRoundCreate,
    ) -> InterviewRound:
        """
        Create a new interview round with timezone support.

        Args:
            session: Database session
            company_id: Company ID
            candidate_id: Candidate ID
            created_by: User ID who created the round
            round_data: Round creation data

        Returns:
            Created interview round
        """
        # Convert scheduled_at to UTC for storage
        utc_scheduled_at = InterviewRoundService.convert_to_utc(
            round_data.scheduled_at,
            round_data.timezone,
        )

        round_obj = InterviewRound(
            company_id=company_id,
            candidate_id=candidate_id,
            round_type=round_data.round_type,
            interviewer_id=round_data.interviewer_id,
            scheduled_at=utc_scheduled_at,
            timezone=round_data.timezone,
            duration_minutes=round_data.duration_minutes,
            notes=round_data.notes,
            created_by=created_by,
        )

        session.add(round_obj)
        await session.flush()
        return round_obj

    @staticmethod
    async def get_round_by_id(
        session: AsyncSession,
        round_id: UUID,
    ) -> Optional[InterviewRound]:
        """
        Get interview round by ID.

        Args:
            session: Database session
            round_id: Round ID

        Returns:
            Interview round or None
        """
        result = await session.execute(
            select(InterviewRound).where(InterviewRound.id == round_id),
        )
        return result.scalars().first()

    @staticmethod
    async def get_candidate_rounds(
        session: AsyncSession,
        company_id: UUID,
        candidate_id: UUID,
        skip: int = 0,
        limit: int = 20,
        status: Optional[RoundStatus] = None,
    ) -> List[InterviewRound]:
        """
        Get all rounds for a candidate.

        Args:
            session: Database session
            company_id: Company ID
            candidate_id: Candidate ID
            skip: Number of records to skip
            limit: Maximum records to return
            status: Optional status filter

        Returns:
            List of interview rounds
        """
        query = select(InterviewRound).where(
            and_(
                InterviewRound.company_id == company_id,
                InterviewRound.candidate_id == candidate_id,
            ),
        )

        if status:
            query = query.where(InterviewRound.status == status)

        query = query.order_by(InterviewRound.scheduled_at.asc())
        query = query.offset(skip).limit(limit)

        result = await session.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_company_rounds(
        session: AsyncSession,
        company_id: UUID,
        skip: int = 0,
        limit: int = 20,
        round_type: Optional[RoundType] = None,
        status: Optional[RoundStatus] = None,
        interviewer_id: Optional[UUID] = None,
    ) -> List[InterviewRound]:
        """
        Get all rounds for a company.

        Args:
            session: Database session
            company_id: Company ID
            skip: Number of records to skip
            limit: Maximum records to return
            round_type: Optional round type filter
            status: Optional status filter
            interviewer_id: Optional interviewer filter

        Returns:
            List of interview rounds
        """
        query = select(InterviewRound).where(InterviewRound.company_id == company_id)

        if round_type:
            query = query.where(InterviewRound.round_type == round_type)

        if status:
            query = query.where(InterviewRound.status == status)

        if interviewer_id:
            query = query.where(InterviewRound.interviewer_id == interviewer_id)

        query = query.order_by(InterviewRound.scheduled_at.asc())
        query = query.offset(skip).limit(limit)

        result = await session.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_upcoming_rounds(
        session: AsyncSession,
        company_id: UUID,
        days_ahead: int = 7,
    ) -> List[InterviewRound]:
        """
        Get upcoming rounds for the next N days.

        Args:
            session: Database session
            company_id: Company ID
            days_ahead: Number of days to look ahead

        Returns:
            List of upcoming interview rounds
        """
        now = datetime.now(timezone.utc)
        future = now + timedelta(days=days_ahead)

        query = select(InterviewRound).where(
            and_(
                InterviewRound.company_id == company_id,
                InterviewRound.status == RoundStatus.SCHEDULED,
                InterviewRound.scheduled_at >= now,
                InterviewRound.scheduled_at <= future,
            ),
        )

        query = query.order_by(InterviewRound.scheduled_at.asc())
        result = await session.execute(query)
        return result.scalars().all()

    @staticmethod
    async def update_round(
        session: AsyncSession,
        round_id: UUID,
        round_data: InterviewRoundUpdate,
    ) -> Optional[InterviewRound]:
        """
        Update interview round.

        Args:
            session: Database session
            round_id: Round ID
            round_data: Update data

        Returns:
            Updated round or None
        """
        round_obj = await InterviewRoundService.get_round_by_id(session, round_id)
        if not round_obj:
            return None

        if round_data.round_type is not None:
            round_obj.round_type = round_data.round_type

        if round_data.interviewer_id is not None:
            round_obj.interviewer_id = round_data.interviewer_id

        if round_data.scheduled_at is not None:
            timezone = round_data.timezone or round_obj.timezone
            utc_scheduled_at = InterviewRoundService.convert_to_utc(
                round_data.scheduled_at,
                timezone,
            )
            round_obj.scheduled_at = utc_scheduled_at

        if round_data.timezone is not None:
            round_obj.timezone = round_data.timezone

        if round_data.duration_minutes is not None:
            round_obj.duration_minutes = round_data.duration_minutes

        if round_data.status is not None:
            round_obj.status = round_data.status

        if round_data.notes is not None:
            round_obj.notes = round_data.notes

        await session.flush()
        return round_obj

    @staticmethod
    async def reschedule_round(
        session: AsyncSession,
        round_id: UUID,
        new_scheduled_at: datetime,
        timezone: Optional[str] = None,
    ) -> Optional[InterviewRound]:
        """
        Reschedule an interview round.

        Args:
            session: Database session
            round_id: Round ID
            new_scheduled_at: New scheduled datetime
            timezone: Timezone for the new time

        Returns:
            Updated round or None
        """
        round_obj = await InterviewRoundService.get_round_by_id(session, round_id)
        if not round_obj:
            return None

        tz = timezone or round_obj.timezone
        utc_scheduled_at = InterviewRoundService.convert_to_utc(new_scheduled_at, tz)

        round_obj.scheduled_at = utc_scheduled_at
        round_obj.timezone = tz
        round_obj.status = RoundStatus.RESCHEDULED

        await session.flush()
        return round_obj

    @staticmethod
    async def cancel_round(
        session: AsyncSession,
        round_id: UUID,
    ) -> bool:
        """
        Cancel an interview round.

        Args:
            session: Database session
            round_id: Round ID

        Returns:
            True if successful
        """
        round_obj = await InterviewRoundService.get_round_by_id(session, round_id)
        if not round_obj:
            return False

        round_obj.status = RoundStatus.CANCELLED
        await session.flush()
        return True

    @staticmethod
    async def complete_round(
        session: AsyncSession,
        round_id: UUID,
    ) -> bool:
        """
        Mark an interview round as completed.

        Args:
            session: Database session
            round_id: Round ID

        Returns:
            True if successful
        """
        round_obj = await InterviewRoundService.get_round_by_id(session, round_id)
        if not round_obj:
            return False

        round_obj.status = RoundStatus.COMPLETED
        await session.flush()
        return True

    @staticmethod
    async def get_candidate_round_progress(
        session: AsyncSession,
        company_id: UUID,
        candidate_id: UUID,
    ) -> dict:
        """
        Get candidate's interview round progress.

        Args:
            session: Database session
            company_id: Company ID
            candidate_id: Candidate ID

        Returns:
            Progress dictionary with round stats
        """
        rounds = await InterviewRoundService.get_candidate_rounds(
            session,
            company_id,
            candidate_id,
            limit=1000,
        )

        completed = [r for r in rounds if r.status == RoundStatus.COMPLETED]
        pending = [r for r in rounds if r.status == RoundStatus.SCHEDULED]
        cancelled = [r for r in rounds if r.status == RoundStatus.CANCELLED]

        next_round = None
        if pending:
            next_round = min(pending, key=lambda x: x.scheduled_at)

        return {
            "candidate_id": candidate_id,
            "total_rounds": len(rounds),
            "completed_rounds": len(completed),
            "pending_rounds": len(pending),
            "cancelled_rounds": len(cancelled),
            "rounds": rounds,
            "next_round": next_round,
        }

    @staticmethod
    async def get_interviewer_schedule(
        session: AsyncSession,
        company_id: UUID,
        interviewer_id: UUID,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> List[InterviewRound]:
        """
        Get interview schedule for an interviewer.

        Args:
            session: Database session
            company_id: Company ID
            interviewer_id: Interviewer ID
            start_date: Optional start date filter
            end_date: Optional end date filter

        Returns:
            List of rounds assigned to interviewer
        """
        query = select(InterviewRound).where(
            and_(
                InterviewRound.company_id == company_id,
                InterviewRound.interviewer_id == interviewer_id,
                InterviewRound.status.in_([RoundStatus.SCHEDULED, RoundStatus.IN_PROGRESS]),
            ),
        )

        if start_date:
            query = query.where(InterviewRound.scheduled_at >= start_date)

        if end_date:
            query = query.where(InterviewRound.scheduled_at <= end_date)

        query = query.order_by(InterviewRound.scheduled_at.asc())
        result = await session.execute(query)
        return result.scalars().all()
