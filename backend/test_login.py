import requests

# Test login directly
response = requests.post(
    "http://localhost:8000/api/v1/auth/login",
    json={
        "email": "hr@aiinterviewer.com",
        "password": "HrPass123!"
    },
    headers={"Content-Type": "application/json"}
)

print(f"Status: {response.status_code}")
print(f"Response: {response.text}")
