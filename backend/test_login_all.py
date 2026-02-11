import requests

users = [
    ('admin@aiinterviewer.com', 'AdminPass123!', 'SYSTEM_ADMIN'),
    ('hr@aiinterviewer.com', 'AdminPass123!', 'HR'),
    ('miesha@gmail.com', 'AdminPass123!', 'HR'),
    ('monali@gmail.com', 'AdminPass123!', 'HR'),
    ('megh@gmail.com', 'AdminPass123!', 'HR'),
    ('mili@gmail.com', 'AdminPass123!', 'HR'),
    ('mahibundela@gmail.com', 'AdminPass123!', 'EMPLOYEE'),
    ('arya@gmail.com', 'AdminPass123!', 'EMPLOYEE'),
]

print("Testing login for all seeded users:")
print("=" * 60)
for email, password, role in users:
    try:
        r = requests.post('http://localhost:8000/api/v1/auth/login', 
                         json={'email': email, 'password': password},
                         timeout=10)
        if r.status_code == 200:
            print(f"✓ {email} ({role}): LOGIN SUCCESS")
        else:
            print(f"✗ {email} ({role}): FAILED - {r.status_code} - {r.json().get('detail', r.text[:50])}")
    except Exception as e:
        print(f"✗ {email} ({role}): ERROR - {e}")

print("\n")
print("=" * 60)
print("VALID DEMO CREDENTIALS:")
print("=" * 60)
print("""
| Email                      | Password       | Role        |
|----------------------------|----------------|-------------|
| admin@aiinterviewer.com    | AdminPass123!  | SYSTEM_ADMIN|
| hr@aiinterviewer.com       | AdminPass123!  | HR          |
| miesha@gmail.com           | AdminPass123!  | HR          |
| mahibundela@gmail.com      | AdminPass123!  | EMPLOYEE    |
| arya@gmail.com             | AdminPass123!  | EMPLOYEE    |
""")
