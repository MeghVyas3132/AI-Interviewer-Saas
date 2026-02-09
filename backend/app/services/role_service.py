"""
Role service for role management operations.
"""

from typing import List, Optional
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.role import Role
from app.models.user import User
from app.schemas.role_schema import RoleCreate, RoleUpdate


class RoleService:
    """Service for role management operations."""

    @staticmethod
    async def create_role(
        session: AsyncSession,
        company_id: UUID,
        role_data: RoleCreate,
    ) -> Role:
        """
        Create a new role.

        Args:
            session: Database session
            company_id: Company ID
            role_data: Role creation data

        Returns:
            Created role
        """
        # Check if role with this name already exists for the company
        result = await session.execute(
            select(Role).where(
                (Role.company_id == company_id) & (Role.name == role_data.name)
            ),
        )
        if result.scalars().first():
            raise ValueError(f"Role '{role_data.name}' already exists for this company")

        role = Role(
            company_id=company_id,
            name=role_data.name,
            description=role_data.description,
            permissions=role_data.permissions,
        )

        session.add(role)
        await session.flush()
        return role

    @staticmethod
    async def get_role_by_id(
        session: AsyncSession,
        role_id: UUID,
    ) -> Optional[Role]:
        """
        Get role by ID.

        Args:
            session: Database session
            role_id: Role ID

        Returns:
            Role or None if not found
        """
        result = await session.execute(
            select(Role).where(Role.id == role_id),
        )
        return result.scalars().first()

    @staticmethod
    async def get_company_roles(
        session: AsyncSession,
        company_id: UUID,
        skip: int = 0,
        limit: int = 50,
        is_active: Optional[bool] = None,
    ) -> List[Role]:
        """
        Get roles for a company.

        Args:
            session: Database session
            company_id: Company ID
            skip: Number of records to skip
            limit: Maximum number of records to return
            is_active: Optional filter for active/inactive roles

        Returns:
            List of roles
        """
        query = select(Role).where(Role.company_id == company_id)

        if is_active is not None:
            query = query.where(Role.is_active == is_active)

        query = query.offset(skip).limit(limit)

        result = await session.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_role_with_user_count(
        session: AsyncSession,
        role_id: UUID,
    ) -> dict:
        """
        Get role with user count.

        Args:
            session: Database session
            role_id: Role ID

        Returns:
            Role data with user count
        """
        role = await RoleService.get_role_by_id(session, role_id)
        if not role:
            return None

        # Count users with this role
        result = await session.execute(
            select(func.count(User.id)).where(User.custom_role_id == role_id)
        )
        user_count = result.scalar() or 0

        return {
            "id": role.id,
            "company_id": role.company_id,
            "name": role.name,
            "description": role.description,
            "permissions": role.permissions,
            "is_active": role.is_active,
            "created_at": role.created_at.isoformat(),
            "updated_at": role.updated_at.isoformat(),
            "user_count": user_count,
        }

    @staticmethod
    async def get_company_roles_with_counts(
        session: AsyncSession,
        company_id: UUID,
        skip: int = 0,
        limit: int = 50,
    ) -> List[dict]:
        """
        Get all roles for a company with user counts.

        Args:
            session: Database session
            company_id: Company ID
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            List of roles with user counts
        """
        roles = await RoleService.get_company_roles(
            session,
            company_id,
            skip=skip,
            limit=limit,
        )

        result = []
        for role in roles:
            user_count_result = await session.execute(
                select(func.count(User.id)).where(User.custom_role_id == role.id)
            )
            user_count = user_count_result.scalar() or 0

            result.append({
                "id": role.id,
                "name": role.name,
                "description": role.description,
                "permissions": role.permissions,
                "is_active": role.is_active,
                "user_count": user_count,
            })

        return result

    @staticmethod
    async def update_role(
        session: AsyncSession,
        role_id: UUID,
        role_data: RoleUpdate,
    ) -> Optional[Role]:
        """
        Update role information.

        Args:
            session: Database session
            role_id: Role ID
            role_data: Update data

        Returns:
            Updated role or None if not found
        """
        role = await RoleService.get_role_by_id(session, role_id)
        if not role:
            return None

        # Update fields if provided
        if role_data.name is not None:
            role.name = role_data.name
        if role_data.description is not None:
            role.description = role_data.description
        if role_data.permissions is not None:
            role.permissions = role_data.permissions
        if role_data.is_active is not None:
            role.is_active = role_data.is_active

        await session.flush()
        return role

    @staticmethod
    async def delete_role(
        session: AsyncSession,
        role_id: UUID,
    ) -> bool:
        """
        Soft delete role (set is_active to False).
        Also detaches all users from this role.

        Args:
            session: Database session
            role_id: Role ID

        Returns:
            True if successful
        """
        role = await RoleService.get_role_by_id(session, role_id)
        if not role:
            return False

        role.is_active = False

        # Detach all users from this role
        await session.execute(
            select(User).where(User.custom_role_id == role_id)
        )
        result = await session.execute(
            select(User).where(User.custom_role_id == role_id)
        )
        for user in result.scalars().all():
            user.custom_role_id = None

        await session.flush()
        return True

    @staticmethod
    async def get_users_by_role(
        session: AsyncSession,
        role_id: UUID,
        skip: int = 0,
        limit: int = 20,
    ) -> List[User]:
        """
        Get all users with a specific role.

        Args:
            session: Database session
            role_id: Role ID
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            List of users
        """
        query = select(User).where(User.custom_role_id == role_id)
        query = query.offset(skip).limit(limit)

        result = await session.execute(query)
        return result.scalars().all()
