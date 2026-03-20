#!/usr/bin/env bash
set -euo pipefail

API="http://localhost:8000/api/v1"
TS="$(date +%s)"

ADMIN_LOGIN="$(curl -sS -X POST "$API/auth/login" -H 'Content-Type: application/json' -d '{"email":"admin@aiinterviewer.com","password":"AdminPass123!@"}')"
ADMIN_TOKEN="$(echo "$ADMIN_LOGIN" | jq -r '.access_token // empty')"
if [ -z "$ADMIN_TOKEN" ]; then
	echo "Admin login failed:" >&2
	echo "$ADMIN_LOGIN" | jq . >&2
	exit 1
fi

COMP1_NAME="AcmeData_${TS}"
COMP2_NAME="BetaVision_${TS}"
DOM1="acmedata${TS}.com"
DOM2="betavision${TS}.com"

COMP1_RESP="$(curl -sS -X POST "$API/company" -H 'Content-Type: application/json' -H "Authorization: Bearer $ADMIN_TOKEN" -d "{\"name\":\"$COMP1_NAME\",\"email_domain\":\"$DOM1\",\"description\":\"Data platform\"}")"
COMP2_RESP="$(curl -sS -X POST "$API/company" -H 'Content-Type: application/json' -H "Authorization: Bearer $ADMIN_TOKEN" -d "{\"name\":\"$COMP2_NAME\",\"email_domain\":\"$DOM2\",\"description\":\"Vision AI\"}")"
COMP1_ID="$(echo "$COMP1_RESP" | jq -r '.id // empty')"
COMP2_ID="$(echo "$COMP2_RESP" | jq -r '.id // empty')"
if [ -z "$COMP1_ID" ] || [ -z "$COMP2_ID" ]; then
	echo "Company creation failed:" >&2
	echo "$COMP1_RESP" | jq . >&2
	echo "$COMP2_RESP" | jq . >&2
	exit 1
fi

HR_PASS="HrPass123Aa"
HR1_EMAIL="hr1_${TS}@${DOM1}"
HR2_EMAIL="hr2_${TS}@${DOM2}"

HR1_REG="$(curl -sS -X POST "$API/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"$HR1_EMAIL\",\"password\":\"$HR_PASS\",\"full_name\":\"HR One\",\"company_id\":\"$COMP1_ID\"}")"
HR2_REG="$(curl -sS -X POST "$API/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"$HR2_EMAIL\",\"password\":\"$HR_PASS\",\"full_name\":\"HR Two\",\"company_id\":\"$COMP2_ID\"}")"
HR1_TOKEN="$(echo "$HR1_REG" | jq -r '.access_token // empty')"
HR2_TOKEN="$(echo "$HR2_REG" | jq -r '.access_token // empty')"
if [ -z "$HR1_TOKEN" ] || [ -z "$HR2_TOKEN" ]; then
	echo "HR registration/token creation failed:" >&2
	echo "$HR1_REG" | jq . >&2
	echo "$HR2_REG" | jq . >&2
	exit 1
fi

CAND_EMAIL="shared.candidate.${TS}@mailinator.com"
JD1="Senior Data Engineer"
JD2="Computer Vision ML Engineer"

EMP1_EMAIL="emp1_${TS}@${DOM1}"
EMP2_EMAIL="emp2_${TS}@${DOM2}"

EMP1_CREATE="$(curl -sS -X POST "$API/users" -H 'Content-Type: application/json' -H "Authorization: Bearer $HR1_TOKEN" -d "{\"name\":\"Employee One\",\"email\":\"$EMP1_EMAIL\",\"password\":\"$HR_PASS\",\"role\":\"EMPLOYEE\",\"department\":\"Engineering\"}")"
EMP2_CREATE="$(curl -sS -X POST "$API/users" -H 'Content-Type: application/json' -H "Authorization: Bearer $HR2_TOKEN" -d "{\"name\":\"Employee Two\",\"email\":\"$EMP2_EMAIL\",\"password\":\"$HR_PASS\",\"role\":\"EMPLOYEE\",\"department\":\"Engineering\"}")"
EMP1_ID="$(echo "$EMP1_CREATE" | jq -r '.id // empty')"
EMP2_ID="$(echo "$EMP2_CREATE" | jq -r '.id // empty')"
if [ -z "$EMP1_ID" ] || [ -z "$EMP2_ID" ]; then
	echo "Employee creation failed:" >&2
	echo "$EMP1_CREATE" | jq . >&2
	echo "$EMP2_CREATE" | jq . >&2
	exit 1
