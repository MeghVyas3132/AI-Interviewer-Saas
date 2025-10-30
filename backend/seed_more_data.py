#!/usr/bin/env python3
"""
Seed script to create demo companies and users with different roles.
Run: python seed_more_data.py
"""
import asyncio
import sys

sys.path.insert(0, "/Users/vaibhavchauhan/Desktop/ai-interview/backend")

from app.core.database import async_session_maker, init_db
from app.services.company_service import CompanyService
from app.services.user_service import UserService
from app.schemas.company_schema import CompanyCreate
from app.schemas.user_schema import UserCreate
from app.models.user import UserRole


async def main() -> None:
    await init_db()

    async with async_session_maker() as session:
        # Company 1 (already exists)
        print("Company 1 already created: Demo Company")
        
        # Company 2
        company2_data = CompanyCreate(
            name="Tech Solutions Inc",
            email_domain="techsolutions.com",
            description="A tech company focused on AI solutions",
        )
        company2 = await CompanyService.create_company(session, company2_data)
        await session.commit()
        print(f"✓ Created company: {company2.name} (ID: {company2.id})")
        
        # Create users for Company 2
        user2_data = UserCreate(
            name="Sarah Johnson",
            email="sarah@techsolutions.com",
            password="SecurePass123!",
            role=UserRole.TEAM_LEAD,
            department="Engineering",
        )
        user2 = await UserService.create_user(session, company2.id, user2_data)
        await session.commit()
        print(f"✓ Created user: {user2.name} ({user2.role.value})")
        
        # Third user for Company 2
        user3_data = UserCreate(
            name="Mike Chen",
            email="mike@techsolutions.com",
            password="SecurePass123!",
            role=UserRole.EMPLOYEE,
            department="Sales",
        )
        user3 = await UserService.create_user(session, company2.id, user3_data)
        await session.commit()
        print(f"✓ Created user: {user3.name} ({user3.role.value})")
        
        print("\n✓ Seed data created successfully!")
        print("\nSummary:")
        print("- 2 Companies")
        print("- 3 Users (1 HR + 1 TEAM_LEAD + 1 EMPLOYEE)")


if __name__ == "__main__":
    asyncio.run(main())
