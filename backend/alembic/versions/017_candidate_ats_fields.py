"""Add ATS fields to candidates table

Revision ID: 017
Revises: 016
Create Date: 2025-01-10

Add ats_score, ats_report, and resume_text fields to candidates table
to enable syncing ATS results between dashboard and interview flow.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '017'
down_revision = '016'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add ATS fields to candidates table."""
    
    # Add ats_score column (0-100 score)
    op.add_column(
        'candidates',
        sa.Column('ats_score', sa.Integer(), nullable=True)
    )
    
    # Add ats_report column (JSON string with full report)
    op.add_column(
        'candidates',
        sa.Column('ats_report', sa.Text(), nullable=True)
    )
    
    # Add resume_text column (extracted text from resume)
    op.add_column(
        'candidates',
        sa.Column('resume_text', sa.Text(), nullable=True)
    )


def downgrade() -> None:
    """Remove ATS fields from candidates table."""
    op.drop_column('candidates', 'resume_text')
    op.drop_column('candidates', 'ats_report')
    op.drop_column('candidates', 'ats_score')
