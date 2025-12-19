"""Add ai_interview_token to interviews table

Revision ID: add_ai_interview_token
Revises: 
Create Date: 2025-12-18 01:50:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_ai_interview_token'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add ai_interview_token column to interviews table
    op.add_column('interviews', sa.Column('ai_interview_token', sa.String(length=255), nullable=True))


def downgrade() -> None:
    # Remove ai_interview_token column from interviews table
    op.drop_column('interviews', 'ai_interview_token')
