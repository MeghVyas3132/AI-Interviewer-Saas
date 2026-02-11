"""Approve company request and create user account."""
import asyncio
import uuid
from datetime import datetime, timezone
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as s:
        request_id = "c1a026d5-294b-42a7-b005-d22e0599f5ff"
        
        # Create company
        company_id = str(uuid.uuid4())
        join_code = str(uuid.uuid4())[:8].upper()  # Generate 8-char join code
        await s.execute(text("""
            INSERT INTO companies (id, join_code, name, email_domain, created_at, updated_at)
            VALUES (:id, :join_code, :name, :domain, NOW(), NOW())
        """), {"id": company_id, "join_code": join_code, "name": "zooho", "domain": "gmail.com"})
        print(f"Created company: zooho ({company_id})")
        
        # Create user with password from request
        user_id = str(uuid.uuid4())
        await s.execute(text("""
            INSERT INTO users (id, email, name, password_hash, role, company_id, is_active, email_verified, verification_attempts, created_at, updated_at)
            SELECT :user_id, requester_email, requester_name, requester_password_hash, 'HR', :company_id, true, true, 0, NOW(), NOW()
            FROM company_requests WHERE id = :request_id
        """), {"user_id": user_id, "company_id": company_id, "request_id": request_id})
        print(f"Created user: monali@gmail.com as HR ({user_id})")
        
        # Update request status
        await s.execute(text("""
            UPDATE company_requests 
            SET status = 'APPROVED', 
                approved_company_id = :company_id,
                reviewed_at = NOW()
            WHERE id = :request_id
        """), {"company_id": company_id, "request_id": request_id})
        print("Updated request status to APPROVED")
        
        await s.commit()
        
        # Verify
        r = await s.execute(text("SELECT email, role, is_active FROM users WHERE email = 'monali@gmail.com'"))
        user = r.fetchone()
        print(f"\nVerification: {user[0]} - role={user[1]}, active={user[2]}")
        print("\nYou can now login with: monali@gmail.com and the password you registered with")

asyncio.run(main())
