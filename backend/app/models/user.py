"""
User model - represents users with different roles.
"""

from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, Column, DateTime, Enum as SQLEnum
from sqlalchemy import ForeignKey, String, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base
import uuid
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.role import Role


class UserRole(str, Enum):
    """User role enumeration."""

    SYSTEM_ADMIN = "SYSTEM_ADMIN"  # Global system administrator (sees all companies)
    HR = "HR"  # Company HR/Admin (sees all company data)
    EMPLOYEE = "EMPLOYEE"  # Regular employee (interviewer)
    CANDIDATE = "CANDIDATE"  # Job candidate


class User(Base):
    """User entity with role-based access control."""

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(
        SQLEnum(
            UserRole,
            values_callable=lambda x: [e.value for e in x],
            name='userrole',
            create_type=False,
        ),
        nullable=False,
        index=True
    )
    custom_role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=True, index=True)
    manager_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )
    department = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    email_verified = Column(Boolean, default=False, index=True)
    verification_token = Column(String(500), nullable=True, unique=True)
    verification_token_expires = Column(DateTime(timezone=True), nullable=True)
    verification_attempts = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    # Relationships
    manager = relationship(
        "User",
        remote_side=[id],
        foreign_keys=[manager_id],
        backref="subordinates",
        uselist=False,
    )
    custom_role = relationship(
        "Role",
        back_populates="users",
        foreign_keys=[custom_role_id],
        uselist=False,
    )

    def __repr__(self) -> str:
        """String representation of User."""
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"
