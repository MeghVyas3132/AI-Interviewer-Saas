"""
Production-grade Candidate API routes for Phase 2
Comprehensive CRUD, bulk operations, and email integration
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.candidate import CandidateStatus, CandidateSource, EmailType, EmailPriority
from app.models.user import User
from app.schemas.candidate_schema import (
    CandidateCreate,
    CandidateBulkImportRequest,
    CandidateBulkImportResponse,
    CandidateResponse,
    CandidateListResponse,
    CandidateUpdate,
    BulkSendEmailRequest,
    BulkActionResponse,
    BulkActionStatusResponse,
)
from app.services.candidate_service import CandidateService
from app.services.email_async_service import EmailService
from app.utils.file_parser import CandidateImportParser, FileParseError, BulkImportStats

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/candidates", tags=["candidates"])


# ============================================================================
# CANDIDATE CRUD ENDPOINTS
# ============================================================================


@router.post(
    "",
    response_model=CandidateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new candidate",
    description="Create a new candidate and optionally send invitation email",
)
async def create_candidate(
    candidate_data: CandidateCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CandidateResponse:
    """
    Create a new candidate in the system
    
    - **email**: Candidate email address (unique per company)
    - **first_name**: First name
    - **last_name**: Last name
    - **domain**: Department/domain (e.g., Engineering, Sales)
    - **position**: Target position
    """
    try:
        # Create candidate
        candidate = await CandidateService.create_candidate(
            session=session,
            company_id=current_user.company_id,
            email=candidate_data.email,
            first_name=candidate_data.first_name,
            last_name=candidate_data.last_name,
            phone=candidate_data.phone,
            domain=candidate_data.domain,
            position=candidate_data.position,
            experience_years=candidate_data.experience_years,
            qualifications=candidate_data.qualifications,
            created_by=current_user.id,
        )
        
        # Queue invitation email
        await EmailService.queue_email(
            session=session,
            company_id=current_user.company_id,
            recipient_email=candidate.email,
            template_id="candidate_invitation",
            subject=f"Invitation to interview at {current_user.company_id}",
            body="<p>You have been invited to participate in our interview process.</p>",
            email_type=EmailType.CANDIDATE_INVITE,
            variables={
                "candidate_name": candidate.full_name,
                "login_link": "https://app.example.com/login",
            },
            recipient_id=candidate.id,
            priority=EmailPriority.HIGH,
        )
        
        await session.commit()
        
        logger.info(f"✅ Candidate created and invitation sent: {candidate.email}")
        
        return CandidateResponse.from_attributes(candidate)
        
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating candidate: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error creating candidate")


@router.get(
    "/{candidate_id}",
    response_model=CandidateResponse,
    summary="Get candidate details",
)
async def get_candidate(
    candidate_id: UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CandidateResponse:
    """Get detailed information about a specific candidate"""
    try:
        candidate = await CandidateService.get_candidate_by_id(
            session=session,
            candidate_id=candidate_id,
            company_id=current_user.company_id,
        )
        
        if not candidate:
            raise HTTPException(status_code=404, detail="Candidate not found")
        
        return CandidateResponse.from_attributes(candidate)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching candidate: {str(e)}")
        raise HTTPException(status_code=500, detail="Error fetching candidate")


@router.get(
    "",
    response_model=CandidateListResponse,
    summary="List candidates",
)
async def list_candidates(
    status: Optional[str] = Query(None, description="Filter by status"),
    domain: Optional[str] = Query(None, description="Filter by domain"),
    skip: int = Query(0, ge=0, description="Number of results to skip"),
    limit: int = Query(20, ge=1, le=100, description="Number of results to return"),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CandidateListResponse:
    """
    List candidates with filtering and pagination
    
    Query parameters:
    - **status**: Filter by candidate status (applied, screening, interview, etc.)
    - **domain**: Filter by domain/department
    - **skip**: Pagination offset
    - **limit**: Number of results per page
    """
    try:
        # Parse status if provided
        parsed_status = None
        if status:
            try:
                parsed_status = CandidateStatus(status)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid status: {status}"
                )
        
        candidates, total = await CandidateService.list_candidates(
            session=session,
            company_id=current_user.company_id,
            status=parsed_status,
            domain=domain,
            skip=skip,
            limit=limit,
        )
        
        return CandidateListResponse(
            candidates=[CandidateResponse.from_attributes(c) for c in candidates],
            total=total,
            page=skip // limit + 1,
            page_size=limit,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing candidates: {str(e)}")
        raise HTTPException(status_code=500, detail="Error listing candidates")


@router.patch(
    "/{candidate_id}",
    response_model=CandidateResponse,
    summary="Update candidate",
)
async def update_candidate(
    candidate_id: UUID,
    update_data: CandidateUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CandidateResponse:
    """Update candidate information"""
    try:
        candidate = await CandidateService.get_candidate_by_id(
            session=session,
            candidate_id=candidate_id,
            company_id=current_user.company_id,
        )
        
        if not candidate:
            raise HTTPException(status_code=404, detail="Candidate not found")
        
        # Update fields
        for field, value in update_data.model_dump(exclude_unset=True).items():
            if value is not None:
                if field == "status":
                    # Update status and send email notification
                    await CandidateService.update_candidate_status(
                        session=session,
                        candidate_id=candidate_id,
                        company_id=current_user.company_id,
                        new_status=CandidateStatus(value),
                        send_email=True,
                    )
                else:
                    setattr(candidate, field, value)
        
        await session.commit()
        
        return CandidateResponse.from_attributes(candidate)
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating candidate: {str(e)}")
        raise HTTPException(status_code=500, detail="Error updating candidate")


@router.delete(
    "/{candidate_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete candidate",
)
async def delete_candidate(
    candidate_id: UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a candidate"""
    try:
        candidate = await CandidateService.get_candidate_by_id(
            session=session,
            candidate_id=candidate_id,
            company_id=current_user.company_id,
        )
        
        if not candidate:
            raise HTTPException(status_code=404, detail="Candidate not found")
        
        await session.delete(candidate)
        await session.commit()
        
        logger.info(f"✅ Candidate deleted: {candidate_id}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting candidate: {str(e)}")
        raise HTTPException(status_code=500, detail="Error deleting candidate")