fi

JOB1_CREATE="$(curl -sS -X POST "$API/jobs" -H 'Content-Type: application/json' -H "Authorization: Bearer $HR1_TOKEN" -d "{\"title\":\"$JD1\",\"description\":\"JD for data engineering role\"}")"
JOB2_CREATE="$(curl -sS -X POST "$API/jobs" -H 'Content-Type: application/json' -H "Authorization: Bearer $HR2_TOKEN" -d "{\"title\":\"$JD2\",\"description\":\"JD for computer vision role\"}")"
JOB1_ID="$(echo "$JOB1_CREATE" | jq -r '.id // empty')"
JOB2_ID="$(echo "$JOB2_CREATE" | jq -r '.id // empty')"
if [ -z "$JOB1_ID" ] || [ -z "$JOB2_ID" ]; then
	echo "Job template creation failed:" >&2
	echo "$JOB1_CREATE" | jq . >&2
	echo "$JOB2_CREATE" | jq . >&2
	exit 1
fi

C1_RESP="$(curl -sS -X POST "$API/candidates" -H 'Content-Type: application/json' -H "Authorization: Bearer $HR1_TOKEN" -d "{\"email\":\"$CAND_EMAIL\",\"first_name\":\"Shared\",\"last_name\":\"Candidate\",\"domain\":\"Data\",\"position\":\"$JD1\"}")"
C2_RESP="$(curl -sS -X POST "$API/candidates" -H 'Content-Type: application/json' -H "Authorization: Bearer $HR2_TOKEN" -d "{\"email\":\"$CAND_EMAIL\",\"first_name\":\"Shared\",\"last_name\":\"Candidate\",\"domain\":\"AI\",\"position\":\"$JD2\"}")"
C1_ID="$(echo "$C1_RESP" | jq -r '.id // empty')"
C2_ID="$(echo "$C2_RESP" | jq -r '.id // empty')"
if [ -z "$C1_ID" ] || [ -z "$C2_ID" ]; then
	echo "Candidate creation failed:" >&2
	echo "$C1_RESP" | jq . >&2
	echo "$C2_RESP" | jq . >&2
	exit 1
fi

ASSIGN1="$(curl -sS -X POST "$API/hr/candidates/$C1_ID/assign?employee_id=$EMP1_ID" -H "Authorization: Bearer $HR1_TOKEN")"
ASSIGN2="$(curl -sS -X POST "$API/hr/candidates/$C2_ID/assign?employee_id=$EMP2_ID" -H "Authorization: Bearer $HR2_TOKEN")"
if ! echo "$ASSIGN1" | jq -e '.employee_id' >/dev/null; then
	echo "Candidate assignment failed for company 1:" >&2
	echo "$ASSIGN1" | jq . >&2
	exit 1
fi
if ! echo "$ASSIGN2" | jq -e '.employee_id' >/dev/null; then
	echo "Candidate assignment failed for company 2:" >&2
	echo "$ASSIGN2" | jq . >&2
	exit 1
fi

EMP1_LOGIN="$(curl -sS -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMP1_EMAIL\",\"password\":\"$HR_PASS\"}")"
EMP2_LOGIN="$(curl -sS -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMP2_EMAIL\",\"password\":\"$HR_PASS\"}")"
EMP1_TOKEN="$(echo "$EMP1_LOGIN" | jq -r '.access_token // empty')"
EMP2_TOKEN="$(echo "$EMP2_LOGIN" | jq -r '.access_token // empty')"
if [ -z "$EMP1_TOKEN" ] || [ -z "$EMP2_TOKEN" ]; then
	echo "Employee login failed:" >&2
	echo "$EMP1_LOGIN" | jq . >&2
	echo "$EMP2_LOGIN" | jq . >&2
	exit 1
