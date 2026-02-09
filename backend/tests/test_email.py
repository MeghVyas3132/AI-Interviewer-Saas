"""
Tests for email service and API endpoints.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.main import app
from app.services.email_service import EmailService, EmailTemplate
from app.services.notification_service import NotificationService, NotificationEvent


# Test fixtures
@pytest.fixture
def client():
    """Create test client"""
    return TestClient(app)


@pytest.fixture
def email_service():
    """Create email service instance"""
    return EmailService()


@pytest.fixture
def notification_service():
    """Create notification service instance"""
    return NotificationService()


class TestEmailService:
    """Tests for EmailService"""

    def test_email_service_initialization(self, email_service):
        """Test email service initializes correctly"""
        assert email_service is not None
        assert email_service.provider == "console"  # Default for testing
        assert email_service.from_email == "noreply@aiinterviewer.com"
        assert email_service.from_name == "AI Interviewer"

    def test_template_rendering(self, email_service):
        """Test Jinja2 template rendering"""
        html = email_service._render_template(
            EmailTemplate.WELCOME,
            {
                "recipient_name": "John Doe",
                "company_name": "Acme Corp",
                "verification_link": "https://example.com/verify",
                "current_year": 2024,
            },
        )

        assert "John Doe" in html
        assert "Acme Corp" in html
        assert "https://example.com/verify" in html
        assert "2024" in html

    def test_html_to_text_conversion(self, email_service):
        """Test HTML to plain text conversion"""
        html = "<p>Hello <strong>World</strong></p><h1>Test</h1>"
        text = email_service._generate_plain_text(html)

        assert "Hello" in text
        assert "World" in text
        assert "Test" in text
        assert "<" not in text
        assert ">" not in text

    @pytest.mark.asyncio
    async def test_send_welcome_email_console(self, email_service):
        """Test sending welcome email in console mode"""
        result = await email_service.send_welcome_email(
            recipient_email="test@example.com",
            recipient_name="Test User",
            company_name="Test Company",
            verification_link="https://example.com/verify?token=abc123",
        )

        assert result is True

    @pytest.mark.asyncio
    async def test_send_email_verification(self, email_service):
        """Test sending email verification"""
        result = await email_service.send_email_verification(
            recipient_email="test@example.com",
            recipient_name="Test User",
            verification_link="https://example.com/verify?token=abc123",
            expiry_minutes=1440,
        )

        assert result is True

    @pytest.mark.asyncio
    async def test_send_password_reset_email(self, email_service):
        """Test sending password reset email"""
        result = await email_service.send_password_reset_email(
            recipient_email="test@example.com",
            recipient_name="Test User",
            reset_link="https://example.com/reset?token=xyz789",
            expiry_minutes=60,
        )

        assert result is True

    @pytest.mark.asyncio
    async def test_send_interview_scheduled_email(self, email_service):
        """Test sending interview scheduled notification"""
        result = await email_service.send_interview_scheduled_email(
            recipient_email="candidate@example.com",
            recipient_name="Alice Johnson",
            candidate_name="Alice Johnson",
            position="Senior Engineer",
            scheduled_time="2024-11-20 14:00 UTC",
            interview_link="https://meet.example.com/abc123",
            interviewer_name="Sarah Smith",
        )

        assert result is True

    @pytest.mark.asyncio
    async def test_send_interview_reminder_email(self, email_service):
        """Test sending interview reminder"""
        result = await email_service.send_interview_reminder_email(
            recipient_email="candidate@example.com",
            recipient_name="Alice Johnson",
            candidate_name="Alice Johnson",
            position="Senior Engineer",
            scheduled_time="2024-11-20 14:00 UTC",
            interview_link="https://meet.example.com/abc123",
        )

        assert result is True

    @pytest.mark.asyncio
    async def test_send_interview_completed_email(self, email_service):
        """Test sending interview completed notification"""
        result = await email_service.send_interview_completed_email(
            recipient_email="candidate@example.com",
            recipient_name="Alice Johnson",
            candidate_name="Alice Johnson",
            position="Senior Engineer",
            next_steps="You will hear from us within 3 business days.",
        )

        assert result is True

    @pytest.mark.asyncio
    async def test_send_candidate_rejection_email(self, email_service):
        """Test sending candidate rejection email"""
        result = await email_service.send_candidate_rejection_email(
            recipient_email="candidate@example.com",
            recipient_name="Alice Johnson",
            candidate_name="Alice Johnson",
            position="Senior Engineer",
            feedback="We appreciate your interest but have decided to move forward with other candidates.",
        )

        assert result is True

    @pytest.mark.asyncio
    async def test_send_bulk_import_complete_email(self, email_service):
        """Test sending bulk import completion email"""
        result = await email_service.send_bulk_import_complete_email(
            recipient_email="hr@example.com",
            recipient_name="HR Manager",
            total_count=100,
            success_count=98,
            failed_count=2,
            import_summary_link="https://app.example.com/imports/123",
        )

        assert result is True


class TestNotificationService:
    """Tests for NotificationService"""

    def test_notification_service_initialization(self, notification_service):
        """Test notification service initializes correctly"""
        assert notification_service is not None
        assert notification_service.email_service is not None

    @pytest.mark.asyncio
    async def test_send_user_created_notification(self, notification_service):
        """Test user created notification"""
        result = await notification_service.send_notification(
            event=NotificationEvent.USER_CREATED,
            recipient_email="test@example.com",
            recipient_name="Test User",
            recipient_id=UUID("12345678-1234-5678-1234-567812345678"),
            company_id=UUID("87654321-4321-8765-4321-876543218765"),
            company_name="Test Company",
            verification_link="https://example.com/verify?token=abc123",
        )

        assert result is True

    @pytest.mark.asyncio
    async def test_send_interview_scheduled_notification(self, notification_service):
        """Test interview scheduled notification"""
        result = await notification_service.send_notification(
            event=NotificationEvent.INTERVIEW_SCHEDULED,
            recipient_email="candidate@example.com",
            recipient_name="Alice Johnson",
            recipient_id=UUID("12345678-1234-5678-1234-567812345678"),
            company_id=UUID("87654321-4321-8765-4321-876543218765"),
            candidate_name="Alice Johnson",
            position="Senior Engineer",
            scheduled_time="2024-11-20 14:00 UTC",
            interview_link="https://meet.example.com/abc123",
            interviewer_name="Sarah Smith",
        )

        assert result is True

    @pytest.mark.asyncio
    async def test_send_candidate_rejection_notification(self, notification_service):
        """Test candidate rejection notification"""
        result = await notification_service.send_notification(
            event=NotificationEvent.CANDIDATE_REJECTED,
            recipient_email="candidate@example.com",
            recipient_name="Alice Johnson",
            recipient_id=UUID("12345678-1234-5678-1234-567812345678"),
            company_id=UUID("87654321-4321-8765-4321-876543218765"),
            candidate_name="Alice Johnson",
            position="Senior Engineer",
            feedback="We appreciate your interest.",
        )

        assert result is True

    @pytest.mark.asyncio
    async def test_send_bulk_import_completed_notification(self, notification_service):
        """Test bulk import completed notification"""
        result = await notification_service.send_notification(
            event=NotificationEvent.BULK_IMPORT_COMPLETED,
            recipient_email="hr@example.com",
            recipient_name="HR Manager",
            recipient_id=UUID("12345678-1234-5678-1234-567812345678"),
            company_id=UUID("87654321-4321-8765-4321-876543218765"),
            total_count=100,
            success_count=98,
            failed_count=2,
            import_summary_link="https://app.example.com/imports/123",
        )

        assert result is True


class TestEmailAPI:
    """Tests for Email API endpoints"""

    @pytest.mark.asyncio
    async def test_get_email_status_requires_auth(self, client):
        """Test that email status endpoint requires authentication"""
        response = client.get("/api/v1/email/status")

        assert response.status_code == 401  # Unauthorized without token

    @pytest.mark.asyncio
    async def test_list_email_templates_requires_auth(self, client):
        """Test that list templates endpoint requires authentication"""
        response = client.get("/api/v1/email/templates")

        assert response.status_code == 401  # Unauthorized without token

    @pytest.mark.asyncio
    async def test_send_email_requires_hr_role(self, client):
        """Test that email sending requires HR role"""
        # Without token - should fail
        response = client.post(
            "/api/v1/email/send",
            json={
                "to_email": "test@example.com",
                "to_name": "Test User",
                "subject": "Test",
                "template": "welcome",
                "variables": {},
            },
        )

        assert response.status_code == 401  # Unauthorized without token


class TestEmailTemplates:
    """Tests for email template files"""

    def test_all_templates_exist(self, email_service):
        """Verify all templates can be rendered"""
        templates = [
            EmailTemplate.WELCOME,
            EmailTemplate.EMAIL_VERIFICATION,
            EmailTemplate.PASSWORD_RESET,
            EmailTemplate.INTERVIEW_SCHEDULED,
            EmailTemplate.INTERVIEW_REMINDER,
            EmailTemplate.INTERVIEW_COMPLETED,
            EmailTemplate.CANDIDATE_REJECTION,
            EmailTemplate.BULK_IMPORT_COMPLETE,
        ]

        for template in templates:
            # Should not raise exception
            html = email_service._render_template(
                template,
                {
                    "recipient_name": "Test User",
                    "company_name": "Test Company",
                    "verification_link": "https://example.com",
                    "reset_link": "https://example.com",
                    "candidate_name": "Candidate",
                    "position": "Engineer",
                    "scheduled_time": "2024-11-20 14:00 UTC",
                    "interview_link": "https://meet.example.com",
                    "interviewer_name": "Interviewer",
                    "next_steps": "Pending",
                    "feedback": "Great interview",
                    "total_count": 100,
                    "success_count": 98,
                    "failed_count": 2,
                    "success_rate": 98,
                    "import_summary_link": "https://example.com/summary",
                    "expiry_minutes": 1440,
                    "current_year": 2024,
                },
            )

            assert len(html) > 0
            assert "html" in html.lower()

    def test_template_variable_substitution(self, email_service):
        """Test that template variables are substituted correctly"""
        html = email_service._render_template(
            EmailTemplate.WELCOME,
            {
                "recipient_name": "John Doe",
                "company_name": "Acme Corp",
                "verification_link": "https://example.com/verify?token=abc123",
                "current_year": 2024,
            },
        )

        # Verify variables were substituted
        assert "John Doe" in html
        assert "Acme Corp" in html
        assert "https://example.com/verify?token=abc123" in html
        assert "2024" in html

        # Verify template tags are gone (not literal)
        assert "{{ recipient_name }}" not in html
        assert "{{ company_name }}" not in html


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
