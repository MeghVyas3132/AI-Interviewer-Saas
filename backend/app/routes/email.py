"""
Email API endpoints for managing email sending and notifications.
Requires HR role to send emails.
"""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import require_hr, get_current_user
from app.schemas.email_schema import (
    EmailSendRequest,
    EmailResponse,
    WelcomeEmailRequest,
    EmailVerificationRequest,
    PasswordResetRequest,
    InterviewScheduledRequest,
    InterviewReminderRequest,
    InterviewCompletedRequest,
    CandidateRejectionRequest,
    BulkImportCompleteRequest,
    EmailTemplateListResponse,
    EmailStatusResponse,
)
from app.services.email_service import EmailService, EmailTemplate
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/email", tags=["email"])


@router.get(
    "/status",
    response_model=EmailStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Get email system status",
    description="Check email provider configuration and status",
)
async def get_email_status(current_user: dict = Depends(get_current_user)):
    """Get email system status (provider, configuration)"""
    email_service = EmailService()
    
    return EmailStatusResponse(
        provider=email_service.provider,
        is_configured=email_service.provider != "console",
        from_email=email_service.from_email,
        from_name=email_service.from_name,
    )


@router.get(
    "/templates",
    response_model=EmailTemplateListResponse,
    status_code=status.HTTP_200_OK,
    summary="List available email templates",
    description="Get list of all available email templates",
)
async def list_email_templates(current_user: dict = Depends(get_current_user)):
    """List all available email templates"""
    templates = [template.value for template in EmailTemplate]
    
    return EmailTemplateListResponse(
        templates=templates,
        count=len(templates),
    )


