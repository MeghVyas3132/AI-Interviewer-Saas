import asyncio
import asyncpg

async def check_users():
    conn = await asyncpg.connect(
        host='localhost',
        port=5432,
        user='ai_interviewer_user',
        password='ai_interviewer_password',
        database='ai_interviewer_db'
    )
    
    users = await conn.fetch("""
        SELECT email, is_active, email_verified, password_hash 
        FROM users
    """)
    
    print("Users status:")
    for u in users:
        has_pwd = u['password_hash'] and len(u['password_hash']) > 10
        print(f"  {u['email']} | active: {u['is_active']} | verified: {u['email_verified']} | has_pwd: {has_pwd}")
    
    await conn.close()

asyncio.run(check_users())
