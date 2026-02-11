import asyncio
import asyncpg
import bcrypt
from uuid import uuid4

async def create_test_user():
    conn = await asyncpg.connect(
        host='localhost',
        port=5432,
        user='ai_interviewer_user',
        password='ai_interviewer_password',
        database='ai_interviewer_db'
    )
    
    # Get a valid company_id (use the first one)
    company = await conn.fetchrow("SELECT id FROM companies LIMIT 1")
    if not company:
        print("No companies found! Cannot create user.")
        await conn.close()
        return
    
    company_id = company['id']
    print(f"Using company_id: {company_id}")
    
    # Hash the password
    password = "Test1234!"
    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    print(f"Password hash created: {hashed[:30]}...")
    
    # Check if user already exists
    existing = await conn.fetchrow("SELECT id FROM users WHERE email = 'test@test.com'")
    if existing:
        # Update existing user
        await conn.execute("""
            UPDATE users SET 
                password_hash = $1,
                role = 'SYSTEM_ADMIN',
                is_active = true,
                email_verified = true
            WHERE email = 'test@test.com'
        """, hashed)
        print("Updated existing test@test.com user")
    else:
        # Create new user
        user_id = uuid4()
        await conn.execute("""
            INSERT INTO users (id, company_id, name, email, password_hash, role, is_active, email_verified, verification_attempts, created_at, updated_at)
            VALUES ($1, $2, 'Test Admin', 'test@test.com', $3, 'SYSTEM_ADMIN', true, true, 0, NOW(), NOW())
        """, user_id, company_id, hashed)
        print(f"Created new user test@test.com with id: {user_id}")
    
    await conn.close()
    
    # Verify login works
    import requests
    r = requests.post('http://localhost:8000/api/v1/auth/login', 
                     json={'email': 'test@test.com', 'password': 'Test1234!'},
                     timeout=10)
    print(f"\nLogin test: {r.status_code}")
    if r.status_code == 200:
        print("✓ LOGIN SUCCESSFUL!")
        print(f"Token: {r.json()['access_token'][:50]}...")
    else:
        print(f"✗ LOGIN FAILED: {r.json()}")

asyncio.run(create_test_user())
