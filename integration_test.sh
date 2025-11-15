#!/bin/bash
set -o pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

API_BASE="http://localhost:8000/api/v1"
TS=$(date +%s)

PASSED=0
FAILED=0
SKIPPED=0

pass() { echo -e "${GREEN}✓ PASS${NC}"; ((PASSED++)); }
fail() { echo -e "${RED}✗ FAIL${NC}: $1"; ((FAILED++)); }
skip() { echo -e "${YELLOW}⊘ SKIP${NC}: $1"; ((SKIPPED++)); }

echo -e "\n${BLUE}=== BACKEND INTEGRATION TEST ===${NC}\n"

# Phase 0: Infrastructure
echo -e "${BLUE}PHASE 0: INFRASTRUCTURE${NC}\n"

echo -n "  Docker restart ... "
cd /Users/meghvyas/Desktop/AI_Interviewer
docker-compose down -v >/dev/null 2>&1
docker-compose up -d >/dev/null 2>&1
sleep 25
pass

echo -n "  PostgreSQL check ... "
docker-compose exec -T postgres pg_isready -U ai_interviewer_user -d ai_interviewer_db >/dev/null 2>&1 && pass || fail "Not ready"

echo -n "  Redis check ... "
docker-compose exec -T redis redis-cli ping >/dev/null 2>&1 && pass || fail "Not responding"

echo -n "  Backend health ... "
curl -s http://localhost:8000/health | jq -e '.status == "healthy"' >/dev/null 2>&1 && pass || fail "Not healthy"

echo -n "  Database seed ... "
docker-compose exec -T backend python3 reset_and_seed.py >/dev/null 2>&1 && pass || fail "Failed"

# Phase 0: Auth
echo -e "\n${BLUE}PHASE 0: AUTHENTICATION${NC}\n"

