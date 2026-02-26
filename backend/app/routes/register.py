"""
Public registration routes for first HR user in a company.

This allows companies to register their first HR user using a company_id
provided by the AI Interviewer admin.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import UserRole
from app.schemas.user_schema import UserCreate, UserResponse
from app.services.company_service import CompanyService
from app.services.email_verification_service import EmailVerificationService
from app.services.user_service import UserService

router = APIRouter(prefix="/api/v1/register", tags=["register"])


@router.post("/user", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_first_hr(
    user_data: UserCreate,
    company_id: UUID,
    session: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    Register the first HR user for a company.

    This is a public endpoint that allows the first HR registration for a company.
    The company_id must be provided by the AI Interviewer admin.

    Args:
        user_data: User registration data (name, email, password)
        company_id: Company ID provided by admin
        session: Database session

    Returns:
        Created HR user

    Raises:
        HTTPException 400: Invalid company_id or company not found
        HTTPException 400: User already exists in this company
        HTTPException 400: Role must be HR for first registration
    """
    # Validate company exists
    company = await CompanyService.get_company_by_id(session, company_id)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid company_id. Please contact your admin.",
        )

    # Only HR role allowed for first registration
    if user_data.role != UserRole.HR:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="First user must have HR role",
        )

    try:
        # Create HR user in the specified company
        user = await UserService.create_user(session, company_id, user_data)
        
        # Generate verification token
        verification_token = EmailVerificationService.generate_verification_token()
        user.verification_token = verification_token
        user.email_verified = False
        user.verification_attempts = 0
        
        await session.commit()
        
        # Refresh to ensure all fields are loaded before session closes
        await session.refresh(user)
        
        # Send verification email
        try:
            await EmailVerificationService.send_verification_email(
                user,
                verification_token,
                frontend_url="http://localhost:3000",  # TODO: Load from config
            )
        except Exception as e:
            # Log the error but don't fail registration
            print(f"Failed to send verification email to {user.email}: {str(e)}")
        
        return user
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
