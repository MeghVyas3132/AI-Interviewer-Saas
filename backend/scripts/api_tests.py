#!/usr/bin/env python3
"""
Simple API tester: logs in as admin and HR, calls a few endpoints to validate RBAC and behavior.
"""
import sys
import time
import json
from datetime import datetime, timedelta

try:
    import requests
except Exception:
    print("Missing dependency 'requests'. Please run: pip3 install requests")
    sys.exit(2)

API_BASE = "http://localhost:8000/api/v1"


def login(email, password):
    url = f"{API_BASE}/auth/login"
    r = requests.post(url, json={"email": email, "password": password}, timeout=10)
    print(f"LOGIN {email} -> status {r.status_code}")
    try:
        data = r.json()
    except Exception:
        data = r.text
    print("Response:", data)
    if r.status_code != 200:
        return None, None
    token = data.get("access_token")
    cookies = r.cookies.get_dict()
    return token, cookies


def api_get(path, token=None, cookies=None):
    url = f"{API_BASE}{path}"
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.get(url, headers=headers, cookies=cookies, timeout=10)
    print(f"GET {path} -> {r.status_code}")
    try:
        print(r.json())
    except Exception:
        print(r.text)
    return r


def api_post(path, payload, token=None, cookies=None):
    url = f"{API_BASE}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.post(url, headers=headers, cookies=cookies, json=payload, timeout=10)
    print(f"POST {path} -> {r.status_code}")
    try:
        print(r.json())
    except Exception:
        print(r.text)
    return r


if __name__ == '__main__':
    print("Starting API tests...")

    # 1) Login as SYSTEM_ADMIN (seeded)
    admin_email = "admin@aiinterviewer.com"
    admin_pass = "AdminPass123!@"
    admin_token, admin_cookies = login(admin_email, admin_pass)

    if admin_token:
        # admin endpoints
        api_get("/admin/companies", token=admin_token)
        api_get("/admin/system/metrics", token=admin_token)
        api_get("/admin/requests/pending", token=admin_token)
    else:
        print("Admin login failed; skipping admin endpoint checks.")

    # 2) Login as HR in test company
    hr_email = "hr@testcorp.com"
    hr_pass = "HRPass123!@"
    hr_token, hr_cookies = login(hr_email, hr_pass)

    if not hr_token:
        print("HR login failed; cannot continue HR-based tests.")
        sys.exit(1)

    # 3) Create a new candidate via HR
    candidate_email = f"api_test_candidate_{int(time.time())}@example.com"
    candidate_payload = {
        "email": candidate_email,
        "first_name": "APITest",
        "last_name": "Candidate",
        "phone": "+1-555-0100",
        "position": "Software Engineer",
        "domain": "Engineering",
        "experience_years": 3,
        "qualifications": "BSc Computer Science",
    }

    r = api_post("/candidates", candidate_payload, token=hr_token)
    if r.status_code == 201:
        candidate = r.json()
        candidate_id = candidate.get("id")
        print("Created candidate id:", candidate_id)
    else:
        print("Failed to create candidate; status", r.status_code)
        sys.exit(1)

    # 4) Schedule an interview for the candidate as HR
    scheduled_at = (datetime.utcnow() + timedelta(days=1)).replace(microsecond=0).isoformat() + "Z"
    round_payload = {
        "candidate_id": candidate_id,
        "round_type": "SCREENING",
        "scheduled_at": scheduled_at,
        "timezone": "UTC",
        "duration_minutes": 45,
        "notes": "Automated test scheduling",
    }

    r2 = api_post("/interview-rounds", round_payload, token=hr_token)
    if r2.status_code == 201:
        print("Interview round scheduled successfully.")
    else:
        print("Failed to schedule interview round; status", r2.status_code)
        sys.exit(1)

    print("API tests completed.")
