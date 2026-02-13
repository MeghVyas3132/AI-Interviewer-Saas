"""
Company routes.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import get_current_user, require_hr, require_admin
from app.models.user import User
from app.schemas.company_schema import (
    CompanyCreate,
    CompanyResponse,
    CompanyUpdate,
)
from app.services.audit_log_service import AuditLogService
from app.services.company_service import CompanyService

router = APIRouter(prefix="/api/v1/company", tags=["company"])


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def register_company(
    company_data: CompanyCreate,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> CompanyResponse:
    """
    Create a new company (ADMIN only).

    Args:
        company_data: Company creation data
        current_user: Current authenticated ADMIN user
        session: Database session

    Returns:
        Created company
    """
    try:
        company = await CompanyService.create_company(session, company_data)
        await session.commit()
        return company
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/{company_id}", response_model=CompanyResponse)
async def get_company(
    company_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> CompanyResponse:
    """
    Get company by ID.

    Args:
        company_id: Company ID
        current_user: Current authenticated user
        session: Database session

    Returns:
        Company details
    """
    # Verify user belongs to the company or is accessing their own company
    if current_user.company_id != company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access company data",
        )

    company = await CompanyService.get_company_by_id(session, company_id)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )

    return company


@router.put("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: UUID,
    company_data: CompanyUpdate,
    current_user: User = Depends(require_hr),
    session: AsyncSession = Depends(get_db),
) -> CompanyResponse:
    """
    Update company information (HR only).

    Args:
        company_id: Company ID
        company_data: Update data
        current_user: Current authenticated HR user
        session: Database session

    Returns:
        Updated company
    """
    # Verify HR user belongs to the company
    if current_user.company_id != company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update company data",
        )

    company = await CompanyService.update_company(session, company_id, company_data)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )

    # Log update action
    await AuditLogService.log_action(
        session,
        company_id,
        current_user.id,
        "UPDATE_COMPANY",
        resource_type="company",
        resource_id=company_id,
    )

    await session.commit()
    return company
