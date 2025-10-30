"""
Tests for user service
"""

import pytest
from app.services.user_service import UserService
from app.services.company_service import CompanyService
from app.schemas.user_schema import UserCreate, UserUpdate
from app.schemas.company_schema import CompanyCreate
from app.models.user import UserRole


@pytest.mark.asyncio
async def test_create_user(test_db, sample_company_data, sample_user_data):
    """Test user creation."""
    # Create company first
    company = await CompanyService.create_company(
        test_db,
        CompanyCreate(**sample_company_data),
    )

    # Create user
    user_create = UserCreate(
        **sample_user_data,
        role=UserRole.EMPLOYEE,
    )
    user = await UserService.create_user(test_db, company.id, user_create)

    assert user is not None
    assert user.email == sample_user_data["email"]
    assert user.company_id == company.id


@pytest.mark.asyncio
async def test_get_user_by_email(test_db, sample_company_data, sample_user_data):
    """Test getting user by email."""
    # Create company and user
    company = await CompanyService.create_company(
        test_db,
        CompanyCreate(**sample_company_data),
    )

    user_create = UserCreate(
        **sample_user_data,
        role=UserRole.EMPLOYEE,
    )
    await UserService.create_user(test_db, company.id, user_create)

    # Get user by email
    user = await UserService.get_user_by_email(test_db, sample_user_data["email"])

    assert user is not None
    assert user.email == sample_user_data["email"]


@pytest.mark.asyncio
async def test_update_user(test_db, sample_company_data, sample_user_data):
    """Test user update."""
    # Create company and user
    company = await CompanyService.create_company(
        test_db,
        CompanyCreate(**sample_company_data),
    )

    user_create = UserCreate(
        **sample_user_data,
        role=UserRole.EMPLOYEE,
    )
    user = await UserService.create_user(test_db, company.id, user_create)

    # Update user
    update_data = UserUpdate(name="Updated Name", role=UserRole.TEAM_LEAD)
    updated_user = await UserService.update_user(test_db, user.id, update_data)

    assert updated_user.name == "Updated Name"
    assert updated_user.role == UserRole.TEAM_LEAD
