import bcrypt
from sqlalchemy import create_engine, text

e = create_engine('postgresql://ai_interviewer_user:ai_interviewer_password@localhost:5432/ai_interviewer_db')
c = e.connect()
r = c.execute(text("SELECT email, password_hash FROM users WHERE email = 'hr@aiinterviewer.com'"))
row = r.fetchone()
if row:
    email, hashed = row
    print(f'Email: {email}')
    print(f'Hash: {hashed}')
    # Test password
    test_pass = 'HrPass123!'
    try:
        result = bcrypt.checkpw(test_pass.encode(), hashed.encode())
        print(f'Password valid: {result}')
    except Exception as ex:
        print(f'Error checking: {ex}')
else:
    print('User not found')