fi

ASSIGN_JOB1="$(curl -sS -X PUT "$API/employee/my-candidates/$C1_ID/assign-job" -H 'Content-Type: application/json' -H "Authorization: Bearer $EMP1_TOKEN" -d "{\"job_id\":\"$JOB1_ID\"}")"
ASSIGN_JOB2="$(curl -sS -X PUT "$API/employee/my-candidates/$C2_ID/assign-job" -H 'Content-Type: application/json' -H "Authorization: Bearer $EMP2_TOKEN" -d "{\"job_id\":\"$JOB2_ID\"}")"
if ! echo "$ASSIGN_JOB1" | jq -e '.job_id' >/dev/null; then
	echo "Assign job failed for company 1:" >&2
	echo "$ASSIGN_JOB1" | jq . >&2
	exit 1
fi
if ! echo "$ASSIGN_JOB2" | jq -e '.job_id' >/dev/null; then
	echo "Assign job failed for company 2:" >&2
	echo "$ASSIGN_JOB2" | jq . >&2
	exit 1
fi

S1="$(date -u -v+1H +"%Y-%m-%dT%H:%M:%S")"
S2="$(date -u -v+2H +"%Y-%m-%dT%H:%M:%S")"

I1_RESP="$(curl -sS -X POST "$API/employee/my-candidates/$C1_ID/schedule-interview" -H 'Content-Type: application/json' -H "Authorization: Bearer $EMP1_TOKEN" -d "{\"scheduled_time\":\"$S1\",\"round\":\"screening\",\"timezone\":\"UTC\"}")"
I2_RESP="$(curl -sS -X POST "$API/employee/my-candidates/$C2_ID/schedule-interview" -H 'Content-Type: application/json' -H "Authorization: Bearer $EMP2_TOKEN" -d "{\"scheduled_time\":\"$S2\",\"round\":\"technical\",\"timezone\":\"UTC\"}")"
I1_ID="$(echo "$I1_RESP" | jq -r '.interview.id // empty')"
I2_ID="$(echo "$I2_RESP" | jq -r '.interview.id // empty')"
if [ -z "$I1_ID" ] || [ -z "$I2_ID" ]; then
	echo "Interview scheduling failed:" >&2
	echo "$I1_RESP" | jq . >&2
	echo "$I2_RESP" | jq . >&2
	exit 1
fi

CAND_LOGIN="$(curl -sS -X POST "$API/candidate-portal/login" -H 'Content-Type: application/json' -d "{\"email\":\"$CAND_EMAIL\"}")"
CAND_TOKEN="$(echo "$CAND_LOGIN" | jq -r '.access_token // empty')"
if [ -z "$CAND_TOKEN" ]; then
	echo "Candidate login failed:" >&2
	echo "$CAND_LOGIN" | jq . >&2
	exit 1
fi
PORTAL="$(curl -sS -X GET "$API/candidate-portal/my-interviews" -H "Authorization: Bearer $CAND_TOKEN")"

if ! echo "$PORTAL" | jq -e '.interviews and (.interviews | type == "array")' >/dev/null; then
	echo "Candidate portal response missing interviews array:" >&2
	echo "$PORTAL" | jq . >&2
	exit 1
fi

echo "$PORTAL" | jq '{total, companies, interviews: [.interviews[] | {company_name, position, round, scheduled_time, status}]}'

echo "CAND_EMAIL=$CAND_EMAIL"
echo "COMPANY_1=$COMP1_NAME"
echo "COMPANY_2=$COMP2_NAME"

echo "$PORTAL" | jq -e '.interviews | length >= 2' >/dev/null

echo "PASS: Candidate portal includes both companies with different JD positions."
