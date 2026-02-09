"""
Company Registration Request model - holds pending company registration requests.
"""

from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.core.database import Base
import uuid


class RequestStatus(str, PyEnum):
    """Status of company registration request."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class CompanyRequest(Base):
    """
    Company registration request entity.
    
    When a user wants to create a new company, a request is created here
    instead of directly creating a Company. System admin reviews and 
    approves/rejects the request.
    """

    __tablename__ = "company_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Requested company info
    company_name = Column(String(255), nullable=False, index=True)
    email_domain = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    
    # Requester info (the user who will become HR if approved)
    requester_email = Column(String(255), nullable=False, index=True)
    requester_name = Column(String(255), nullable=False)
    requester_password_hash = Column(String(255), nullable=False)
    
    # Request status
    status = Column(
        Enum(RequestStatus, name="request_status"),
        default=RequestStatus.PENDING,
        nullable=False,
        index=True
    )
    
    # Admin review info
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    
    # If approved, link to created company
    approved_company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        """String representation of CompanyRequest."""
        return f"<CompanyRequest(id={self.id}, company={self.company_name}, status={self.status})>"
