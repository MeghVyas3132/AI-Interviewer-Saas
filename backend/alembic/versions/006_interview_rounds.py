"""
Add interview_rounds table for multi-round scheduling with timezone support.

Revision ID: 006
Revises: 005
Create Date: 2025-11-16 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create interview_rounds table."""
    op.create_table(
        "interview_rounds",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("candidate_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "round_type",
            sa.Enum("SCREENING", "TECHNICAL", "BEHAVIORAL", "FINAL", "HR", "CUSTOM", name="roundtype"),
            nullable=False,
        ),
        sa.Column("interviewer_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("timezone", sa.String(50), nullable=False, server_default="UTC"),
        sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column(
            "status",
            sa.Enum("SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "RESCHEDULED", name="roundstatus"),
            nullable=False,
            server_default="SCHEDULED",
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["candidate_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["interviewer_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes for common queries
    op.create_index("ix_interview_rounds_company_id", "interview_rounds", ["company_id"])
    op.create_index("ix_interview_rounds_candidate_id", "interview_rounds", ["candidate_id"])
    op.create_index("ix_interview_rounds_interviewer_id", "interview_rounds", ["interviewer_id"])
    op.create_index("ix_interview_rounds_scheduled_at", "interview_rounds", ["scheduled_at"])
    op.create_index("ix_interview_rounds_status", "interview_rounds", ["status"])
    op.create_index(
        "ix_interview_rounds_company_scheduled",
        "interview_rounds",
        ["company_id", "scheduled_at"],
    )
    op.create_index(
        "ix_interview_rounds_candidate_scheduled",
        "interview_rounds",
        ["candidate_id", "scheduled_at"],
    )


def downgrade() -> None:
    """Drop interview_rounds table."""
    op.drop_index("ix_interview_rounds_candidate_scheduled")
    op.drop_index("ix_interview_rounds_company_scheduled")
    op.drop_index("ix_interview_rounds_status")
    op.drop_index("ix_interview_rounds_scheduled_at")
    op.drop_index("ix_interview_rounds_interviewer_id")
    op.drop_index("ix_interview_rounds_candidate_id")
    op.drop_index("ix_interview_rounds_company_id")
    op.drop_table("interview_rounds")
