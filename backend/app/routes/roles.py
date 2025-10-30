"""
Role management routes.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import get_current_user, require_hr
from app.models.user import User
from app.schemas.role_schema import (
    RoleCreate,
    RoleListResponse,
    RoleResponse,
    RoleUpdate,
    RoleWithUserCount,
)
from app.schemas.user_schema import UserListResponse
from app.services.audit_log_service import AuditLogService
from app.services.role_service import RoleService
from app.services.user_service import UserService

router = APIRouter(prefix="/api/v1/roles", tags=["roles"])


@router.post("", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    role_data: RoleCreate,
    current_user: User = Depends(require_hr),
    session: AsyncSession = Depends(get_db),
) -> RoleResponse:
    """
    Create a new role in the company (HR only).

    Args:
        role_data: Role creation data
        current_user: Current authenticated HR user
        session: Database session

    Returns:
        Created role
    """
    try:
        role = await RoleService.create_role(
            session,
            current_user.company_id,
            role_data,
        )

        # Log role creation
        await AuditLogService.log_action(
            session,
            current_user.company_id,
            current_user.id,
            "CREATE_ROLE",
            resource_type="role",
            resource_id=role.id,
        )

        await session.commit()
        return role
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("", response_model=List[RoleListResponse])
async def list_roles(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    is_active: bool | None = None,
) -> List[RoleListResponse]:
    """
    List roles in the company with user counts.

    Args:
        current_user: Current authenticated user
        session: Database session
        skip: Number of records to skip
        limit: Maximum number of records
        is_active: Optional filter for active/inactive roles

    Returns:
        List of roles with user counts
    """
    roles_with_counts = await RoleService.get_company_roles_with_counts(
        session,
        current_user.company_id,
        skip=skip,
        limit=limit,
    )

    return roles_with_counts


@router.get("/{role_id}", response_model=RoleWithUserCount)
async def get_role(
    role_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> RoleWithUserCount:
    """
    Get role by ID with user count.

    Args:
        role_id: Role ID
        current_user: Current authenticated user
        session: Database session

    Returns:
        Role details with user count
    """
    role = await RoleService.get_role_by_id(session, role_id)
    if not role or role.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found",
        )

    role_data = await RoleService.get_role_with_user_count(session, role_id)
    return role_data


@router.put("/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: UUID,
    role_data: RoleUpdate,
    current_user: User = Depends(require_hr),
    session: AsyncSession = Depends(get_db),
) -> RoleResponse:
    """
    Update role information (HR only).

    Args:
        role_id: Role ID
        role_data: Update data
        current_user: Current authenticated HR user
        session: Database session

    Returns:
        Updated role
    """
    role = await RoleService.get_role_by_id(session, role_id)
    if not role or role.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found",
        )

    role = await RoleService.update_role(session, role_id, role_data)

    # Log update action
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "UPDATE_ROLE",
        resource_type="role",
        resource_id=role_id,
    )

    await session.commit()
    return role


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: UUID,
    current_user: User = Depends(require_hr),
    session: AsyncSession = Depends(get_db),
) -> None:
    """
    Delete role (soft delete - HR only).

    Args:
        role_id: Role ID
        current_user: Current authenticated HR user
        session: Database session
    """
    role = await RoleService.get_role_by_id(session, role_id)
    if not role or role.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found",
        )

    await RoleService.delete_role(session, role_id)

    # Log delete action
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "DELETE_ROLE",
        resource_type="role",
        resource_id=role_id,
    )

    await session.commit()


@router.get("/{role_id}/users", response_model=List[UserListResponse])
async def get_users_by_role(
    role_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> List[UserListResponse]:
    """
    Get all users with a specific role.

    Args:
        role_id: Role ID
        current_user: Current authenticated user
        session: Database session
        skip: Number of records to skip
        limit: Maximum number of records

    Returns:
        List of users with the role
    """
    role = await RoleService.get_role_by_id(session, role_id)
    if not role or role.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found",
        )

    users = await RoleService.get_users_by_role(
        session,
        role_id,
        skip=skip,
        limit=limit,
    )

    return users


@router.post("/{role_id}/users/{user_id}")
async def assign_role_to_user(
    role_id: UUID,
    user_id: UUID,
    current_user: User = Depends(require_hr),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """
    Assign a role to a user (HR only).

    Args:
        role_id: Role ID
        user_id: User ID
        current_user: Current authenticated HR user
        session: Database session

    Returns:
        Success message
    """
    role = await RoleService.get_role_by_id(session, role_id)
    if not role or role.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found",
        )

    user = await UserService.get_user_by_id(session, user_id)
    if not user or user.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.custom_role_id = role_id
    await session.flush()

    # Log action
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "ASSIGN_ROLE",
        resource_type="user_role",
        resource_id=user_id,
        details=f"Role {role.name} assigned",
    )

    await session.commit()
    return {"message": f"Role '{role.name}' assigned to user successfully"}


@router.delete("/{role_id}/users/{user_id}")
async def remove_role_from_user(
    role_id: UUID,
    user_id: UUID,
    current_user: User = Depends(require_hr),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """
    Remove a role from a user (HR only).

    Args:
        role_id: Role ID
        user_id: User ID
        current_user: Current authenticated HR user
        session: Database session

    Returns:
        Success message
    """
    role = await RoleService.get_role_by_id(session, role_id)
    if not role or role.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found",
        )

    user = await UserService.get_user_by_id(session, user_id)
    if not user or user.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if user.custom_role_id != role_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User does not have this role",
        )

    user.custom_role_id = None
    await session.flush()

    # Log action
    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "REMOVE_ROLE",
        resource_type="user_role",
        resource_id=user_id,
        details=f"Role {role.name} removed",
    )

    await session.commit()
    return {"message": f"Role '{role.name}' removed from user successfully"}
