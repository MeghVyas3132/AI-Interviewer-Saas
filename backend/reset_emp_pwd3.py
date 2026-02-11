import asyncio
import asyncpg

async def reset_employee_password():
    conn = await asyncpg.connect(
        host='localhost',
        port=5432,
        user='ai_interviewer_user',
        password='ai_interviewer_password',
        database='ai_interviewer_db'
    )
    
    # Get the password hash from admin
    result = await conn.fetchrow("""
        SELECT password_hash FROM users WHERE email = 'admin@aiinterviewer.com'
    """)
    
    if result:
        hashed = result['password_hash']
        print(f"Found hash from admin")
        
        # Update employee passwords with the same hash
        await conn.execute("""
            UPDATE users SET password_hash = $1 WHERE email IN ('mahibundela@gmail.com', 'arya@gmail.com')
        """, hashed)
        
        print("Employee passwords updated - use same password as admin@aiinterviewer.com (AdminPass123!)")
    else:
        print("Could not find admin user")
    
    await conn.close()

asyncio.run(reset_employee_password())
