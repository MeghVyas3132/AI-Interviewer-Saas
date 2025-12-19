"""
Authentication service for user login, token generation, and validation.
"""

from typing import Optional, Tuple
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.user import User
from app.schemas.auth_schema import TokenResponse
from app.utils.jwt_helper import create_access_token, create_refresh_token, verify_token
from app.utils.password_hashing import hash_password, verify_password


class AuthService:
    """Service for authentication operations."""

    @staticmethod
    async def check_email_exists(
        session: AsyncSession,
        email: str,
    ) -> Optional[User]:
        """
        Check if email exists in database.

        Login Flow Step 1: Email check

        Args:
            session: Database session
            email: User email to check

        Returns:
            User object if found, None otherwise
        """
        result = await session.execute(
            select(User).where(User.email == email),
        )
        return result.scalars().first()

    @staticmethod
    async def check_password(
        session: AsyncSession,
        email: str,
        password: str,
    ) -> bool:
        """
        Check if password is correct for the email.

        Login Flow Step 2: Password check

        Args:
            session: Database session
            email: User email
            password: Plain text password to verify

        Returns:
            True if password is correct, False otherwise
        """
        result = await session.execute(
            select(User).where(User.email == email),
        )
        user = result.scalars().first()

        if not user:
            return False

        return verify_password(password, user.password_hash)

    @staticmethod
    async def authenticate_user(
        session: AsyncSession,
        email: str,
        password: str,
    ) -> Optional[User]:
        """
        Authenticate user by email and password following the login flow.

        Login Flow Steps:
        1. Email check - Verify email exists in database
        2. Password check - Verify password matches hash
        3. Return user if authentication successful

        Args:
            session: Database session
            email: User email
            password: Plain text password

        Returns:
            User object if authentication successful, None otherwise
        """
        # Step 1: Email check
        result = await session.execute(
            select(User).where(User.email == email),
        )
        user = result.scalars().first()

        if not user or not user.is_active:
            return None

        # Check if email is verified
        if not user.email_verified:
            return None

        # Step 2: Password check
        if not verify_password(password, user.password_hash):
            return None

        # Step 3: Authentication successful
        return user

    @staticmethod
    def create_tokens(user_id: UUID, company_id: UUID) -> TokenResponse:
        """
        Create access and refresh tokens for user.

        Login Flow Step 3: JWT generation

        Args:
            user_id: User ID
            company_id: Company ID

        Returns:
            TokenResponse with access and refresh tokens
        """
        access_token = create_access_token(
            data={
                "sub": str(user_id),
                "company_id": str(company_id),
            },
        )
        refresh_token = create_refresh_token(
            data={
                "sub": str(user_id),
                "company_id": str(company_id),
            },
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
        )

    @staticmethod
    def verify_and_refresh_token(refresh_token: str) -> Optional[Tuple[str, str, UUID, UUID]]:
        """
        Verify refresh token and generate new access token.

        Args:
            refresh_token: Refresh token to verify

        Returns:
            Tuple of (new_access_token, refresh_token, user_id, company_id) or None if invalid
        """
        payload = verify_token(refresh_token)

        if not payload:
            return None

        user_id = UUID(payload.get("sub"))
        company_id = UUID(payload.get("company_id"))

        new_access_token = create_access_token(
            data={
                "sub": str(user_id),
                "company_id": str(company_id),
            },
        )

        return new_access_token, refresh_token, user_id, company_id

    @staticmethod
    def hash_password(password: str) -> str:
        """
        Hash password using bcrypt.

        Args:
            password: Plain text password

        Returns:
            Hashed password
        """
        return hash_password(password)
