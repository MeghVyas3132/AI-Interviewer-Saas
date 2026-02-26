import asyncio
import os
import sys

# Add the app directory to the path so we can import app modules
sys.path.append(os.path.join(os.getcwd()))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.services.auth_service import AuthService

async def reset_password():
    async with AsyncSessionLocal() as session:
        try:
            # Find system admin user (first match)
            result = await session.execute(
                select(User).where(User.role == UserRole.SYSTEM_ADMIN)
            )
            user = result.scalars().first()
            if user:
                old_email = user.email
                print(f"Found system admin user: {old_email}")
                # Update email and password per request
                new_email = "admin@aigenthix.com"
                new_password = "qwerty123?"
                user.email = new_email
                user.password_hash = AuthService.hash_password(new_password)
                user.is_active = True
                user.email_verified = True
                await session.commit()
                print(f"Successfully updated system admin: {old_email} -> {new_email}")
                print(f"Password set to: {new_password}")
            else:
                print("No SYSTEM_ADMIN user found in the database")
        except Exception as e:
            print(f"Error updating system admin: {e}")
            await session.rollback()

if __name__ == "__main__":
    asyncio.run(reset_password())
