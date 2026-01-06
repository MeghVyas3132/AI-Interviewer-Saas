"""
User management routes.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import (
    get_current_user,
    require_employee,
    require_hr,
    require_hr_or_admin,
    require_team_lead,
)
from app.models.user import User, UserRole
from app.schemas.user_schema import (
    ChangePasswordRequest,
    UserCreate,
    UserListResponse,
    UserResponse,
    UserUpdate,
)
from app.services.audit_log_service import AuditLogService
from app.services.user_service import UserService

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(require_hr_or_admin),
    session: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    Create a new user (HR or Admin).

    Args:
        user_data: User creation data
        current_user: Current authenticated HR or Admin user
        session: Database session

    Returns:
        Created user
    """
    try:
        user = await UserService.create_user(
            session,
            current_user.company_id,
            user_data,
        )

        # Log user creation
        await AuditLogService.log_action(
            session,
            current_user.company_id,
            current_user.id,
            "CREATE_USER",
            resource_type="user",
            resource_id=user.id,
        )

        await session.commit()
        return user
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("", response_model=List[UserListResponse])
async def list_users(
    current_user: User = Depends(require_team_lead),
    session: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    role: Optional[UserRole] = None,
    custom_role_id: Optional[UUID] = None,
) -> List[UserListResponse]:
    """
    List users in the company (Employee and above).

    Args:
        current_user: Current authenticated user
        session: Database session
        skip: Number of records to skip
        limit: Maximum number of records
        role: Optional system role filter (HR, EMPLOYEE, CANDIDATE)
        custom_role_id: Optional custom role ID filter

    Returns:
        List of users
    """
    users = await UserService.get_company_users(
        session,
        current_user.company_id,
        skip=skip,
        limit=limit,
        role=role,
        custom_role_id=custom_role_id,
    )

    return users


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    Get user by ID.

    Args:
        user_id: User ID
        current_user: Current authenticated user
        session: Database session

    Returns:
        User details
    """
    # Users can view themselves or their company members (if HR)
    if user_id != current_user.id and current_user.role not in [
        UserRole.EMPLOYEE,
        UserRole.HR,
    ]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot view other user data",
        )

    user = await UserService.get_user_by_id(session, user_id)
    if not user or user.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    user_data: UserUpdate,
    current_user: User = Depends(require_hr),
    session: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    Update user information (HR only).

    Args:
        user_id: User ID
        user_data: Update data
        current_user: Current authenticated HR user
        session: Database session

    Returns:
        Updated user
    """
    user = await UserService.get_user_by_id(session, user_id)
    if not user or user.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user = await UserService.update_user(session, user_id, user_data)

    # Log update action
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "UPDATE_USER",
        resource_type="user",
        resource_id=user_id,
    )

    await session.commit()
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID,
    current_user: User = Depends(require_hr),
    session: AsyncSession = Depends(get_db),
) -> None:
    """
    Delete user (soft delete - HR can delete employees, System Admin can delete anyone).

    Args:
        user_id: User ID
        current_user: Current authenticated admin user
        session: Database session
    """
    user = await UserService.get_user_by_id(session, user_id)
    if not user or user.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    
    # HR can only delete EMPLOYEE role
    if current_user.role == UserRole.HR:
        if user.role != UserRole.EMPLOYEE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="HR users can only delete employees. Contact system admin for other roles.",
            )
    # Non-admin roles (except HR) cannot delete users
    elif current_user.role != UserRole.SYSTEM_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only HR and system administrators can delete users.",
        )
    
    # Prevent deleting yourself
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account.",
        )

    # Store user info for logging before deletion
    deleted_user_email = user.email
    deleted_user_name = user.name

    # Hard delete user and related records
    await UserService.delete_user(session, user_id, hard_delete=True)

    # Log delete action (use current user's ID since deleted user no longer exists)
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "DELETE_USER",
        resource_type="user",
        resource_id=user_id,
        metadata={"deleted_user": deleted_user_name, "deleted_email": deleted_user_email},
    )

    await session.commit()


@router.post("/{user_id}/change-password")
async def change_password(
    user_id: UUID,
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """
    Change user password.

    Args:
        user_id: User ID
        request: Password change request
        current_user: Current authenticated user
        session: Database session

    Returns:
        Success message
    """
    # Users can only change their own password
    if user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot change other user's password",
        )

    try:
        await UserService.change_password(
            session,
            user_id,
            request.old_password,
            request.new_password,
        )

        # Log password change
        await AuditLogService.log_action(
            session,
            current_user.company_id,
            current_user.id,
            "CHANGE_PASSWORD",
            resource_type="user",
            resource_id=user_id,
        )

        await session.commit()
        return {"message": "Password changed successfully"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
