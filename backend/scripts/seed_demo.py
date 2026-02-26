#!/usr/bin/env python3
"""Seed script to create a demo company and HR user.

Run inside the backend container:

  docker compose exec backend python3 app/scripts/seed_demo.py

It will create a company and an HR user and print their IDs.
"""
import asyncio
from app.core.database import async_session_maker, init_db
from app.services.company_service import CompanyService
from app.services.user_service import UserService
from app.schemas.company_schema import CompanyCreate
from app.schemas.user_schema import UserCreate
from app.models.user import UserRole


async def main() -> None:
    await init_db()

    async with async_session_maker() as session:
        company_data = CompanyCreate(
            name="Demo Company",
            email_domain="demo.com",
            description="Demo company created by seed script",
        )

        company = await CompanyService.create_company(session, company_data)
        await session.commit()

        print(f"Created company id: {company.id}")

        user_data = UserCreate(
            name="Demo HR",
            email="demo@demo.com",
            password="DemoPassword123!",
            role=UserRole.HR,
        )

        user = await UserService.create_user(session, company.id, user_data)
        await session.commit()

        print(f"Created HR user id: {user.id}")
        print("Login with: demo@demo.com / DemoPassword123!")


if __name__ == "__main__":
    asyncio.run(main())
