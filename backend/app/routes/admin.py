"""
System Admin routes for managing companies and global operations.

System Admin capabilities:
- Create new companies
- View all companies (metadata only)
- Manage company status
- View system-wide metrics
- NO access to company internal data (candidates, interviews, etc)
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.middleware.auth import get_current_user
from app.models.user import User, UserRole
from app.schemas.company_schema import (
    CompanyCreate,
    CompanyResponse,
)
from app.services.audit_log_service import AuditLogService
from app.services.company_service import CompanyService

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def require_system_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    Dependency to require SYSTEM_ADMIN role.
    """
    if current_user.role != UserRole.SYSTEM_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system administrators can access this resource",
        )
    return current_user


@router.post(
    "/companies",
    response_model=CompanyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new company",
)
async def create_company(
    company_data: CompanyCreate,
    current_user: User = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db),
) -> CompanyResponse:
    """
    Create a new company in the system (SYSTEM_ADMIN only).
    
    This endpoint is used during company onboarding.
    After creation, the company HR will register using the generated company_id.
    
    Args:
        company_data: Company creation data (name, email)
        current_user: Current authenticated SYSTEM_ADMIN user
        session: Database session
    
    Returns:
        Created company with company_id
    """
    try:
        company = await CompanyService.create_company(session, company_data)
        
        # Log admin action
        await AuditLogService.log_action(
            session,
            company.id,  # Log to the new company
            current_user.id,
            "CREATE_COMPANY",
            resource_type="company",
            resource_id=company.id,
            metadata={"company_name": company.name, "company_email_domain": company.email_domain},
        )
        
        await session.commit()
        return company
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error creating company",
        )


@router.get(
    "/companies",
    response_model=List[CompanyResponse],
    summary="List all companies",
)
async def list_all_companies(
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(50, ge=1, le=500, description="Pagination limit"),
    current_user: User = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db),
) -> List[CompanyResponse]:
    """
    List all companies in the system (SYSTEM_ADMIN only).
    
    Returns metadata only - no internal company data is accessible.
    
    Args:
        skip: Pagination offset
        limit: Pagination limit (max 500)
        current_user: Current authenticated SYSTEM_ADMIN user
        session: Database session
    
    Returns:
        List of companies with metadata
    """
    try:
        companies = await CompanyService.list_all_companies(
            session,
            skip=skip,
            limit=limit,
        )
        return companies
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching companies",
        )


@router.get(
    "/companies/{company_id}",
    response_model=CompanyResponse,
    summary="Get company details",
)
async def get_company_details(
    company_id: UUID,
    current_user: User = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db),
) -> CompanyResponse:
    """
    Get company metadata by ID (SYSTEM_ADMIN only).
    
    Only company metadata is accessible - no internal data.
    
    Args:
        company_id: Company ID
        current_user: Current authenticated SYSTEM_ADMIN user
        session: Database session
    
    Returns:
        Company details
    """
    try:
        company = await CompanyService.get_company_by_id(session, company_id)
        if not company:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Company not found",
            )
        return company
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching company",
        )


