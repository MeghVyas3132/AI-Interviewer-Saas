import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from app.models.interview_round import InterviewRound

DATABASE_URL = 'postgresql+asyncpg://postgres:postgres@localhost:5432/ai_interviewer_db'

async def main():
    engine = create_async_engine(DATABASE_URL)
    async with AsyncSession(engine) as session:
        result = await session.execute(select(InterviewRound).order_by(InterviewRound.created_at.desc()))
        rounds = result.scalars().all()
        for r in rounds[:5]:
            mode = getattr(r, 'interview_mode', None)
            meeting = getattr(r, 'videosdk_meeting_id', None)
            ai_done = getattr(r, 'ai_interview_completed', False)
            print(f'Round: {r.id}')
            print(f'  Status: {r.status}, Mode: {mode}, Meeting: {meeting}')
            print(f'  AI Complete: {ai_done}')
            print()

asyncio.run(main())
