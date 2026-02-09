"""
Score service for interview scoring operations.
"""

from typing import List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.score import Score
from app.schemas.score_schema import ScoreCreate, ScoreUpdate


class ScoreService:
    """Service for interview scoring operations."""

    @staticmethod
    async def create_score(
        session: AsyncSession,
        interview_id: UUID,
        score_data: ScoreCreate,
    ) -> Score:
        """
        Create a new score record.

        Args:
            session: Database session
            interview_id: Interview ID
            score_data: Score creation data

        Returns:
            Created score
        """
        # Calculate overall score if individual scores are provided
        overall = None
        if score_data.communication is not None or score_data.technical is not None or score_data.behaviour is not None:
            scores = []
            if score_data.communication is not None:
                scores.append(score_data.communication)
            if score_data.technical is not None:
                scores.append(score_data.technical)
            if score_data.behaviour is not None:
                scores.append(score_data.behaviour)
            if scores:
                overall = sum(scores) / len(scores)

        # Determine pass recommendation based on overall score
        pass_recommendation = None
        if overall is not None:
            pass_recommendation = overall >= 70

        score = Score(
            interview_id=interview_id,
            communication=score_data.communication,
            technical=score_data.technical,
            behaviour=score_data.behaviour,
            overall=overall,
            pass_recommendation=pass_recommendation,
            evaluator_notes=score_data.evaluator_notes,
        )

        session.add(score)
        await session.flush()
        return score

    @staticmethod
    async def get_score_by_id(
        session: AsyncSession,
        score_id: UUID,
    ) -> Optional[Score]:
        """
        Get score by ID.

        Args:
            session: Database session
            score_id: Score ID

        Returns:
            Score or None if not found
        """
        result = await session.execute(
            select(Score).where(Score.id == score_id),
        )
        return result.scalars().first()

    @staticmethod
    async def get_score_by_interview_id(
        session: AsyncSession,
        interview_id: UUID,
    ) -> Optional[Score]:
        """
        Get score for an interview.

        Args:
            session: Database session
            interview_id: Interview ID

        Returns:
            Score or None if not found
        """
        result = await session.execute(
            select(Score).where(Score.interview_id == interview_id),
        )
        return result.scalars().first()

    @staticmethod
    async def update_score(
        session: AsyncSession,
        score_id: UUID,
        score_data: ScoreUpdate,
    ) -> Optional[Score]:
        """
        Update score information.

        Args:
            session: Database session
            score_id: Score ID
            score_data: Update data

        Returns:
            Updated score or None if not found
        """
        score = await ScoreService.get_score_by_id(session, score_id)
        if not score:
            return None

        # Update fields if provided
        if score_data.communication is not None:
            score.communication = score_data.communication
        if score_data.technical is not None:
            score.technical = score_data.technical
        if score_data.behaviour is not None:
            score.behaviour = score_data.behaviour
        if score_data.evaluator_notes is not None:
            score.evaluator_notes = score_data.evaluator_notes
        if score_data.pass_recommendation is not None:
            score.pass_recommendation = score_data.pass_recommendation

        # Recalculate overall score
        scores = []
        if score.communication is not None:
            scores.append(score.communication)
        if score.technical is not None:
            scores.append(score.technical)
        if score.behaviour is not None:
            scores.append(score.behaviour)
        if scores:
            score.overall = sum(scores) / len(scores)

        await session.flush()
        return score