@router.get(
    "/system/metrics",
    summary="Get system-wide metrics",
)
async def get_system_metrics(
    current_user: User = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get system-wide metrics (SYSTEM_ADMIN only).
    
    Returns:
        System metrics including total companies, active companies, etc.
    """
    try:
        metrics = await CompanyService.get_system_metrics(session)
        return metrics
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching metrics",
        )


# =============================================================================
# Company Registration Request Management
# =============================================================================

from datetime import datetime, timezone
from pydantic import BaseModel
from sqlalchemy import select
from app.models.company_request import CompanyRequest, RequestStatus
from app.models.company import Company
# Async email queueing service (Celery)
from app.services.email_async_service import EmailService as AsyncEmailService
from app.models.candidate import EmailType, EmailPriority


class CompanyRequestResponse(BaseModel):
    """Response schema for company registration request."""
    id: str
    company_name: str
    email_domain: str | None
    description: str | None
    requester_email: str
    requester_name: str
    status: str
    created_at: str
    reviewed_at: str | None = None
    rejection_reason: str | None = None

    class Config:
        from_attributes = True


class ApproveRequestBody(BaseModel):
    """Body for approving a company request."""
    email_domain: str | None = None
    description: str | None = None


class RejectRequestBody(BaseModel):
    """Body for rejecting a company request."""
    reason: str


@router.get(
    "/requests/pending",
    response_model=List[CompanyRequestResponse],
    summary="List pending company registration requests",
)
async def list_pending_requests(
    current_user: User = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db),
) -> List[CompanyRequestResponse]:
    """
    List all pending company registration requests (SYSTEM_ADMIN only).
    
    These are requests from users who want to create a new company.
    Admin must approve or reject each request.
    """
    try:
        result = await session.execute(
            select(CompanyRequest)
            .where(CompanyRequest.status == RequestStatus.PENDING)
            .order_by(CompanyRequest.created_at.desc())
            .limit(100)
        )
        requests = result.scalars().all()
        
        return [
            CompanyRequestResponse(
                id=str(req.id),
                company_name=req.company_name,
                email_domain=req.email_domain,
                description=req.description,
                requester_email=req.requester_email,
                requester_name=req.requester_name,
                status=req.status.value,
                created_at=req.created_at.isoformat() if req.created_at else "",
                reviewed_at=req.reviewed_at.isoformat() if req.reviewed_at else None,
                rejection_reason=req.rejection_reason,
            )
            for req in requests
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching pending requests",
        )


@router.get(
    "/requests/all",
    response_model=List[CompanyRequestResponse],
    summary="List all company registration requests",
)
async def list_all_requests(
    status_filter: str | None = Query(None, description="Filter by status: pending, approved, rejected"),
    current_user: User = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db),
) -> List[CompanyRequestResponse]:
    """
    List all company registration requests with optional status filter.
    """
    try:
        query = select(CompanyRequest).order_by(CompanyRequest.created_at.desc())
        
        if status_filter:
            try:
                filter_status = RequestStatus(status_filter)
                query = query.where(CompanyRequest.status == filter_status)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid status filter. Must be: pending, approved, or rejected",
                )
        
        query = query.limit(200)
        result = await session.execute(query)
        requests = result.scalars().all()
        
        return [
            CompanyRequestResponse(
                id=str(req.id),
                company_name=req.company_name,
                email_domain=req.email_domain,
                description=req.description,
                requester_email=req.requester_email,
                requester_name=req.requester_name,
                status=req.status.value,
                created_at=req.created_at.isoformat() if req.created_at else "",
                reviewed_at=req.reviewed_at.isoformat() if req.reviewed_at else None,
                rejection_reason=req.rejection_reason,
            )
            for req in requests
        ]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching requests",
        )


@router.post(
    "/requests/{request_id}/approve",
    summary="Approve a company registration request",
)
async def approve_request(
    request_id: UUID,
    body: ApproveRequestBody | None = None,
    current_user: User = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """
    Approve a pending company registration request (SYSTEM_ADMIN only).
    
    This will:
    1. Create the company
    2. Create the user as HR of the company
    3. Update the request status to approved
    
    The user can then login with their original credentials.
    """
    try:
        # Get the request
        result = await session.execute(
            select(CompanyRequest).where(CompanyRequest.id == request_id)
        )
        company_request = result.scalars().first()
        
        if not company_request:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Request not found",
            )
        
        if company_request.status != RequestStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Request is already {company_request.status.value}",
            )
        
        # Check if company name already exists (in case it was created since the request)
        existing_company = await session.execute(
            select(Company).where(Company.name == company_request.company_name)
        )
        if existing_company.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A company with this name already exists. Please reject this request.",
            )
        
        # Create the company
        company = Company(
            name=company_request.company_name,
            email_domain=body.email_domain if body else company_request.email_domain,
            description=body.description if body else company_request.description,
            is_active=True,
        )
        session.add(company)
        await session.flush()
        
        # Create the user as HR
        user = User(
            email=company_request.requester_email,
            name=company_request.requester_name,
            password_hash=company_request.requester_password_hash,
            company_id=company.id,
            role=UserRole.HR,
            is_active=True,
            email_verified=True,  # Admin approval bypasses email verification
        )
        session.add(user)
        await session.flush()
        
        # Update the request
        company_request.status = RequestStatus.APPROVED
        company_request.reviewed_by = current_user.id
        company_request.reviewed_at = datetime.now(timezone.utc)
        company_request.approved_company_id = company.id
        
        # Log the action
        await AuditLogService.log_action(
            session,
            company.id,
            current_user.id,
            "APPROVE_COMPANY_REQUEST",
            resource_type="company_request",
            resource_id=company_request.id,
            metadata={
                "company_name": company.name,
                "requester_email": company_request.requester_email,
            },
        )
        
        await session.commit()
        # Queue a welcome / approval email to the requester via Celery
        try:
            login_link = f"{settings.frontend_url}/auth/login"
            await AsyncEmailService.queue_email(
                session=session,
                company_id=company.id,
                recipient_email=user.email,
                template_id="welcome",
                subject=f"Your company '{company.name}' has been approved",
                body=(
                    f"<p>Hi {user.name},</p>"
                    f"<p>Your company <strong>{company.name}</strong> has been approved by the administrator."
                    " You can now sign in to your account using the credentials you provided during registration.</p>"
                    f"<p><a href=\"{login_link}\">Sign in to AI Interviewer</a></p>"
                ),
                email_type=EmailType.WELCOME,
                variables={
                    "recipient_name": user.name,
                    "company_name": company.name,
                    "login_link": login_link,
                },
                recipient_id=user.id,
                priority=EmailPriority.MEDIUM,
            )
        except Exception:
            # If email queueing fails, log but do not fail the approval
            import logging
            logging.getLogger(__name__).exception("Failed to queue approval email to requester")

        return {
            "message": "Company request approved successfully",
            "company_id": str(company.id),
            "company_name": company.name,
            "user_email": user.email,
            "user_role": user.role.value,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error approving request",
        )


@router.post(
    "/requests/{request_id}/reject",
    summary="Reject a company registration request",
)
async def reject_request(
    request_id: UUID,
    body: RejectRequestBody,
    current_user: User = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """
    Reject a pending company registration request (SYSTEM_ADMIN only).
    
    A rejection reason must be provided.
    """
    try:
        # Get the request
        result = await session.execute(
            select(CompanyRequest).where(CompanyRequest.id == request_id)
        )
        company_request = result.scalars().first()
        
        if not company_request:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Request not found",
            )
        
        if company_request.status != RequestStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Request is already {company_request.status.value}",
            )
        
        # Update the request
        company_request.status = RequestStatus.REJECTED
        company_request.reviewed_by = current_user.id
        company_request.reviewed_at = datetime.now(timezone.utc)
        company_request.rejection_reason = body.reason
        
        await session.commit()
        
        return {
            "message": "Company request rejected",
            "request_id": str(request_id),
            "reason": body.reason,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error rejecting request",
        )


# =============================================================================
# Delete Company (with Admin Code Authentication)
# =============================================================================

class DeleteCompanyBody(BaseModel):
    """Body for deleting a company."""
    admin_code: str


@router.delete(
    "/companies/{company_id}",
    summary="Delete a company and all its data",
)
async def delete_company(
    company_id: UUID,
    body: DeleteCompanyBody,
    current_user: User = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """
    Delete a company and ALL associated data (SYSTEM_ADMIN only).
    
    This is a DESTRUCTIVE operation that will permanently delete:
    - The company
    - All users (HR, employees) in the company
    - All candidates associated with the company
    - All interviews
    - All audit logs
    
    Requires admin code verification for security.
    """
    # Verify admin code from environment variable
    from app.core.config import settings
    admin_delete_code = getattr(settings, 'admin_delete_code', None)
    if not admin_delete_code:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Admin delete code not configured. Set ADMIN_DELETE_CODE env var.",
        )
    if body.admin_code != admin_delete_code:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin code. Deletion not authorized.",
        )
    
    try:
        # Get the company
        result = await session.execute(
            select(Company).where(Company.id == company_id)
        )
        company = result.scalars().first()
        
        if not company:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Company not found",
            )
        
        company_name = company.name
        
        # Import all models with company_id FK
        from app.models.candidate import Candidate, Interview
        from app.models.audit_log import AuditLog
        from app.models.import_job import ImportJob
        from app.models.interview_round import InterviewRound
        from app.models.role import Role
        
        # Delete in correct order (respecting foreign key constraints)
        # 1. Delete audit logs first (has FK to users)
        try:
            await session.execute(
                AuditLog.__table__.delete().where(AuditLog.company_id == company_id)
            )
        except Exception:
            pass  # Table might not exist or be empty
        
        # 2. Delete import jobs
        try:
            await session.execute(
                ImportJob.__table__.delete().where(ImportJob.company_id == company_id)
            )
        except Exception:
            pass
        
        # 3. Delete interview round configs
        try:
            await session.execute(
                InterviewRound.__table__.delete().where(InterviewRound.company_id == company_id)
            )
        except Exception:
            pass
        
        # 4. Delete interviews (has FK to candidates)
        try:
            await session.execute(
                Interview.__table__.delete().where(Interview.company_id == company_id)
            )
        except Exception:
            pass
        
        # 5. Delete candidates
        try:
            await session.execute(
                Candidate.__table__.delete().where(Candidate.company_id == company_id)
            )
        except Exception:
            pass
        
        # 6. Delete roles
        try:
            await session.execute(
                Role.__table__.delete().where(Role.company_id == company_id)
            )
        except Exception:
            pass
        
        # 7. Delete users
        await session.execute(
            User.__table__.delete().where(User.company_id == company_id)
        )
        
        # 8. Delete company requests associated with this company
        await session.execute(
            CompanyRequest.__table__.delete().where(CompanyRequest.approved_company_id == company_id)
        )
        
        # Finally delete the company
        await session.delete(company)
        
        await session.commit()
        
        return {
            "message": f"Company '{company_name}' and all associated data has been permanently deleted",
            "company_id": str(company_id),
            "company_name": company_name,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error deleting company",
        )
