import asyncio
import asyncpg

async def check_schema():
    conn = await asyncpg.connect(
        host='localhost',
        port=5432,
        user='ai_interviewer_user',
        password='ai_interviewer_password',
        database='ai_interviewer_db'
    )
    
    # Check users table columns
    result = await conn.fetch("""
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_name = 'users' ORDER BY ordinal_position
    """)
    
    print("Users table columns:")
    for row in result:
        print(f"  {row['column_name']} | {row['data_type']}")
    
    await conn.close()

asyncio.run(check_schema())
