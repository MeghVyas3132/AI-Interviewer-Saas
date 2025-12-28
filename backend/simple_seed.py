import asyncio
from app.core.database import async_session_maker, init_db
from app.models.user import User, UserRole
from sqlalchemy import text
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def main():
    """Simple seed script that creates a SYSTEM_ADMIN user."""
    await init_db()
    
    async with async_session_maker() as session:
        # Check if system admin already exists
        result = await session.execute(
            text("SELECT id FROM users WHERE email = 'admin@aigenthix.com'")
        )
        if result.fetchone():
            print("System Admin already exists. Skipping seed.")
            return
        
        print("Creating SYSTEM_ADMIN user...")
        
        # Create system admin directly (no company needed)
        hashed_password = pwd_context.hash("qwerty123")
        
        await session.execute(
            text("""
                INSERT INTO users (id, name, email, password_hash, role, is_active, email_verified, created_at, updated_at)
                VALUES (
                    gen_random_uuid(),
                    'System Admin',
                    'admin@aigenthix.com',
                    :password_hash,
                    'SYSTEM_ADMIN',
                    true,
                    true,
                    NOW(),
                    NOW()
                )
            """),
            {"password_hash": hashed_password}
        )
        await session.commit()
        
        print()
        print("SEED COMPLETE!")
        print()
        print("System Admin credentials:")
        print("  Email: admin@aigenthix.com")
        print("  Password: qwerty123")

if __name__ == "__main__":
    asyncio.run(main())
