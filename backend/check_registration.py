"""Check company requests and registration flow."""
import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as s:
        # Get company_requests columns
        r = await s.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='company_requests' ORDER BY ordinal_position"))
        cols = [x[0] for x in r.fetchall()]
        print(f"company_requests columns: {cols}")
        
        # Check recent entries
        r = await s.execute(text("SELECT * FROM company_requests ORDER BY created_at DESC LIMIT 3"))
        rows = r.fetchall()
        print(f"\nRecent requests: {len(rows)}")
        for i, row in enumerate(rows):
            print(f"  Request {i+1}: {dict(zip(cols, row))}")
        
        # Also check all HR users
        r = await s.execute(text("SELECT email, role, is_active FROM users WHERE role = 'HR' OR role = 'EMPLOYEE'"))
        users = r.fetchall()
        print(f"\nExisting HR/Employee users: {len(users)}")
        for u in users:
            print(f"  {u[0]} - role={u[1]}, active={u[2]}")

asyncio.run(main())
