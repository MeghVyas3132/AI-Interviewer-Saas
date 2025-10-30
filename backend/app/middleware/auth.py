"""
Security middleware for authentication and authorization.
"""

from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from starlette.requests import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User, UserRole
from app.services.user_service import UserService
from app.utils.jwt_helper import verify_token

security = HTTPBearer()


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> User:
    """
    Get current authenticated user from JWT token.

    Args:
        request: HTTP request
        session: Database session

    Returns:
        Current user

    Raises:
        HTTPException: If token is invalid
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = auth_header[7:]  # Remove "Bearer " prefix
    payload = verify_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await UserService.get_user_by_id(session, UUID(user_id))
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return user


def require_role(*allowed_roles: UserRole):
    """
    Create a role-based authorization dependency.

    Args:
        *allowed_roles: Allowed user roles

    Returns:
        Authorization dependency function
    """

    async def check_role(current_user: User = Depends(get_current_user)) -> User:
        """Check if current user has required role."""
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return check_role


async def require_hr(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Require HR role.

    Args:
        current_user: Current authenticated user

    Returns:
        Current user
    """
    if current_user.role != UserRole.HR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR role required",
        )
    return current_user


async def require_team_lead(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Require Team Lead or HR role.

    Args:
        current_user: Current authenticated user

    Returns:
        Current user
    """
    if current_user.role not in [UserRole.TEAM_LEAD, UserRole.HR]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Team Lead or HR role required",
        )
    return current_user


async def require_employee(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Require Employee, Team Lead, or HR role.

    Args:
        current_user: Current authenticated user

    Returns:
        Current user
    """
    if current_user.role not in [UserRole.EMPLOYEE, UserRole.TEAM_LEAD, UserRole.HR]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Employee or higher role required",
        )
    return current_user


async def require_authenticated(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Require any authenticated user.

    Args:
        current_user: Current authenticated user

    Returns:
        Current user
    """
    return current_user
