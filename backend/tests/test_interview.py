"""
Tests for interview service
"""

import pytest
from datetime import datetime, timedelta
from uuid import UUID
from app.services.interview_service import InterviewService
from app.services.company_service import CompanyService
from app.services.user_service import UserService
from app.schemas.interview_schema import InterviewCreate
from app.schemas.company_schema import CompanyCreate
from app.schemas.user_schema import UserCreate
from app.models.user import UserRole


@pytest.mark.asyncio
async def test_create_interview(test_db, sample_company_data, sample_user_data):
    """Test interview creation."""
    # Create company
    company = await CompanyService.create_company(
        test_db,
        CompanyCreate(**sample_company_data),
    )
    company_id = UUID(str(company.id)) if isinstance(company.id, str) else company.id

    # Create candidate and scheduler users
    candidate_data = UserCreate(
        **{**sample_user_data, "email": "candidate@test.com"},
        role=UserRole.CANDIDATE,
    )
    candidate = await UserService.create_user(test_db, company_id, candidate_data)
    candidate_id = UUID(str(candidate.id)) if isinstance(candidate.id, str) else candidate.id

    scheduler_data = UserCreate(
        **{**sample_user_data, "email": "scheduler@test.com"},
        role=UserRole.EMPLOYEE,
    )
    scheduler = await UserService.create_user(test_db, company_id, scheduler_data)
    scheduler_id = UUID(str(scheduler.id)) if isinstance(scheduler.id, str) else scheduler.id

    # Create interview
    scheduled_at = datetime.utcnow() + timedelta(days=1)
    interview_create = InterviewCreate(
        candidate_id=candidate_id,
        scheduled_at=scheduled_at,
    )
    interview = await InterviewService.create_interview(
        test_db,
        company_id,
        candidate_id,
        scheduler_id,
        interview_create,
    )

    assert interview is not None
    assert interview.candidate_id == candidate_id
    assert interview.scheduled_by == scheduler_id


@pytest.mark.asyncio
async def test_get_candidate_interviews(test_db, sample_company_data, sample_user_data):
    """Test getting candidate's interviews."""
    # Setup
    company = await CompanyService.create_company(
        test_db,
        CompanyCreate(**sample_company_data),
    )
    company_id = UUID(str(company.id)) if isinstance(company.id, str) else company.id

    candidate = await UserService.create_user(
        test_db,
        company_id,
        UserCreate(**{**sample_user_data, "email": "candidate@test.com"}, role=UserRole.CANDIDATE),
    )
    candidate_id = UUID(str(candidate.id)) if isinstance(candidate.id, str) else candidate.id

    scheduler = await UserService.create_user(
        test_db,
        company_id,
        UserCreate(**{**sample_user_data, "email": "scheduler@test.com"}, role=UserRole.EMPLOYEE),
    )
    scheduler_id = UUID(str(scheduler.id)) if isinstance(scheduler.id, str) else scheduler.id

    # Create multiple interviews
    for i in range(3):
        scheduled_at = datetime.utcnow() + timedelta(days=i+1)
        interview_create = InterviewCreate(
            candidate_id=candidate_id,
            scheduled_at=scheduled_at,
        )
        await InterviewService.create_interview(
            test_db,
            company_id,
            candidate_id,
            scheduler_id,
            interview_create,
        )

    # Get candidate's interviews
    interviews = await InterviewService.get_candidate_interviews(test_db, candidate_id)

    assert len(interviews) == 3
