"""Create all standard seed users for local development."""
import asyncio
import bcrypt
from app.core.database import async_session_maker, init_db
from sqlalchemy import text


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


async def main():
    await init_db()
    async with async_session_maker() as session:
        # Get system company
        result = await session.execute(text("SELECT id FROM companies WHERE name = 'Aigenthix System'"))
        row = result.fetchone()
        if not row:
            print("ERROR: Run simple_seed.py first to create the system company!")
            return
        company_id = row[0]

        users = [
            {
                "name": "HR Manager",
                "email": "hr@aiinterviewer.com",
                "password": "HrPass123!",
                "role": "HR",
            },
            {
                "name": "Megh HR",
                "email": "megh@gmail.com",
                "password": "qwerty123",
                "role": "HR",
            },
            {
                "name": "Test Employee",
                "email": "employee@aiinterviewer.com",
                "password": "EmpPass123!",
                "role": "EMPLOYEE",
            },
        ]

        for u in users:
            # Check if user exists
            result = await session.execute(
                text("SELECT id FROM users WHERE email = :email"),
                {"email": u["email"]},
            )
            existing = result.fetchone()
            hashed = hash_password(u["password"])

            if existing:
                # Update password and ensure active/verified
                await session.execute(
                    text("""
                        UPDATE users 
                        SET password_hash = :pw, is_active = true, email_verified = true
                        WHERE email = :email
                    """),
                    {"pw": hashed, "email": u["email"]},
                )
                print(f"  UPDATED: {u['email']} / {u['password']} ({u['role']})")
            else:
                await session.execute(
                    text("""
                        INSERT INTO users (id, company_id, name, email, password_hash, role, is_active, email_verified, verification_attempts, created_at, updated_at)
                        VALUES (gen_random_uuid(), :company_id, :name, :email, :pw, :role, true, true, 0, NOW(), NOW())
                    """),
                    {
                        "company_id": company_id,
                        "name": u["name"],
                        "email": u["email"],
                        "pw": hashed,
                        "role": u["role"],
                    },
                )
                print(f"  CREATED: {u['email']} / {u['password']} ({u['role']})")

        await session.commit()
        print("\nAll users seeded successfully!")
        print("\nLogin credentials:")
        print("  admin@aigenthix.com / qwerty123 (SYSTEM_ADMIN)")
        for u in users:
            print(f"  {u['email']} / {u['password']} ({u['role']})")


if __name__ == "__main__":
    asyncio.run(main())
