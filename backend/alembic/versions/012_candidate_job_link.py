"""
Add job_template_id to candidates for question linking

Revision ID: 012
Revises: 011
Create Date: 2025-12-23 18:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '012'
down_revision = '011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add job_template_id foreign key to candidates."""
    # Add job_template_id column with foreign key to job_templates
    op.add_column(
        'candidates',
        sa.Column('job_template_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    
    # Add foreign key constraint
    op.create_foreign_key(
        'fk_candidates_job_template_id',
        'candidates',
        'job_templates',
        ['job_template_id'],
        ['id'],
        ondelete='SET NULL'
    )
    
    # Add index for performance
    op.create_index('ix_candidates_job_template_id', 'candidates', ['job_template_id'])


def downgrade() -> None:
    """Remove job_template_id from candidates."""
    op.drop_index('ix_candidates_job_template_id', 'candidates')
    op.drop_constraint('fk_candidates_job_template_id', 'candidates', type_='foreignkey')
    op.drop_column('candidates', 'job_template_id')
