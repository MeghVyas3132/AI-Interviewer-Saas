"""Add company AI configuration

Revision ID: 014_company_ai_config
Revises: 013_employee_availability
Create Date: 2024-01-20

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = '014_company_ai_config'
down_revision = '013_employee_availability'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create company_ai_config table
    op.create_table(
        'company_ai_config',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('company_id', UUID(as_uuid=True), sa.ForeignKey('companies.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('min_passing_score', sa.Integer(), nullable=False, default=70),
        sa.Column('min_ats_score', sa.Integer(), nullable=False, default=60),
        sa.Column('auto_reject_below', sa.Integer(), nullable=True),  # Auto reject candidates below this score
        sa.Column('require_employee_review', sa.Boolean(), default=True),  # Require employee to review AI decision
        sa.Column('ats_enabled', sa.Boolean(), default=True),
        sa.Column('ai_verdict_enabled', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    
    # Create index for faster lookups
    op.create_index('ix_company_ai_config_company_id', 'company_ai_config', ['company_id'])


def downgrade() -> None:
    op.drop_index('ix_company_ai_config_company_id')
    op.drop_table('company_ai_config')
