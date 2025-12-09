"""
Company model - represents organizations using the platform.
"""

from datetime import datetime
import random
import string

from sqlalchemy import Boolean, Column, DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.core.database import Base
import uuid


def generate_join_code() -> str:
    """Generate a short, human-friendly join code like ABCD-EFGH."""
    chars = string.ascii_uppercase
    part1 = ''.join(random.choices(chars, k=4))
    part2 = ''.join(random.choices(chars, k=4))
    return f"{part1}-{part2}"


class Company(Base):
    """Company entity for multi-tenant support."""

    __tablename__ = "companies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    join_code = Column(String(9), nullable=False, unique=True, index=True, default=generate_join_code)
    name = Column(String(255), nullable=False, unique=True, index=True)
    email_domain = Column(String(255), nullable=True, unique=True, index=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        """String representation of Company."""
        return f"<Company(id={self.id}, name={self.name})>"
