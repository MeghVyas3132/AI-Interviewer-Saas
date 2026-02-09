"""Add real-time AI insights tables and extend interview_rounds for human-AI-assisted mode

Revision ID: 019_realtime_ai_insights
Revises: 018_pipeline_statuses
Create Date: 2026-02-02

This migration adds:
1. New fields to interview_rounds for VideoSDK integration
2. live_insights table for real-time AI insights
3. fraud_alerts table for fraud detection
4. interview_transcripts table for speech-to-text
5. human_verdicts table for interviewer decisions
6. interview_summaries table for post-interview reports
7. candidate_resumes table for structured resume data
8. ai_audit_logs table for compliance

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision = '019'
down_revision = '018'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create ENUM types first
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE interview_mode_type AS ENUM (
                'AI_CONDUCTED',
                'HUMAN_AI_ASSISTED',
                'HUMAN_ONLY'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE insight_type AS ENUM (
                'SPEECH_CONFIDENCE',
                'HESITATION',
                'RESPONSE_LATENCY',
                'HEAD_MOVEMENT',
                'VIDEO_QUALITY',
                'MULTIPLE_FACES',
                'FACE_SWITCH',
                'TAB_SWITCH',
                'BACKGROUND_VOICE',
                'RESUME_CONTRADICTION'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE alert_severity AS ENUM (
                'INFO',
                'LOW',
                'MEDIUM',
                'HIGH',
                'CRITICAL'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE verdict_decision AS ENUM (
                'ADVANCE',
                'REJECT',
                'HOLD',
                'REASSESS'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    
    # Add new columns to interview_rounds for VideoSDK integration
    op.add_column('interview_rounds', 
        sa.Column('interview_mode', sa.String(50), nullable=True, server_default='AI_CONDUCTED'))
    op.add_column('interview_rounds',
        sa.Column('videosdk_meeting_id', sa.String(255), nullable=True))
    op.add_column('interview_rounds',
        sa.Column('videosdk_token', sa.Text(), nullable=True))
    op.add_column('interview_rounds',
        sa.Column('candidate_consent_given', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('interview_rounds',
        sa.Column('candidate_consent_timestamp', sa.DateTime(timezone=True), nullable=True))
    op.add_column('interview_rounds',
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('interview_rounds',
        sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True))
    
    # Create candidate_resumes table for structured resume data
    op.create_table(
        'candidate_resumes',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('candidate_id', UUID(as_uuid=True), sa.ForeignKey('candidates.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('resume_json', JSONB, nullable=False),
        sa.Column('key_facts', JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index('idx_candidate_resumes_candidate_id', 'candidate_resumes', ['candidate_id'])
    
    # Create live_insights table
    op.create_table(
        'live_insights',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('round_id', UUID(as_uuid=True), sa.ForeignKey('interview_rounds.id', ondelete='CASCADE'), nullable=False),
        sa.Column('timestamp_ms', sa.BigInteger(), nullable=False),
        sa.Column('insight_type', sa.String(50), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False, server_default='INFO'),
        sa.Column('value', JSONB, nullable=False),
        sa.Column('explanation', sa.Text(), nullable=True),
        sa.Column('model_version', sa.String(100), nullable=True),
        sa.Column('processing_time_ms', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('idx_live_insights_round_id', 'live_insights', ['round_id'])
    op.create_index('idx_live_insights_round_timestamp', 'live_insights', ['round_id', 'timestamp_ms'])
    op.create_index('idx_live_insights_type', 'live_insights', ['insight_type'])
    
    # Create fraud_alerts table
    op.create_table(
        'fraud_alerts',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('round_id', UUID(as_uuid=True), sa.ForeignKey('interview_rounds.id', ondelete='CASCADE'), nullable=False),
        sa.Column('insight_id', UUID(as_uuid=True), sa.ForeignKey('live_insights.id', ondelete='CASCADE'), nullable=False),
        sa.Column('alert_type', sa.String(50), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('detected_at_ms', sa.BigInteger(), nullable=False),
        sa.Column('confidence', sa.Numeric(5, 4), nullable=False),
        sa.Column('evidence', JSONB, nullable=True),
        sa.Column('acknowledged', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('acknowledged_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('false_positive_marked', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('idx_fraud_alerts_round_id', 'fraud_alerts', ['round_id'])
    op.create_index('idx_fraud_alerts_severity', 'fraud_alerts', ['severity'])
    
    # Create interview_transcripts table
    op.create_table(
        'interview_transcripts',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('round_id', UUID(as_uuid=True), sa.ForeignKey('interview_rounds.id', ondelete='CASCADE'), nullable=False),
        sa.Column('speaker', sa.String(20), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('start_time_ms', sa.BigInteger(), nullable=False),
        sa.Column('end_time_ms', sa.BigInteger(), nullable=False),
        sa.Column('word_timestamps', JSONB, nullable=True),
        sa.Column('stt_provider', sa.String(50), nullable=True),
        sa.Column('stt_confidence', sa.Numeric(5, 4), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("speaker IN ('CANDIDATE', 'INTERVIEWER')", name='valid_speaker'),
    )
    op.create_index('idx_transcripts_round_id', 'interview_transcripts', ['round_id'])
    op.create_index('idx_transcripts_round_time', 'interview_transcripts', ['round_id', 'start_time_ms'])
    
    # Create human_verdicts table
    op.create_table(
        'human_verdicts',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('round_id', UUID(as_uuid=True), sa.ForeignKey('interview_rounds.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('interviewer_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=False),
        sa.Column('decision', sa.String(20), nullable=False),
        sa.Column('overall_rating', sa.Integer(), nullable=True),
        sa.Column('criteria_scores', JSONB, nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('ai_insights_helpful', sa.Boolean(), nullable=True),
        sa.Column('ai_feedback_notes', sa.Text(), nullable=True),
        sa.Column('submitted_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("decision IN ('ADVANCE', 'REJECT', 'HOLD', 'REASSESS')", name='valid_verdict_decision'),
        sa.CheckConstraint("overall_rating BETWEEN 1 AND 5", name='valid_overall_rating'),
    )
    op.create_index('idx_verdicts_round_id', 'human_verdicts', ['round_id'])
    op.create_index('idx_verdicts_interviewer', 'human_verdicts', ['interviewer_id'])
    
    # Create interview_summaries table
    op.create_table(
        'interview_summaries',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('round_id', UUID(as_uuid=True), sa.ForeignKey('interview_rounds.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('avg_speech_confidence', sa.Numeric(5, 4), nullable=True),
        sa.Column('total_hesitations', sa.Integer(), nullable=True),
        sa.Column('avg_response_latency_ms', sa.Integer(), nullable=True),
        sa.Column('fraud_alerts_count', sa.Integer(), server_default='0', nullable=True),
        sa.Column('critical_alerts_count', sa.Integer(), server_default='0', nullable=True),
        sa.Column('resume_contradictions_found', sa.Integer(), server_default='0', nullable=True),
        sa.Column('contradiction_details', JSONB, nullable=True),
        sa.Column('ai_summary', sa.Text(), nullable=True),
        sa.Column('key_observations', JSONB, nullable=True),
        sa.Column('generated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('idx_summaries_round_id', 'interview_summaries', ['round_id'])
    
    # Create ai_audit_logs table
    op.create_table(
        'ai_audit_logs',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('round_id', UUID(as_uuid=True), sa.ForeignKey('interview_rounds.id', ondelete='SET NULL'), nullable=True),
        sa.Column('service_name', sa.String(50), nullable=False),
        sa.Column('action_type', sa.String(100), nullable=False),
        sa.Column('input_summary', JSONB, nullable=True),
        sa.Column('output_data', JSONB, nullable=True),
        sa.Column('model_id', sa.String(100), nullable=True),
        sa.Column('model_version', sa.String(50), nullable=True),
        sa.Column('processing_time_ms', sa.Integer(), nullable=True),
        sa.Column('success', sa.Boolean(), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('idx_audit_logs_round_id', 'ai_audit_logs', ['round_id'])
    op.create_index('idx_audit_logs_service', 'ai_audit_logs', ['service_name'])
    op.create_index('idx_audit_logs_created', 'ai_audit_logs', ['created_at'])


def downgrade() -> None:
    # Drop tables in reverse order (respecting foreign keys)
    op.drop_table('ai_audit_logs')
    op.drop_table('interview_summaries')
    op.drop_table('human_verdicts')
    op.drop_table('interview_transcripts')
    op.drop_table('fraud_alerts')
    op.drop_table('live_insights')
    op.drop_table('candidate_resumes')
    
    # Drop columns from interview_rounds
    op.drop_column('interview_rounds', 'ended_at')
    op.drop_column('interview_rounds', 'started_at')
    op.drop_column('interview_rounds', 'candidate_consent_timestamp')
    op.drop_column('interview_rounds', 'candidate_consent_given')
    op.drop_column('interview_rounds', 'videosdk_token')
    op.drop_column('interview_rounds', 'videosdk_meeting_id')
    op.drop_column('interview_rounds', 'interview_mode')
    
    # Drop ENUM types
    op.execute("DROP TYPE IF EXISTS verdict_decision")
    op.execute("DROP TYPE IF EXISTS alert_severity")
    op.execute("DROP TYPE IF EXISTS insight_type")
    op.execute("DROP TYPE IF EXISTS interview_mode_type")
