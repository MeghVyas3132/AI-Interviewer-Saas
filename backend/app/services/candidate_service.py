"""
Production-grade Candidate Service
Handles CRUD operations, validation, and business logic for candidates
"""

import logging
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select, and_, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.candidate import (
    Candidate,
    CandidateStatus,
    CandidateSource,
    EmailType,
    EmailPriority,
)
from app.services.email_async_service import EmailService

logger = logging.getLogger(__name__)


class CandidateService:
    """Service for candidate management and operations"""

    @staticmethod
    async def create_candidate(
        session: AsyncSession,
        company_id: UUID,
        email: str,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        phone: Optional[str] = None,
        domain: Optional[str] = None,
        position: Optional[str] = None,
        experience_years: Optional[int] = None,
        qualifications: Optional[str] = None,
        resume_url: Optional[str] = None,
        source: CandidateSource = CandidateSource.DIRECT,
        created_by: Optional[UUID] = None,
    ) -> Candidate:
        """
        Create a new candidate
        
        Args:
            session: Database session
            company_id: Company UUID
            email: Candidate email
            first_name: First name
            last_name: Last name
            phone: Phone number
            domain: Domain/department
            position: Target position
            experience_years: Years of experience
            qualifications: Qualifications text
            resume_url: URL to resume
            source: Source of candidate
            created_by: User ID who created
            
        Returns:
            Created Candidate object
        """
        try:
            # Check if candidate already exists
            existing = await CandidateService.get_candidate_by_email(
                session, company_id, email
            )
            if existing:
                logger.warning(f"Candidate already exists: {email} in company {company_id}")
                raise ValueError(f"Candidate with email {email} already exists in this company")
            
            # Create new candidate
            candidate = Candidate(
                company_id=company_id,
                email=email,
                first_name=first_name,
                last_name=last_name,
                phone=phone,
                domain=domain,
                position=position,
                experience_years=experience_years,
                qualifications=qualifications,
                resume_url=resume_url,
                source=source,
                created_by=created_by,
                status=CandidateStatus.APPLIED,
            )
            
            session.add(candidate)
            await session.flush()
            
            logger.info(f"✅ Candidate created: {email} (ID: {candidate.id}) in {company_id}")
            
            return candidate
            
        except ValueError as e:
            logger.error(f"Validation error creating candidate: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Error creating candidate: {str(e)}", exc_info=True)
            raise

    @staticmethod
    async def get_candidate_by_id(
        session: AsyncSession,
        candidate_id: UUID,
        company_id: UUID,
    ) -> Optional[Candidate]:
        """Get candidate by ID (multi-tenant safe)"""
        try:
            result = await session.execute(
                select(Candidate).where(
                    and_(
                        Candidate.id == candidate_id,
                        Candidate.company_id == company_id,
                    )
                )
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching candidate: {str(e)}")
            raise

    @staticmethod
    async def get_candidate_by_email(
        session: AsyncSession,
        company_id: UUID,
        email: str,
    ) -> Optional[Candidate]:
        """Get candidate by email (multi-tenant safe)"""
        try:
            result = await session.execute(
                select(Candidate).where(
                    and_(
                        Candidate.company_id == company_id,
                        Candidate.email == email,
                    )
                )
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching candidate by email: {str(e)}")
            raise

    @staticmethod
    async def list_candidates(
        session: AsyncSession,
        company_id: UUID,
        status: Optional[CandidateStatus] = None,
        domain: Optional[str] = None,
        skip: int = 0,
        limit: int = 20,
    ) -> tuple[List[Candidate], int]:
        """
        List candidates with filtering and pagination
        
        Returns:
            Tuple of (candidates list, total count)
        """
        try:
            # Build query
            query = select(Candidate).where(Candidate.company_id == company_id)
            
            if status:
                query = query.where(Candidate.status == status)
            if domain:
                query = query.where(Candidate.domain == domain)
            
            # Get total count
            count_result = await session.execute(
                select(func.count(Candidate.id)).where(Candidate.company_id == company_id)
            )
            total = count_result.scalar() or 0
            
            # Get paginated results
            query = query.order_by(desc(Candidate.created_at))
            query = query.offset(skip).limit(limit)
            
            result = await session.execute(query)
            candidates = result.scalars().all()
            
            logger.info(f"📊 Listed {len(candidates)} candidates for {company_id}")
            
            return candidates, total
            
        except Exception as e:
            logger.error(f"Error listing candidates: {str(e)}")
            raise

    @staticmethod
    async def update_candidate_status(
        session: AsyncSession,
        candidate_id: UUID,
        company_id: UUID,
        new_status: CandidateStatus,
        send_email: bool = True,
    ) -> Candidate:
        """
        Update candidate status and optionally send notification email
        
        Args:
            session: Database session
            candidate_id: Candidate UUID
            company_id: Company UUID
            new_status: New status
            send_email: Whether to send notification email
            
        Returns:
            Updated Candidate
        """
        try:
            candidate = await CandidateService.get_candidate_by_id(
                session, candidate_id, company_id
            )
            if not candidate:
                raise ValueError(f"Candidate not found: {candidate_id}")
            
            old_status = candidate.status
            candidate.status = new_status
            await session.flush()
            
            logger.info(f"Status updated: {candidate.email} from {old_status} to {new_status}")
            
            # Send notification email if enabled
            if send_email:
                await EmailService.queue_email(
                    session=session,
                    company_id=company_id,
                    recipient_email=candidate.email,
                    template_id="candidate_status_update",
                    subject=f"Update: Your {new_status.value} status",
                    body=f"<p>Hi {candidate.first_name},</p>"
                         f"<p>Your status has been updated to: {new_status.value}</p>",
                    email_type=EmailType.STATUS_UPDATE,
                    variables={
                        "candidate_name": candidate.full_name,
                        "status": new_status.value,
                    },
                    recipient_id=candidate_id,
                    priority=EmailPriority.MEDIUM,
                )
                logger.info(f"Status update email queued for {candidate.email}")
            
            return candidate
            
        except Exception as e:
            logger.error(f"Error updating candidate status: {str(e)}", exc_info=True)
            raise

    @staticmethod
    async def bulk_create_candidates(
        session: AsyncSession,
        company_id: UUID,
        candidates_data: List[dict],
        created_by: Optional[UUID] = None,
        send_invitation_emails: bool = True,
    ) -> tuple[List[Candidate], List[str]]:
        """
        Create multiple candidates from bulk data (e.g., Excel import)
        
        Args:
            session: Database session
            company_id: Company UUID
            candidates_data: List of candidate dictionaries
            created_by: User who initiated bulk creation
            send_invitation_emails: Whether to queue invitation emails
            
        Returns:
            Tuple of (created candidates, error messages)
        """
        created_candidates = []
        errors = []
        
        try:
            for idx, data in enumerate(candidates_data, 1):
                try:
                    email = data.get("email", "").strip().lower()
                    
                    # Validate email
                    if not email or "@" not in email:
                        errors.append(f"Row {idx}: Invalid email '{data.get('email')}'")
                        continue
                    
                    # Create candidate
                    candidate = await CandidateService.create_candidate(
                        session=session,
                        company_id=company_id,
                        email=email,
                        first_name=data.get("first_name", "").strip() or None,
                        last_name=data.get("last_name", "").strip() or None,
                        phone=data.get("phone", "").strip() or None,
                        domain=data.get("domain", "").strip() or None,
                        position=data.get("position", "").strip() or None,
                        experience_years=data.get("experience_years"),
                        qualifications=data.get("qualifications", "").strip() or None,
                        resume_url=data.get("resume_url", "").strip() or None,
                        source=CandidateSource.EXCEL_IMPORT,
                        created_by=created_by,
                    )
                    
                    created_candidates.append(candidate)
                    
                except ValueError as e:
                    # Likely duplicate email
                    errors.append(f"Row {idx}: {str(e)}")
                except Exception as e:
                    errors.append(f"Row {idx}: {str(e)}")
            
            # Commit all created candidates
            await session.commit()
            logger.info(f"✅ Bulk created {len(created_candidates)} candidates for {company_id}")
            
            # Queue invitation emails if enabled
            if send_invitation_emails and created_candidates:
                await CandidateService._queue_bulk_invitations(
                    session, company_id, created_candidates
                )
            
            return created_candidates, errors
            
        except Exception as e:
            logger.error(f"Error in bulk create: {str(e)}", exc_info=True)
            raise

    @staticmethod
    async def _queue_bulk_invitations(
        session: AsyncSession,
        company_id: UUID,
        candidates: List[Candidate],
    ) -> None:
        """Queue invitation emails for bulk created candidates"""
        try:
            recipients = [
                {
                    "email": candidate.email,
                    "template_id": "candidate_invitation",
                    "variables": {
                        "candidate_name": candidate.full_name,
                        "company_name": "Your Company",  # TODO: Get from company
                        "login_link": "https://app.example.com/login",
                        "password": "temporary_password_123",  # TODO: Generate actual password
                    },
                    "recipient_id": candidate.id,
                }
                for candidate in candidates
            ]
            
            await EmailService.queue_bulk_emails(
                session=session,
                company_id=company_id,
                recipients=recipients,
                subject="You're invited to interview!",
                body="<p>Welcome! Click the link to get started.</p>",
                email_type=EmailType.CANDIDATE_INVITE,
                priority=EmailPriority.HIGH,
            )
            
            logger.info(f"📧 Queued {len(recipients)} invitation emails")
            
        except Exception as e:
            logger.error(f"Error queueing bulk invitations: {str(e)}", exc_info=True)
            # Don't fail the whole import if emails fail
