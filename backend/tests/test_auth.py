"""
Tests for authentication service
"""

import pytest
from app.services.auth_service import AuthService
from app.services.user_service import UserService
from app.models.user import UserRole
from app.schemas.user_schema import UserCreate


@pytest.mark.asyncio
async def test_authenticate_user_success(test_db, sample_company_data, sample_user_data):
    """Test successful user authentication."""
    from app.services.company_service import CompanyService
    from app.schemas.company_schema import CompanyCreate

    # Create company
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

    # Authenticate
    authenticated_user = await AuthService.authenticate_user(
        test_db,
        sample_user_data["email"],
        sample_user_data["password"],
    )

    assert authenticated_user is not None
    assert authenticated_user.email == sample_user_data["email"]


@pytest.mark.asyncio
async def test_authenticate_user_invalid_password(test_db, sample_company_data, sample_user_data):
    """Test authentication with invalid password."""
    from app.services.company_service import CompanyService
    from app.schemas.company_schema import CompanyCreate

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

    # Try to authenticate with wrong password
    authenticated_user = await AuthService.authenticate_user(
        test_db,
        sample_user_data["email"],
        "wrongpassword",
    )

    assert authenticated_user is None


def test_create_tokens():
    """Test JWT token creation."""
    import uuid

    user_id = uuid.uuid4()
    company_id = uuid.uuid4()

    tokens = AuthService.create_tokens(user_id, company_id)

    assert tokens.access_token is not None
    assert tokens.refresh_token is not None
    assert tokens.token_type == "bearer"


def test_hash_password():
    """Test password hashing."""
    password = "testpassword123"
    hashed = AuthService.hash_password(password)

    assert hashed != password
    assert len(hashed) > 0
