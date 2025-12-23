"""add job_templates and questions

Revision ID: 010_add_jobs_and_questions
Revises: 009_add_ai_reports
Create Date: 2025-12-22 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '010_add_jobs_and_questions'
down_revision = '009_add_ai_reports'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'job_templates',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('ai_prompt', sa.Text(), nullable=True),
        sa.Column('ai_model', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('idx_job_templates_company_id', 'job_templates', ['company_id'])

    op.create_table(
        'questions',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('job_template_id', sa.UUID(), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('weight', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('idx_questions_job_template_id', 'questions', ['job_template_id'])


def downgrade():
    op.drop_index('idx_questions_job_template_id', table_name='questions')
    op.drop_table('questions')
    op.drop_index('idx_job_templates_company_id', table_name='job_templates')
    op.drop_table('job_templates')
