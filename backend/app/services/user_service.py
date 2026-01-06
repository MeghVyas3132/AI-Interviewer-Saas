"""
User service for user management operations.
"""

from typing import List, Optional
from uuid import UUID

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.user import User, UserRole
from app.models.audit_log import AuditLog
from app.schemas.user_schema import UserCreate, UserUpdate
from app.services.auth_service import AuthService
from app.utils.password_hashing import verify_password


class UserService:
    """Service for user management operations."""

    @staticmethod
    async def create_user(
        session: AsyncSession,
        company_id: UUID,
        user_data: UserCreate,
    ) -> User:
        """
        Create a new user.

        Args:
            session: Database session
            company_id: Company ID
            user_data: User creation data

        Returns:
            Created user
        """
        # Check if user with this email already exists
        result = await session.execute(
            select(User).where(User.email == user_data.email),
        )
        if result.scalars().first():
            raise ValueError(f"User with email {user_data.email} already exists")

        user = User(
            company_id=company_id,
            name=user_data.name,
            email=user_data.email,
            password_hash=AuthService.hash_password(user_data.password),
            role=user_data.role,
            manager_id=user_data.manager_id,
            department=user_data.department,
            is_active=True,
            email_verified=True,  # Users created by HR are pre-verified
        )

        session.add(user)
        await session.flush()
        return user

    @staticmethod
    async def get_user_by_id(
        session: AsyncSession,
        user_id: UUID,
    ) -> Optional[User]:
        """
        Get user by ID.

        Args:
            session: Database session
            user_id: User ID

        Returns:
            User or None if not found
        """
        result = await session.execute(
            select(User).where(User.id == user_id),
        )
        return result.scalars().first()

    @staticmethod
    async def get_user_by_email(
        session: AsyncSession,
        email: str,
    ) -> Optional[User]:
        """
        Get user by email.

        Args:
            session: Database session
            email: User email

        Returns:
            User or None if not found
        """
        result = await session.execute(
            select(User).where(User.email == email),
        )
        return result.scalars().first()

    @staticmethod
    async def get_company_users(
        session: AsyncSession,
        company_id: UUID,
        skip: int = 0,
        limit: int = 20,
        role: Optional[UserRole] = None,
        custom_role_id: Optional[UUID] = None,
    ) -> List[User]:
        """
        Get users for a company.

        Args:
            session: Database session
            company_id: Company ID
            skip: Number of records to skip
            limit: Maximum number of records to return
            role: Optional system role filter (HR, EMPLOYEE, etc.)
            custom_role_id: Optional custom role ID filter

        Returns:
            List of users
        """
        query = select(User).where(User.company_id == company_id)

        if role:
            query = query.where(User.role == role)

        if custom_role_id:
            query = query.where(User.custom_role_id == custom_role_id)

        query = query.offset(skip).limit(limit)

        result = await session.execute(query)
        return result.scalars().all()

    @staticmethod
    async def update_user(
        session: AsyncSession,
        user_id: UUID,
        user_data: UserUpdate,
    ) -> Optional[User]:
        """
        Update user information.

        Args:
            session: Database session
            user_id: User ID
            user_data: Update data

        Returns:
            Updated user or None if not found
        """
        user = await UserService.get_user_by_id(session, user_id)
        if not user:
            return None

        # Update fields if provided
        if user_data.name is not None:
            user.name = user_data.name
        if user_data.role is not None:
            user.role = user_data.role
        if user_data.department is not None:
            user.department = user_data.department
        if user_data.is_active is not None:
            user.is_active = user_data.is_active
        if user_data.manager_id is not None:
            user.manager_id = user_data.manager_id

        await session.flush()
        return user

    @staticmethod
    async def delete_user(
        session: AsyncSession,
        user_id: UUID,
        hard_delete: bool = True,
    ) -> bool:
        """
        Delete user - either hard delete (removes from DB) or soft delete (set is_active to False).

        Args:
            session: Database session
            user_id: User ID
            hard_delete: If True, permanently delete user and related records. 
                        If False, soft delete (set is_active=False).

        Returns:
            True if successful
        """
        user = await UserService.get_user_by_id(session, user_id)
        if not user:
            return False

        if hard_delete:
            # Delete related audit logs first (foreign key constraint)
            await session.execute(
                delete(AuditLog).where(AuditLog.user_id == user_id)
            )
            # Now delete the user
            await session.execute(
                delete(User).where(User.id == user_id)
            )
        else:
            # Soft delete - just mark as inactive
            user.is_active = False
        
        await session.flush()
        return True

    @staticmethod
    async def change_password(
        session: AsyncSession,
        user_id: UUID,
        old_password: str,
        new_password: str,
    ) -> bool:
        """
        Change user password.

        Args:
            session: Database session
            user_id: User ID
            old_password: Current password
            new_password: New password

        Returns:
            True if successful
        """
        user = await UserService.get_user_by_id(session, user_id)
        if not user:
            return False

        if not verify_password(old_password, user.password_hash):
            raise ValueError("Old password is incorrect")

        user.password_hash = AuthService.hash_password(new_password)
        await session.flush()
        return True
