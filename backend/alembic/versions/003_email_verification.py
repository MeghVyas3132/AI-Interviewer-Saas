"""Add email verification fields to user table

Revision ID: 003
Revises: 002
Create Date: 2024-11-14 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add email verification columns to user table"""
    op.add_column('users', sa.Column('email_verified', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('verification_token', sa.String(), nullable=True))
    op.add_column('users', sa.Column('verification_token_expires', sa.DateTime(timezone=True), nullable=True))
    
    # Create indexes for verification token lookup
    op.create_index(
        'ix_user_verification_token',
        'users',
        ['verification_token'],
        unique=True,
        postgresql_where=sa.text("verification_token IS NOT NULL")
    )


def downgrade() -> None:
    """Remove email verification columns from user table"""
    op.drop_index('ix_user_verification_token', table_name='users')
    op.drop_column('users', 'verification_token_expires')
    op.drop_column('users', 'verification_token')
    op.drop_column('users', 'email_verified')
