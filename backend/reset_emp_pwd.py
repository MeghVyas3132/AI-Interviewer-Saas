import asyncio
import asyncpg
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def reset_employee_password():
    conn = await asyncpg.connect(
        host='localhost',
        port=5432,
        user='ai_interviewer_user',
        password='ai_interviewer_password',
        database='ai_interviewer_db'
    )
    
    hashed = pwd_context.hash("EmployeePass123!")
    
    # Update employee passwords
    await conn.execute("""
        UPDATE users SET hashed_password = $1 WHERE email IN ('mahibundela@gmail.com', 'arya@gmail.com')
    """, hashed)
    
    print("Employee passwords reset to: EmployeePass123!")
    await conn.close()

asyncio.run(reset_employee_password())
