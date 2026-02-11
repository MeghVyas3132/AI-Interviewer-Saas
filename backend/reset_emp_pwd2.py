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
    
    # Get the password hash from ashish (known to work with Password123!)
    result = await conn.fetchrow("""
        SELECT password_hash FROM users WHERE email = 'ashish@gmail.com'
    """)
    
    if result:
        hashed = result['password_hash']
        print(f"Found hash from ashish@gmail.com")
        
        # Update employee passwords with the same hash
        await conn.execute("""
            UPDATE users SET password_hash = $1 WHERE email IN ('mahibundela@gmail.com', 'arya@gmail.com')
        """, hashed)
        
        print("Employee passwords updated - use same password as ashish@gmail.com")
    else:
        print("Could not find ashish user")
        
    # List all users
    print("\nAll users:")
    users = await conn.fetch("SELECT email, role, password_hash FROM users")
    for u in users:
        print(f"  {u['email']} | {u['role']} | hash: {u['password_hash'][:30]}...")
    
    await conn.close()

asyncio.run(reset_employee_password())
