"""
Company schemas for request/response validation.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID
import re

from pydantic import BaseModel, Field, field_validator


class CompanyBase(BaseModel):
    """Base company schema."""

    name: str = Field(..., min_length=1, max_length=255)
    email_domain: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate company name - alphanumeric, spaces, hyphens only."""
        if not re.match(r"^[a-zA-Z0-9\s\-_.()&']+$", v):
            raise ValueError("Company name can only contain letters, numbers, spaces, and -_().&'")
        return v.strip()

    @field_validator("email_domain")
    @classmethod
    def validate_email_domain(cls, v: Optional[str]) -> Optional[str]:
        """Validate email domain format."""
        if v is None:
            return None
        
        v = v.strip().lower()
        
        # Basic domain format validation
        domain_pattern = r"^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$"
        if not re.match(domain_pattern, v):
            raise ValueError("Invalid email domain format (e.g., company.com)")
        
        return v


class CompanyCreate(CompanyBase):
    """Schema for creating a company."""

    pass


class CompanyUpdate(BaseModel):
    """Schema for updating a company."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email_domain: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        """Validate company name - alphanumeric, spaces, hyphens only."""
        if v is None:
            return None
        if not re.match(r"^[a-zA-Z0-9\s\-_.()&']+$", v):
            raise ValueError("Company name can only contain letters, numbers, spaces, and -_().&'")
        return v.strip()

    @field_validator("email_domain")
    @classmethod
    def validate_email_domain(cls, v: Optional[str]) -> Optional[str]:
        """Validate email domain format."""
        if v is None:
            return None
        
        v = v.strip().lower()
        
        domain_pattern = r"^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$"
        if not re.match(domain_pattern, v):
            raise ValueError("Invalid email domain format (e.g., company.com)")
        
        return v


class CompanyResponse(CompanyBase):
    """Schema for company response."""

    id: UUID
    join_code: str  # Short code like ABCD-EFGH for users to join
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        """Pydantic config."""

        from_attributes = True


class CompanyDetailResponse(CompanyResponse):
    """Detailed company response with full info."""

    pass
