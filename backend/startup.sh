#!/bin/sh

echo "=== AI Interviewer Backend Startup ==="

# Run Alembic migrations (don't exit on failure)
echo "Running database migrations..."
alembic upgrade head || {
    echo "Alembic migrations failed, attempting direct SQL fix..."
    
    # If alembic fails, try to fix the database directly using Python
    python << 'PYTHON_SCRIPT'
import asyncio
from sqlalchemy import text
from app.core.database import engine

async def fix_db():
    async with engine.connect() as conn:
        # Check current version
        try:
            result = await conn.execute(text('SELECT version_num FROM alembic_version'))
            version = result.scalar()
            print(f'Current migration version: {version}')
        except Exception as e:
            print(f'Could not read version: {e}')
            version = None
        
        # Add missing columns to interviews table
        columns_to_add = [
            ('ats_score', 'INTEGER'),
            ('resume_text', 'TEXT'),
            ('transcript', 'TEXT'),
            ('ai_verdict', 'TEXT'),
            ('ai_recommendation', 'VARCHAR(50)'),
            ('behavior_score', 'INTEGER'),
            ('confidence_score', 'INTEGER'),
            ('answer_score', 'INTEGER'),
            ('employee_verdict', 'VARCHAR(50)'),
        ]
        
        for col_name, col_type in columns_to_add:
            try:
                await conn.execute(text(f'ALTER TABLE interviews ADD COLUMN IF NOT EXISTS {col_name} {col_type}'))
                print(f'Added column: {col_name}')
            except Exception as e:
                if 'already exists' not in str(e).lower():
                    print(f'Column {col_name}: {e}')
        
        # Create company_ai_config table if not exists
        try:
            await conn.execute(text('''
                CREATE TABLE IF NOT EXISTS company_ai_config (
                    id UUID PRIMARY KEY,
                    company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
                    min_passing_score INTEGER NOT NULL DEFAULT 60,
                    min_ats_score INTEGER NOT NULL DEFAULT 50,
                    auto_reject_below INTEGER,
                    require_employee_review BOOLEAN DEFAULT TRUE,
                    ats_enabled BOOLEAN DEFAULT TRUE,
                    ai_verdict_enabled BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            '''))
            print('Created company_ai_config table')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f'company_ai_config table: {e}')
        
        # Update alembic version to 015
        try:
            await conn.execute(text("DELETE FROM alembic_version"))
            await conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('015')"))
            print('Updated alembic version to 015')
        except Exception as e:
            print(f'Version update: {e}')
        
        await conn.commit()
        print('Database fix completed')

asyncio.run(fix_db())
PYTHON_SCRIPT

    echo "Direct fix attempted"
}

echo "Migrations step complete, starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
