"""
Production-grade email service with async Celery task integration
Supports multiple email providers and comprehensive error handling
"""

import logging
from typing import Dict, List, Optional
from uuid import UUID

from app.core.celery_config import celery_app
from app.core.config import settings
from app.core.database import get_db
from app.models.candidate import EmailQueue, EmailStatus, EmailType, EmailPriority
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class EmailService:
    """Email service for queueing and sending emails"""

    @staticmethod
    async def queue_email(
        session: AsyncSession,
        company_id: UUID,
        recipient_email: str,
        template_id: str,
        subject: str,
        body: str,
        email_type: EmailType,
        variables: Optional[Dict] = None,
        recipient_id: Optional[UUID] = None,
        priority: EmailPriority = EmailPriority.MEDIUM,
    ) -> UUID:
        """
        Queue an email for async sending via Celery
        
        Args:
            session: Database session
            company_id: Company UUID
            recipient_email: Email address to send to
            template_id: Email template identifier
            subject: Email subject
            body: Email body (HTML or plain text)
            email_type: Type of email (from EmailType enum)
            variables: Template variables for personalization
            recipient_id: Optional ID of recipient (user or candidate)
            priority: Email priority (HIGH, MEDIUM, LOW)
            
        Returns:
            UUID of created email queue record
        """
        try:
            # Validate email
            if not EmailService._is_valid_email(recipient_email):
                logger.error(f"Invalid email address: {recipient_email}")
                raise ValueError(f"Invalid email address: {recipient_email}")
            
            # Create email queue record
            email_queue = EmailQueue(
                company_id=company_id,
                recipient_email=recipient_email,
                recipient_id=recipient_id,
                template_id=template_id,
                subject=subject,
                body=body,
                variables=variables or {},
                email_type=email_type,
                priority=priority,
                status=EmailStatus.QUEUED,
            )
            
            session.add(email_queue)
            await session.flush()  # Get the ID before commit
            email_id = email_queue.id
            
            logger.info(
                f"Email queued: {email_type.value} to {recipient_email} "
                f"(ID: {email_id}, Priority: {priority.value})"
            )
            
            # Trigger Celery task to send the email
            await EmailService._trigger_send_email_task(email_id, priority)
            
            return email_id
            
        except Exception as e:
            logger.error(f"Error queueing email: {str(e)}", exc_info=True)
            raise

    @staticmethod
    async def queue_bulk_emails(
        session: AsyncSession,
        company_id: UUID,
        recipients: List[Dict],  # [{"email": "...", "variables": {...}, "template_id": "..."}, ...]
        subject: str,
        body: str,
        email_type: EmailType,
        priority: EmailPriority = EmailPriority.MEDIUM,
    ) -> List[UUID]:
        """
        Queue multiple emails at once for bulk sending
        
        Args:
            session: Database session
            company_id: Company UUID
            recipients: List of recipient dicts with email, variables, template_id
            subject: Email subject
            body: Email body
            email_type: Type of email
            priority: Email priority
            
        Returns:
            List of created email queue IDs
        """
        try:
            email_ids = []
            
            for recipient in recipients:
                email_id = await EmailService.queue_email(
                    session=session,
                    company_id=company_id,
                    recipient_email=recipient["email"],
                    template_id=recipient.get("template_id", "default"),
                    subject=subject,
                    body=body,
                    email_type=email_type,
                    variables=recipient.get("variables", {}),
                    recipient_id=recipient.get("recipient_id"),
                    priority=priority,
                )
                email_ids.append(email_id)
            
            await session.commit()
            logger.info(f"Bulk: {len(email_ids)} emails queued for {company_id}")
            
            return email_ids
            
        except Exception as e:
            logger.error(f"Error queueing bulk emails: {str(e)}", exc_info=True)
            raise

    @staticmethod
    async def _trigger_send_email_task(email_id: UUID, priority: EmailPriority) -> None:
        """Trigger Celery task to send email"""
        try:
            # Map priority to Celery queue
            queue_map = {
                EmailPriority.HIGH: "email_high",
                EmailPriority.MEDIUM: "email_default",
                EmailPriority.LOW: "email_low",
            }
            queue = queue_map.get(priority, "email_default")
            
            # Send task to Celery
            celery_app.send_task(
                "tasks.send_email",
                args=[str(email_id)],
                queue=queue,
                priority=priority.value,
            )
            
        except Exception as e:
            logger.error(f"Error triggering Celery task: {str(e)}", exc_info=True)

    @staticmethod
    def _is_valid_email(email: str) -> bool:
        """Basic email validation"""
        if not email or "@" not in email or len(email) < 5:
            return False
        return True


# ============================================================================
# CELERY TASKS FOR ASYNC EMAIL SENDING
# ============================================================================


