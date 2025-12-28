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
        sys.stdout.flush()
        
        # Delete existing admin if exists (to ensure clean state)
        await session.execute(
            text("DELETE FROM users WHERE email = 'admin@aigenthix.com'")
        )
        await session.commit()
        
        # Check if system company exists, create if not
        print("Checking for system company...")
        sys.stdout.flush()
        result = await session.execute(
            text("SELECT id FROM companies WHERE name = 'Aigenthix System'")
        )
        row = result.fetchone()
        
        if row:
            company_id = row[0]
            print(f"   Found existing system company: {company_id}")
        else:
            print("   Creating system company...")
            result = await session.execute(
                text("""
                    INSERT INTO companies (id, join_code, name, email_domain, description, is_active, created_at, updated_at)
                    VALUES (
                        gen_random_uuid(),
                        'SYST-ADMN',
                        'Aigenthix System',
                        'aigenthix.com',
                        'System Administration Company',
                        true,
                        NOW(),
                        NOW()
                    )
                    RETURNING id
                """)
            )
            company_id = result.fetchone()[0]
            await session.commit()
            print(f"   Created system company: {company_id}")
        
        sys.stdout.flush()
        
        print("Creating SYSTEM_ADMIN user...")
        sys.stdout.flush()
        
        # Create system admin directly
        hashed_password = pwd_context.hash("qwerty123")
        
        await session.execute(
            text("""
                INSERT INTO users (id, company_id, name, email, password_hash, role, is_active, email_verified, created_at, updated_at)
                VALUES (
                    gen_random_uuid(),
                    :company_id,
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
            {"company_id": company_id, "password_hash": hashed_password}
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
