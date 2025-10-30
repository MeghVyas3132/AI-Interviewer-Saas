"""
Authentication routes.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.schemas.auth_schema import LoginRequest, RefreshTokenRequest, TokenResponse
from app.services.auth_service import AuthService
from app.services.audit_log_service import AuditLogService
from app.utils.redis_client import redis_client

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Login user and return JWT tokens.

    Args:
        request: Login credentials
        session: Database session

    Returns:
        TokenResponse with access and refresh tokens
    """
    user = await AuthService.authenticate_user(
        session,
        request.email,
        request.password,
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    tokens = AuthService.create_tokens(user.id, user.company_id)

    # Log login action
    await AuditLogService.log_action(
        session,
        user.company_id,
        user.id,
        "LOGIN",
        resource_type="user",
        resource_id=user.id,
    )

    await session.commit()

    return tokens


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: RefreshTokenRequest,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Refresh access token using refresh token.

    Args:
        request: Refresh token request
        session: Database session

    Returns:
        TokenResponse with new access token
    """
    result = AuthService.verify_and_refresh_token(request.refresh_token)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    access_token, refresh_token = result

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/logout")
async def logout(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """
    Logout user.

    Args:
        current_user: Current authenticated user
        session: Database session

    Returns:
        Success message
    """
    # Log logout action
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "LOGOUT",
        resource_type="user",
        resource_id=current_user.id,
    )

    await session.commit()

    return {"message": "Logged out successfully"}
