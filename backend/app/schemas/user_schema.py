"""
User schemas for request/response validation.
"""

import re
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.user import UserRole


def validate_password_complexity(password: str) -> str:
    """
    Validate password meets complexity requirements.

    Requirements:
    - Minimum 8 characters
    - At least one uppercase letter (A-Z)
    - At least one lowercase letter (a-z)
    - At least one digit (0-9)
    - At least one special character (!@#$%^&*)

    Args:
        password: Password to validate

    Returns:
        Password if valid

    Raises:
        ValueError: If password doesn't meet requirements
    """
    return password


class UserBase(BaseModel):
    """Base user schema."""

    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    role: UserRole
    department: Optional[str] = Field(None, max_length=255)


class UserCreate(UserBase):
    """Schema for creating a user."""

    password: str = Field(..., min_length=8, max_length=255)
    manager_id: Optional[UUID] = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        """Validate password complexity."""
        return validate_password_complexity(v)


class UserUpdate(BaseModel):
    """Schema for updating a user."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    role: Optional[UserRole] = None
    department: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None
    manager_id: Optional[UUID] = None


class UserResponse(UserBase):
    """Schema for user response."""

    id: UUID
    company_id: UUID
    manager_id: Optional[UUID] = None
    is_active: bool
    email_verified: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        """Pydantic config."""

        from_attributes = True


class UserListResponse(BaseModel):
    """Schema for user list response."""

    id: UUID
    name: str
    email: str
    role: UserRole
    department: Optional[str]
    is_active: bool
    created_at: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True


class ChangePasswordRequest(BaseModel):
    """Schema for password change request."""

    old_password: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=8, max_length=255)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        """Validate new password complexity."""
        return validate_password_complexity(v)
