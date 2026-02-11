import asyncio
import bcrypt
from app.core.database import async_session_maker, init_db
from sqlalchemy import text

async def reset_admin():
    await init_db()
    async with async_session_maker() as session:
        # Delete existing admin
        await session.execute(text("DELETE FROM users WHERE email = 'admin@aigenthix.com'"))
        await session.execute(text("DELETE FROM users WHERE email = 'admin@system.local'"))
        await session.execute(text("DELETE FROM users WHERE email = 'admin@aiinterviewer.com'"))
        await session.commit()
        
        # Create new admin with correct password hash
        password = 'AdminPass123!'
        hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        # Get company
        result = await session.execute(text("SELECT id FROM companies WHERE name = 'Aigenthix System'"))
        company_id = result.fetchone()[0]
        
        await session.execute(text("""
            INSERT INTO users (id, company_id, name, email, password_hash, role, is_active, email_verified, verification_attempts, created_at, updated_at)
            VALUES (gen_random_uuid(), :company_id, 'System Admin', 'admin@aiinterviewer.com', :password, 'SYSTEM_ADMIN', true, true, 0, NOW(), NOW())
        """), {'company_id': company_id, 'password': hashed})
        await session.commit()
        print('=' * 50)
        print('Admin user reset!')
        print('=' * 50)
        print('Email: admin@aiinterviewer.com')
        print('Password: AdminPass123!')
        print('=' * 50)

if __name__ == "__main__":
    asyncio.run(reset_admin())
