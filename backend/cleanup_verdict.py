"""Clean up the test verdict so the round can be tested from the frontend."""
import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as session:
        # Check existing verdicts
        result = await session.execute(text("""
            SELECT hv.id, hv.round_id, hv.interviewer_id, hv.decision, hv.submitted_at
            FROM human_verdicts hv
        """))
        rows = result.fetchall()
        print(f"Existing verdicts: {len(rows)}")
        for r in rows:
            print(f"  Verdict {r[0]}: round={r[1]}, decision={r[3]}, submitted_at={r[4]}")
        
        # Delete the test verdict for round 5b9fb22f
        result = await session.execute(text("""
            DELETE FROM human_verdicts 
            WHERE round_id = '5b9fb22f-e1d0-42b5-83b0-b5b9a677deb9'
            RETURNING id
        """))
        deleted = result.fetchall()
        await session.commit()
        print(f"\nDeleted {len(deleted)} test verdict(s)")
        
        # Also list all interview rounds for reference
        result = await session.execute(text("""
            SELECT ir.id, ir.status, ir.round_type,
                   c.full_name as candidate_name,
                   u.full_name as interviewer_name
            FROM interview_rounds ir
            LEFT JOIN candidates c ON ir.candidate_id = c.id
            LEFT JOIN users u ON ir.interviewer_id = u.id
            WHERE ir.company_id = '9eb540bb-fae3-4ff6-8d0e-d410c6d1e710'
        """))
        rounds = result.fetchall()
        print(f"\nAll rounds for ZTA company: {len(rounds)}")
        for r in rounds:
            print(f"  Round {r[0]}: status={r[1]}, type={r[2]}, candidate={r[3]}, interviewer={r[4]}")

asyncio.run(main())
