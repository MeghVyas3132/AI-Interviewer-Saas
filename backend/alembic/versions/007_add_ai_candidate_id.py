"""
Add ai_candidate_id column to candidates table

Revision ID: 007
Revises: 006
Create Date: 2025-12-18 20:55:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('candidates', sa.Column('ai_candidate_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('candidates', 'ai_candidate_id')
