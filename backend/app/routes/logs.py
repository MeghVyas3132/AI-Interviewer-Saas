"""
Audit log routes.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import (
    require_hr_or_employee,
)
from app.models.user import User
from app.schemas.audit_log_schema import AuditLogResponse
from app.services.audit_log_service import AuditLogService

router = APIRouter(prefix="/api/v1/logs", tags=["logs"])


@router.get("", response_model=List[AuditLogResponse])
async def get_audit_logs(
    current_user: User = Depends(require_hr_or_employee),
    session: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> List[AuditLogResponse]:
    """
    Get audit logs for the company (Team Lead and above).

    Args:
        current_user: Current authenticated user
        session: Database session
        skip: Number of records to skip
        limit: Maximum number of records

    Returns:
        List of audit logs
    """
    logs = await AuditLogService.get_company_logs(
        session,
        current_user.company_id,
        skip=skip,
        limit=limit,
    )

    return logs


@router.get("/user/{user_id}", response_model=List[AuditLogResponse])
async def get_user_logs(
    user_id: UUID,
    current_user: User = Depends(require_hr_or_employee),
    session: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> List[AuditLogResponse]:
    """
    Get audit logs for a specific user (HR and Employee).

    Args:
        user_id: User ID
        current_user: Current authenticated user
        session: Database session
        skip: Number of records to skip
        limit: Maximum number of records

    Returns:
        List of audit logs
    """
    # Verify user belongs to the company
    from sqlalchemy import text

    user_check = await session.execute(
        text("SELECT id FROM users WHERE id = :uid AND company_id = :cid"),
        {"uid": str(user_id), "cid": str(current_user.company_id)},
    )
    if not user_check.fetchone():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    logs = await AuditLogService.get_user_logs(
        session,
        user_id,
        skip=skip,
        limit=limit,
    )

    return logs
