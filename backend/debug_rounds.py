import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def check():
    async with AsyncSessionLocal() as s:
        # Check interview_rounds table exists and has data
        try:
            r = await s.execute(text("SELECT id, candidate_id, interviewer_id, company_id, status, round_type FROM interview_rounds LIMIT 10"))
            rows = r.fetchall()
            if rows:
                for row in rows:
                    print(f"Round: {row[0]} | cand={row[1]} | interviewer={row[2]} | company={row[3]} | status={row[4]} | type={row[5]}")
            else:
                print("NO interview_rounds found")
        except Exception as e:
            print(f"interview_rounds table error: {e}")

        # Check human_rounds table
        try:
            r2 = await s.execute(text("SELECT id, candidate_id, interviewer_id, company_id, status, round_type FROM human_rounds LIMIT 10"))
            rows2 = r2.fetchall()
            if rows2:
                print("\n--- human_rounds ---")
                for row in rows2:
                    print(f"Round: {row[0]} | cand={row[1]} | interviewer={row[2]} | company={row[3]} | status={row[4]} | type={row[5]}")
            else:
                print("\nNO human_rounds found")
        except Exception as e:
            print(f"human_rounds table error: {e}")

        # Check human_verdicts table
        try:
            r3 = await s.execute(text("SELECT id, round_id, decision FROM human_verdicts LIMIT 10"))
            rows3 = r3.fetchall()
            print(f"\nhuman_verdicts: {len(rows3)} rows")
            for row in rows3:
                print(f"  Verdict: {row[0]} | round={row[1]} | decision={row[2]}")
        except Exception as e:
            print(f"human_verdicts table error: {e}")

        # List all tables
        r4 = await s.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"))
        tables = [row[0] for row in r4.fetchall()]
        print(f"\nAll tables: {tables}")

asyncio.run(check())
