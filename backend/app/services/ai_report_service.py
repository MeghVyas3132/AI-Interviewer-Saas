from sqlalchemy.ext.asyncio import AsyncSession
from app.models.ai_report import AIReport


class AIReportService:
    @staticmethod
    async def create_report(
        session: AsyncSession,
        company_id,
        report_type: str,
        provider_response: dict | None = None,
        candidate_id: str | None = None,
        interview_id: str | None = None,
        score: float | None = None,
        summary: str | None = None,
        created_by: str | None = None,
    ) -> AIReport:
        report = AIReport(
            company_id=company_id,
            candidate_id=candidate_id,
            interview_id=interview_id,
            report_type=report_type,
            score=score,
            summary=summary,
            provider_response=provider_response,
            created_by=created_by,
        )
        session.add(report)
        await session.flush()
        return report
