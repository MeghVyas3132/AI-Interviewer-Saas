import asyncio
import sys
from app.core.database import async_session_maker, init_db
from app.models.user import User, UserRole
from sqlalchemy import text
from passlib.context import CryptContext

print("=" * 50)
print("SIMPLE SEED SCRIPT STARTING...")
print("=" * 50)
sys.stdout.flush()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def main():
    """Simple seed script that creates a SYSTEM_ADMIN user."""
    await init_db()
    
    async with async_session_maker() as session:
        print("Checking for existing admin...")
        
        # Delete existing admin if exists (to ensure clean state)
        await session.execute(
            text("DELETE FROM users WHERE email = 'admin@aigenthix.com'")
        )
        await session.commit()
        
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
        print("=" * 50)
        sys.stdout.flush()
        print()
        print("System Admin credentials:")
        print("  Email: admin@aigenthix.com")
        print("  Password: qwerty123")

if __name__ == "__main__":
    print("Running main()...")
    sys.stdout.flush()
    asyncio.run(main())
