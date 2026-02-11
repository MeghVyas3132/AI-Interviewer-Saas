"""Check all interview rounds."""
import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as session:
        result = await session.execute(text("""
            SELECT ir.id, ir.status, ir.round_type,
                   c.full_name as candidate_name,
                   u.full_name as interviewer_name
            FROM interview_rounds ir
            LEFT JOIN candidates c ON ir.candidate_id = c.id
            LEFT JOIN users u ON ir.interviewer_id = u.id
            ORDER BY ir.created_at DESC
        """))
        rows = result.fetchall()
        print(f"All rounds: {len(rows)}")
        for r in rows:
            print(f"  {r[0]}: status={r[1]}, type={r[2]}, candidate={r[3]}, interviewer={r[4]}")
        
        # Check verdicts
        result = await session.execute(text("SELECT count(*) FROM human_verdicts"))
        count = result.scalar()
        print(f"\nVerdict count: {count}")

asyncio.run(main())
