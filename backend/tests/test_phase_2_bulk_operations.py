"""
Phase 2 Integration Tests: Bulk Operations  
Tests for bulk candidate import, bulk email, and dashboard analytics
"""

import pytest
from uuid import UUID
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.candidate import Candidate, CandidateStatus, EmailType, EmailPriority
from app.models.company import Company
from app.models.user import User, UserRole
from app.services.candidate_service import CandidateService
from app.services.company_service import CompanyService
from app.services.user_service import UserService
from app.schemas.company_schema import CompanyCreate
from app.schemas.user_schema import UserCreate


@pytest.mark.asyncio
async def test_bulk_import_from_json(test_db: AsyncSession):
    """Test bulk importing candidates from JSON"""
    
    # Create a test company
    company_data = CompanyCreate(
        name="Test Company",
        email_domain="test.com",
        description="Test",
    )
    company = await CompanyService.create_company(test_db, company_data)
    await test_db.commit()
    
    # Prepare bulk import data
    candidates_data = [
        {
            "email": "jane.smith@example.com",
            "first_name": "Jane",
            "last_name": "Smith",
            "phone": "+1-456-789-0123",
            "domain": "Engineering",
            "position": "Senior Engineer",
            "experience_years": 8,
        },
        {
            "email": "bob.johnson@example.com",
            "first_name": "Bob",
            "last_name": "Johnson",
            "phone": "+1-456-789-0124",
            "domain": "Product",
            "position": "Product Manager",
            "experience_years": 5,
        },
    ]
    
    # Bulk create candidates
    created, errors = await CandidateService.bulk_create_candidates(
        session=test_db,
        company_id=company.id,
        candidates=candidates_data,
        send_invitation_emails=False,
    )
    
    assert len(created) == 2
    assert len(errors) == 0
    assert created[0].email == "jane.smith@example.com"
    assert created[1].email == "bob.johnson@example.com"


@pytest.mark.asyncio
async def test_bulk_import_with_duplicates(test_db: AsyncSession):
    """Test bulk import with duplicate email"""
    
    # Create a test company
    company_data = CompanyCreate(
        name="Test Company 2",
        email_domain="test2.com",
        description="Test",
    )
    company = await CompanyService.create_company(test_db, company_data)
    await test_db.commit()
    
    candidates_data = [
        {
            "email": "duplicate@example.com",
            "first_name": "First",
            "last_name": "Person",
        },
        {
            "email": "duplicate@example.com",
            "first_name": "Second",
            "last_name": "Person",
        },
    ]
    
    created, errors = await CandidateService.bulk_create_candidates(
        session=test_db,
        company_id=company.id,
        candidates=candidates_data,
        send_invitation_emails=False,
    )
    
    assert len(created) == 1
    assert len(errors) >= 1


@pytest.mark.asyncio
async def test_dashboard_stats(test_db: AsyncSession):
    """Test dashboard stats analytics"""
    
    # Create a test company
    company_data = CompanyCreate(
        name="Analytics Test Company",
        email_domain="analytics.com",
        description="Test",
    )
    company = await CompanyService.create_company(test_db, company_data)
    await test_db.commit()
    
    # Create some candidates
    await CandidateService.create_candidate(
        session=test_db,
        company_id=company.id,
        email="analytics1@example.com",
        first_name="Test",
        last_name="One",
        domain="Engineering",
    )
    
    await CandidateService.create_candidate(
        session=test_db,
        company_id=company.id,
        email="analytics2@example.com",
        first_name="Test",
        last_name="Two",
        domain="Sales",
    )
    
    await test_db.commit()
    
    # Get dashboard stats
    stats = await CandidateService.get_dashboard_stats(
        session=test_db,
        company_id=company.id,
    )
    
    assert stats["total_candidates"] == 2
    assert "active_interviews" in stats
    assert "candidates_by_status" in stats
    assert stats["candidates_by_status"]["applied"] == 2
    assert stats["candidates_by_domain"]["Engineering"] == 1
    assert stats["candidates_by_domain"]["Sales"] == 1


