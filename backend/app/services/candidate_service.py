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
    Interview,
    InterviewStatus,
)
from app.services.email_async_service import EmailService
from app.models.user import User, UserRole

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

            # Ensure there's a corresponding user record for the candidate so
            # interview_rounds which reference users.id as candidate_id will
            # not violate foreign key constraints. Some flows (candidate portal)
            # expect a User row for candidates with a placeholder password.
            try:
                user_query = await session.execute(
                    select(User).where(User.email == email, User.role == UserRole.CANDIDATE)
                )
                existing_user = user_query.scalars().first()
            except Exception:
                existing_user = None

            if not existing_user:
                # Create a candidate user with the same UUID as the candidate so
                # candidate_id -> users.id FK works when scheduling rounds.
                candidate_user = User(
                    id=candidate.id,
                    company_id=company_id,
                    name=(f"{first_name or ''} {last_name or ''}".strip() or email),
                    email=email,
                    password_hash="CANDIDATE_NO_PASSWORD",
                    role=UserRole.CANDIDATE,
                    is_active=True,
                    email_verified=True,
                )
                session.add(candidate_user)
                # flush to ensure the user row exists for any subsequent FK checks
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
                    email_val = data.get("email")
                    email = email_val.strip().lower() if email_val else ""
                    
                    # Validate email
                    if not email or "@" not in email:
                        errors.append(f"Row {idx}: Invalid email '{data.get('email')}'")
                        continue
                    
                    # Helper to safely strip strings
                    def safe_strip(val):
                        return val.strip() if val else None
                    
                    # Create candidate
                    candidate = await CandidateService.create_candidate(
                        session=session,
                        company_id=company_id,
                        email=email,
                        first_name=safe_strip(data.get("first_name")),
                        last_name=safe_strip(data.get("last_name")),
                        phone=safe_strip(data.get("phone")),
                        domain=safe_strip(data.get("domain")),
                        position=safe_strip(data.get("position")),
                        experience_years=data.get("experience_years"),
                        qualifications=safe_strip(data.get("qualifications")),
                        resume_url=safe_strip(data.get("resume_url")),
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

    @staticmethod
    async def log_bulk_import(
        session: AsyncSession,
        company_id: UUID,
        user_id: UUID,
        filename: str,
        total: int,
        created: int,
        failed: int,
    ) -> None:
        """Log bulk import operation to audit logs"""
        try:
            from app.services.audit_log_service import AuditLogService
            
            await AuditLogService.log_action(
                session=session,
                company_id=company_id,
                user_id=user_id,
                action="BULK_IMPORT_CANDIDATES",
                resource_type="candidate",
                resource_id=None,
                details={
                    "filename": filename,
                    "total": total,
                    "created": created,
                    "failed": failed,
                    "success_rate": f"{(created/total*100):.1f}%" if total > 0 else "0%",
                }
            )
            logger.info(f"✅ Logged bulk import: {created}/{total} created")
        except Exception as e:
            logger.error(f"Error logging bulk import: {str(e)}")

    # ========================================================================
    # DASHBOARD ANALYTICS
    # ========================================================================

    @staticmethod
    async def get_dashboard_stats(
        session: AsyncSession,
        company_id: UUID,
    ) -> dict:
        """
        Get comprehensive dashboard statistics
        
        Returns:
        - Total candidates
        - Candidates by status
        - Candidates by domain
        - Active interviews
        - Pending feedback
        - Recent activities
        """
        try:
            # Total candidates
            total_result = await session.execute(
                select(func.count(Candidate.id)).where(
                    Candidate.company_id == company_id
                )
            )
            total_candidates = total_result.scalar() or 0
            
            # Candidates by status
            status_query = select(
                Candidate.status,
                func.count(Candidate.id).label("count")
            ).where(
                Candidate.company_id == company_id
            ).group_by(Candidate.status)
            
            status_result = await session.execute(status_query)
            candidates_by_status = {
                row[0].value: row[1] for row in status_result.fetchall()
            }
            
            # Candidates by domain
            domain_query = select(
                Candidate.domain,
                func.count(Candidate.id).label("count")
            ).where(
                Candidate.company_id == company_id,
                Candidate.domain != None
            ).group_by(Candidate.domain)
            
            domain_result = await session.execute(domain_query)
            candidates_by_domain = {
                row[0] or "Unspecified": row[1] for row in domain_result.fetchall()
            }
            
            # Active interviews (from interview model)
            
            active_interviews_query = select(func.count(Interview.id)).where(
                and_(
                    Interview.company_id == company_id,
                    Interview.status.in_([
                        InterviewStatus.SCHEDULED,
                        InterviewStatus.IN_PROGRESS,
                    ])
                )
            )
            
            active_interviews_result = await session.execute(active_interviews_query)
            active_interviews = active_interviews_result.scalar() or 0
            
            # Pending feedback (interviews without feedback)
            pending_feedback_query = select(func.count(Interview.id)).where(
                and_(
                    Interview.company_id == company_id,
                    Interview.status == InterviewStatus.COMPLETED,
                    Interview.notes == None  # No feedback yet
                )
            )
            
            pending_feedback_result = await session.execute(pending_feedback_query)
            pending_feedback = pending_feedback_result.scalar() or 0
            
            # Conversion rates
            applied = candidates_by_status.get("applied", 0)
            shortlisted = candidates_by_status.get("screening", 0)  # screening is shortlisting
            interviewed = candidates_by_status.get("interview", 0)
            accepted = candidates_by_status.get("accepted", 0)  # accepted offers
            rejected = candidates_by_status.get("rejected", 0)
            
            conversion_rates = {
                "applied_to_screening": round((shortlisted / applied * 100) if applied > 0 else 0, 1),
                "screening_to_interview": round((interviewed / shortlisted * 100) if shortlisted > 0 else 0, 1),
                "interview_to_offer": round((accepted / interviewed * 100) if interviewed > 0 else 0, 1),
                "total_acceptance_rate": round((accepted / applied * 100) if applied > 0 else 0, 1),
                "rejection_rate": round((rejected / applied * 100) if applied > 0 else 0, 1),
            }
            
            return {
                "total_candidates": total_candidates,
                "active_interviews": active_interviews,
                "pending_feedback": pending_feedback,
                "candidates_by_status": candidates_by_status,
                "candidates_by_domain": candidates_by_domain,
                "conversion_rates": conversion_rates,
                "timestamp": None,  # Will be set by route handler
            }
            
        except Exception as e:
            logger.error(f"Error getting dashboard stats: {str(e)}", exc_info=True)
            raise

    @staticmethod
    async def get_funnel_analytics(
        session: AsyncSession,
        company_id: UUID,
    ) -> dict:
        """
        Get candidate funnel analytics showing progression through stages
        
        Returns:
        - Applied → Screening → Interview → Offer → Accepted
        - Drop-off rates at each stage
        - Total funnel efficiency
        """
        try:
            # Get candidates by status
            status_query = select(
                Candidate.status,
                func.count(Candidate.id).label("count")
            ).where(
                Candidate.company_id == company_id
            ).group_by(Candidate.status)
            
            status_result = await session.execute(status_query)
            status_counts = {row[0].value: row[1] for row in status_result.fetchall()}
            
            applied = status_counts.get("applied", 0)
            screening = status_counts.get("screening", 0)  # shortlisting stage
            interview = status_counts.get("interview", 0)
            offer = status_counts.get("offer", 0)
            accepted = status_counts.get("accepted", 0)  # hired/accepted offers
            rejected = status_counts.get("rejected", 0)
            
            total = applied + screening + interview + offer + accepted + rejected
            
            # Calculate funnel stages and drop-off rates
            funnel_stages = [
                {"stage": "Applied", "count": applied, "percentage": round((applied/total*100) if total > 0 else 0, 1)},
                {"stage": "Screening", "count": screening, "percentage": round((screening/total*100) if total > 0 else 0, 1), "dropoff_from_applied": round((1 - screening/applied) * 100 if applied > 0 else 0, 1)},
                {"stage": "Interview", "count": interview, "percentage": round((interview/total*100) if total > 0 else 0, 1), "dropoff_from_screening": round((1 - interview/screening) * 100 if screening > 0 else 0, 1)},
                {"stage": "Offer", "count": offer, "percentage": round((offer/total*100) if total > 0 else 0, 1), "dropoff_from_interview": round((1 - offer/interview) * 100 if interview > 0 else 0, 1)},
                {"stage": "Accepted", "count": accepted, "percentage": round((accepted/total*100) if total > 0 else 0, 1), "dropoff_from_offer": round((1 - accepted/offer) * 100 if offer > 0 else 0, 1)},
            ]
            
            return {
                "funnel_stages": funnel_stages,
                "total_candidates": total,
                "rejected": rejected,
                "overall_acceptance_rate": round((accepted / applied * 100) if applied > 0 else 0, 1),
            }
            
        except Exception as e:
            logger.error(f"Error getting funnel analytics: {str(e)}", exc_info=True)
            raise

    @staticmethod
    async def get_time_to_hire_metrics(
        session: AsyncSession,
        company_id: UUID,
    ) -> dict:
        """
        Get time-to-hire metrics showing duration at each stage
        
        Returns:
        - Average days from applied to hired (accepted)
        - Average days per stage
        - Department breakdowns
        - Trend data
        """
        try:
            from sqlalchemy import extract
            from datetime import datetime, timedelta
            
            # Get accepted candidates with duration
            hired_candidates = await session.execute(
                select(
                    Candidate.id,
                    Candidate.created_at,
                    Candidate.updated_at,
                    Candidate.domain,
                ).where(
                    and_(
                        Candidate.company_id == company_id,
                        Candidate.status == CandidateStatus.ACCEPTED
                    )
                )
            )
            
            hired_list = hired_candidates.fetchall()
            
            if not hired_list:
                return {
                    "average_days_to_hire": 0,
                    "median_days_to_hire": 0,
                    "by_department": {},
                    "recent_hires_count": 0,
                    "message": "No accepted candidates yet",
                }
            
            # Calculate time-to-hire for each candidate
            durations = []
            by_department = {}
            
            for candidate_id, created_at, updated_at, domain in hired_list:
                duration = (updated_at - created_at).days
                durations.append(duration)
                
                dept = domain or "Unspecified"
                if dept not in by_department:
                    by_department[dept] = []
                by_department[dept].append(duration)
            
            # Calculate statistics
            avg_days = sum(durations) / len(durations) if durations else 0
            sorted_durations = sorted(durations)
            median_days = sorted_durations[len(sorted_durations) // 2] if durations else 0
            
            # Department averages
            dept_stats = {}
            for dept, times in by_department.items():
                dept_stats[dept] = {
                    "average_days": round(sum(times) / len(times), 1),
                    "count": len(times),
                    "min_days": min(times),
                    "max_days": max(times),
                }
            
            # Recent hires (last 30 days)
            thirty_days_ago = datetime.utcnow() - timedelta(days=30)
            recent_count = sum(1 for _, created_at, _, _ in hired_list if created_at >= thirty_days_ago)
            
            return {
                "average_days_to_hire": round(avg_days, 1),
                "median_days_to_hire": median_days,
                "total_hired": len(hired_list),
                "by_department": dept_stats,
                "recent_hires_30_days": recent_count,
            }
            
        except Exception as e:
            logger.error(f"Error getting time-to-hire metrics: {str(e)}", exc_info=True)
            raise

