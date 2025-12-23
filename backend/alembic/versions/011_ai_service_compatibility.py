"""
Add AI service compatibility columns and tables.

This migration adds columns and tables expected by the AI Interview Service
(Aigenthix_AI_Interviewer) to work with the shared PostgreSQL database.

Revision ID: 011
Revises: 010
Create Date: 2025-01-15 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '011'
down_revision = '010_add_jobs_and_questions'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add AI service compatibility columns and tables."""
    
    # Add job_role_id and resume_id columns to interview_sessions
    # These are expected by the AI service's postgres-data-store.ts
    op.add_column('interview_sessions', sa.Column('job_role_id', sa.Integer(), nullable=True))
    op.add_column('interview_sessions', sa.Column('resume_id', sa.Integer(), nullable=True))
    
    # Create job_positions table if it doesn't exist
    # The AI service expects position_id as PK, not id
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_name = 'job_positions'
            ) THEN
                CREATE TABLE job_positions (
                    position_id SERIAL PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    department VARCHAR(255),
                    description TEXT,
                    requirements TEXT,
                    experience_level VARCHAR(100),
                    salary_range_min INTEGER,
                    salary_range_max INTEGER,
                    location VARCHAR(255),
                    employment_type VARCHAR(100),
                    status VARCHAR(50) DEFAULT 'active',
                    exam_id INTEGER,
                    subcategory_id INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_active BOOLEAN DEFAULT true
                );
            END IF;
        END $$;
    """)
    
    # Create resumes table if it doesn't exist
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_name = 'resumes'
            ) THEN
                CREATE TABLE resumes (
                    resume_id SERIAL PRIMARY KEY,
                    candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
                    file_name VARCHAR(255) NOT NULL,
                    file_path VARCHAR(500) NOT NULL,
                    file_size INTEGER,
                    file_type VARCHAR(100),
                    extracted_text TEXT,
                    parsed_data JSONB,
                    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_active BOOLEAN DEFAULT true
                );
            END IF;
        END $$;
    """)
    
    # Create interviewers table if it doesn't exist
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_name = 'interviewers'
            ) THEN
                CREATE TABLE interviewers (
                    interviewer_id SERIAL PRIMARY KEY,
                    first_name VARCHAR(255),
                    last_name VARCHAR(255),
                    email VARCHAR(255) UNIQUE NOT NULL,
                    department VARCHAR(255),
                    position VARCHAR(255),
                    specialization VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_active BOOLEAN DEFAULT true
                );
            END IF;
        END $$;
    """)
    
    # Create foreign key constraints for interview_sessions (if tables exist)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_name = 'job_positions'
            ) THEN
                BEGIN
                    ALTER TABLE interview_sessions 
                    ADD CONSTRAINT fk_interview_sessions_job_role 
                    FOREIGN KEY (job_role_id) REFERENCES job_positions(position_id) ON DELETE SET NULL;
                EXCEPTION WHEN duplicate_object THEN
                    -- Constraint already exists
                    NULL;
                END;
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_name = 'resumes'
            ) THEN
                BEGIN
                    ALTER TABLE interview_sessions 
                    ADD CONSTRAINT fk_interview_sessions_resume 
                    FOREIGN KEY (resume_id) REFERENCES resumes(resume_id) ON DELETE SET NULL;
                EXCEPTION WHEN duplicate_object THEN
                    -- Constraint already exists
                    NULL;
                END;
            END IF;
        END $$;
    """)
    
    # Create indexes for new columns
    op.create_index('ix_interview_sessions_job_role_id', 'interview_sessions', ['job_role_id'], if_not_exists=True)
    op.create_index('ix_interview_sessions_resume_id', 'interview_sessions', ['resume_id'], if_not_exists=True)
    op.create_index('ix_interview_sessions_token', 'interview_sessions', ['token'], if_not_exists=True)
    op.create_index('ix_interview_sessions_status', 'interview_sessions', ['status'], if_not_exists=True)
    op.create_index('ix_interview_sessions_expires_at', 'interview_sessions', ['expires_at'], if_not_exists=True)


def downgrade() -> None:
    """Remove AI service compatibility columns and tables."""
    
    # Drop indexes
    op.drop_index('ix_interview_sessions_job_role_id', table_name='interview_sessions', if_exists=True)
    op.drop_index('ix_interview_sessions_resume_id', table_name='interview_sessions', if_exists=True)
    
    # Drop foreign key constraints
    op.execute("""
        ALTER TABLE interview_sessions 
        DROP CONSTRAINT IF EXISTS fk_interview_sessions_job_role;
    """)
    op.execute("""
        ALTER TABLE interview_sessions 
        DROP CONSTRAINT IF EXISTS fk_interview_sessions_resume;
    """)
    
    # Drop columns from interview_sessions
    op.drop_column('interview_sessions', 'job_role_id')
    op.drop_column('interview_sessions', 'resume_id')
    
    # Note: We don't drop the tables created in upgrade as they might have data
    # To fully rollback, manually drop: job_positions, resumes, interviewers
