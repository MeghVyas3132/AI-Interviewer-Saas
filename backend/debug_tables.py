import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def check():
    async with AsyncSessionLocal() as s:
        # Check which tables exist
        r = await s.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"))
        tables = [row[0] for row in r.fetchall()]
        print("All tables:")
        for t in tables:
            print(f"  {t}")
        
        # Check if human_verdicts exists
        print(f"\nhuman_verdicts exists: {'human_verdicts' in tables}")
        print(f"interview_rounds exists: {'interview_rounds' in tables}")
        print(f"interview_summaries exists: {'interview_summaries' in tables}")
        
        # Check alembic version
        try:
            r2 = await s.execute(text("SELECT version_num FROM alembic_version"))
            versions = [row[0] for row in r2.fetchall()]
            print(f"\nalembic versions: {versions}")
        except Exception as e:
            print(f"alembic error: {e}")

asyncio.run(check())