# ============================================================================
# ============================================================================
# BULK OPERATIONS
# ============================================================================


@router.post(
    "/bulk/import/file",
    response_model=CandidateBulkImportResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Bulk import candidates from file",
    description="Import multiple candidates from Excel (XLSX) or CSV file",
)
async def bulk_import_file(
    file: UploadFile = File(..., description="Excel (.xlsx) or CSV (.csv) file with candidate data"),
    send_invitations: bool = Query(True, description="Send invitation emails after import"),
    default_domain: Optional[str] = Query(None, description="Default domain for all candidates"),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CandidateBulkImportResponse:
    """
    Bulk import candidates from uploaded file
    
    **File Format:**
    - Excel (.xlsx) or CSV (.csv)
    - Required columns: email, first_name, last_name
    - Optional columns: phone, domain, position, experience_years, qualifications, resume_url
    
    **Example CSV:**
    ```
    email,first_name,last_name,phone,domain,position,experience_years
    john@example.com,John,Doe,+1-234-567-8900,Engineering,Senior Engineer,5
    jane@example.com,Jane,Smith,+1-234-567-8901,Sales,Account Executive,3
    ```
    """
    try:
        # Validate file size (max 10MB)
        content = await file.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File size exceeds 10MB limit"
            )
        
        # Parse file
        logger.info(f"Parsing file: {file.filename}")
        parsed_candidates, parse_errors = CandidateImportParser.parse_file(
            content,
            file.filename or "candidates.csv"
        )
        
        if not parsed_candidates and parse_errors:
            logger.error(f"File parsing failed: {parse_errors}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to parse file: {parse_errors[0]}"
            )
        
        logger.info(f"✅ Parsed {len(parsed_candidates)} candidates from {file.filename}")
        
        # Add default domain if provided
        if default_domain:
            for candidate in parsed_candidates:
                if "domain" not in candidate or not candidate["domain"]:
                    candidate["domain"] = default_domain
        
        # Prepare candidate data for creation
        candidates_data = []
        for cand in parsed_candidates:
            cand["created_by"] = current_user.id
            candidates_data.append(cand)
        
        # Bulk create candidates
        created, errors = await CandidateService.bulk_create_candidates(
            session=session,
            company_id=current_user.company_id,
            candidates_data=candidates_data,
            created_by=current_user.id,
            send_invitation_emails=send_invitations,
        )
        
        # Log audit
        await CandidateService.log_bulk_import(
            session=session,
            company_id=current_user.company_id,
            user_id=current_user.id,
            filename=file.filename or "unknown",
            total=len(candidates_data),
            created=len(created),
            failed=len(errors),
        )
        
        # Combine parse errors with creation errors
        all_errors = parse_errors + errors
        
        logger.info(
            f"✅ Bulk import complete: {len(created)} created, "
            f"{len(all_errors)} errors"
        )
        
        return CandidateBulkImportResponse(
            total=len(candidates_data),
            created=len(created),
            failed=len(all_errors),
            errors=all_errors[:100],  # Return first 100 errors
            created_candidates=[
                CandidateResponse.from_orm(c) for c in created
            ] if created else [],
            message=f"✅ Imported {len(created)}/{len(candidates_data)} candidates successfully. "
                   f"{len(all_errors)} errors." if created else f"❌ Import failed: {all_errors[0] if all_errors else 'Unknown error'}"
        )
        
    except FileParseError as e:
        logger.error(f"File parsing error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File parsing error: {str(e)}"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk import: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error importing candidates: {str(e)}"
        )


