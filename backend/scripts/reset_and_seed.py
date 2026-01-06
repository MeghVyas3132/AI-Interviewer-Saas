import asyncio
import sys
from app.core.database import async_session_maker, init_db
from app.services.company_service import CompanyService
from app.services.user_service import UserService
from app.schemas.company_schema import CompanyCreate
from app.schemas.user_schema import UserCreate
from app.models.user import UserRole
from sqlalchemy import text

async def main():
    await init_db()
    
    async with async_session_maker() as session:
        print("Deleting all data...")
        tables = ["audit_logs", "interviews", "scores", "users", "roles", "companies"]
        for table in tables:
            try:
                await session.execute(text(f"DELETE FROM {table}"))
                print(f"   Cleared {table}")
            except Exception as e:
                print(f"   {table}: {str(e)[:40]}")
        
        await session.commit()
        print()
        
        # Create AI Interviewer company (for admin and platform users)
        print("Creating AI Interviewer company...")
        ai_company_data = CompanyCreate(
            name="AI Interviewer",
            email_domain="aiinterviewer.com",
            description="AI Interviewer Platform - Admin",
        )
        ai_company = await CompanyService.create_company(session, ai_company_data)
        await session.commit()
        print(f"   Company: {ai_company.name}")
        print()
        
        # Create ADMIN user for AI Interviewer
        print("Creating ADMIN user...")
        admin_data = UserCreate(
            name="Platform Admin",
            email="admin@aiinterviewer.com",
            password="AdminPass123!@",
            role=UserRole.SYSTEM_ADMIN,
            department="Administration",
        )
        admin_user = await UserService.create_user(session, ai_company.id, admin_data)
        # Mark email as verified for seeded admin
        admin_user.email_verified = True
        await session.commit()
        print(f"   {admin_user.name} ({admin_user.email})")
        print(f"   Password: AdminPass123!@")
        print()
        
        # Create test company
        print("Creating test company...")
        company_data = CompanyCreate(
            name="Test Corp",
            email_domain="testcorp.com",
            description="Test company for development",
        )
        company = await CompanyService.create_company(session, company_data)
        await session.commit()
        print(f"   Company: {company.name}")
        print()
        
        # Create HR user in test company
        print("Creating HR user in test company...")
        hr_data = UserCreate(
            name="HR Manager",
            email="hr@testcorp.com",
            password="HRPass123!@",
            role=UserRole.HR,
            department="Human Resources",
        )
        hr_user = await UserService.create_user(session, company.id, hr_data)
        # Mark email as verified for seeded HR user
        hr_user.email_verified = True
        await session.commit()
        print(f"   {hr_user.name} ({hr_user.email})")
        print(f"   Password: HRPass123!@")
        print()
        
        # Create 2 employees
        print("Creating employees...")
        employees = [
            ("John Smith", "john@testcorp.com", "EmpPass123!@"),
            ("Sarah Chen", "sarah@testcorp.com", "EmpPass123!@"),
        ]
        
        for name, email, password in employees:
            emp_data = UserCreate(
                name=name,
                email=email,
                password=password,
                role=UserRole.EMPLOYEE,
                department="Engineering",
            )
            emp = await UserService.create_user(session, company.id, emp_data)
            # Mark email as verified for seeded employees
            emp.email_verified = True
            await session.commit()
            print(f"   {name} ({email}) - Password: {password}")
        print()
        
        # Create 3 candidates
        print("Creating candidates...")
        candidates = [
            ("Alice Johnson", "alice@candidate.com", "CandPass123!@"),
            ("Bob Wilson", "bob@candidate.com", "CandPass123!@"),
            ("Carol Davis", "carol@candidate.com", "CandPass123!@"),
        ]
        
        for name, email, password in candidates:
            cand_data = UserCreate(
                name=name,
                email=email,
                password=password,
                role=UserRole.CANDIDATE,
                department="Candidates",
            )
            cand = await UserService.create_user(session, company.id, cand_data)
            # Mark email as verified for seeded candidates
            cand.email_verified = True
            await session.commit()
            print(f"   {name} ({email}) - Password: {password}")
        
        print()
        print("DATABASE RESET COMPLETE!")

if __name__ == "__main__":
    asyncio.run(main())
