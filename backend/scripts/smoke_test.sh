#!/usr/bin/env bash
# Simple smoke test for core flows (auth, create job, ATS check, list reports)
# Usage:
#   NEXT_PUBLIC_API_URL=http://localhost:8000 ./scripts/smoke_test.sh
# or set API_URL, HR_EMAIL, HR_PASSWORD env vars
set -euo pipefail
API_URL=${NEXT_PUBLIC_API_URL:-${API_URL:-http://localhost:8000}}
HR_EMAIL=${HR_EMAIL:-hr@example.com}
HR_PASSWORD=${HR_PASSWORD:-password}

echo "Using API: $API_URL"

# Login (HR credentials)
LOGIN_RESP=$(curl -s -X POST "$API_URL/api/v1/auth/login" -H "Content-Type: application/json" -d "{\"email\": \"$HR_EMAIL\", \"password\": \"$HR_PASSWORD\"}")
ACCESS_TOKEN=$(echo "$LOGIN_RESP" | jq -r '.access_token')
if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
  echo "Login failed: $LOGIN_RESP"
  exit 1
fi

echo "Logged in as HR. Token len: ${#ACCESS_TOKEN}"

# Create a job template (minimal)
CREATE_JOB=$(curl -s -X POST "$API_URL/api/v1/jobs" -H "Content-Type: application/json" -H "Authorization: Bearer $ACCESS_TOKEN" -d '{"title":"Smoke Test Job","description":"Smoke test job description"}')
JOB_ID=$(echo "$CREATE_JOB" | jq -r '.id')
if [ -z "$JOB_ID" ] || [ "$JOB_ID" = "null" ]; then
  echo "Job create failed: $CREATE_JOB"
  exit 1
fi

echo "Created job: $JOB_ID"

# Trigger generate questions
GEN_RESP=$(curl -s -X POST "$API_URL/api/v1/jobs/$JOB_ID/generate-questions" -H "Authorization: Bearer $ACCESS_TOKEN")
echo "Enqueued generate-questions: $GEN_RESP"

# Call ATS checker with simple resume text
ATS_RESP=$(curl -s -X POST "$API_URL/api/v1/ai/ats-check-and-save" -H "Content-Type: application/json" -H "Authorization: Bearer $ACCESS_TOKEN" -d '{"resume_text":"Experienced Python developer with SQL and FastAPI"}')
echo "ATS response: $ATS_RESP"

# List AI reports
REPORTS=$(curl -s -X GET "$API_URL/api/v1/ai/reports" -H "Authorization: Bearer $ACCESS_TOKEN")
echo "Reports: $REPORTS"

echo "Smoke test finished"
