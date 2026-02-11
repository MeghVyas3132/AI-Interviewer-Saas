"""Check candidate columns and status."""
import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as s:
        r = await s.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='candidates' ORDER BY ordinal_position"))
        cols = [row[0] for row in r.fetchall()]
        print("Candidate columns:", cols)
        
        r = await s.execute(text("SELECT id, status FROM candidates WHERE email='omi@gmail.com'"))
        row = r.fetchone()
        print(f"omi: id={row[0]}, status={row[1]}")
        
        r = await s.execute(text("SELECT count(id) FROM human_verdicts"))
        print(f"Verdicts: {r.scalar()}")

asyncio.run(main())
