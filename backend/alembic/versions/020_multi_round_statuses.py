"""Add multi-round interview pipeline statuses

Revision ID: 020_multi_round_statuses
Revises: 019_realtime_ai_insights
Create Date: 2026-02-03

This migration adds new candidate statuses for multi-round interview flow:
- ai_passed: AI interview verdict was PASS
- ai_review: AI interview verdict was REVIEW (needs manual review)
- ai_rejected: AI interview verdict was FAIL
- eligible_round_2: Approved for Round 2 (human interview)
- round_2_scheduled: Round 2 interview scheduled
- round_2_in_progress: Round 2 interview in progress
- round_2_completed: Round 2 interview completed
- final_review: Awaiting final hiring decision
- hired: Candidate has been hired
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '020'
down_revision = '019'
branch_labels = None
depends_on = None


def upgrade():
    # Add new candidate status enum values for multi-round flow
    # PostgreSQL requires special handling for adding enum values
    
    # First, check and add each status if not exists
    new_statuses = [
        'ai_passed',
        'ai_review', 
        'ai_rejected',
        'eligible_round_2',
        'round_2_scheduled',
        'round_2_in_progress',
        'round_2_completed',
        'final_review',
        'hired',
        'offer_extended',
        'offer_accepted',
        'offer_rejected'
    ]
    
    for status in new_statuses:
        # Use IF NOT EXISTS to avoid errors if status already exists
        op.execute(f"""
            DO $$ 
            BEGIN
                ALTER TYPE candidatestatus ADD VALUE IF NOT EXISTS '{status}';
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
        """)
    
    # Add interview_verdict column to track AI verdict on interview
    # This helps with the review flow
    try:
        op.add_column('interviews', 
            sa.Column('interview_verdict', sa.String(20), nullable=True,
                     comment='AI verdict: PASS, REVIEW, or FAIL'))
    except Exception:
        pass  # Column may already exist
    
    # Add reviewed_by and reviewed_at columns for manual review tracking
    try:
        op.add_column('interviews',
            sa.Column('reviewed_by', sa.UUID(), nullable=True,
                     comment='Employee who reviewed this interview'))
    except Exception:
        pass
    
    try:
        op.add_column('interviews',
            sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True,
                     comment='When the interview was reviewed'))
    except Exception:
        pass
    
    try:
        op.add_column('interviews',
            sa.Column('review_notes', sa.Text(), nullable=True,
                     comment='Notes from employee review'))
    except Exception:
        pass
    
    # Add foreign key for reviewed_by
    try:
        op.create_foreign_key(
            'fk_interviews_reviewed_by',
            'interviews', 'users',
            ['reviewed_by'], ['id'],
            ondelete='SET NULL'
        )
    except Exception:
        pass
    
    # Add current_round column to candidates to track their progress
    try:
        op.add_column('candidates',
            sa.Column('current_round', sa.Integer(), nullable=True, server_default='1',
                     comment='Current interview round (1=AI, 2+=Human)'))
    except Exception:
        pass
    
    # Add promoted_at timestamp for tracking when candidate moved to next round
    try:
        op.add_column('candidates',
            sa.Column('promoted_at', sa.DateTime(timezone=True), nullable=True,
                     comment='When candidate was promoted to current round'))
    except Exception:
        pass


def downgrade():
    # Remove added columns
    op.drop_column('candidates', 'promoted_at')
    op.drop_column('candidates', 'current_round')
    
    op.drop_constraint('fk_interviews_reviewed_by', 'interviews', type_='foreignkey')
    op.drop_column('interviews', 'review_notes')
    op.drop_column('interviews', 'reviewed_at')
    op.drop_column('interviews', 'reviewed_by')
    op.drop_column('interviews', 'interview_verdict')
    
    # Note: Cannot remove enum values in PostgreSQL easily
    # Would need to recreate the type
