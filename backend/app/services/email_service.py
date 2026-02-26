"""
Email Service for sending transactional and notification emails.
Supports SendGrid and AWS SES backends.
"""

import os
import logging
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime
from jinja2 import Environment, FileSystemLoader, Template

try:
    import sendgrid
    from sendgrid.helpers.mail import Mail, Email, To, Content, HtmlContent
    SENDGRID_AVAILABLE = True
except ImportError:
    SENDGRID_AVAILABLE = False

try:
    import boto3
    SES_AVAILABLE = True
except ImportError:
    SES_AVAILABLE = False

logger = logging.getLogger(__name__)


class EmailProvider(str, Enum):
    """Supported email providers"""
    SENDGRID = "sendgrid"
    SES = "ses"
    CONSOLE = "console"  # For development/testing


class EmailTemplate(str, Enum):
    """Available email templates"""
    WELCOME = "welcome"
    EMAIL_VERIFICATION = "email_verification"
    PASSWORD_RESET = "password_reset"
    INTERVIEW_SCHEDULED = "interview_scheduled"
    INTERVIEW_REMINDER = "interview_reminder"
    INTERVIEW_COMPLETED = "interview_completed"
    CANDIDATE_REJECTION = "candidate_rejection"
    BULK_IMPORT_COMPLETE = "bulk_import_complete"


