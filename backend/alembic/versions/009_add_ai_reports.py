"""
Add ai_reports table

Revision ID: 009
Revises: 008
Create Date: 2025-12-22 19:45:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '009_add_ai_reports'
down_revision = '008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'ai_reports',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('candidate_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('interview_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('report_type', sa.String(length=100), nullable=False),
        sa.Column('score', sa.Float(), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('provider_response', postgresql.JSONB(), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('idx_ai_reports_company_id', 'ai_reports', ['company_id'])
    op.create_index('idx_ai_reports_candidate_id', 'ai_reports', ['candidate_id'])


def downgrade() -> None:
    op.drop_index('idx_ai_reports_candidate_id', table_name='ai_reports')
    op.drop_index('idx_ai_reports_company_id', table_name='ai_reports')
    op.drop_table('ai_reports')
