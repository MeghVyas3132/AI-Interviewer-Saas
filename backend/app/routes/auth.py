"""
Authentication routes implementing login flow.

Login Flow:
1. Email check - Verify email exists in database
2. Password check - Verify password is correct  
3. JWT generation - Create access and refresh tokens
4. Cookie setting - Send refresh token via secure HTTP-only cookie
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.schemas.auth_schema import LoginRequest, RefreshTokenRequest, TokenResponse, UserLoginResponse, RegisterRequest
from app.services.auth_service import AuthService
from app.services.audit_log_service import AuditLogService
from app.services.token_blacklist_service import TokenBlacklistService
from app.services.email_verification_service import EmailVerificationService
from app.models.user import User, UserRole
from app.models.company import Company
from app.models.company_request import CompanyRequest, RequestStatus

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
logger = logging.getLogger(__name__)


class VerifyEmailRequest(BaseModel):
    """Email verification request."""
    token: str


class ResendVerificationRequest(BaseModel):
    """Resend verification email request."""
    email: str


class RegistrationResponse(BaseModel):
    """Response for company registration request."""
    message: str
    status: str
    request_id: str | None = None
    # For join existing company flow - immediate login
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str | None = None
    user: UserLoginResponse | None = None


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Login user and return JWT tokens following the login flow.
    """
    # Step 1: Email check
    user = await AuthService.authenticate_user(
        session,
        request.email,
        request.password,
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Fetch company name
    company_result = await session.execute(
        select(Company).where(Company.id == user.company_id)
    )
    company = company_result.scalars().first()
    company_name = company.name if company else None

    # Step 3: JWT generation
    tokens = AuthService.create_tokens(user.id, user.company_id)

    # Step 4: Set secure HTTP-only cookie for refresh token
    response.set_cookie(
        key="refresh_token",
        value=tokens.refresh_token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=7 * 24 * 60 * 60,
    )

    # Log login action
    await AuditLogService.log_action(
        session,
        user.company_id,
        user.id,
        "LOGIN",
        resource_type="user",
        resource_id=user.id,
    )

    await session.commit()

    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        token_type=tokens.token_type,
        user=UserLoginResponse(
            id=str(user.id),
            email=user.email,
            full_name=user.name,
            role=user.role,
            company_id=str(user.company_id),
            company_name=company_name,
            is_active=user.is_active,
            department=user.department,
            created_at=user.created_at.isoformat() if user.created_at else "",
        )
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: RefreshTokenRequest,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Refresh access token using refresh token."""
    result = AuthService.verify_and_refresh_token(request.refresh_token)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    access_token, refresh_token = result

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/logout")
async def logout(
    request: Request,
    current_user=Depends(get_current_user),
    response: Response = Response(),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Logout user, revoke tokens, and clear refresh token cookie."""
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
        blacklist_service = TokenBlacklistService()
        await blacklist_service.add_to_blacklist(token)

    response.delete_cookie(
        key="refresh_token",
        httponly=True,
        secure=True,
        samesite="strict",
    )

    await AuditLogService.log_action(
        session,
        current_user.company_id,
        current_user.id,
        "LOGOUT",
        resource_type="user",
        resource_id=current_user.id,
    )

    await session.commit()

    return {"message": "Logged out successfully"}


@router.post("/verify-email")
async def verify_email(
    request: VerifyEmailRequest,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Verify user's email using verification token."""
    try:
        user = await EmailVerificationService.verify_email_token(session, request.token)
        await session.commit()
        return {
            "message": "Email verified successfully. You can now log in.",
            "email": user.email,
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/resend-verification")
async def resend_verification(
    request: ResendVerificationRequest,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Resend verification email to user."""
    try:
        await EmailVerificationService.resend_verification_email(
            session,
            request.email,
            frontend_url=settings.frontend_url,
        )
        await session.commit()
        return {"message": "Verification email sent. Check your inbox."}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(e),
        )


@router.post("/register", response_model=RegistrationResponse)
async def register(
    request: RegisterRequest,
    response: Response,
    session: AsyncSession = Depends(get_db),
):
    """
    Register a new user - either request a new company or join an existing one.
    
    Registration Flows:
    A. Request new company (provide company_name):
       1. Create a pending company request
       2. System admin must approve before company is created
       3. User will be notified and can login after approval
       Returns: Pending status with request_id
    
    B. Join existing company (provide company_id):
       1. Validate company exists and is active
       2. Create user as HR of existing company
       3. User can login immediately
       Returns: Tokens for immediate login
    """
    from uuid import UUID as PyUUID
    
    try:
        # Validate: must provide either company_name OR company_id
        if not request.company_name and not request.company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either company_name (to request new) or company_id (to join existing) is required",
            )
        
        if request.company_name and request.company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provide either company_name or company_id, not both",
            )
        
        # Check if email already exists in users
        existing_user = await AuthService.check_email_exists(session, request.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )
        
        # Flow A: Request new company (requires admin approval)
        if request.company_name:
            # Check if there's already a pending request with this email
            existing_request = await session.execute(
                select(CompanyRequest).where(
                    CompanyRequest.requester_email == request.email,
                    CompanyRequest.status == RequestStatus.PENDING
                )
            )
            if existing_request.scalars().first():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="You already have a pending company registration request",
                )
            
            # Check if company name already exists
            existing_company = await session.execute(
                select(Company).where(Company.name == request.company_name)
            )
            if existing_company.scalars().first():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A company with this name already exists",
                )
            
            # Create pending company request
            company_request = CompanyRequest(
                company_name=request.company_name,
                requester_email=request.email,
                requester_name=request.full_name,
                requester_password_hash=AuthService.hash_password(request.password),
                status=RequestStatus.PENDING,
            )
            session.add(company_request)
            await session.commit()
            
            return RegistrationResponse(
                message="Your company registration request has been submitted. You will be notified once an administrator reviews your request.",
                status="pending",
                request_id=str(company_request.id),
            )
        
        # Flow B: Join existing company (immediate access)
        else:
            # Accept either join_code (ABCD-EFGH) or company_id (UUID)
            join_code = request.company_id.upper().strip()
            
            # Check if it's a join code format (XXXX-XXXX)
            if len(join_code) == 9 and join_code[4] == '-':
                result = await session.execute(
                    select(Company).where(Company.join_code == join_code)
                )
            else:
                # Try as UUID for backward compatibility
                try:
                    company_uuid = PyUUID(request.company_id)
                    result = await session.execute(
                        select(Company).where(Company.id == company_uuid)
                    )
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid Company Code format. Use the 8-character code (e.g., ABCD-EFGH).",
                    )
            
            company = result.scalars().first()
            
            if not company:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Company not found. Please check the Company Code.",
                )
            
            if not company.is_active:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Company is not active. Contact your administrator.",
                )
            
            # Create user as HR
            user = User(
                email=request.email,
                name=request.full_name,
                password_hash=AuthService.hash_password(request.password),
                company_id=company.id,
                role=UserRole.HR,
                email_verified=True,
                is_active=True,
            )
            session.add(user)
            await session.flush()
            
            # Generate JWT tokens
            tokens = AuthService.create_tokens(user.id, company.id)
            
            # Set secure HTTP-only cookie
            response.set_cookie(
                key="refresh_token",
                value=tokens.refresh_token,
                httponly=True,
                secure=True,
                samesite="strict",
                max_age=7 * 24 * 60 * 60,
            )
            
            await session.commit()
            
            return RegistrationResponse(
                message="Registration successful! You have joined the company as HR.",
                status="approved",
                access_token=tokens.access_token,
                refresh_token=tokens.refresh_token,
                token_type=tokens.token_type,
                user=UserLoginResponse(
                    id=str(user.id),
                    email=user.email,
                    full_name=user.name,
                    role=user.role,
                    company_id=str(company.id),
                    company_name=company.name,
                    is_active=user.is_active,
                    department=user.department,
                    created_at=user.created_at.isoformat() if user.created_at else "",
                )
            )
        
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}",
        )


@router.get("/register/status/{request_id}")
async def check_registration_status(
    request_id: str,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """
    Check the status of a company registration request.
    
    Returns:
        Status of the request (pending, approved, rejected)
        If approved: company_id to use for login
        If rejected: rejection reason
    """
    from uuid import UUID as PyUUID
    
    try:
        request_uuid = PyUUID(request_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid request ID format",
        )
    
    result = await session.execute(
        select(CompanyRequest).where(CompanyRequest.id == request_uuid)
    )
    company_request = result.scalars().first()
    
    if not company_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration request not found",
        )
    
    response_data = {
        "status": company_request.status.value,
        "company_name": company_request.company_name,
        "created_at": company_request.created_at.isoformat() if company_request.created_at else None,
    }
    
    if company_request.status == RequestStatus.APPROVED:
        response_data["company_id"] = str(company_request.approved_company_id)
        response_data["message"] = "Your company has been approved! You can now login."
    elif company_request.status == RequestStatus.REJECTED:
        response_data["rejection_reason"] = company_request.rejection_reason
        response_data["message"] = "Your company registration was rejected."
    else:
        response_data["message"] = "Your request is pending review by an administrator."
    
    return response_data


# =============================================================================
# Candidate Email-Only Login (No Password Required)
# =============================================================================

class CandidateLoginRequest(BaseModel):
    """Schema for candidate email-only login."""
    email: str



class CandidateLoginResponse(BaseModel):
    """Response for candidate login."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserLoginResponse
    companies: list = []
    interviews: list = []


@router.post("/candidate-login")
async def candidate_login(
    request: CandidateLoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_db),
):
    """
    Candidate login using email only (no password required).
    
    Returns all companies where the candidate is registered,
    along with any scheduled interviews for each company.
    """
    from app.models.candidate import Candidate, Interview
    
    try:
        # Find all candidates by email (across all companies)
        result = await session.execute(
            select(Candidate).where(Candidate.email == request.email.lower().strip()).limit(10)
        )
        candidates = result.scalars().all()
        
        if not candidates:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No candidate found with this email. Please check your email or contact HR.",
            )
        
        # Get the first candidate for user creation
        candidate = candidates[0]
        
        # Check if user already exists for this candidate
        user_result = await session.execute(
            select(User).where(
                User.email == request.email.lower().strip(),
                User.role == UserRole.CANDIDATE
            )
        )
        user = user_result.scalars().first()
        
        if not user:
            # Create a candidate user account (no password)
            user = User(
                email=request.email.lower().strip(),
                name=f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or request.email,
                password_hash="CANDIDATE_NO_PASSWORD",
                company_id=candidate.company_id,
                role=UserRole.CANDIDATE,
                is_active=True,
                email_verified=True,
            )
            session.add(user)
            await session.flush()
        
        # Generate JWT tokens
        tokens = AuthService.create_tokens(user.id, user.company_id)
        
        # Set secure HTTP-only cookie
        response.set_cookie(
            key="refresh_token",
            value=tokens.refresh_token,
            httponly=True,
            secure=True,
            samesite="strict",
            max_age=7 * 24 * 60 * 60,
        )
        
        # Build company data with interviews
        companies_data = []
        all_interviews = []
        
        for cand in candidates:
            # Get company info
            company_result = await session.execute(
                select(Company).where(Company.id == cand.company_id)
            )
            company = company_result.scalars().first()
            
            # Get interviews for this candidate
            interviews_result = await session.execute(
                select(Interview).where(Interview.candidate_id == cand.id).limit(50)
            )
            interviews = interviews_result.scalars().all()
            
            company_interviews = []
            for interview in interviews:
                interviewer_info = None
                if interview.interviewer_id:
                    interviewer_result = await session.execute(
                        select(User).where(User.id == interview.interviewer_id)
                    )
                    interviewer = interviewer_result.scalars().first()
                    if interviewer:
                        interviewer_info = {
                            "id": str(interviewer.id),
                            "name": interviewer.name,
                            "email": interviewer.email,
                        }
                
                interview_data = {
                    "id": str(interview.id),
                    "company_name": company.name if company else "Unknown",
                    "company_id": str(cand.company_id),
                    "position": cand.position,
                    "round": interview.round.value if interview.round else None,
                    "scheduled_time": interview.scheduled_time.isoformat() if interview.scheduled_time else None,
                    "timezone": interview.timezone,
                    "status": interview.status.value if interview.status else None,
                    "meeting_link": interview.meeting_link,
                    "interviewer": interviewer_info,
                }
                company_interviews.append(interview_data)
                all_interviews.append(interview_data)
            
            # Add company data regardless of whether there are interviews
            companies_data.append({
                "company_id": str(cand.company_id),
                "company_name": company.name if company else "Unknown",
                "position": cand.position,
                "domain": cand.domain,
                "status": cand.status.value if cand.status else None,
                "applied_at": cand.created_at.isoformat() if cand.created_at else None,
                "interviews": company_interviews,
            })
        
        await session.commit()
        
        # Fetch company name for user
        user_company_result = await session.execute(
            select(Company).where(Company.id == user.company_id)
        )
        user_company = user_company_result.scalars().first()
        
        return {
            "access_token": tokens.access_token,
            "refresh_token": tokens.refresh_token,
            "token_type": tokens.token_type,
            "user": UserLoginResponse(
                id=str(user.id),
                email=user.email,
                full_name=user.name,
                role=user.role,
                company_id=str(user.company_id),
                company_name=user_company.name if user_company else None,
                is_active=user.is_active,
                department=user.department,
                created_at=user.created_at.isoformat() if user.created_at else "",
            ),
            "companies": companies_data,
            "interviews": all_interviews,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        logger.exception("Unexpected error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login failed: {str(e)}",
        )


# =============================================================================
# Password Reset Endpoints
# =============================================================================

class ForgotPasswordRequest(BaseModel):
    """Schema for forgot password request."""
    email: str


class ResetPasswordRequest(BaseModel):
    """Schema for password reset."""
    token: str
    new_password: str


@router.post("/forgot-password")
async def forgot_password(
    request: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_db),
):
    """
    Request a password reset email.
    
    For security, always returns success even if email doesn't exist.
    Stores reset token in Redis with 1-hour TTL.
    """
    import secrets
    import json
    import logging
    from datetime import datetime, timedelta, timezone
    from app.utils.redis_client import redis_client
    
    logger = logging.getLogger(__name__)
    email = request.email.lower().strip()
    
    # Find user by email
    result = await session.execute(
        select(User).where(User.email == email)
    )
    user = result.scalars().first()
    
    if user:
        # Generate reset token
        reset_token = secrets.token_urlsafe(32)
        
        # Store token → user_id mapping in Redis with 1-hour TTL
        reset_key = f"password_reset:{reset_token}"
        reset_data = json.dumps({
            "user_id": str(user.id),
            "email": email,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            await redis_client.setex(reset_key, 3600, reset_data)  # 1 hour TTL
        except Exception as e:
            logger.error(f"Failed to store reset token in Redis: {e}")
            # Still return success for security — don't reveal internal failures
        
        reset_link = f"{settings.frontend_url}/auth/reset-password?token={reset_token}"
        logger.info(f"Password reset link generated for {email}: {reset_link}")
        
        # TODO: Send actual email via notification service
        # await notification_service.send_password_reset_email(email, reset_link)
    
    # Always return success for security (don't reveal if email exists)
    return {
        "message": "If an account with this email exists, a password reset link has been sent.",
        "success": True
    }


@router.post("/reset-password")
async def reset_password(
    request: ResetPasswordRequest,
    session: AsyncSession = Depends(get_db),
):
    """
    Reset password using a valid reset token.
    
    Validates the token from Redis, updates the user's password,
    and deletes the token so it can't be reused.
    """
    import json
    import logging
    from app.utils.redis_client import redis_client
    from app.utils.password_hashing import hash_password
    from app.schemas.user_schema import validate_password_complexity
    
    logger = logging.getLogger(__name__)
    
    # 1. Look up the token in Redis
    reset_key = f"password_reset:{request.token}"
    try:
        raw = await redis_client.get(reset_key)
    except Exception as e:
        logger.error(f"Redis error during password reset: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to process password reset. Please try again later.",
        )
    
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token. Please request a new password reset link.",
        )
    
    # 2. Parse token data
    try:
        token_data = json.loads(raw)
        user_id = token_data["user_id"]
    except (json.JSONDecodeError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token data.",
        )
    
    # 3. Validate password complexity
    try:
        validate_password_complexity(request.new_password)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    
    # 4. Find the user and update password
    from uuid import UUID as UUIDType
    result = await session.execute(
        select(User).where(User.id == UUIDType(user_id))
    )
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token.",
        )
    
    user.password_hash = hash_password(request.new_password)
    await session.commit()
    
    # 5. Delete the token so it can't be reused
    try:
        await redis_client.delete(reset_key)
    except Exception as e:
        logger.warning(f"Failed to delete used reset token: {e}")
    
    logger.info(f"Password reset successful for user {user.email}")
    
    return {
        "message": "Password has been reset successfully. You can now log in with your new password.",
        "success": True,
    }
