"""
InterviewSession model for AI interview sessions.
This table is managed by the AI service but accessed by the backend for integration.
"""

from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON, Text
from app.core.database import Base


class InterviewSession(Base):
    """
    Model representing an AI interview session.
    Created by the AI service when scheduling interviews via email.
    """
    __tablename__ = "interview_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, nullable=True, index=True)
    job_role_id = Column(Integer, nullable=True, index=True)
    resume_id = Column(Integer, nullable=True, index=True)
    exam_id = Column(Integer, nullable=True)
    subcategory_id = Column(Integer, nullable=True)
    
    token = Column(String(255), unique=True, nullable=False, index=True)
    status = Column(String(50), default='pending', index=True)
    
    scheduled_time = Column(DateTime, nullable=True)
    scheduled_end_time = Column(DateTime, nullable=True)
    link_sent_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True, index=True)
    
    results_json = Column(JSON, nullable=True)
    questions_generated = Column(JSON, nullable=True)
    interview_mode = Column(String(50), default='video')
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)
    
    def __repr__(self):
        return f"<InterviewSession(id={self.id}, token={self.token[:8]}..., status={self.status})>"
