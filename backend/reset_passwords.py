import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import bcrypt

DATABASE_URL = 'postgresql+asyncpg://ai_interviewer_user:ai_interviewer_password@localhost:5432/ai_interviewer_db'

async def reset_passwords():
    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        # Hash the password using bcrypt
        password = 'AdminPass123!'
        new_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(12)).decode('utf-8')
        print(f'New hash: {new_hash[:30]}...')
        
        # Update all users using parameterized query
        await session.execute(text("UPDATE users SET password_hash = :hash"), {"hash": new_hash})
        await session.commit()
        print('All passwords reset to AdminPass123!')
        
        # Verify
        result = await session.execute(text("SELECT email, password_hash FROM users"))
        rows = result.fetchall()
        for row in rows:
            valid = bcrypt.checkpw(password.encode('utf-8'), row[1].encode('utf-8'))
            print(f'{row[0]}: {"✓" if valid else "✗"}')
    await engine.dispose()

asyncio.run(reset_passwords())
