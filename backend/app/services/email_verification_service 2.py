"""
Email verification service for user registration.
Handles token generation, verification, and resend logic.
"""

import secrets
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.services.notification_service import NotificationService


class EmailVerificationService:
    """Service for email verification during registration."""

    VERIFICATION_TOKEN_LENGTH = 32
    VERIFICATION_EXPIRY_HOURS = 24
    MAX_VERIFICATION_ATTEMPTS = 5

    @staticmethod
    def generate_verification_token() -> str:
        """
        Generate a secure random verification token.

        Returns:
            32-character secure random token
        """
        return secrets.token_urlsafe(EmailVerificationService.VERIFICATION_TOKEN_LENGTH)

    @staticmethod
    async def send_verification_email(
        user: User,
        verification_token: str,
        frontend_url: str = "https://app.example.com",
    ) -> bool:
        """
        Send verification email to user.

        Args:
            user: User object
            verification_token: Token to include in email
            frontend_url: Frontend URL for verification link

        Returns:
            True if email sent successfully, False otherwise
        """
        verification_link = (
            f"{frontend_url}/verify-email?token={verification_token}"
        )

        email_data = {
            "to": user.email,
            "subject": "Verify Your Email - AI Interviewer",
            "template": "email_verification",
            "context": {
                "user_name": user.name,
                "verification_link": verification_link,
                "expiry_hours": EmailVerificationService.VERIFICATION_EXPIRY_HOURS,
            },
        }

        try:
            await NotificationService.send_email(**email_data)
            return True
        except Exception as e:
            # Log but don't fail - user can resend
            print(f"Failed to send verification email: {e}")
            return False

    @staticmethod
    async def verify_email_token(
        session: AsyncSession,
        token: str,
    ) -> User:
        """
        Verify an email token and activate the user account.

        Args:
            session: Database session
            token: Verification token

        Returns:
            User object

        Raises:
            ValueError: If token is invalid or expired
        """
        # Find user with this token
        result = await session.execute(
            select(User).where(
                User.verification_token == token,
                User.email_verified == False,
            )
        )
        user = result.scalars().first()

        if not user:
            raise ValueError("Invalid or already used verification token")

        # Check if token has expired
        if user.verification_token_expires and \
           user.verification_token_expires < datetime.utcnow():
            raise ValueError("Verification token has expired. Please request a new one.")

        # Mark email as verified
        user.email_verified = True
        user.verification_token = None
        user.verification_token_expires = None

        await session.commit()
        return user

    @staticmethod
    async def resend_verification_email(
        session: AsyncSession,
        email: str,
        frontend_url: str = "https://app.example.com",
    ) -> None:
        """
        Resend verification email to user.

        Args:
            session: Database session
            email: User email address
            frontend_url: Frontend URL for verification link

        Raises:
            ValueError: If user not found, already verified, or too many attempts
        """
        # Find user
        result = await session.execute(
            select(User).where(User.email == email)
        )
        user = result.scalars().first()

        if not user:
            # Don't reveal if email exists
            raise ValueError("If this email exists, verification link will be sent")

        # Already verified
        if user.email_verified:
            raise ValueError("Your email is already verified")

        # Check if too many resend attempts
        if user.verification_attempts and \
           user.verification_attempts >= EmailVerificationService.MAX_VERIFICATION_ATTEMPTS:
            raise ValueError("Too many verification attempts. Please contact support.")

        # Generate new token
        new_token = EmailVerificationService.generate_verification_token()
        user.verification_token = new_token
        user.verification_token_expires = datetime.utcnow() + timedelta(
            hours=EmailVerificationService.VERIFICATION_EXPIRY_HOURS
        )
        user.verification_attempts = (user.verification_attempts or 0) + 1

        await session.commit()

        # Send email
        await EmailVerificationService.send_verification_email(
            user, new_token, frontend_url
        )
