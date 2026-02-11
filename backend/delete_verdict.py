"""Delete test verdict."""
import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as s:
        await s.execute(text("DELETE FROM human_verdicts WHERE round_id = '5b9fb22f-e1d0-42b5-83b0-b5b9a677deb9'"))
        await s.commit()
        print("Cleaned up test verdict")

asyncio.run(main())
