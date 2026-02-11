"""Post-test check: verify candidate status was updated after verdict."""
import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as s:
        r = await s.execute(text("SELECT id, status, email FROM candidates WHERE email='omi@gmail.com'"))
        row = r.fetchone()
        print(f"Candidate AFTER verdict: id={row[0]}, status={row[1]}, email={row[2]}")
        
        r = await s.execute(text("SELECT id, decision, overall_rating, submitted_at FROM human_verdicts"))
        rows = r.fetchall()
        print(f"Verdicts: {len(rows)}")
        for v in rows:
            print(f"  Verdict {v[0]}: decision={v[1]}, rating={v[2]}, at={v[3]}")

asyncio.run(main())
