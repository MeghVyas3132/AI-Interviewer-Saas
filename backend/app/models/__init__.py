"""
Database models initialization
"""

from app.models.company import Company
from app.models.user import User
from app.models.role import Role
from app.models.score import Score
from app.models.audit_log import AuditLog
from app.models.candidate import Candidate, Interview, EmailQueue, EmailTracking, CandidateFeedback
from app.models.ai_report import AIReport
from app.models.job import JobTemplate, Question
from app.models.import_job import ImportJob
from app.models.company_request import CompanyRequest, RequestStatus
from app.models.interview_round import InterviewRound
from app.models.employee_availability import EmployeeAvailability, ScheduledSlot, AutoScheduleConfig, DayOfWeek
from app.models.company_ai_config import CompanyAIConfig
from app.models.realtime_insights import (
    CandidateResume,
    LiveInsight,
    FraudAlert,
    InterviewTranscript,
    HumanVerdict,
    InterviewSummary,
    AIAuditLog,
    InterviewModeType,
    InsightType,
    AlertSeverity,
    VerdictDecision,
)

__all__ = [
    "Company",
    "User",
    "Role",
    "Interview",
    "InterviewRound",
    "Score",
    "AuditLog",
    "Candidate",
    "EmailQueue",
    "EmailTracking",
    "CandidateFeedback",
    "ImportJob",
    "CompanyRequest",
    "RequestStatus",
    "AIReport",
    "JobTemplate",
    "Question",
    "EmployeeAvailability",
    "ScheduledSlot",
    "AutoScheduleConfig",
    "DayOfWeek",
    "CompanyAIConfig",
    # Real-time AI Insights models
    "CandidateResume",
    "LiveInsight",
    "FraudAlert",
    "InterviewTranscript",
    "HumanVerdict",
    "InterviewSummary",
    "AIAuditLog",
    "InterviewModeType",
    "InsightType",
    "AlertSeverity",
    "VerdictDecision",
]


