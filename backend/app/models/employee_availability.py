"""
Employee Availability model - stores time slots for auto-scheduling interviews.
"""

from datetime import datetime, time
from enum import Enum

from sqlalchemy import Boolean, Column, DateTime, Enum as SQLEnum
from sqlalchemy import ForeignKey, String, Time, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base
import uuid


class DayOfWeek(str, Enum):
    """Days of the week."""
    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"


class EmployeeAvailability(Base):
    """
    Stores employee's available time slots for scheduling interviews.
    When a candidate passes a round, the system picks the next available slot.
    """

    __tablename__ = "employee_availability"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    
    # Day and time slot
    day_of_week = Column(
        SQLEnum(
            DayOfWeek,
            values_callable=lambda x: [e.value for e in x],
            name='dayofweek',
            create_type=False,
        ),
        nullable=False
    )
    start_time = Column(Time, nullable=False)  # e.g., 14:00
    end_time = Column(Time, nullable=False)    # e.g., 16:00
    
    # Slot duration in minutes (default 30 mins per interview)
    slot_duration_minutes = Column(Integer, default=30)
    
    # Max interviews per slot
    max_interviews_per_slot = Column(Integer, default=1)
    
    # Is this slot active?
    is_active = Column(Boolean, default=True)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    employee = relationship("User", foreign_keys=[employee_id])


class ScheduledSlot(Base):
    """
    Tracks which slots are already booked to prevent double-booking.
    """

    __tablename__ = "scheduled_slots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    availability_id = Column(UUID(as_uuid=True), ForeignKey("employee_availability.id"), nullable=False)
    interview_id = Column(UUID(as_uuid=True), ForeignKey("interviews.id"), nullable=False, unique=True)
    
    # The actual scheduled datetime
    scheduled_datetime = Column(DateTime(timezone=True), nullable=False)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    availability = relationship("EmployeeAvailability")
    interview = relationship("Interview")


class AutoScheduleConfig(Base):
    """
    Configuration for auto-scheduling behavior per employee.
    """

    __tablename__ = "auto_schedule_config"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    
    # Minimum days after interview to schedule next round
    min_days_gap = Column(Integer, default=1)
    
    # Maximum days to look ahead for available slots
    max_days_ahead = Column(Integer, default=14)
    
    # Passing score threshold (0-100)
    passing_score_threshold = Column(Integer, default=60)
    
    # Auto-schedule enabled
    auto_schedule_enabled = Column(Boolean, default=True)
    
    # Notify on pass/fail
    notify_on_pass = Column(Boolean, default=True)
    notify_on_fail = Column(Boolean, default=True)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    employee = relationship("User", foreign_keys=[employee_id])
