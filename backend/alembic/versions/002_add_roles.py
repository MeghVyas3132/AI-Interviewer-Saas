"""
Migration 002: Add roles table and custom_role_id to users.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "002_add_roles"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add roles table and custom_role_id column to users."""

    # Create roles table
    op.create_table(
        "roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("permissions", sa.String(1000), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "name", name="uq_company_role_name"),
    )
    op.create_index(op.f("ix_roles_company_id"), "roles", ["company_id"])
    op.create_index(op.f("ix_roles_name"), "roles", ["name"])
    op.create_index(op.f("ix_roles_is_active"), "roles", ["is_active"])

    # Add custom_role_id column to users
    op.add_column(
        "users",
        sa.Column("custom_role_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_custom_role_id",
        "users",
        "roles",
        ["custom_role_id"],
        ["id"],
    )
    op.create_index(op.f("ix_users_custom_role_id"), "users", ["custom_role_id"])


def downgrade() -> None:
    """Rollback changes."""
    op.drop_index(op.f("ix_users_custom_role_id"), table_name="users")
    op.drop_constraint("fk_users_custom_role_id", "users", type_="foreignkey")
    op.drop_column("users", "custom_role_id")
    op.drop_index(op.f("ix_roles_is_active"), table_name="roles")
    op.drop_index(op.f("ix_roles_name"), table_name="roles")
    op.drop_index(op.f("ix_roles_company_id"), table_name="roles")
    op.drop_table("roles")
