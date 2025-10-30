"""
Audit log service for logging user actions.
"""

from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.audit_log import AuditLog


class AuditLogService:
    """Service for audit logging operations."""

    @staticmethod
    async def log_action(
        session: AsyncSession,
        company_id: UUID,
        user_id: UUID,
        action: str,
        resource_type: Optional[str] = None,
        resource_id: Optional[UUID] = None,
        metadata: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AuditLog:
        """
        Log a user action.

        Args:
            session: Database session
            company_id: Company ID
            user_id: User ID
            action: Action description
            resource_type: Type of resource affected
            resource_id: ID of resource affected
            metadata: Additional metadata
            ip_address: User's IP address
            user_agent: User's browser/client info

        Returns:
            Created audit log
        """
        log = AuditLog(
            company_id=company_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=metadata,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        session.add(log)
        await session.flush()
        return log

    @staticmethod
    async def get_company_logs(
        session: AsyncSession,
        company_id: UUID,
        skip: int = 0,
        limit: int = 20,
        action: Optional[str] = None,
        user_id: Optional[UUID] = None,
    ) -> List[AuditLog]:
        """
        Get audit logs for a company.

        Args:
            session: Database session
            company_id: Company ID
            skip: Number of records to skip
            limit: Maximum number of records to return
            action: Optional action filter
            user_id: Optional user filter

        Returns:
            List of audit logs
        """
        query = select(AuditLog).where(AuditLog.company_id == company_id)

        if action:
            query = query.where(AuditLog.action == action)

        if user_id:
            query = query.where(AuditLog.user_id == user_id)

        query = query.order_by(AuditLog.created_at.desc())
        query = query.offset(skip).limit(limit)

        result = await session.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_user_logs(
        session: AsyncSession,
        user_id: UUID,
        skip: int = 0,
        limit: int = 20,
    ) -> List[AuditLog]:
        """
        Get audit logs for a specific user.

        Args:
            session: Database session
            user_id: User ID
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            List of audit logs
        """
        query = select(AuditLog).where(AuditLog.user_id == user_id)
        query = query.order_by(AuditLog.created_at.desc())
        query = query.offset(skip).limit(limit)

        result = await session.execute(query)
        return result.scalars().all()
