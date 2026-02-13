"""
Notification Service for coordinating email notifications based on system events.
Handles smart email logic: with/without resume, timing, and user preferences.
"""

import logging
from typing import Optional
from uuid import UUID
from datetime import datetime, timedelta, timezone
from enum import Enum

from app.services.email_service import EmailService

logger = logging.getLogger(__name__)


class NotificationEvent(str, Enum):
    """System events that trigger notifications"""
    USER_CREATED = "user_created"
    EMAIL_VERIFICATION_REQUIRED = "email_verification_required"
    PASSWORD_RESET_REQUESTED = "password_reset_requested"
    INTERVIEW_SCHEDULED = "interview_scheduled"
    INTERVIEW_REMINDER = "interview_reminder"  # 24 hours before
    INTERVIEW_COMPLETED = "interview_completed"
    CANDIDATE_REJECTED = "candidate_rejected"
    BULK_IMPORT_STARTED = "bulk_import_started"
    BULK_IMPORT_COMPLETED = "bulk_import_completed"


class NotificationPreference(str, Enum):
    """User notification preferences"""
    ALL = "all"  # All notifications
    IMPORTANT = "important"  # Only important (interviews, rejections)
    NONE = "none"  # No notifications


class NotificationService:
    """
    Service for handling application notifications.
    
    Smart Email Logic:
    - Candidates with resumes: Send email links to view resume in portal
    - Candidates without resumes: Send full details in email body
    - HR/Interviewers: Always send full details + call-to-action links
    """

    def __init__(self):
        """Initialize notification service"""
        self.email_service = EmailService()
        # Note: Notification preferences stored in User model
        # Default preference: IMPORTANT

    async def send_notification(
        self,
        event: NotificationEvent,
        recipient_email: str,
        recipient_name: str,
        recipient_id: UUID,
        company_id: UUID,
        **kwargs,
    ) -> bool:
        """
        Route notification to appropriate handler based on event type.
        
        Args:
            event: Type of notification event
            recipient_email: Recipient email address
            recipient_name: Recipient full name
            recipient_id: User ID
            company_id: Company ID for multi-tenant context
            **kwargs: Event-specific parameters
            
        Returns:
            True if notification sent successfully
        """
        try:
            # Check user notification preferences
            # For now, default to IMPORTANT (can enhance with DB query later)
            preferences = NotificationPreference.IMPORTANT
            
            # Skip if preferences are NONE
            if preferences == NotificationPreference.NONE:
                logger.info(f"Skipping notification for {recipient_email} (preferences: NONE)")
                return True
            
            # Route to appropriate handler
            if event == NotificationEvent.USER_CREATED:
                return await self._handle_user_created(
                    recipient_email, recipient_name, company_id=company_id, **kwargs
                )
            
            elif event == NotificationEvent.EMAIL_VERIFICATION_REQUIRED:
                return await self._handle_email_verification(
                    recipient_email, recipient_name, **kwargs
                )
            
            elif event == NotificationEvent.PASSWORD_RESET_REQUESTED:
                return await self._handle_password_reset(
                    recipient_email, recipient_name, **kwargs
                )
            
            elif event == NotificationEvent.INTERVIEW_SCHEDULED:
                return await self._handle_interview_scheduled(
                    recipient_email, recipient_name, recipient_id, company_id, **kwargs
                )
            
            elif event == NotificationEvent.INTERVIEW_REMINDER:
                return await self._handle_interview_reminder(
                    recipient_email, recipient_name, **kwargs
                )
            
            elif event == NotificationEvent.INTERVIEW_COMPLETED:
                return await self._handle_interview_completed(
                    recipient_email, recipient_name, **kwargs
                )
            
            elif event == NotificationEvent.CANDIDATE_REJECTED:
                return await self._handle_candidate_rejected(
                    recipient_email, recipient_name, **kwargs
                )
            
            elif event == NotificationEvent.BULK_IMPORT_COMPLETED:
                return await self._handle_bulk_import_completed(
                    recipient_email, recipient_name, **kwargs
                )
            
            else:
                logger.warning(f"Unknown notification event: {event}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to send {event} notification to {recipient_email}: {str(e)}")
            return False

    async def _handle_user_created(
        self,
        recipient_email: str,
        recipient_name: str,
        company_id: UUID,
        verification_link: str,
        company_name: str = "AI Interviewer",
        **kwargs,
    ) -> bool:
        """Handle new user welcome email with verification link"""
        return await self.email_service.send_welcome_email(
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            company_name=company_name,
            verification_link=verification_link,
        )

    async def _handle_email_verification(
        self,
        recipient_email: str,
        recipient_name: str,
        verification_link: str,
        expiry_minutes: int = 24 * 60,
        **kwargs,
    ) -> bool:
        """Handle email verification request"""
        return await self.email_service.send_email_verification(
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            verification_link=verification_link,
            expiry_minutes=expiry_minutes,
        )

    async def _handle_password_reset(
        self,
        recipient_email: str,
        recipient_name: str,
        reset_link: str,
        expiry_minutes: int = 60,
        **kwargs,
    ) -> bool:
        """Handle password reset email"""
        return await self.email_service.send_password_reset_email(
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            reset_link=reset_link,
            expiry_minutes=expiry_minutes,
        )

    async def _handle_interview_scheduled(
        self,
        recipient_email: str,
        recipient_name: str,
        recipient_id: UUID,
        company_id: UUID,
        candidate_name: str,
        position: str,
        scheduled_time: str,
        interview_link: Optional[str] = None,
        interviewer_name: Optional[str] = None,
        has_resume: bool = False,
        **kwargs,
    ) -> bool:
        """
        Handle interview scheduled notification.
        
        Smart Logic:
        - If candidate has resume: Send with link to portal
        - If candidate without resume: Include all details in email
        - HR/Interviewers: Always send full details + interview link
        """
        # For now, send standard interview scheduled email
        # This will be enhanced in Phase 8 with resume-aware logic
        return await self.email_service.send_interview_scheduled_email(
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            candidate_name=candidate_name,
            position=position,
            scheduled_time=scheduled_time,
            interview_link=interview_link,
            interviewer_name=interviewer_name,
        )

    async def _handle_interview_reminder(
        self,
        recipient_email: str,
        recipient_name: str,
        candidate_name: str,
        position: str,
        scheduled_time: str,
        interview_link: Optional[str] = None,
        **kwargs,
    ) -> bool:
        """Handle interview reminder (24 hours before)"""
        return await self.email_service.send_interview_reminder_email(
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            candidate_name=candidate_name,
            position=position,
            scheduled_time=scheduled_time,
            interview_link=interview_link,
        )

    async def _handle_interview_completed(
        self,
        recipient_email: str,
        recipient_name: str,
        candidate_name: str,
        position: str,
        next_steps: str = "You will hear from us soon.",
        **kwargs,
    ) -> bool:
        """Handle interview completed notification"""
        return await self.email_service.send_interview_completed_email(
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            candidate_name=candidate_name,
            position=position,
            next_steps=next_steps,
        )

    async def _handle_candidate_rejected(
        self,
        recipient_email: str,
        recipient_name: str,
        candidate_name: str,
        position: str,
        feedback: Optional[str] = None,
        **kwargs,
    ) -> bool:
        """Handle candidate rejection notification"""
        return await self.email_service.send_candidate_rejection_email(
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            candidate_name=candidate_name,
            position=position,
            feedback=feedback,
        )

    async def _handle_bulk_import_completed(
        self,
        recipient_email: str,
        recipient_name: str,
        total_count: int,
        success_count: int,
        failed_count: int,
        import_summary_link: Optional[str] = None,
        **kwargs,
    ) -> bool:
        """Handle bulk import completion notification"""
        return await self.email_service.send_bulk_import_complete_email(
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            total_count=total_count,
            success_count=success_count,
            failed_count=failed_count,
            import_summary_link=import_summary_link,
        )

    async def schedule_interview_reminder(
        self,
        interview_id: UUID,
        candidate_email: str,
        candidate_name: str,
        position: str,
        scheduled_time: datetime,
        recipient_email: str,
        recipient_name: str,
    ) -> bool:
        """
        Schedule interview reminder for 24 hours before.
        
        Uses Celery's `apply_async(eta=...)` to schedule the task.
        Falls back to logging if Celery is unavailable.
        """
        # Calculate reminder time (24 hours before)
        reminder_time = scheduled_time - timedelta(hours=24)
        
        # If reminder time is already in the past, skip scheduling
        if reminder_time <= datetime.now(timezone.utc):
            logger.info(
                f"Skipping reminder for interview {interview_id}: "
                f"reminder time {reminder_time} is in the past"
            )
            return True
        
        try:
            from app.core.celery_config import celery_app
            
            celery_app.send_task(
                "tasks.send_email",
                kwargs={
                    "recipient_email": recipient_email,
                    "recipient_name": recipient_name,
                    "subject": f"Interview Reminder: {position}",
                    "body": (
                        f"<p>Hi {recipient_name},</p>"
                        f"<p>This is a reminder that <strong>{candidate_name}</strong> "
                        f"({candidate_email}) has an interview scheduled for "
                        f"<strong>{scheduled_time.strftime('%B %d, %Y at %I:%M %p UTC')}</strong> "
                        f"for the <strong>{position}</strong> position.</p>"
                        f"<p>Please ensure everything is ready.</p>"
                    ),
                },
                eta=reminder_time,
                queue="email",
            )
            
            logger.info(
                f"Scheduled reminder for interview {interview_id} "
                f"at {reminder_time} (24h before {scheduled_time})"
            )
            return True
            
        except Exception as e:
            logger.error(f"Failed to schedule interview reminder via Celery: {e}")
            logger.info(
                f"[FALLBACK] Reminder needed for interview {interview_id} "
                f"at {reminder_time} (24h before {scheduled_time})"
            )
            return False
