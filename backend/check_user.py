"""Check user registration status."""
import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as s:
        # Check users table
        r = await s.execute(text("SELECT id, email, role, company_id, is_active FROM users WHERE email = 'monali@gmail.com'"))
        user = r.fetchone()
        if user:
            print(f"User found: id={user[0]}, email={user[1]}, role={user[2]}, company={user[3]}, active={user[4]}")
        else:
            print("User NOT found in users table")
        
        # Check candidates table
        r = await s.execute(text("SELECT id, email, status FROM candidates WHERE email = 'monali@gmail.com'"))
        candidate = r.fetchone()
        if candidate:
            print(f"Candidate found: id={candidate[0]}, email={candidate[1]}, status={candidate[2]}")
        else:
            print("Not a candidate either")
        
        # Check company_requests (pending registrations)
        r = await s.execute(text("SELECT id, email, status, company_name FROM company_requests WHERE email = 'monali@gmail.com'"))
        req = r.fetchone()
        if req:
            print(f"Company request found: id={req[0]}, email={req[1]}, status={req[2]}, company={req[3]}")
        else:
            print("No pending company request")

asyncio.run(main())
