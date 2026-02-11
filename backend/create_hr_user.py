import asyncio
import bcrypt
from app.core.database import async_session_maker, init_db
from sqlalchemy import text

async def create_hr_user():
    await init_db()
    async with async_session_maker() as session:
        # Delete existing HR user if any
        await session.execute(text("DELETE FROM users WHERE email = 'hr@aiinterviewer.com'"))
        await session.commit()
        
        # Hash password
        password = 'HrPass123!'
        hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        # Get company
        result = await session.execute(text("SELECT id FROM companies WHERE name = 'Aigenthix System'"))
        company_id = result.fetchone()[0]
        
        # Create HR user
        await session.execute(text("""
            INSERT INTO users (id, company_id, name, email, password_hash, role, is_active, email_verified, verification_attempts, created_at, updated_at)
            VALUES (gen_random_uuid(), :company_id, 'HR Manager', 'hr@aiinterviewer.com', :password, 'HR', true, true, 0, NOW(), NOW())
        """), {'company_id': company_id, 'password': hashed})
        await session.commit()
        print('=' * 50)
        print('HR User Created!')
        print('=' * 50)
        print('Email: hr@aiinterviewer.com')
        print('Password: HrPass123!')
        print('=' * 50)

if __name__ == "__main__":
    asyncio.run(create_hr_user())
