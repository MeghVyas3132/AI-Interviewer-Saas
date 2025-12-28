#!/bin/sh

echo "=== AI Interviewer Backend Startup ==="

# Skip alembic entirely and use direct SQL - more reliable for Railway
echo "Running database fix script..."

python << 'PYTHON_SCRIPT'
import os
import psycopg2
from urllib.parse import urlparse

# Parse DATABASE_URL
db_url = os.environ.get('DATABASE_URL', '')
if db_url.startswith('postgresql+asyncpg://'):
    db_url = db_url.replace('postgresql+asyncpg://', 'postgresql://')

print(f"Connecting to database...")

try:
    conn = psycopg2.connect(db_url)
    conn.autocommit = True  # Each statement commits immediately
    cur = conn.cursor()
    
    print("Connected successfully!")
    
    # 1. Create alembic_version table if not exists
    print("Checking alembic_version table...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS alembic_version (
            version_num VARCHAR(32) NOT NULL PRIMARY KEY
        )
    """)
    print("alembic_version table ensured")
    
    # 2. Set version to 015
    cur.execute("DELETE FROM alembic_version")
    cur.execute("INSERT INTO alembic_version (version_num) VALUES ('015')")
    print("Set alembic version to 015")
    
    # 3. Add missing columns to interviews table
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
            cur.execute(f"ALTER TABLE interviews ADD COLUMN IF NOT EXISTS {col_name} {col_type}")
            print(f"Column {col_name}: OK")
        except Exception as e:
            print(f"Column {col_name}: {e}")
    
    # 4. Create company_ai_config table if not exists
    print("Checking company_ai_config table...")
    try:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS company_ai_config (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
        """)
        print("company_ai_config table: OK")
    except Exception as e:
        print(f"company_ai_config table: {e}")
    
    # 5. Verify the columns exist
    print("\nVerifying interviews table columns...")
    cur.execute("""
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'interviews' 
        ORDER BY ordinal_position
    """)
    columns = [row[0] for row in cur.fetchall()]
    print(f"Interviews table columns: {columns}")
    
    cur.close()
    conn.close()
    print("\nDatabase fix completed successfully!")
    
except Exception as e:
    print(f"Database fix error: {e}")
    import traceback
    traceback.print_exc()

PYTHON_SCRIPT

echo "Database step complete, starting server..."

echo "Migrations step complete, starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
