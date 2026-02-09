"""Add new pipeline candidate statuses

Revision ID: 018
Revises: 017
Create Date: 2026-01-06

Add new candidate status values for simplified AI pipeline:
- uploaded, assigned, interview_scheduled, interview_completed
- passed, failed, review, auto_rejected
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '018'
down_revision = '017'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add new candidate status enum values."""
    # PostgreSQL allows adding values to enum types
    # We need to add each new value separately
    
    new_values = [
        'uploaded',
        'assigned', 
        'interview_scheduled',
        'interview_completed',
        'passed',
        'failed',
        'review',
        'auto_rejected'
    ]
    
    for value in new_values:
        try:
            op.execute(f"ALTER TYPE candidatestatus ADD VALUE IF NOT EXISTS '{value}'")
        except Exception:
            # Value might already exist
            pass


def downgrade() -> None:
    """
    Note: PostgreSQL doesn't support removing values from enums easily.
    The new values will remain but won't be used if rolling back.
    """
    pass
