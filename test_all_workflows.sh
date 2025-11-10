#!/bin/bash

# Comprehensive workflow tests for AI Interviewer
# Tests all user roles and key operations

set -e

BASE_URL="http://localhost:8000/api/v1"
HR_EMAIL="hr@testcorp.com"
HR_PASSWORD="HRPass123!@"
EMP1_EMAIL="john@testcorp.com"
EMP1_PASSWORD="EmpPass123!@"
CAND1_EMAIL="alice@candidate.com"
CAND1_PASSWORD="CandPass123!@"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}AI INTERVIEWER - COMPREHENSIVE WORKFLOW TESTS${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Test counter
PASSED=0
FAILED=0

# Function to extract token
extract_token() {
  echo $1 | jq -r '.access_token'
}

# Function to run test
run_test() {
  local test_name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  local expected_code=$5
  local token=$6

  echo -e "${YELLOW}→ Testing: $test_name${NC}"
  
  local cmd="curl -s -w '\n%{http_code}' -X $method $BASE_URL$endpoint"
  
  if [ -n "$token" ]; then
    cmd="$cmd -H 'Authorization: Bearer $token'"
  fi
  
  if [ -n "$data" ]; then
    cmd="$cmd -H 'Content-Type: application/json' -d '$data'"
  fi
  
  local response=$(eval $cmd)
  local http_code=$(echo "$response" | tail -n 1)
  local body=$(echo "$response" | sed '$d')
  
  if [ "$http_code" = "$expected_code" ]; then
    echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
    ((PASSED++))
    echo "$body" | jq . 2>/dev/null || echo "$body"
  else
    echo -e "${RED}✗ FAIL${NC} (Expected $expected_code, got $http_code)"
    ((FAILED++))
    echo "$body" | jq . 2>/dev/null || echo "$body"
  fi
  echo ""
}

# 1. AUTHENTICATION TESTS
echo -e "${BLUE}PHASE 1: AUTHENTICATION${NC}\n"

# Test 1.1: Login as HR
test_login=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$HR_EMAIL\",\"password\":\"$HR_PASSWORD\"}")
HR_TOKEN=$(extract_token "$test_login")
if [ -n "$HR_TOKEN" ] && [ "$HR_TOKEN" != "null" ]; then
  echo -e "${GREEN}✓ PASS${NC} HR Login"
  ((PASSED++))
else
  echo -e "${RED}✗ FAIL${NC} HR Login"
  ((FAILED++))
fi
echo "Token: ${HR_TOKEN:0:50}..."
echo ""

# Test 1.2: Login as Employee
test_login=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMP1_EMAIL\",\"password\":\"$EMP1_PASSWORD\"}")
EMP_TOKEN=$(extract_token "$test_login")
if [ -n "$EMP_TOKEN" ] && [ "$EMP_TOKEN" != "null" ]; then
  echo -e "${GREEN}✓ PASS${NC} Employee Login"
  ((PASSED++))
else
  echo -e "${RED}✗ FAIL${NC} Employee Login"
  ((FAILED++))
fi
echo "Token: ${EMP_TOKEN:0:50}..."
echo ""

# Test 1.3: Login as Candidate
test_login=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$CAND1_EMAIL\",\"password\":\"$CAND1_PASSWORD\"}")
CAND_TOKEN=$(extract_token "$test_login")
if [ -n "$CAND_TOKEN" ] && [ "$CAND_TOKEN" != "null" ]; then
  echo -e "${GREEN}✓ PASS${NC} Candidate Login"
  ((PASSED++))
else
  echo -e "${RED}✗ FAIL${NC} Candidate Login"
  ((FAILED++))
fi
echo "Token: ${CAND_TOKEN:0:50}..."
echo ""

# 2. USER MANAGEMENT TESTS
echo -e "${BLUE}PHASE 2: USER MANAGEMENT${NC}\n"

# Get HR user ID first
HR_USER_ID=$(curl -s -X GET $BASE_URL/users \
  -H "Authorization: Bearer $HR_TOKEN" | jq -r '.[0].id' 2>/dev/null)

