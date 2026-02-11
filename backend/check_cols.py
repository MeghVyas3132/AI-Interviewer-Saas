"""Check users table columns."""
import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as s:
        r = await s.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position"))
        cols = [x[0] for x in r.fetchall()]
        print(f"users columns: {cols}")

asyncio.run(main())