@router.post(
    "/send",
    response_model=EmailResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send custom email",
    description="Send a custom email using specified template (HR only)",
    dependencies=[Depends(require_hr)],
)
async def send_custom_email(
    request: EmailSendRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Send a custom email using specified template.
    
    Requires HR role.
    """
    try:
        email_service = EmailService()
        
        # Convert template name to enum
        try:
            template = EmailTemplate[request.template.upper()]
        except KeyError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid template: {request.template}",
            )
        
        # Send email
        success = await email_service.send_email(
            to_email=request.to_email,
            to_name=request.to_name,
            subject=request.subject,
            template=template,
            variables=request.variables,
            cc_emails=request.cc_emails,
            bcc_emails=request.bcc_emails,
            reply_to=request.reply_to,
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send email",
            )
        
        logger.info(f"Email sent to {request.to_email} using template {request.template}")
        
        return EmailResponse(
            success=True,
            message="Email sent successfully",
            recipient=request.to_email,
            template=request.template,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending email to {request.to_email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send email",
        )


@router.post(
    "/welcome",
    response_model=EmailResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send welcome email",
    description="Send welcome email to new user with verification link (HR only)",
    dependencies=[Depends(require_hr)],
)
async def send_welcome_email(
    request: WelcomeEmailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Send welcome email with email verification link.
    
    Requires HR role.
    """
    try:
        email_service = EmailService()
        
        success = await email_service.send_welcome_email(
            recipient_email=request.to_email,
            recipient_name=request.to_name,
            company_name=request.company_name,
            verification_link=request.verification_link,
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send welcome email",
            )
        
        logger.info(f"Welcome email sent to {request.to_email}")
        
        return EmailResponse(
            success=True,
            message="Welcome email sent successfully",
            recipient=request.to_email,
            template="welcome",
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending welcome email to {request.to_email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send welcome email",
        )


@router.post(
    "/verify-email",
    response_model=EmailResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send email verification",
    description="Send email verification link to user (HR only)",
    dependencies=[Depends(require_hr)],
)
async def send_email_verification(
    request: EmailVerificationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Send email verification link to user.
    
    Requires HR role.
    """
    try:
        email_service = EmailService()
        
        success = await email_service.send_email_verification(
            recipient_email=request.to_email,
            recipient_name=request.to_name,
            verification_link=request.verification_link,
            expiry_minutes=request.expiry_minutes,
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send verification email",
            )
        
        logger.info(f"Verification email sent to {request.to_email}")
        
        return EmailResponse(
            success=True,
            message="Verification email sent successfully",
            recipient=request.to_email,
            template="email_verification",
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending verification email to {request.to_email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send verification email",
        )


@router.post(
    "/password-reset",
    response_model=EmailResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send password reset email",
    description="Send password reset link to user (HR only)",
    dependencies=[Depends(require_hr)],
)
async def send_password_reset_email(
    request: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Send password reset email.
    
    Requires HR role.
    """
    try:
        email_service = EmailService()
        
        success = await email_service.send_password_reset_email(
            recipient_email=request.to_email,
            recipient_name=request.to_name,
            reset_link=request.reset_link,
            expiry_minutes=request.expiry_minutes,
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send password reset email",
            )
        
        logger.info(f"Password reset email sent to {request.to_email}")
        
        return EmailResponse(
            success=True,
            message="Password reset email sent successfully",
            recipient=request.to_email,
            template="password_reset",
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending password reset email to {request.to_email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send password reset email",
        )


@router.post(
    "/interview-scheduled",
    response_model=EmailResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send interview scheduled notification",
    description="Send interview scheduled email to candidate/interviewer (HR only)",
    dependencies=[Depends(require_hr)],
)
async def send_interview_scheduled_notification(
    request: InterviewScheduledRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Send interview scheduled notification.
    
    Requires HR role.
    """
    try:
        email_service = EmailService()
        
        success = await email_service.send_interview_scheduled_email(
            recipient_email=request.to_email,
            recipient_name=request.to_name,
            candidate_name=request.candidate_name,
            position=request.position,
            scheduled_time=request.scheduled_time,
            interview_link=request.interview_link,
            interviewer_name=request.interviewer_name,
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send interview scheduled email",
            )
        
        logger.info(f"Interview scheduled email sent to {request.to_email}")
        
        return EmailResponse(
            success=True,
            message="Interview scheduled email sent successfully",
            recipient=request.to_email,
            template="interview_scheduled",
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending interview scheduled email to {request.to_email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send interview scheduled email",
        )


@router.post(
    "/interview-reminder",
    response_model=EmailResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send interview reminder",
    description="Send interview reminder (24h before) to participant (HR only)",
    dependencies=[Depends(require_hr)],
)
async def send_interview_reminder(
    request: InterviewReminderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Send interview reminder (24 hours before interview).
    
    Requires HR role.
    """
    try:
        email_service = EmailService()
        
        success = await email_service.send_interview_reminder_email(
            recipient_email=request.to_email,
            recipient_name=request.to_name,
            candidate_name=request.candidate_name,
            position=request.position,
            scheduled_time=request.scheduled_time,
            interview_link=request.interview_link,
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send interview reminder email",
            )
        
        logger.info(f"Interview reminder email sent to {request.to_email}")
        
        return EmailResponse(
            success=True,
            message="Interview reminder email sent successfully",
            recipient=request.to_email,
            template="interview_reminder",
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending interview reminder email to {request.to_email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send interview reminder email",
        )


@router.post(
    "/interview-completed",
    response_model=EmailResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send interview completed notification",
    description="Send interview completed email to participant (HR only)",
    dependencies=[Depends(require_hr)],
)
async def send_interview_completed_notification(
    request: InterviewCompletedRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Send interview completed notification.
    
    Requires HR role.
    """
    try:
        email_service = EmailService()
        
        success = await email_service.send_interview_completed_email(
            recipient_email=request.to_email,
            recipient_name=request.to_name,
            candidate_name=request.candidate_name,
            position=request.position,
            next_steps=request.next_steps,
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send interview completed email",
            )
        
        logger.info(f"Interview completed email sent to {request.to_email}")
        
        return EmailResponse(
            success=True,
            message="Interview completed email sent successfully",
            recipient=request.to_email,
            template="interview_completed",
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending interview completed email to {request.to_email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send interview completed email",
        )


@router.post(
    "/candidate-rejection",
    response_model=EmailResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send candidate rejection email",
    description="Send candidate rejection notification (HR only)",
    dependencies=[Depends(require_hr)],
)
async def send_candidate_rejection_email(
    request: CandidateRejectionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Send candidate rejection email.
    
    Requires HR role.
    """
    try:
        email_service = EmailService()
        
        success = await email_service.send_candidate_rejection_email(
            recipient_email=request.to_email,
            recipient_name=request.to_name,
            candidate_name=request.candidate_name,
            position=request.position,
            feedback=request.feedback,
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send rejection email",
            )
        
        logger.info(f"Rejection email sent to {request.to_email}")
        
        return EmailResponse(
            success=True,
            message="Rejection email sent successfully",
            recipient=request.to_email,
            template="candidate_rejection",
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending rejection email to {request.to_email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send rejection email",
        )


@router.post(
    "/bulk-import-complete",
    response_model=EmailResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send bulk import completion email",
    description="Send bulk import summary report email (HR only)",
    dependencies=[Depends(require_hr)],
)
async def send_bulk_import_complete_email(
    request: BulkImportCompleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Send bulk import completion summary email.
    
    Requires HR role.
    """
    try:
        email_service = EmailService()
        
        success = await email_service.send_bulk_import_complete_email(
            recipient_email=request.to_email,
            recipient_name=request.to_name,
            total_count=request.total_count,
            success_count=request.success_count,
            failed_count=request.failed_count,
            import_summary_link=request.import_summary_link,
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send bulk import email",
            )
        
        logger.info(f"Bulk import complete email sent to {request.to_email}")
        
        return EmailResponse(
            success=True,
            message="Bulk import complete email sent successfully",
            recipient=request.to_email,
            template="bulk_import_complete",
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending bulk import email to {request.to_email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send bulk import email",
        )
