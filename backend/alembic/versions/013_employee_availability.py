"""Add employee availability tables for auto-scheduling

Revision ID: 013
Revises: 012
Create Date: 2025-12-24

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = '013'
down_revision = '012'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # Create day_of_week enum if it doesn't exist
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dayofweek') THEN
                CREATE TYPE dayofweek AS ENUM ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');
            END IF;
        END$$;
    """)

    # Create employee_availability table if it doesn't exist
    if 'employee_availability' not in existing_tables:
        op.create_table(
            'employee_availability',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('employee_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
            sa.Column('company_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('companies.id'), nullable=False, index=True),
            sa.Column('day_of_week', postgresql.ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', name='dayofweek', create_type=False), nullable=False),
            sa.Column('start_time', sa.Time(), nullable=False),
            sa.Column('end_time', sa.Time(), nullable=False),
            sa.Column('slot_duration_minutes', sa.Integer(), default=30),
            sa.Column('max_interviews_per_slot', sa.Integer(), default=1),
            sa.Column('is_active', sa.Boolean(), default=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        )

    # Create scheduled_slots table if it doesn't exist
    if 'scheduled_slots' not in existing_tables:
        op.create_table(
            'scheduled_slots',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('availability_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('employee_availability.id'), nullable=False),
            sa.Column('interview_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('interviews.id'), nullable=False, unique=True),
            sa.Column('scheduled_datetime', sa.DateTime(timezone=True), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    # Create auto_schedule_config table if it doesn't exist
    if 'auto_schedule_config' not in existing_tables:
        op.create_table(
            'auto_schedule_config',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('employee_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, unique=True),
            sa.Column('company_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('companies.id'), nullable=False, index=True),
            sa.Column('min_days_gap', sa.Integer(), default=1),
            sa.Column('max_days_ahead', sa.Integer(), default=14),
            sa.Column('passing_score_threshold', sa.Integer(), default=60),
            sa.Column('auto_schedule_enabled', sa.Boolean(), default=True),
            sa.Column('notify_on_pass', sa.Boolean(), default=True),
            sa.Column('notify_on_fail', sa.Boolean(), default=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table('auto_schedule_config')
    op.drop_table('scheduled_slots')
    op.drop_table('employee_availability')
    
    # Drop enum
    op.execute('DROP TYPE IF EXISTS dayofweek')
