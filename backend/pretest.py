"""Pre-test check: candidate status and verdict count."""
import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as s:
        r = await s.execute(text("SELECT id, status, current_round FROM candidates WHERE email='omi@gmail.com'"))
        row = r.fetchone()
        print(f"Candidate before: id={row[0]}, status={row[1]}, round={row[2]}")
        
        r = await s.execute(text("SELECT count(id) FROM human_verdicts"))
        print(f"Existing verdicts: {r.scalar()}")

asyncio.run(main())
