"""Check rounds and verdicts."""
import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as session:
        r = await session.execute(text(
            "SELECT id, status, round_type, candidate_id, interviewer_id FROM interview_rounds ORDER BY created_at DESC"
        ))
        rows = r.fetchall()
        print(f"Rounds: {len(rows)}")
        for row in rows:
            print(f"  {row[0]}: status={row[1]}, type={row[2]}, cand={row[3]}, int={row[4]}")
        
        r = await session.execute(text("SELECT count(id) FROM human_verdicts"))
        print(f"Verdicts: {r.scalar()}")

asyncio.run(main())