@pytest.mark.asyncio
async def test_funnel_analytics(test_db: AsyncSession):
    """Test funnel analytics"""
    
    # Create a test company
    company_data = CompanyCreate(
        name="Funnel Test Company",
        email_domain="funnel.com",
        description="Test",
    )
    company = await CompanyService.create_company(test_db, company_data)
    await test_db.commit()
    
    # Create candidates with different statuses
    c1 = await CandidateService.create_candidate(
        session=test_db,
        company_id=company.id,
        email="funnel1@example.com",
        first_name="Funnel",
        last_name="One",
    )
    c1.status = CandidateStatus.APPLIED
    
    c2 = await CandidateService.create_candidate(
        session=test_db,
        company_id=company.id,
        email="funnel2@example.com",
        first_name="Funnel",
        last_name="Two",
    )
    c2.status = CandidateStatus.SCREENING
    
    c3 = await CandidateService.create_candidate(
        session=test_db,
        company_id=company.id,
        email="funnel3@example.com",
        first_name="Funnel",
        last_name="Three",
    )
    c3.status = CandidateStatus.INTERVIEW
    
    await test_db.commit()
    
    # Get funnel analytics
    funnel = await CandidateService.get_funnel_analytics(
        session=test_db,
        company_id=company.id,
    )
    
    assert funnel["total_candidates"] == 3
    assert len(funnel["funnel_stages"]) == 5
    assert funnel["funnel_stages"][0]["count"] == 1  # Applied
    assert funnel["funnel_stages"][1]["count"] == 1  # Screening
    assert funnel["funnel_stages"][2]["count"] == 1  # Interview


@pytest.mark.asyncio
async def test_time_to_hire_metrics(test_db: AsyncSession):
    """Test time-to-hire metrics"""
    
    # Create a test company
    company_data = CompanyCreate(
        name="TTH Test Company",
        email_domain="tth.com",
        description="Test",
    )
    company = await CompanyService.create_company(test_db, company_data)
    await test_db.commit()
    
    # Create an accepted candidate
    candidate = await CandidateService.create_candidate(
        session=test_db,
        company_id=company.id,
        email="tth@example.com",
        first_name="TTH",
        last_name="Test",
        domain="Engineering",
    )
    candidate.status = CandidateStatus.ACCEPTED
    await test_db.commit()
    
    # Get time-to-hire metrics
    metrics = await CandidateService.get_time_to_hire_metrics(
        session=test_db,
        company_id=company.id,
    )
    
    assert "average_days_to_hire" in metrics
    assert "median_days_to_hire" in metrics
    assert metrics["total_hired"] == 1
    assert "Engineering" in metrics["by_department"]


@pytest.mark.asyncio
async def test_candidate_status_progression(test_db: AsyncSession):
    """Test candidate status updates through hiring stages"""
    
    # Create a test company
    company_data = CompanyCreate(
        name="Status Test Company",
        email_domain="status.com",
        description="Test",
    )
    company = await CompanyService.create_company(test_db, company_data)
    await test_db.commit()
    
    # Create candidate
    candidate = await CandidateService.create_candidate(
        session=test_db,
        company_id=company.id,
        email="progression@example.com",
        first_name="Progress",
        last_name="Test",
    )
    await test_db.commit()
    
    # Verify initial status
    assert candidate.status == CandidateStatus.APPLIED
    
    # Update through stages
    candidate.status = CandidateStatus.SCREENING
    await test_db.commit()
    assert candidate.status == CandidateStatus.SCREENING
    
    candidate.status = CandidateStatus.INTERVIEW
    await test_db.commit()
    assert candidate.status == CandidateStatus.INTERVIEW
    
    candidate.status = CandidateStatus.ACCEPTED
    await test_db.commit()
    assert candidate.status == CandidateStatus.ACCEPTED


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