@celery_app.task(
    name="tasks.send_email",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
)
async def send_email_task(self, email_id: str):
    """
    Celery task to send email from queue
    Retries up to 3 times with exponential backoff
    """
    try:
        logger.info(f"Starting email send for ID: {email_id}")
        
        # Get database session
        async with get_db_session() as session:
            # Fetch email from queue
            result = await session.execute(
                select(EmailQueue).where(EmailQueue.id == UUID(email_id))
            )
            email_queue = result.scalar_one_or_none()
            
            if not email_queue:
                logger.error(f"Email not found in queue: {email_id}")
                return
            
            # Update status to SENDING
            email_queue.status = EmailStatus.SENDING
            await session.commit()
            
            # Send email via provider
            try:
                provider_id = await EmailService._send_via_provider(email_queue)
                
                # Update with success
                email_queue.status = EmailStatus.SENT
                email_queue.email_provider_id = provider_id
                email_queue.retry_count = 0
                from datetime import datetime
                email_queue.sent_at = datetime.utcnow()
                await session.commit()
                
                logger.info(f"Email sent successfully: {email_id} (Provider ID: {provider_id})")
                
            except Exception as send_error:
                logger.error(f"Error sending email: {str(send_error)}", exc_info=True)
                
                # Handle retry logic
                email_queue.retry_count += 1
                email_queue.error_message = str(send_error)
                
                if email_queue.retry_count < email_queue.max_retries:
                    email_queue.status = EmailStatus.QUEUED
                    await session.commit()
                    
                    # Retry with exponential backoff
                    retry_delay = 60 * (2 ** (email_queue.retry_count - 1))
                    logger.warning(
                        f"Retrying email {email_id} in {retry_delay}s "
                        f"(Attempt {email_queue.retry_count}/{email_queue.max_retries})"
                    )
                    raise self.retry(countdown=retry_delay)
                else:
                    # Mark as failed after max retries
                    email_queue.status = EmailStatus.FAILED
                    await session.commit()
                    logger.error(f"Email failed after {email_queue.max_retries} retries: {email_id}")
                    
    except self.retry.retry_later():
        # Celery retry
        pass
    except Exception as e:
        logger.error(f"Unexpected error in send_email_task: {str(e)}", exc_info=True)
        raise


@celery_app.task(
    name="tasks.send_bulk_emails",
    bind=True,
    max_retries=3,
)
async def send_bulk_emails_task(self, email_ids: List[str]):
    """
    Celery task to send multiple emails
    Distributes across multiple send_email tasks
    """
    try:
        logger.info(f"Starting bulk email send for {len(email_ids)} emails")
        
        # Queue individual email tasks
        for email_id in email_ids:
            celery_app.send_task(
                "tasks.send_email",
                args=[email_id],
                queue="email_default",
            )
        
        logger.info(f"Queued {len(email_ids)} individual email tasks")
        
    except Exception as e:
        logger.error(f"Error in bulk email task: {str(e)}", exc_info=True)
        raise


class EmailProviderService:
    """Handle actual email provider integrations"""

    @staticmethod
    async def _send_via_provider(email_queue: EmailQueue) -> str:
        """Send email via configured provider"""
        
        provider = settings.email_provider.lower()
        
        if provider == "sendgrid":
            return await EmailProviderService._send_via_sendgrid(email_queue)
        elif provider == "ses":
            return await EmailProviderService._send_via_ses(email_queue)
        else:
            # Console provider for development
            return await EmailProviderService._send_via_console(email_queue)

    @staticmethod
    async def _send_via_sendgrid(email_queue: EmailQueue) -> str:
        """Send via SendGrid"""
        try:
            import sendgrid
            from sendgrid.helpers.mail import Mail, Email, To, Content
            
            if not settings.sendgrid_api_key:
                raise ValueError("SENDGRID_API_KEY not configured")
            
            sg = sendgrid.SendGridAPIClient(settings.sendgrid_api_key)
            
            message = Mail(
                from_email=Email(settings.email_from_address, settings.email_from_name),
                to_emails=To(email_queue.recipient_email),
                subject=email_queue.subject,
                plain_text_content=email_queue.body,
                html_content=email_queue.body,
            )
            
            response = sg.send(message)
            
            # SendGrid returns message ID in headers
            message_id = response.headers.get("X-Message-Id", "sendgrid_" + str(email_queue.id))
            logger.info(f"SendGrid: Message sent (ID: {message_id})")
            
            return message_id
            
        except ImportError:
            logger.error("sendgrid package not installed")
            raise
        except Exception as e:
            logger.error(f"SendGrid error: {str(e)}")
            raise

    @staticmethod
    async def _send_via_ses(email_queue: EmailQueue) -> str:
        """Send via AWS SES"""
        try:
            import boto3
            
            client = boto3.client(
                "ses",
                region_name=settings.aws_region,
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key,
            )
            
            response = client.send_email(
                Source=settings.email_from_address,
                Destination={"ToAddresses": [email_queue.recipient_email]},
                Message={
                    "Subject": {"Data": email_queue.subject},
                    "Body": {"Html": {"Data": email_queue.body}},
                },
            )
            
            message_id = response.get("MessageId", "ses_" + str(email_queue.id))
            logger.info(f"AWS SES: Message sent (ID: {message_id})")
            
            return message_id
            
        except Exception as e:
            logger.error(f"AWS SES error: {str(e)}")
            raise

    @staticmethod
    async def _send_via_console(email_queue: EmailQueue) -> str:
        """Send via console (development only)"""
        message_id = f"console_{email_queue.id}"
        logger.info(
            f"\n{'='*80}\n"
            f"CONSOLE EMAIL (Development Only)\n"
            f"{'='*80}\n"
            f"To: {email_queue.recipient_email}\n"
            f"Subject: {email_queue.subject}\n"
            f"Priority: {email_queue.priority.value}\n"
            f"{'-'*80}\n"
            f"{email_queue.body}\n"
            f"{'='*80}\n"
        )
        return message_id
