import asyncio
import asyncpg
import bcrypt

async def check_password():
    conn = await asyncpg.connect(
        host='localhost',
        port=5432,
        user='ai_interviewer_user',
        password='ai_interviewer_password',
        database='ai_interviewer_db'
    )
    
    users = await conn.fetch("SELECT email, password_hash FROM users")
    
    test_password = "AdminPass123!"
    
    print("Testing password verification:")
    for u in users:
        email = u['email']
        stored_hash = u['password_hash']
        
        if stored_hash and not stored_hash.startswith('CANDIDATE'):
            try:
                is_valid = bcrypt.checkpw(test_password.encode('utf-8'), stored_hash.encode('utf-8'))
                print(f"  {email}: {'✓ VALID' if is_valid else '✗ INVALID'}")
            except Exception as e:
                print(f"  {email}: ERROR - {e}")
        else:
            print(f"  {email}: SKIPPED (no password)")
    
    await conn.close()

asyncio.run(check_password())
