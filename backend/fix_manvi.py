import asyncio
import asyncpg

async def fix_manvi():
    conn = await asyncpg.connect(
        host='localhost',
        port=5432,
        user='ai_interviewer_user',
        password='ai_interviewer_password',
        database='ai_interviewer_db'
    )
    
    # Fix manvi's status to ai_review (matches NEUTRAL recommendation)
    await conn.execute("""
        UPDATE candidates SET status = 'ai_review' WHERE email = 'manvi@gmail.com'
    """)
    
    print("Fixed manvi to ai_review status")
    
    await conn.close()

asyncio.run(fix_manvi())
