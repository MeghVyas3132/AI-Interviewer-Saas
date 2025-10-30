"""
Role schemas for API requests and responses.
"""

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class RoleCreate(BaseModel):
    """Schema for creating a new role."""

    name: str = Field(..., min_length=1, max_length=255, description="Role name")
    description: Optional[str] = Field(None, max_length=1000, description="Role description")
    permissions: Optional[str] = Field(None, description="Comma-separated permissions")


class RoleUpdate(BaseModel):
    """Schema for updating a role."""

    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Role name")
    description: Optional[str] = Field(None, max_length=1000, description="Role description")
    permissions: Optional[str] = Field(None, description="Comma-separated permissions")
    is_active: Optional[bool] = Field(None, description="Whether role is active")


class RoleResponse(BaseModel):
    """Schema for role responses."""

    id: UUID
    company_id: UUID
    name: str
    description: Optional[str]
    permissions: Optional[str]
    is_active: bool
    created_at: str
    updated_at: str

    class Config:
        """Pydantic config."""

        from_attributes = True


class RoleWithUserCount(RoleResponse):
    """Schema for role response with user count."""

    user_count: int = Field(0, description="Number of users with this role")


class RoleListResponse(BaseModel):
    """Schema for role list response."""

    id: UUID
    name: str
    description: Optional[str]
    permissions: Optional[str]
    is_active: bool
    user_count: int = 0

    class Config:
        """Pydantic config."""

        from_attributes = True
