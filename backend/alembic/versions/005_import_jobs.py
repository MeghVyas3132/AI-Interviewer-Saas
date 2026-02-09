"""Add ImportJob model for async bulk import tracking

Revision ID: 005
Revises: 004
Create Date: 2025-11-16 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create ImportJobStatus enum type
    import_job_status = postgresql.ENUM(
        'queued', 'processing', 'completed', 'failed', 'cancelled',
        name='importjobstatus',
        create_type=True
    )
    import_job_status.create(op.get_bind(), checkfirst=True)
    
    # Create import_jobs table
    op.create_table(
        'import_jobs',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.func.gen_random_uuid(), nullable=False),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('filename', sa.String(500), nullable=False),
        sa.Column('file_size_bytes', sa.Integer(), nullable=False),
        sa.Column('file_format', sa.String(50), nullable=False),
        sa.Column('status', import_job_status, nullable=False, server_default='queued'),
        sa.Column('celery_task_id', sa.String(500), nullable=True, unique=True),
        sa.Column('send_invitations', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('default_domain', sa.String(255), nullable=True),
        sa.Column('total_records', sa.Integer(), nullable=False),
        sa.Column('created_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('failed_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('skipped_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('detailed_errors', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('processing_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('processing_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('processing_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index('idx_import_jobs_company_id', 'import_jobs', ['company_id'])
    op.create_index('idx_import_jobs_status', 'import_jobs', ['status'])
    op.create_index('idx_import_jobs_created_at', 'import_jobs', ['created_at'])
    op.create_index('idx_import_jobs_celery_task_id', 'import_jobs', ['celery_task_id'])
    op.create_index('idx_import_jobs_created_by', 'import_jobs', ['created_by'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('idx_import_jobs_created_by', table_name='import_jobs')
    op.drop_index('idx_import_jobs_celery_task_id', table_name='import_jobs')
    op.drop_index('idx_import_jobs_created_at', table_name='import_jobs')
    op.drop_index('idx_import_jobs_status', table_name='import_jobs')
    op.drop_index('idx_import_jobs_company_id', table_name='import_jobs')
    
    # Drop table
    op.drop_table('import_jobs')
    
    # Drop enum type
    import_job_status = postgresql.ENUM(
        'queued', 'processing', 'completed', 'failed', 'cancelled',
        name='importjobstatus'
    )
    import_job_status.drop(op.get_bind(), checkfirst=True)