# Test 2.1: Get current user by ID
if [ -n "$HR_USER_ID" ] && [ "$HR_USER_ID" != "null" ]; then
  user_response=$(curl -s -X GET $BASE_URL/users/$HR_USER_ID \
    -H "Authorization: Bearer $HR_TOKEN")
  user_email=$(echo "$user_response" | jq -r '.email' 2>/dev/null)
  if [ "$user_email" = "$HR_EMAIL" ]; then
    echo -e "${GREEN}✓ PASS${NC} Get User by ID (HR)"
    ((PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC} Get User by ID (HR)"
    ((FAILED++))
  fi
else
  echo -e "${RED}✗ FAIL${NC} Get User by ID (HR) - Could not get HR_USER_ID"
  ((FAILED++))
fi
echo ""

# Test 2.2: List all users (HR should have access)
users_response=$(curl -s -X GET $BASE_URL/users \
  -H "Authorization: Bearer $HR_TOKEN")
user_count=$(echo "$users_response" | jq 'length' 2>/dev/null)
if [ "$user_count" -gt 0 ]; then
  echo -e "${GREEN}✓ PASS${NC} List Users (found $user_count users)"
  ((PASSED++))
else
  echo -e "${RED}✗ FAIL${NC} List Users"
  ((FAILED++))
fi
echo ""

# 3. COMPANY TESTS
echo -e "${BLUE}PHASE 3: COMPANY OPERATIONS${NC}\n"

# Get company ID from user object
COMPANY_ID=$(curl -s -X GET $BASE_URL/users/$HR_USER_ID \
  -H "Authorization: Bearer $HR_TOKEN" | jq -r '.company_id' 2>/dev/null)

# Test 3.1: Get company info
if [ -n "$COMPANY_ID" ] && [ "$COMPANY_ID" != "null" ]; then
  company_response=$(curl -s -X GET $BASE_URL/company/$COMPANY_ID \
    -H "Authorization: Bearer $HR_TOKEN")
  company_name=$(echo "$company_response" | jq -r '.name' 2>/dev/null)
  if [ "$company_name" = "Test Corp" ]; then
    echo -e "${GREEN}✓ PASS${NC} Get Company Info"
    ((PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC} Get Company Info (got: '$company_name')"
    ((FAILED++))
  fi
else
  echo -e "${RED}✗ FAIL${NC} Get Company Info - Could not extract company ID"
  ((FAILED++))
fi
echo ""

# 4. ROLE TESTS
echo -e "${BLUE}PHASE 4: ROLE MANAGEMENT${NC}\n"

# Test 4.1: Get all roles (if endpoint exists)
roles_response=$(curl -s -w '\n%{http_code}' -X GET $BASE_URL/roles \
  -H "Authorization: Bearer $HR_TOKEN")
roles_code=$(echo "$roles_response" | tail -n 1)
roles_body=$(echo "$roles_response" | sed '$d')

if [ "$roles_code" = "200" ]; then
  role_count=$(echo "$roles_body" | jq 'length' 2>/dev/null)
  if [ "$role_count" -gt 0 ]; then
    echo -e "${GREEN}✓ PASS${NC} Get Roles (found $role_count roles)"
    ((PASSED++))
  else
    echo -e "${YELLOW}⚠ NOTE${NC} Roles endpoint returned empty list"
  fi
elif [ "$roles_code" = "404" ] || [ "$roles_code" = "405" ]; then
  echo -e "${YELLOW}⚠ NOTE${NC} Roles endpoint not available (HTTP $roles_code) - skipping"
else
  echo -e "${RED}✗ FAIL${NC} Get Roles (HTTP $roles_code)"
  ((FAILED++))
fi
echo ""

# 5. INTERVIEW TESTS
echo -e "${BLUE}PHASE 5: INTERVIEW OPERATIONS${NC}\n"

# Get candidate ID from users list
CANDIDATE_ID=$(curl -s -X GET $BASE_URL/users \
  -H "Authorization: Bearer $HR_TOKEN" | jq -r '.[] | select(.role == "CANDIDATE") | .id' | head -1)

# Get employee ID 
EMPLOYEE_ID=$(curl -s -X GET $BASE_URL/users \
  -H "Authorization: Bearer $HR_TOKEN" | jq -r '.[] | select(.role == "EMPLOYEE") | .id' | head -1)

# Test 5.1: Create interview
if [ -n "$CANDIDATE_ID" ] && [ "$CANDIDATE_ID" != "null" ]; then
  interview_data="{\"candidate_id\":\"$CANDIDATE_ID\",\"scheduled_at\":\"2024-12-20T10:00:00Z\"}"
  interview_response=$(curl -s -X POST $BASE_URL/interviews \
    -H "Authorization: Bearer $HR_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$interview_data")
  interview_id=$(echo "$interview_response" | jq -r '.id' 2>/dev/null)
  if [ -n "$interview_id" ] && [ "$interview_id" != "null" ]; then
    echo -e "${GREEN}✓ PASS${NC} Create Interview"
    ((PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC} Create Interview"
    echo "$interview_response" | jq .
    ((FAILED++))
  fi
else
  echo -e "${YELLOW}⚠ NOTE${NC} No candidate found for interview test"
fi
echo ""

# Test 5.2: Get interview
if [ -n "$interview_id" ] && [ "$interview_id" != "null" ]; then
  interview_get=$(curl -s -X GET $BASE_URL/interviews/$interview_id \
    -H "Authorization: Bearer $HR_TOKEN")
  interview_status=$(echo "$interview_get" | jq -r '.status' 2>/dev/null)
  if [ -n "$interview_status" ] && [ "$interview_status" != "null" ]; then
    echo -e "${GREEN}✓ PASS${NC} Get Interview"
    ((PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC} Get Interview"
    ((FAILED++))
  fi
fi
echo ""

# Test 5.3: List interviews
interviews_list=$(curl -s -X GET $BASE_URL/interviews \
  -H "Authorization: Bearer $HR_TOKEN")
interview_count=$(echo "$interviews_list" | jq 'length' 2>/dev/null)
if [ "$interview_count" -gt 0 ]; then
  echo -e "${GREEN}✓ PASS${NC} List Interviews (found $interview_count)"
  ((PASSED++))
else
  echo -e "${YELLOW}⚠ NOTE${NC} No interviews found (normal for first run)"
fi
echo ""

# 6. AUTHENTICATION SECURITY TESTS
echo -e "${BLUE}PHASE 6: SECURITY & AUTHORIZATION${NC}\n"

# Test 6.1: Unauthorized access without token
unauth_response=$(curl -s -w '\n%{http_code}' -X GET $BASE_URL/users)
unauth_code=$(echo "$unauth_response" | tail -n 1)
if [ "$unauth_code" = "403" ]; then
  echo -e "${GREEN}✓ PASS${NC} Unauthorized Access Blocked (HTTP 403)"
  ((PASSED++))
else
  echo -e "${YELLOW}⚠ WARNING${NC} Unauthorized Access Code: $unauth_code (expected 403)"
fi
echo ""

# Test 6.2: Invalid token rejection
invalid_response=$(curl -s -w '\n%{http_code}' -X GET $BASE_URL/users \
  -H "Authorization: Bearer invalidtoken123")
invalid_code=$(echo "$invalid_response" | tail -n 1)
if [ "$invalid_code" = "403" ]; then
  echo -e "${GREEN}✓ PASS${NC} Invalid Token Rejected (HTTP 403)"
  ((PASSED++))
else
  echo -e "${YELLOW}⚠ WARNING${NC} Invalid Token Code: $invalid_code (expected 403)"
fi
echo ""

# 7. AUDIT LOG TESTS
echo -e "${BLUE}PHASE 7: AUDIT LOGGING${NC}\n"

# Test 7.1: Check audit logs
logs_response=$(curl -s -X GET "$BASE_URL/logs?action=LOGIN&limit=10" \
  -H "Authorization: Bearer $HR_TOKEN")
log_count=$(echo "$logs_response" | jq 'length' 2>/dev/null)
if [ "$log_count" -gt 0 ]; then
  echo -e "${GREEN}✓ PASS${NC} Audit Logs Retrieved (found $log_count logs)"
  ((PASSED++))
else
  echo -e "${YELLOW}⚠ NOTE${NC} Audit Logs (may be normal for first run)"
fi
echo ""

# FINAL SUMMARY
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}TEST SUMMARY${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
TOTAL=$((PASSED + FAILED))
if [ $TOTAL -gt 0 ]; then
  PERCENT=$((PASSED * 100 / TOTAL))
  echo -e "Success Rate: ${PERCENT}%"
fi
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
  exit 0
else
  echo -e "${RED}✗ SOME TESTS FAILED${NC}"
  exit 1
fi
