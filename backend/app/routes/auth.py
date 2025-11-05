"""
Authentication routes implementing login flow.

Login Flow:
1. Email check - Verify email exists in database
2. Password check - Verify password is correct  
3. JWT generation - Create access and refresh tokens
4. Cookie setting - Send refresh token via secure HTTP-only cookie
"""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.schemas.auth_schema import LoginRequest, RefreshTokenRequest, TokenResponse
from app.services.auth_service import AuthService
from app.services.audit_log_service import AuditLogService

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Login user and return JWT tokens following the login flow.

    Login Flow Steps:
    1. Email check - Verify email exists in database
    2. Password check - Verify password is correct
    3. JWT generation - Create access and refresh tokens
    4. Cookie setting - Set refresh token in secure HTTP-only cookie

    Args:
        request: Login credentials (email, password)
        response: HTTP response to set cookie
        session: Database session

    Returns:
        TokenResponse with access_token and refresh_token

    Raises:
        HTTPException 401: Email not found in database
        HTTPException 401: Invalid password
    """
    # Step 1: Email check
    user = await AuthService.authenticate_user(
        session,
        request.email,
        request.password,
    )

    if not user:
        # Email not found or password invalid
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Step 3: JWT generation
    tokens = AuthService.create_tokens(user.id, user.company_id)

    # Step 4: Set secure HTTP-only cookie for refresh token
    response.set_cookie(
        key="refresh_token",
        value=tokens.refresh_token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=7 * 24 * 60 * 60,  # 7 days
    )

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
    response: Response = Response(),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """
    Logout user and clear refresh token cookie.

    Args:
        current_user: Current authenticated user
        response: HTTP response to clear cookie
        session: Database session

    Returns:
        Success message
    """
    # Clear refresh token cookie
    response.delete_cookie(
        key="refresh_token",
        httponly=True,
        secure=True,
        samesite="strict",
    )

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