class EmailService:
    """
    Service for sending emails through configured backend provider.
    Handles template rendering and email delivery.
    """

    def __init__(self):
        """Initialize email service with configured provider"""
        self.provider = os.getenv("EMAIL_PROVIDER", EmailProvider.CONSOLE).lower()
        self.from_email = os.getenv("EMAIL_FROM_ADDRESS", "noreply@aiinterviewer.com")
        self.from_name = os.getenv("EMAIL_FROM_NAME", "AI Interviewer")
        
        # Initialize provider-specific clients
        if self.provider == EmailProvider.SENDGRID:
            if not SENDGRID_AVAILABLE:
                raise ImportError("sendgrid package not installed. Run: pip install sendgrid")
            self.sendgrid_client = sendgrid.SendGridAPIClient(
                os.getenv("SENDGRID_API_KEY")
            )
        elif self.provider == EmailProvider.SES:
            if not SES_AVAILABLE:
                raise ImportError("boto3 package not installed. Run: pip install boto3")
            self.ses_client = boto3.client(
                "ses",
                region_name=os.getenv("AWS_REGION", "us-east-1"),
                aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
                aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            )
        
        # Setup Jinja2 for template rendering
        template_dir = os.path.join(
            os.path.dirname(__file__), "..", "templates", "emails"
        )
        self.jinja_env = Environment(
            loader=FileSystemLoader(template_dir),
            autoescape=True
        )

    async def send_welcome_email(
        self,
        recipient_email: str,
        recipient_name: str,
        company_name: str,
        verification_link: str,
    ) -> bool:
        """Send welcome email with verification link to new user"""
        return await self.send_email(
            to_email=recipient_email,
            to_name=recipient_name,
            subject="Welcome to AI Interviewer",
            template=EmailTemplate.WELCOME,
            variables={
                "recipient_name": recipient_name,
                "company_name": company_name,
                "verification_link": verification_link,
                "current_year": datetime.now().year,
            },
        )

    async def send_email_verification(
        self,
        recipient_email: str,
        recipient_name: str,
        verification_link: str,
        expiry_minutes: int = 24 * 60,
    ) -> bool:
        """Send email verification link"""
        return await self.send_email(
            to_email=recipient_email,
            to_name=recipient_name,
            subject="Verify Your Email Address",
            template=EmailTemplate.EMAIL_VERIFICATION,
            variables={
                "recipient_name": recipient_name,
                "verification_link": verification_link,
                "expiry_minutes": expiry_minutes,
                "current_year": datetime.now().year,
            },
        )

    async def send_password_reset_email(
        self,
        recipient_email: str,
        recipient_name: str,
        reset_link: str,
        expiry_minutes: int = 60,
    ) -> bool:
        """Send password reset email"""
        return await self.send_email(
            to_email=recipient_email,
            to_name=recipient_name,
            subject="Reset Your Password",
            template=EmailTemplate.PASSWORD_RESET,
            variables={
                "recipient_name": recipient_name,
                "reset_link": reset_link,
                "expiry_minutes": expiry_minutes,
                "current_year": datetime.now().year,
            },
        )

    async def send_interview_scheduled_email(
        self,
        recipient_email: str,
        recipient_name: str,
        candidate_name: str,
        position: str,
        scheduled_time: str,
        interview_link: Optional[str] = None,
        interviewer_name: Optional[str] = None,
    ) -> bool:
        """Send interview scheduled notification"""
        return await self.send_email(
            to_email=recipient_email,
            to_name=recipient_name,
            subject=f"Interview Scheduled: {position}",
            template=EmailTemplate.INTERVIEW_SCHEDULED,
            variables={
                "recipient_name": recipient_name,
                "candidate_name": candidate_name,
                "position": position,
                "scheduled_time": scheduled_time,
                "interview_link": interview_link or "#",
                "interviewer_name": interviewer_name or "Your Interviewer",
                "current_year": datetime.now().year,
            },
        )

    async def send_interview_reminder_email(
        self,
        recipient_email: str,
        recipient_name: str,
        candidate_name: str,
        position: str,
        scheduled_time: str,
        interview_link: Optional[str] = None,
    ) -> bool:
        """Send interview reminder (24 hours before)"""
        return await self.send_email(
            to_email=recipient_email,
            to_name=recipient_name,
            subject=f"Reminder: Interview Tomorrow - {position}",
            template=EmailTemplate.INTERVIEW_REMINDER,
            variables={
                "recipient_name": recipient_name,
                "candidate_name": candidate_name,
                "position": position,
                "scheduled_time": scheduled_time,
                "interview_link": interview_link or "#",
                "current_year": datetime.now().year,
            },
        )

    async def send_interview_completed_email(
        self,
        recipient_email: str,
        recipient_name: str,
        candidate_name: str,
        position: str,
        next_steps: str = "You will hear from us soon.",
    ) -> bool:
        """Send interview completed notification"""
        return await self.send_email(
            to_email=recipient_email,
            to_name=recipient_name,
            subject=f"Interview Completed - {position}",
            template=EmailTemplate.INTERVIEW_COMPLETED,
            variables={
                "recipient_name": recipient_name,
                "candidate_name": candidate_name,
                "position": position,
                "next_steps": next_steps,
                "current_year": datetime.now().year,
            },
        )

    async def send_candidate_rejection_email(
        self,
        recipient_email: str,
        recipient_name: str,
        candidate_name: str,
        position: str,
        feedback: Optional[str] = None,
    ) -> bool:
        """Send candidate rejection email"""
        return await self.send_email(
            to_email=recipient_email,
            to_name=recipient_name,
            subject=f"Application Update - {position}",
            template=EmailTemplate.CANDIDATE_REJECTION,
            variables={
                "recipient_name": recipient_name,
                "candidate_name": candidate_name,
                "position": position,
                "feedback": feedback or "We appreciate your interest.",
                "current_year": datetime.now().year,
            },
        )

    async def send_bulk_import_complete_email(
        self,
        recipient_email: str,
        recipient_name: str,
        total_count: int,
        success_count: int,
        failed_count: int,
        import_summary_link: Optional[str] = None,
    ) -> bool:
        """Send bulk import completion summary email"""
        return await self.send_email(
            to_email=recipient_email,
            to_name=recipient_name,
            subject="Bulk Import Complete",
            template=EmailTemplate.BULK_IMPORT_COMPLETE,
            variables={
                "recipient_name": recipient_name,
                "total_count": total_count,
                "success_count": success_count,
                "failed_count": failed_count,
                "success_rate": round((success_count / total_count * 100) if total_count > 0 else 0),
                "import_summary_link": import_summary_link or "#",
                "current_year": datetime.now().year,
            },
        )

    async def send_email(
        self,
        to_email: str,
        to_name: str,
        subject: str,
        template: EmailTemplate,
        variables: Dict[str, Any],
        cc_emails: Optional[List[str]] = None,
        bcc_emails: Optional[List[str]] = None,
        reply_to: Optional[str] = None,
    ) -> bool:
        """
        Send email using configured provider.
        
        Args:
            to_email: Recipient email address
            to_name: Recipient name
            subject: Email subject
            template: Email template to use
            variables: Template variables for rendering
            cc_emails: List of CC email addresses
            bcc_emails: List of BCC email addresses
            reply_to: Reply-to email address
            
        Returns:
            True if email sent successfully, False otherwise
        """
        try:
            # Render HTML content from template
            html_content = self._render_template(template, variables)
            
            # Generate plain text version
            text_content = self._generate_plain_text(html_content)
            
            if self.provider == EmailProvider.SENDGRID:
                return await self._send_via_sendgrid(
                    to_email=to_email,
                    to_name=to_name,
                    subject=subject,
                    html_content=html_content,
                    text_content=text_content,
                    cc_emails=cc_emails,
                    bcc_emails=bcc_emails,
                    reply_to=reply_to,
                )
            elif self.provider == EmailProvider.SES:
                return await self._send_via_ses(
                    to_email=to_email,
                    to_name=to_name,
                    subject=subject,
                    html_content=html_content,
                    text_content=text_content,
                    cc_emails=cc_emails,
                    bcc_emails=bcc_emails,
                    reply_to=reply_to,
                )
            else:  # Console mode for development
                return self._log_email_to_console(
                    to_email=to_email,
                    to_name=to_name,
                    subject=subject,
                    html_content=html_content,
                    text_content=text_content,
                )
                
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False

    def _render_template(self, template: EmailTemplate, variables: Dict[str, Any]) -> str:
        """Render Jinja2 template with provided variables"""
        try:
            template_obj = self.jinja_env.get_template(f"{template.value}.html")
            return template_obj.render(**variables)
        except Exception as e:
            logger.error(f"Failed to render template {template.value}: {str(e)}")
            raise

    def _generate_plain_text(self, html_content: str) -> str:
        """Generate plain text version from HTML content"""
        # Simple HTML to text conversion (remove HTML tags)
        import re
        text = re.sub("<[^<]+?>", "", html_content)
        text = re.sub(r"\n\s*\n", "\n", text)  # Remove excessive newlines
        return text.strip()

    async def _send_via_sendgrid(
        self,
        to_email: str,
        to_name: str,
        subject: str,
        html_content: str,
        text_content: str,
        cc_emails: Optional[List[str]] = None,
        bcc_emails: Optional[List[str]] = None,
        reply_to: Optional[str] = None,
    ) -> bool:
        """Send email via SendGrid API"""
        try:
            message = Mail(
                from_email=Email(self.from_email, self.from_name),
                to_emails=To(to_email, to_name),
                subject=subject,
                plain_text_content=Content("text/plain", text_content),
                html_content=HtmlContent(html_content),
            )
            
            # Add CC recipients
            if cc_emails:
                for cc_email in cc_emails:
                    message.add_cc(cc_email)
            
            # Add BCC recipients
            if bcc_emails:
                for bcc_email in bcc_emails:
                    message.add_bcc(bcc_email)
            
            # Set reply-to
            if reply_to:
                message.reply_to = Email(reply_to)
            
            # Send email
            response = self.sendgrid_client.send(message)
            
            logger.info(
                f"Email sent via SendGrid to {to_email} "
                f"(Status: {response.status_code})"
            )
            return response.status_code in [200, 201, 202]
            
        except Exception as e:
            logger.error(f"SendGrid error: {str(e)}")
            return False

    async def _send_via_ses(
        self,
        to_email: str,
        to_name: str,
        subject: str,
        html_content: str,
        text_content: str,
        cc_emails: Optional[List[str]] = None,
        bcc_emails: Optional[List[str]] = None,
        reply_to: Optional[str] = None,
    ) -> bool:
        """Send email via AWS SES"""
        try:
            # Prepare recipient list
            to_addresses = [to_email]
            
            # Prepare request
            request = {
                "Source": f"{self.from_name} <{self.from_email}>",
                "Destination": {
                    "ToAddresses": to_addresses,
                },
                "Message": {
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": {
                        "Text": {"Data": text_content, "Charset": "UTF-8"},
                        "Html": {"Data": html_content, "Charset": "UTF-8"},
                    },
                },
            }
            
            # Add CC
            if cc_emails:
                request["Destination"]["CcAddresses"] = cc_emails
            
            # Add BCC
            if bcc_emails:
                request["Destination"]["BccAddresses"] = bcc_emails
            
            # Add reply-to
            if reply_to:
                request["ReplyToAddresses"] = [reply_to]
            
            # Send email
            response = self.ses_client.send_email(**request)
            
            logger.info(f"Email sent via SES to {to_email} (ID: {response['MessageId']})")
            return True
            
        except Exception as e:
            logger.error(f"SES error: {str(e)}")
            return False

    def _log_email_to_console(
        self,
        to_email: str,
        to_name: str,
        subject: str,
        html_content: str,
        text_content: str,
    ) -> bool:
        """Log email to console for development/testing"""
        logger.info("=" * 80)
        logger.info("EMAIL (Console Mode)")
        logger.info("=" * 80)
        logger.info(f"To: {to_name} <{to_email}>")
        logger.info(f"From: {self.from_name} <{self.from_email}>")
        logger.info(f"Subject: {subject}")
        logger.info("-" * 80)
        logger.info("Text Version:")
        logger.info(text_content)
        logger.info("-" * 80)
        logger.info("HTML Version (first 500 chars):")
        logger.info(html_content[:500] + "..." if len(html_content) > 500 else html_content)
        logger.info("=" * 80)
        return True

    async def verify_email_address(self, email: str) -> bool:
        """Verify email address is valid and not in bounce list"""
        if self.provider == EmailProvider.SES:
            try:
                response = self.ses_client.list_verified_email_addresses()
                return email in response.get("VerifiedEmailAddresses", [])
            except Exception as e:
                logger.error(f"Failed to verify email via SES: {str(e)}")
                return False
        
        # For other providers, assume valid
        return True
