"""
User schemas for request/response validation.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole


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
    created_at: datetime
    updated_at: datetime

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
