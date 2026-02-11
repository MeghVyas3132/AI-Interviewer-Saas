"""Reset interview for testing"""
import asyncio

async def reset():
    from sqlalchemy import text
    from app.core.database import async_session_maker
    async with async_session_maker() as db:
        await db.execute(text(
            "UPDATE interviews SET status = 'SCHEDULED', behavior_score = NULL, confidence_score = NULL, answer_score = NULL, ai_verdict = NULL, ai_recommendation = NULL, transcript = NULL WHERE id = '375812fe-bf30-41e7-8dc7-abd0b0e17c23'"
        ))
        await db.execute(text(
            "UPDATE candidates SET status = 'interview_scheduled' WHERE id = 'a8a93e87-3804-46c2-92cd-74483bac21fa'"
        ))
        await db.commit()
        
        r = await db.execute(text("SELECT status FROM interviews LIMIT 1"))
        print('Interview status:', r.fetchone()[0])
        r2 = await db.execute(text("SELECT status FROM candidates LIMIT 1"))
        print('Candidate status:', r2.fetchone()[0])
        print('Reset complete')

asyncio.run(reset())
