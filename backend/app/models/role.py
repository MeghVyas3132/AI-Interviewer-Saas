"""
Role model - represents custom roles within a company.
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, String, Text
from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
import uuid


class Role(Base):
    """Role entity for company-specific role management."""

    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_company_role_name"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    permissions = Column(String(1000), nullable=True)  # Comma-separated or JSON string
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    users = relationship(
        "User",
        back_populates="custom_role",
        cascade="save-update, merge",
        foreign_keys="User.custom_role_id",
    )

    def __repr__(self) -> str:
        """String representation of Role."""
        return f"<Role(id={self.id}, company_id={self.company_id}, name={self.name})>"
