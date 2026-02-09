"""
Company service for company management operations.
"""

from typing import List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.company import Company
from app.schemas.company_schema import CompanyCreate, CompanyUpdate


class CompanyService:
    """Service for company management operations."""

    @staticmethod
    async def create_company(
        session: AsyncSession,
        company_data: CompanyCreate,
    ) -> Company:
        """
        Create a new company.

        Args:
            session: Database session
            company_data: Company creation data

        Returns:
            Created company
        """
        # Check if company name already exists
        result = await session.execute(
            select(Company).where(Company.name == company_data.name),
        )
        if result.scalars().first():
            raise ValueError(f"Company with name {company_data.name} already exists")

        company = Company(
            name=company_data.name,
            email_domain=company_data.email_domain,
            description=company_data.description,
        )

        session.add(company)
        await session.flush()
        return company

    @staticmethod
    async def get_company_by_id(
        session: AsyncSession,
        company_id: UUID,
    ) -> Optional[Company]:
        """
        Get company by ID.

        Args:
            session: Database session
            company_id: Company ID

        Returns:
            Company or None if not found
        """
        result = await session.execute(
            select(Company).where(Company.id == company_id),
        )
        return result.scalars().first()

    @staticmethod
    async def get_company_by_name(
        session: AsyncSession,
        name: str,
    ) -> Optional[Company]:
        """
        Get company by name.

        Args:
            session: Database session
            name: Company name

        Returns:
            Company or None if not found
        """
        result = await session.execute(
            select(Company).where(Company.name == name),
        )
        return result.scalars().first()

    @staticmethod
    async def get_all_companies(
        session: AsyncSession,
        skip: int = 0,
        limit: int = 20,
    ) -> List[Company]:
        """
        Get all companies.

        Args:
            session: Database session
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            List of companies
        """
        result = await session.execute(
            select(Company).offset(skip).limit(limit),
        )
        return result.scalars().all()

    @staticmethod
    async def update_company(
        session: AsyncSession,
        company_id: UUID,
        company_data: CompanyUpdate,
    ) -> Optional[Company]:
        """
        Update company information.

        Args:
            session: Database session
            company_id: Company ID
            company_data: Update data

        Returns:
            Updated company or None if not found
        """
        company = await CompanyService.get_company_by_id(session, company_id)
        if not company:
            return None

        # Update fields if provided
        if company_data.name is not None:
            company.name = company_data.name
        if company_data.email_domain is not None:
            company.email_domain = company_data.email_domain
        if company_data.description is not None:
            company.description = company_data.description
        if company_data.is_active is not None:
            company.is_active = company_data.is_active

        await session.flush()
        return company

    @staticmethod
    async def deactivate_company(
        session: AsyncSession,
        company_id: UUID,
    ) -> bool:
        """
        Deactivate a company.

        Args:
            session: Database session
            company_id: Company ID

        Returns:
            True if successful
        """
        company = await CompanyService.get_company_by_id(session, company_id)
        if not company:
            return False

        company.is_active = False
        await session.flush()
        return True

    @staticmethod
    async def list_all_companies(
        session: AsyncSession,
        skip: int = 0,
        limit: int = 50,
    ) -> list:
        """
        List all companies (system admin only).

        Args:
            session: Database session
            skip: Pagination offset
            limit: Pagination limit

        Returns:
            List of companies
        """
        from sqlalchemy import select
        from app.models.company import Company

        query = select(Company).offset(skip).limit(limit)
        result = await session.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_system_metrics(session: AsyncSession) -> dict:
        """
        Get system-wide metrics.

        Args:
            session: Database session

        Returns:
            System metrics
        """
        from sqlalchemy import select, func
        from app.models.company import Company
        from app.models.user import User

        # Get total companies
        company_query = select(func.count(Company.id))
        company_result = await session.execute(company_query)
        total_companies = company_result.scalar()

        # Get active companies
        active_query = select(func.count(Company.id)).where(Company.is_active == True)
        active_result = await session.execute(active_query)
        active_companies = active_result.scalar()

        # Get total users
        user_query = select(func.count(User.id))
        user_result = await session.execute(user_query)
        total_users = user_result.scalar()

        return {
            "total_companies": total_companies or 0,
            "active_companies": active_companies or 0,
            "inactive_companies": (total_companies or 0) - (active_companies or 0),
            "total_users": total_users or 0,
        }
