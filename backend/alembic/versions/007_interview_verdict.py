"""Add interview verdict and ATS fields

Revision ID: 007_interview_verdict
Revises: 006_interview_rounds
Create Date: 2025-12-28

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '007_interview_verdict'
down_revision = '006_interview_rounds'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add ATS and verdict columns to interviews table
    op.add_column('interviews', sa.Column('ats_score', sa.Integer(), nullable=True))
    op.add_column('interviews', sa.Column('resume_text', sa.Text(), nullable=True))
    op.add_column('interviews', sa.Column('transcript', sa.Text(), nullable=True))
    op.add_column('interviews', sa.Column('ai_verdict', sa.Text(), nullable=True))
    op.add_column('interviews', sa.Column('ai_recommendation', sa.String(50), nullable=True))
    op.add_column('interviews', sa.Column('behavior_score', sa.Integer(), nullable=True))
    op.add_column('interviews', sa.Column('confidence_score', sa.Integer(), nullable=True))
    op.add_column('interviews', sa.Column('answer_score', sa.Integer(), nullable=True))
    op.add_column('interviews', sa.Column('employee_verdict', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('interviews', 'ats_score')
    op.drop_column('interviews', 'resume_text')
    op.drop_column('interviews', 'transcript')
    op.drop_column('interviews', 'ai_verdict')
    op.drop_column('interviews', 'ai_recommendation')
    op.drop_column('interviews', 'behavior_score')
    op.drop_column('interviews', 'confidence_score')
    op.drop_column('interviews', 'answer_score')
    op.drop_column('interviews', 'employee_verdict')
