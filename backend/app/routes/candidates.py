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
from app.schemas.import_job_schema import ImportJobResponse, ImportJobStatusResponse
from app.services.candidate_service import CandidateService
from app.services.email_async_service import EmailService
from app.services.import_job_service import ImportJobService
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
        
        return CandidateResponse.model_validate(candidate)
        
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
        
        return CandidateResponse.model_validate(candidate)
        
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
        
        # Fetch assigned employee names
        from sqlalchemy import select
        from app.models.user import User as UserModel
        
        candidate_responses = []
        for c in candidates:
            response_dict = {
                "id": c.id,
                "email": c.email,
                "first_name": c.first_name,
                "last_name": c.last_name,
                "phone": c.phone,
                "domain": c.domain,
                "position": c.position,
                "experience_years": c.experience_years,
                "qualifications": c.qualifications,
                "company_id": c.company_id,
                "status": c.status.value if hasattr(c.status, 'value') else str(c.status),
                "source": c.source.value if hasattr(c.source, 'value') else str(c.source),
                "created_by": c.created_by,
                "resume_url": c.resume_url,
                "assigned_to": c.assigned_to,
                "assigned_employee_name": None,
                "created_at": c.created_at,
                "updated_at": c.updated_at,
            }
            
            # Get employee name if assigned
            if c.assigned_to:
                emp_result = await session.execute(
                    select(UserModel).where(UserModel.id == c.assigned_to)
                )
                emp = emp_result.scalar_one_or_none()
                if emp:
                    response_dict["assigned_employee_name"] = emp.name
            
            candidate_responses.append(CandidateResponse(**response_dict))
        
        return CandidateListResponse(
            candidates=candidate_responses,
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
        
        return CandidateResponse.model_validate(candidate)
        
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
    response_model=ImportJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Bulk import candidates from file (async)",
    description="Queue file upload for async processing - returns immediately with job ID",
)
async def bulk_import_file(
    file: UploadFile = File(..., description="Excel (.xlsx) or CSV (.csv) file with candidate data"),
    send_invitations: bool = Query(True, description="Send invitation emails after import"),
    default_domain: Optional[str] = Query(None, description="Default domain for all candidates"),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ImportJobResponse:
    """
    Bulk import candidates from file (ASYNC)
    
    ⚡ **This endpoint is now ASYNC** - returns immediately with a job ID
    
    The file is queued for processing by Celery workers in the background.
    Use the job ID to poll status: `GET /api/v1/candidates/import-jobs/{job_id}`
    
    **File Format:**
    - Excel (.xlsx) or CSV (.csv)
    - Required columns: email, first_name, last_name
    - Optional columns: phone, domain, position, experience_years, qualifications, resume_url
    
    **Max concurrent imports per company: 2**
    
    **Example CSV:**
    ```
    email,first_name,last_name,phone,domain,position,experience_years
    john@example.com,John,Doe,+1-234-567-8900,Engineering,Senior Engineer,5
    jane@example.com,Jane,Smith,+1-234-567-8901,Sales,Account Executive,3
    ```
    
    **Response (Immediate 202):**
    ```json
    {
      "job_id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "queued",
      "message": "Import job queued for processing",
      "total_records": 1000,
      "celery_task_id": "abc123..."
    }
    ```
    
    **Then poll for status:**
    ```
    GET /api/v1/candidates/import-jobs/550e8400-e29b-41d4-a716-446655440000
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
        
        # Check rate limit - max 2 concurrent imports per company
        allowed, message = await ImportJobService.check_rate_limit(
            session=session,
            company_id=current_user.company_id,
            max_concurrent=2,
        )
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=message,
            )
        
        # Parse file to get record count (quick validation)
        logger.info(f"Validating file: {file.filename}")
        parsed_candidates, parse_errors = CandidateImportParser.parse_file(
            content,
            file.filename or "candidates.csv",
        )
        
        if not parsed_candidates:
            parse_error_msg = parse_errors[0] if parse_errors else "Unknown error"
            logger.error(f"File validation failed: {parse_error_msg}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File validation failed: {parse_error_msg}",
            )
        
        logger.info(
            f"✅ File validated: {len(parsed_candidates)} candidates in {file.filename}"
        )
        
        # Determine file format
        file_format = "xlsx" if file.filename.endswith((".xlsx", ".xls")) else "csv"
        
        # Create import job record
        import_job = await ImportJobService.create_import_job(
            session=session,
            company_id=current_user.company_id,
            created_by=current_user.id,
            filename=file.filename or "candidates",
            file_size_bytes=len(content),
            file_format=file_format,
            total_records=len(parsed_candidates),
            send_invitations=send_invitations,
            default_domain=default_domain,
        )
        await session.commit()
        
        # Queue Celery task for async processing
        celery_task_id = await ImportJobService.queue_bulk_import_task(
            session=session,
            import_job=import_job,
            file_content=content,
            created_by=current_user.id,
        )
        await session.commit()
        
        logger.info(
            f"✅ Queued bulk import job {import_job.id} with Celery task {celery_task_id}"
        )
        
        return ImportJobResponse(
            job_id=import_job.id,
            status=import_job.status,
            message=(
                f"✅ Import job queued for processing. "
                f"Total records: {len(parsed_candidates)}. "
                f"Check status with: GET /api/v1/candidates/import-jobs/{import_job.id}"
            ),
            total_records=len(parsed_candidates),
            celery_task_id=celery_task_id,
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
        logger.error(f"Error queuing import job: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error queuing import job: {str(e)}"
        )


@router.get(
    "/import-jobs/{job_id}",
    response_model=ImportJobStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Get import job status",
    description="Poll the status of a bulk import job",
)
async def get_import_job_status(
    job_id: UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ImportJobStatusResponse:
    """
    Get the status of a bulk import job
    
    Use this endpoint to poll the status of your import job.
    
    **Response Status Codes:**
    - `queued`: Waiting to be processed
    - `processing`: Currently being processed
    - `completed`: Successfully completed
    - `failed`: Failed during processing
    - `cancelled`: Cancelled by user
    
    **Example:**
    ```
    GET /api/v1/candidates/import-jobs/550e8400-e29b-41d4-a716-446655440000
    
    Response:
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "filename": "candidates.csv",
      "status": "processing",
      "total_records": 1000,
      "created_count": 750,
      "failed_count": 50,
      "skipped_count": 200,
      "success_rate": 75.0,
      "processing_duration_seconds": 30,
      "error_message": null,
      "created_at": "2025-11-16T10:30:00Z"
    }
    ```
    """
    try:
        import_job = await ImportJobService.get_import_job(
            session=session,
            import_job_id=job_id,
            company_id=current_user.company_id,
        )
        
        if not import_job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Import job {job_id} not found",
            )
        
        return ImportJobStatusResponse.model_validate(import_job)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching import job status: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching import job status: {str(e)}"
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
                CandidateResponse.model_validate(c) for c in created
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


@router.post(
    "/bulk/import-csv",
    response_model=CandidateBulkImportResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Bulk import candidates from CSV",
    description="Import multiple candidates from CSV file",
)
async def bulk_import_candidates_csv(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CandidateBulkImportResponse:
    """
    Import multiple candidates from CSV file
    
    CSV format should have columns: email, first_name, last_name, position, experience_years
    
    Example CSV:
    ```
    email,first_name,last_name,position,experience_years
    john@example.com,John,Doe,Senior Engineer,5
    jane@example.com,Jane,Smith,Product Manager,3
    ```
    """
    try:
        import csv
        from io import StringIO
        
        # Read CSV file
        content = await file.read()
        text_content = content.decode('utf-8')
        csv_reader = csv.DictReader(StringIO(text_content))
        
        candidates_data = []
        for row in csv_reader:
            if not row.get('email'):
                continue
            
            candidates_data.append({
                'email': row.get('email', ''),
                'first_name': row.get('first_name', ''),
                'last_name': row.get('last_name', ''),
                'position': row.get('position', ''),
                'experience_years': int(row.get('experience_years', 0)) if row.get('experience_years', '').isdigit() else 0,
                'created_by': current_user.id,
            })
        
        if not candidates_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid candidates found in CSV"
            )
        
        # Bulk create
        created, errors = await CandidateService.bulk_create_candidates(
            session=session,
            company_id=current_user.company_id,
            candidates_data=candidates_data,
            created_by=current_user.id,
            send_invitation_emails=False,
        )
        
        logger.info(
            f"✅ CSV Bulk import complete: {len(created)} created, {len(errors)} errors"
        )
        
        return CandidateBulkImportResponse(
            total=len(candidates_data),
            created=len(created),
            failed=len(errors),
            errors=errors,
            created_candidates=[
                CandidateResponse.model_validate(c) for c in created
            ] if created else [],
            message=f"Imported {len(created)} candidates from CSV. {len(errors)} errors."
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in CSV bulk import: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error importing candidates from CSV: {str(e)}"
        )
