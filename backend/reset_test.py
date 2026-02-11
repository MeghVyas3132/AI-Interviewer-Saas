"""Reset test data: delete verdict and restore candidate status."""
import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as s:
        # Delete the test verdict
        await s.execute(text("DELETE FROM human_verdicts WHERE round_id = '5b9fb22f-e1d0-42b5-83b0-b5b9a677deb9'"))
        
        # Reset candidate status back to ai_passed (pre-verdict state) 
        await s.execute(text("UPDATE candidates SET status = 'ai_passed' WHERE email = 'omi@gmail.com'"))
        
        await s.commit()
        
        # Verify
        r = await s.execute(text("SELECT status FROM candidates WHERE email='omi@gmail.com'"))
        print(f"Candidate reset to: {r.scalar()}")
        r = await s.execute(text("SELECT count(id) FROM human_verdicts"))
        print(f"Verdicts remaining: {r.scalar()}")

asyncio.run(main())