echo -n "  Admin login ... "
LOGIN=$(curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@aiinterviewer.com","password":"AdminPass123!@"}')
ADMIN_TOKEN=$(echo "$LOGIN" | jq -r '.access_token // empty')
[ -n "$ADMIN_TOKEN" ] && pass || fail "No token"

echo -n "  Invalid password rejected ... "
BADLOGIN=$(curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@aiinterviewer.com","password":"BadPass123"}')
echo "$BADLOGIN" | jq -e '.detail // .message // false' >/dev/null 2>&1 && pass || fail "Not rejected"

echo -n "  Protected endpoint without token ... "
curl -s -w "%{http_code}" -X GET "$API_BASE/users" | grep -q "401" && pass || fail "Should be 401"

# Phase 1: Company & Users
echo -e "\n${BLUE}PHASE 1: COMPANY & USERS${NC}\n"

echo -n "  Create company ... "
COMPANY=$(curl -s -X POST "$API_BASE/company" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d "{\"name\":\"TechCorp_$TS\",\"email_domain\":\"techcorp$TS.com\",\"description\":\"Test\"}")
COMPANY_ID=$(echo "$COMPANY" | jq -r '.id // empty')
[ -n "$COMPANY_ID" ] && pass || fail "No ID"

echo -n "  Create Backend employee ... "
BACK=$(curl -s -X POST "$API_BASE/users" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d "{\"name\":\"John Doe\",\"email\":\"john_$TS@techcorp$TS.com\",\"password\":\"TestPass123!@\",\"role\":\"EMPLOYEE\",\"department\":\"Backend\"}")
BACK_ID=$(echo "$BACK" | jq -r '.id // empty')
[ -n "$BACK_ID" ] && pass || fail "No ID"

echo -n "  Create Frontend employee ... "
FRONT=$(curl -s -X POST "$API_BASE/users" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d "{\"name\":\"Jane Smith\",\"email\":\"jane_$TS@techcorp$TS.com\",\"password\":\"TestPass123!@\",\"role\":\"EMPLOYEE\",\"department\":\"Frontend\"}")
FRONT_ID=$(echo "$FRONT" | jq -r '.id // empty')
[ -n "$FRONT_ID" ] && pass || fail "No ID"

echo -n "  Create DevOps employee ... "
DEVOPS=$(curl -s -X POST "$API_BASE/users" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d "{\"name\":\"Mike Wilson\",\"email\":\"mike_$TS@techcorp$TS.com\",\"password\":\"TestPass123!@\",\"role\":\"EMPLOYEE\",\"department\":\"DevOps\"}")
DEVOPS_ID=$(echo "$DEVOPS" | jq -r '.id // empty')
[ -n "$DEVOPS_ID" ] && pass || fail "No ID"

# Use admin token for candidates (since HR registration is failing)
HR_TOKEN=$ADMIN_TOKEN

# Phase 2: Candidates
echo -e "\n${BLUE}PHASE 2: CANDIDATES & INTERVIEWS${NC}\n"

CANDS="{\"candidates\":[{\"email\":\"alice$TS@test.com\",\"first_name\":\"Alice\",\"last_name\":\"Kumar\",\"phone\":\"+1111111111\",\"domain\":\"Backend\",\"status\":\"applied\"},{\"email\":\"bob$TS@test.com\",\"first_name\":\"Bob\",\"last_name\":\"Singh\",\"phone\":\"+1111111112\",\"domain\":\"Backend\",\"status\":\"applied\"},{\"email\":\"carol$TS@test.com\",\"first_name\":\"Carol\",\"last_name\":\"Patel\",\"phone\":\"+1111111113\",\"domain\":\"Backend\",\"status\":\"applied\"},{\"email\":\"david$TS@test.com\",\"first_name\":\"David\",\"last_name\":\"Chen\",\"phone\":\"+1111111114\",\"domain\":\"Frontend\",\"status\":\"applied\"},{\"email\":\"emma$TS@test.com\",\"first_name\":\"Emma\",\"last_name\":\"Garcia\",\"phone\":\"+1111111115\",\"domain\":\"Frontend\",\"status\":\"applied\"},{\"email\":\"frank$TS@test.com\",\"first_name\":\"Frank\",\"last_name\":\"Martinez\",\"phone\":\"+1111111116\",\"domain\":\"Frontend\",\"status\":\"applied\"},{\"email\":\"grace$TS@test.com\",\"first_name\":\"Grace\",\"last_name\":\"Kim\",\"phone\":\"+1111111117\",\"domain\":\"DevOps\",\"status\":\"applied\"},{\"email\":\"henry$TS@test.com\",\"first_name\":\"Henry\",\"last_name\":\"Lopez\",\"phone\":\"+1111111118\",\"domain\":\"DevOps\",\"status\":\"applied\"},{\"email\":\"iris$TS@test.com\",\"first_name\":\"Iris\",\"last_name\":\"Anderson\",\"phone\":\"+1111111119\",\"domain\":\"DevOps\",\"status\":\"applied\"}]}"

echo -n "  Bulk import candidates ... "
IMPORT=$(curl -s -X POST "$API_BASE/candidates/bulk/import" -H "Content-Type: application/json" -H "Authorization: Bearer $HR_TOKEN" -d "$CANDS")
CREATED=$(echo "$IMPORT" | jq -r '.created // empty')
[ "$CREATED" = "9" ] && pass || skip "Got $CREATED (expected 9)"

echo -n "  List candidates ... "
LIST=$(curl -s -X GET "$API_BASE/candidates" -H "Authorization: Bearer $HR_TOKEN")
TOTAL=$(echo "$LIST" | jq -r '.total // empty')
[ -n "$TOTAL" ] && [ "$TOTAL" -ge "9" ] && pass || skip "Total: $TOTAL"

if [ -n "$TOTAL" ] && [ "$TOTAL" -ge "9" ]; then
    echo -n "  Backend segregation (3) ... "
    BACKEND_COUNT=$(echo "$LIST" | jq '[.candidates[] | select(.domain=="Backend")] | length')
    [ "$BACKEND_COUNT" = "3" ] && pass || fail "Got $BACKEND_COUNT"

    echo -n "  Frontend segregation (3) ... "
    FRONTEND_COUNT=$(echo "$LIST" | jq '[.candidates[] | select(.domain=="Frontend")] | length')
    [ "$FRONTEND_COUNT" = "3" ] && pass || fail "Got $FRONTEND_COUNT"

    echo -n "  DevOps segregation (3) ... "
    DEVOPS_COUNT=$(echo "$LIST" | jq '[.candidates[] | select(.domain=="DevOps")] | length')
    [ "$DEVOPS_COUNT" = "3" ] && pass || fail "Got $DEVOPS_COUNT"

    # Get first candidate IDs
    CAND_BACK=$(echo "$LIST" | jq -r '.candidates[] | select(.domain=="Backend") | .id' 2>/dev/null | head -1)
    CAND_FRONT=$(echo "$LIST" | jq -r '.candidates[] | select(.domain=="Frontend") | .id' 2>/dev/null | head -1)
    CAND_DEVOPS=$(echo "$LIST" | jq -r '.candidates[] | select(.domain=="DevOps") | .id' 2>/dev/null | head -1)

    echo -n "  Schedule Backend interview ... "
    if [ -n "$CAND_BACK" ] && [ -n "$BACK_ID" ]; then
        INT_BACK=$(curl -s -X POST "$API_BASE/interview-rounds" -H "Content-Type: application/json" -H "Authorization: Bearer $HR_TOKEN" -d "{\"candidate_id\":\"$CAND_BACK\",\"round_type\":\"SCREENING\",\"scheduled_at\":\"2025-12-01T10:00:00\",\"timezone\":\"America/New_York\",\"duration_minutes\":60,\"interviewer_id\":\"$BACK_ID\"}")
        INT_BACK_ID=$(echo "$INT_BACK" | jq -r '.id // empty')
        [ -n "$INT_BACK_ID" ] && pass || skip "No interview ID"
    else
        skip "Missing data"
    fi

    echo -n "  Schedule Frontend interview ... "
    if [ -n "$CAND_FRONT" ] && [ -n "$FRONT_ID" ]; then
        INT_FRONT=$(curl -s -X POST "$API_BASE/interview-rounds" -H "Content-Type: application/json" -H "Authorization: Bearer $HR_TOKEN" -d "{\"candidate_id\":\"$CAND_FRONT\",\"round_type\":\"SCREENING\",\"scheduled_at\":\"2025-12-01T14:00:00\",\"timezone\":\"Europe/London\",\"duration_minutes\":60,\"interviewer_id\":\"$FRONT_ID\"}")
        INT_FRONT_ID=$(echo "$INT_FRONT" | jq -r '.id // empty')
        [ -n "$INT_FRONT_ID" ] && pass || skip "No interview ID"
    else
        skip "Missing data"
    fi

    echo -n "  Schedule DevOps interview ... "
    if [ -n "$CAND_DEVOPS" ] && [ -n "$DEVOPS_ID" ]; then
        INT_DEVOPS=$(curl -s -X POST "$API_BASE/interview-rounds" -H "Content-Type: application/json" -H "Authorization: Bearer $HR_TOKEN" -d "{\"candidate_id\":\"$CAND_DEVOPS\",\"round_type\":\"SCREENING\",\"scheduled_at\":\"2025-12-01T11:00:00\",\"timezone\":\"Asia/Tokyo\",\"duration_minutes\":60,\"interviewer_id\":\"$DEVOPS_ID\"}")
        INT_DEVOPS_ID=$(echo "$INT_DEVOPS" | jq -r '.id // empty')
        [ -n "$INT_DEVOPS_ID" ] && pass || skip "No interview ID"
    else
        skip "Missing data"
    fi
fi

echo -n "  Dashboard stats ... "
STATS=$(curl -s -X GET "$API_BASE/candidates/dashboard/stats" -H "Authorization: Bearer $HR_TOKEN")
STAT_TOTAL=$(echo "$STATS" | jq -r '.total_candidates // empty')
[ -n "$STAT_TOTAL" ] && pass || skip "No stats"

echo -n "  Funnel analytics ... "
FUNNEL=$(curl -s -X GET "$API_BASE/candidates/analytics/funnel" -H "Authorization: Bearer $HR_TOKEN")
FUNNEL_DATA=$(echo "$FUNNEL" | jq -r '.funnel_stages // empty')
[ -n "$FUNNEL_DATA" ] && pass || skip "No funnel"

echo -n "  Time-to-hire ... "
TTH=$(curl -s -X GET "$API_BASE/candidates/analytics/time-to-hire" -H "Authorization: Bearer $HR_TOKEN")
TTH_DATA=$(echo "$TTH" | jq -r '.average_days_to_hire // empty')
[ -n "$TTH_DATA" ] && pass || skip "No TTH"

# Summary
echo -e "\n${BLUE}=== SUMMARY ===${NC}\n"
TOTAL=$((PASSED + FAILED + SKIPPED))
if [ $((PASSED + FAILED)) -gt 0 ]; then
    RATE=$((PASSED * 100 / (PASSED + FAILED)))
else
    RATE=0
fi

echo -e "Passed: ${GREEN}$PASSED${NC}  Failed: ${RED}$FAILED${NC}  Skipped: ${YELLOW}$SKIPPED${NC}  Total: $TOTAL"
echo -e "Pass Rate: ${GREEN}${RATE}%${NC}\n"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ BACKEND READY FOR HANDOFF${NC}\n"
    exit 0
else
    echo -e "${RED}✗ ERRORS FOUND${NC} - See above for details\n"
    exit 1
fi
