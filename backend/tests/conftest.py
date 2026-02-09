"""
Test initialization and fixtures
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.core.config import settings


@pytest.fixture
async def test_db():
    """Create test database session."""
    # Use in-memory SQLite for tests
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session_factory = sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session_factory() as session:
        yield session
        await session.rollback()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest.fixture
def sample_company_data():
    """Sample company data for tests."""
    return {
        "name": "Test Company",
        "email_domain": "test.com",
        "description": "Test company description",
    }


@pytest.fixture
def sample_user_data():
    """Sample user data for tests."""
    return {
        "name": "Test User",
        "email": "test@test.com",
        "password": "testpassword123",
        "role": "EMPLOYEE",
    }
