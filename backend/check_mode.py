"""Check interview round mode."""
import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as session:
        r = await session.execute(text(
            "SELECT id, status, round_type, interview_mode, interviewer_id FROM interview_rounds"
        ))
        for row in r.fetchall():
            print(f"Round: id={row[0]}, status={row[1]}, type={row[2]}, mode={row[3]}, interviewer={row[4]}")

        # Check InterviewMode enum values
        from app.models.interview_round import InterviewMode
        print(f"\nInterviewMode values: {[m.value for m in InterviewMode]}")

asyncio.run(main())
