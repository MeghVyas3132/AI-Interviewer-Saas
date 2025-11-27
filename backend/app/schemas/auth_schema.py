"""
Authentication schemas for request/response validation.
"""

from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from enum import Enum
from datetime import datetime
from uuid import UUID


class UserRole(str, Enum):
    """User role enum."""
    SYSTEM_ADMIN = "SYSTEM_ADMIN"
    ADMIN = "ADMIN"
    HR = "HR"
    EMPLOYEE = "EMPLOYEE"
    CANDIDATE = "CANDIDATE"


class UserLoginResponse(BaseModel):
    """Schema for user in login response."""
    
    id: str
    email: str
    full_name: str
    role: UserRole
    company_id: str
    is_active: bool
    department: Optional[str] = None
    created_at: str


class LoginRequest(BaseModel):
    """Schema for login request."""

    email: EmailStr
    password: str = Field(..., min_length=8)


class TokenResponse(BaseModel):
    """Schema for token response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: Optional[UserLoginResponse] = None


class RefreshTokenRequest(BaseModel):
    """Schema for refresh token request."""

    refresh_token: str


class RegisterRequest(BaseModel):
    """Schema for user registration request.
    
    Supports two registration flows:
    1. Create new company: provide company_name
    2. Join existing company: provide company_id
    """
    
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=2, max_length=255)
    company_name: Optional[str] = Field(None, min_length=2, max_length=255)
    company_id: Optional[str] = Field(None, description="UUID of existing company to join")


class RegisterResponse(BaseModel):
    """Schema for registration response."""
    
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserLoginResponse
