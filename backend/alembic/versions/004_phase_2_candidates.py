"""Phase 2: Add Candidates, Interviews, and Email Queue tables

Revision ID: 004
Revises: 003
Create Date: 2025-11-15 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic
revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade():
    """Create tables for Phase 2: Candidate Management & Interview Scheduling"""
    
    # Candidates table
    op.create_table(
        'candidates',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.func.gen_random_uuid()),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('first_name', sa.String(255), nullable=True),
        sa.Column('last_name', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('domain', sa.String(255), nullable=True),  # Engineering, Sales, etc.
        sa.Column('position', sa.String(255), nullable=True),  # Senior Engineer, Product Manager
        sa.Column('experience_years', sa.Integer(), nullable=True),
        sa.Column('qualifications', sa.Text(), nullable=True),  # JSON string of qualifications
        sa.Column('resume_url', sa.String(500), nullable=True),  # S3 URL or similar
        sa.Column('status', sa.String(50), nullable=False, server_default='applied'),
        # Statuses: applied, screening, assessment, interview, selected, offer, accepted, rejected
        sa.Column('source', sa.String(100), nullable=True),  # linkedin, referral, job_portal, excel_import
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),  # HR user who added
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('company_id', 'email', name='uq_candidate_company_email')
    )
    
    # Create indexes
    op.create_index('idx_candidates_company_id', 'candidates', ['company_id'])
    op.create_index('idx_candidates_email', 'candidates', ['email'])
    op.create_index('idx_candidates_status', 'candidates', ['status'])
    op.create_index('idx_candidates_domain', 'candidates', ['domain'])
    op.create_index('idx_candidates_created_at', 'candidates', ['created_at'])
    
    # Interviews table
    op.create_table(
        'interviews',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.func.gen_random_uuid()),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('candidate_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('round', sa.String(100), nullable=False),  # screening, technical, hr, final
        sa.Column('scheduled_time', sa.DateTime(), nullable=False),
        sa.Column('timezone', sa.String(100), nullable=True, server_default='UTC'),
        sa.Column('interviewer_id', postgresql.UUID(as_uuid=True), nullable=True),  # Primary interviewer
        sa.Column('status', sa.String(50), nullable=False, server_default='scheduled'),
        # Statuses: scheduled, in_progress, completed, canceled, rescheduled
        sa.Column('meeting_link', sa.String(500), nullable=True),  # Zoom, Google Meet link
        sa.Column('recording_url', sa.String(500), nullable=True),
        sa.Column('transcription_url', sa.String(500), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),  # HR coordinator
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['candidate_id'], ['candidates.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['interviewer_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index('idx_interviews_company_id', 'interviews', ['company_id'])
    op.create_index('idx_interviews_candidate_id', 'interviews', ['candidate_id'])
    op.create_index('idx_interviews_scheduled_time', 'interviews', ['scheduled_time'])
    op.create_index('idx_interviews_status', 'interviews', ['status'])
    op.create_index('idx_interviews_interviewer_id', 'interviews', ['interviewer_id'])
    
    # Email queue table for async email processing
    op.create_table(
        'email_queue',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.func.gen_random_uuid()),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('recipient_email', sa.String(255), nullable=False),
        sa.Column('recipient_id', postgresql.UUID(as_uuid=True), nullable=True),  # User or Candidate ID
        sa.Column('template_id', sa.String(100), nullable=False),  # welcome_hr, candidate_invitation, etc.
        sa.Column('subject', sa.String(255), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('variables', postgresql.JSONB(), nullable=True),  # Template variables
        sa.Column('email_type', sa.String(50), nullable=False),  # WELCOME, CANDIDATE_INVITE, STATUS_UPDATE, etc.
        sa.Column('status', sa.String(50), nullable=False, server_default='queued'),
        # Statuses: queued, sending, sent, failed, bounced
        sa.Column('priority', sa.String(50), nullable=False, server_default='MEDIUM'),  # HIGH, MEDIUM, LOW
        sa.Column('retry_count', sa.Integer(), nullable=False, server_default=0),
        sa.Column('max_retries', sa.Integer(), nullable=False, server_default=3),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('email_provider_id', sa.String(255), nullable=True),  # SendGrid message ID
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index('idx_email_queue_status', 'email_queue', ['status'])
    op.create_index('idx_email_queue_company_id', 'email_queue', ['company_id'])
    op.create_index('idx_email_queue_created_at', 'email_queue', ['created_at'])
    op.create_index('idx_email_queue_priority', 'email_queue', ['priority'])
    op.create_index('idx_email_queue_recipient', 'email_queue', ['recipient_email'])
    
    # Email tracking table
    op.create_table(
        'email_tracking',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.func.gen_random_uuid()),
        sa.Column('email_queue_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('event_type', sa.String(50), nullable=False),  # sent, delivered, opened, clicked, bounced
        sa.Column('event_data', postgresql.JSONB(), nullable=True),  # Additional event metadata
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['email_queue_id'], ['email_queue.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index('idx_email_tracking_event_type', 'email_tracking', ['event_type'])
    op.create_index('idx_email_tracking_email_queue_id', 'email_tracking', ['email_queue_id'])
    
    # Candidate feedback/notes table for team collaboration
    op.create_table(
        'candidate_feedback',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.func.gen_random_uuid()),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('candidate_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('interview_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=False),  # Interviewer/Evaluator
        sa.Column('score', sa.Float(), nullable=True),  # 1-100 or 1-5
        sa.Column('feedback', sa.Text(), nullable=False),
        sa.Column('recommendation', sa.String(50), nullable=True),  # proceed, reject, hold
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['candidate_id'], ['candidates.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['interview_id'], ['interviews.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index('idx_candidate_feedback_company_id', 'candidate_feedback', ['company_id'])
    op.create_index('idx_candidate_feedback_candidate_id', 'candidate_feedback', ['candidate_id'])
    op.create_index('idx_candidate_feedback_created_by', 'candidate_feedback', ['created_by'])


def downgrade():
    """Downgrade: Drop all Phase 2 tables"""
    op.drop_index('idx_candidate_feedback_created_by')
    op.drop_index('idx_candidate_feedback_candidate_id')
    op.drop_index('idx_candidate_feedback_company_id')
    op.drop_table('candidate_feedback')
    
    op.drop_index('idx_email_tracking_email_queue_id')
    op.drop_index('idx_email_tracking_event_type')
    op.drop_table('email_tracking')
    
    op.drop_index('idx_email_queue_recipient')
    op.drop_index('idx_email_queue_priority')
    op.drop_index('idx_email_queue_created_at')
    op.drop_index('idx_email_queue_company_id')
    op.drop_index('idx_email_queue_status')
    op.drop_table('email_queue')
    
    op.drop_index('idx_interviews_interviewer_id')
    op.drop_index('idx_interviews_status')
    op.drop_index('idx_interviews_scheduled_time')
    op.drop_index('idx_interviews_candidate_id')
    op.drop_index('idx_interviews_company_id')
    op.drop_table('interviews')
    
    op.drop_index('idx_candidates_created_at')
    op.drop_index('idx_candidates_domain')
    op.drop_index('idx_candidates_status')
    op.drop_index('idx_candidates_email')
    op.drop_index('idx_candidates_company_id')
    op.drop_table('candidates')
