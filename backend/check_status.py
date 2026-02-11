import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

DATABASE_URL = 'postgresql+asyncpg://ai_interviewer_user:ai_interviewer_password@localhost:5432/ai_interviewer_db'

async def check():
    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        result = await session.execute(text("SELECT email, status FROM candidates"))
        for row in result.fetchall():
            print(f"{row[0]}: {row[1]}")
    await engine.dispose()

asyncio.run(check())
