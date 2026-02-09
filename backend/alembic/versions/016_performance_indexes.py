"""Add performance indexes

Revision ID: 016
Revises: 015
Create Date: 2026-01-06

Add indexes for frequently queried columns to improve query performance.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = '016'
down_revision = '015'
branch_labels = None
depends_on = None


def table_exists(bind, table_name):
    """Check if a table exists in the database."""
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def index_exists(bind, table_name, index_name):
    """Check if an index exists on a table."""
    inspector = inspect(bind)
    if table_name not in inspector.get_table_names():
        return False
    indexes = inspector.get_indexes(table_name)
    return any(idx['name'] == index_name for idx in indexes)


def upgrade() -> None:
    """Add performance indexes for common query patterns."""
    bind = op.get_bind()
    
    # === CANDIDATES TABLE INDEXES ===
    if table_exists(bind, 'candidates'):
        if not index_exists(bind, 'candidates', 'ix_candidates_company_status'):
            op.create_index(
                'ix_candidates_company_status',
                'candidates',
                ['company_id', 'status'],
                unique=False
            )
        
        if not index_exists(bind, 'candidates', 'ix_candidates_company_domain'):
            op.create_index(
                'ix_candidates_company_domain',
                'candidates',
                ['company_id', 'domain'],
                unique=False
            )
        
        if not index_exists(bind, 'candidates', 'ix_candidates_email_company'):
            op.create_index(
                'ix_candidates_email_company',
                'candidates',
                ['email', 'company_id'],
                unique=False
            )
        
        if not index_exists(bind, 'candidates', 'ix_candidates_created_at'):
            op.create_index(
                'ix_candidates_created_at',
                'candidates',
                ['created_at'],
                unique=False
            )
    
    # === INTERVIEWS TABLE INDEXES ===
    if table_exists(bind, 'interviews'):
        if not index_exists(bind, 'interviews', 'ix_interviews_candidate_id'):
            op.create_index(
                'ix_interviews_candidate_id',
                'interviews',
                ['candidate_id'],
                unique=False
            )
        
        if not index_exists(bind, 'interviews', 'ix_interviews_company_status'):
            op.create_index(
                'ix_interviews_company_status',
                'interviews',
                ['company_id', 'status'],
                unique=False
            )
        
        if not index_exists(bind, 'interviews', 'ix_interviews_scheduled_time'):
            op.create_index(
                'ix_interviews_scheduled_time',
                'interviews',
                ['scheduled_time'],
                unique=False
            )
    
    # === USERS TABLE INDEXES ===
    if table_exists(bind, 'users'):
        if not index_exists(bind, 'users', 'ix_users_company_role'):
            op.create_index(
                'ix_users_company_role',
                'users',
                ['company_id', 'role'],
                unique=False
            )


def downgrade() -> None:
    """Remove performance indexes."""
    bind = op.get_bind()
    
    if table_exists(bind, 'users'):
        if index_exists(bind, 'users', 'ix_users_company_role'):
            op.drop_index('ix_users_company_role', table_name='users')
    
    if table_exists(bind, 'interviews'):
        if index_exists(bind, 'interviews', 'ix_interviews_scheduled_time'):
            op.drop_index('ix_interviews_scheduled_time', table_name='interviews')
        if index_exists(bind, 'interviews', 'ix_interviews_company_status'):
            op.drop_index('ix_interviews_company_status', table_name='interviews')
        if index_exists(bind, 'interviews', 'ix_interviews_candidate_id'):
            op.drop_index('ix_interviews_candidate_id', table_name='interviews')
    
    if table_exists(bind, 'candidates'):
        if index_exists(bind, 'candidates', 'ix_candidates_created_at'):
            op.drop_index('ix_candidates_created_at', table_name='candidates')
        if index_exists(bind, 'candidates', 'ix_candidates_email_company'):
            op.drop_index('ix_candidates_email_company', table_name='candidates')
        if index_exists(bind, 'candidates', 'ix_candidates_company_domain'):
            op.drop_index('ix_candidates_company_domain', table_name='candidates')
        if index_exists(bind, 'candidates', 'ix_candidates_company_status'):
            op.drop_index('ix_candidates_company_status', table_name='candidates')
