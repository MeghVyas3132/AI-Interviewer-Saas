import asyncio
import asyncpg

async def reset_all_passwords():
    conn = await asyncpg.connect(
        host='localhost',
        port=5432,
        user='ai_interviewer_user',
        password='ai_interviewer_password',
        database='ai_interviewer_db'
    )
    
    # Get admin's password hash (known to work with AdminPass123!)
    admin = await conn.fetchrow("""
        SELECT password_hash FROM users WHERE email = 'admin@aiinterviewer.com'
    """)
    
    if admin:
        admin_hash = admin['password_hash']
        
        # Update all users to use the same password
        await conn.execute("""
            UPDATE users SET password_hash = $1 
            WHERE email NOT LIKE '%CANDIDATE%' AND password_hash != $1
        """, admin_hash)
        
        print(f"All user passwords reset to: AdminPass123!")
    else:
        print("Admin user not found")
    
    await conn.close()

asyncio.run(reset_all_passwords())