@router.post(
    "/bulk/import",
    response_model=CandidateBulkImportResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Bulk import candidates from JSON",
    description="Import multiple candidates from JSON request body",
)
async def bulk_import_candidates(
    request: CandidateBulkImportRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CandidateBulkImportResponse:
    """
    Import multiple candidates from JSON
    
    Request body:
    - **candidates**: List of candidate objects with email, name, etc.
    - **send_invitations**: Whether to send invitation emails (default: true)
    - **domain**: Default domain for all candidates (optional)
    
    **Example:**
    ```json
    {
      "candidates": [
        {
          "email": "john@example.com",
          "first_name": "John",
          "last_name": "Doe",
          "position": "Senior Engineer",
          "experience_years": 5
        }
      ],
      "send_invitations": true
    }
    ```
    """
    try:
        # Prepare candidates data
        candidates_data = []
        for cand in request.candidates:
            cand_dict = cand.model_dump()
            if request.domain:
                cand_dict["domain"] = request.domain
            cand_dict["created_by"] = current_user.id
            candidates_data.append(cand_dict)
        
        # Bulk create
        created, errors = await CandidateService.bulk_create_candidates(
            session=session,
            company_id=current_user.company_id,
            candidates_data=candidates_data,
            created_by=current_user.id,
            send_invitation_emails=request.send_invitations,
        )
        
        logger.info(
            f"✅ Bulk import complete: {len(created)} created, {len(errors)} errors"
        )
        
        return CandidateBulkImportResponse(
            total=len(candidates_data),
            created=len(created),
            failed=len(errors),
            errors=errors,
            created_candidates=[
                CandidateResponse.from_orm(c) for c in created
            ] if created else [],
            message=f"Imported {len(created)} candidates successfully. {len(errors)} errors."
        )
        
    except Exception as e:
        logger.error(f"Error in bulk import: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error importing candidates"
        )


@router.post(
    "/bulk/send-email",
    response_model=BulkActionResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send bulk email to candidates",
)
async def bulk_send_email(
    request: BulkSendEmailRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BulkActionResponse:
    """
    Send email to multiple candidates
    
    This endpoint queues emails for async sending.
    Response returns immediately with job_id for status tracking.
    """
    try:
        if not request.candidate_ids:
            raise HTTPException(status_code=400, detail="No candidates specified")
        
        # Fetch candidates
        candidates = []
        for cid in request.candidate_ids:
            candidate = await CandidateService.get_candidate_by_id(
                session=session,
                candidate_id=cid,
                company_id=current_user.company_id,
            )
            if candidate:
                candidates.append(candidate)
        
        if not candidates:
            raise HTTPException(status_code=404, detail="No candidates found")
        
        # Prepare recipients
        recipients = [
            {
                "email": c.email,
                "template_id": request.template_id,
                "variables": {
                    "candidate_name": c.full_name,
                    "subject": request.subject,
                },
                "recipient_id": c.id,
            }
            for c in candidates
        ]
        
        # Queue emails
        email_ids = await EmailService.queue_bulk_emails(
            session=session,
            company_id=current_user.company_id,
            recipients=recipients,
            subject=request.subject or "Message from AI Interviewer",
            body=request.body or "Please check your message.",
            email_type=EmailType.STATUS_UPDATE,
            priority=EmailPriority.MEDIUM,
        )
        
        await session.commit()
        
        from datetime import datetime, timedelta
        
        return BulkActionResponse(
            job_id=email_ids[0] if email_ids else None,  # Return first email ID as job ID
            status="202 ACCEPTED",
            queued_count=len(email_ids),
            estimated_completion=datetime.utcnow() + timedelta(minutes=2),
            message=f"Queued {len(email_ids)} emails for sending",
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk email: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error queuing emails")


# ============================================================================
# STATUS AND DASHBOARD
# ============================================================================


@router.get(
    "/dashboard/stats",
    summary="Get HR dashboard statistics",
)
async def get_dashboard_stats(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get comprehensive HR dashboard statistics and metrics
    
    Returns:
    - Total candidates by status (applied, shortlisted, interviewed, rejected, hired)
    - Candidates by domain/department
    - Active interview count
    - Pending feedback count
    - Recent activities and time-to-hire metrics
    """
    try:
        stats = await CandidateService.get_dashboard_stats(
            session=session,
            company_id=current_user.company_id,
        )
        
        logger.info(f"📊 Dashboard stats retrieved for company: {current_user.company_id}")
        
        return stats
        
    except Exception as e:
        logger.error(f"Error fetching dashboard stats: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error fetching statistics")


@router.get(
    "/analytics/funnel",
    summary="Get candidate funnel analytics",
)
async def get_funnel_analytics(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get candidate funnel analytics
    
    Shows progression through each stage:
    - Applied → Shortlisted → Interviewed → Offered → Hired
    - Includes drop-off rates at each stage
    """
    try:
        funnel = await CandidateService.get_funnel_analytics(
            session=session,
            company_id=current_user.company_id,
        )
        
        logger.info(f"📈 Funnel analytics retrieved for company: {current_user.company_id}")
        
        return funnel
        
    except Exception as e:
        logger.error(f"Error fetching funnel analytics: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error fetching analytics")


@router.get(
    "/analytics/time-to-hire",
    summary="Get time-to-hire metrics",
)
async def get_time_to_hire(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get time-to-hire metrics
    
    Shows:
    - Average days from applied to hired
    - Average days per stage
    - Department/domain breakdowns
    - Trend over time
    """
    try:
        metrics = await CandidateService.get_time_to_hire_metrics(
            session=session,
            company_id=current_user.company_id,
        )
        
        logger.info(f"⏱️  Time-to-hire metrics retrieved for company: {current_user.company_id}")
        
        return metrics
        
    except Exception as e:
        logger.error(f"Error fetching time-to-hire metrics: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error fetching metrics")
