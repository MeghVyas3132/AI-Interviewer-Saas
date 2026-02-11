import requests

# Login as employee
login_response = requests.post(
    'http://localhost:8000/api/v1/auth/login',
    json={'email': 'arya@gmail.com', 'password': 'AdminPass123!'}
)

if login_response.status_code != 200:
    print(f'Login failed: {login_response.status_code}')
    print(login_response.text)
    exit(1)

token = login_response.json()['access_token']
print(f'Logged in as arya@gmail.com')

headers = {'Authorization': f'Bearer {token}'}

# Test pending-review endpoint
print('\n=== PENDING REVIEW ===')
response = requests.get('http://localhost:8000/api/v1/employee/pending-review', headers=headers)
print(f'Status: {response.status_code}')
if response.status_code == 200:
    data = response.json()
    print(f"Total: {data.get('total', 0)}")
    for c in data.get('candidates', []):
        print(f"  - {c.get('email')} | {c.get('status')} | verdict: {c.get('ai_verdict')}")
else:
    print(response.text)

# Test ready-for-round-2 endpoint  
print('\n=== READY FOR ROUND 2 ===')
response = requests.get('http://localhost:8000/api/v1/employee/ready-for-round-2', headers=headers)
print(f'Status: {response.status_code}')
if response.status_code == 200:
    data = response.json()
    print(f"Total: {data.get('total', 0)}")
    for c in data.get('candidates', []):
        print(f"  - {c.get('email')} | {c.get('status')}")
else:
    print(response.text)

# Test my-candidates endpoint
print('\n=== MY CANDIDATES ===')
response = requests.get('http://localhost:8000/api/v1/employee/my-candidates', headers=headers)
print(f'Status: {response.status_code}')
if response.status_code == 200:
    data = response.json()
    print(f"Total: {len(data)}")
    for c in data:
        print(f"  - {c.get('email')} | {c.get('status')}")
else:
    print(response.text)
