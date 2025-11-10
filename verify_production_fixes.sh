#!/bin/bash
# Production Fixes Verification Script
# Verifies all critical fixes are properly implemented

echo "🔍 Production Fixes Verification Script"
echo "======================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BACKEND_PATH="backend/app"
PASSED=0
FAILED=0

check() {
    local name=$1
    local file=$2
    local pattern=$3
    
    if grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "${GREEN}✅${NC} $name"
        ((PASSED++))
    else
        echo -e "${RED}❌${NC} $name (not found in $file)"
        ((FAILED++))
    fi
}

echo "📋 Checking File Structure..."
echo ""

# 1. Configuration Validation
echo "1️⃣  Configuration Validation:"
check "SECRET_KEY validation" "$BACKEND_PATH/core/config.py" "@field_validator.*secret_key"
check "Database URL validator" "$BACKEND_PATH/core/config.py" "@field_validator.*database_url"
check "Debug mode validator" "$BACKEND_PATH/core/config.py" "@field_validator.*debug"
echo ""

# 2. Connection Pooling
echo "2️⃣  Connection Pooling & Error Handling:"
check "Pool size config" "$BACKEND_PATH/core/database.py" "pool_size"
check "Max overflow config" "$BACKEND_PATH/core/database.py" "max_overflow"
check "Query timeout" "$BACKEND_PATH/core/database.py" "command_timeout"
check "Pool recycle" "$BACKEND_PATH/core/database.py" "pool_recycle"
check "Database error handling" "$BACKEND_PATH/core/database.py" "except.*Exception"
echo ""

# 3. Rate Limiting
echo "3️⃣  Rate Limiting Middleware:"
check "Rate limit middleware exists" "$BACKEND_PATH/middleware/rate_limit.py" "RateLimitMiddleware"
check "Rate limit on login" "$BACKEND_PATH/middleware/rate_limit.py" "/api/v1/auth/login"
check "Redis rate limit" "$BACKEND_PATH/middleware/rate_limit.py" "redis_client"
check "Rate limit in main.py" "$BACKEND_PATH/main.py" "RateLimitMiddleware"
echo ""

# 4. Token Blacklist
echo "4️⃣  Token Blacklist Service:"
check "Token blacklist service exists" "$BACKEND_PATH/services/token_blacklist_service.py" "TokenBlacklistService"
check "Add to blacklist method" "$BACKEND_PATH/services/token_blacklist_service.py" "add_to_blacklist"
check "Is blacklisted check" "$BACKEND_PATH/services/token_blacklist_service.py" "is_blacklisted"
check "Token blacklist in auth middleware" "$BACKEND_PATH/middleware/auth.py" "TokenBlacklistService"
check "Token blacklist in logout" "$BACKEND_PATH/routes/auth.py" "TokenBlacklistService"
echo ""

# 5. Password Complexity
echo "5️⃣  Password Complexity Validation:"
check "Password validation function" "$BACKEND_PATH/schemas/user_schema.py" "validate_password_complexity"
check "Uppercase requirement" "$BACKEND_PATH/schemas/user_schema.py" "[A-Z]"
check "Lowercase requirement" "$BACKEND_PATH/schemas/user_schema.py" "[a-z]"
check "Digit requirement" "$BACKEND_PATH/schemas/user_schema.py" "\\\\d"
check "Special char requirement" "$BACKEND_PATH/schemas/user_schema.py" "special character"
check "Validator on UserCreate" "$BACKEND_PATH/schemas/user_schema.py" "@field_validator.*password"
echo ""

# 6. Security Headers
echo "6️⃣  Security Headers Middleware:"
check "Security headers middleware exists" "$BACKEND_PATH/middleware/security_headers.py" "SecurityHeadersMiddleware"
check "X-Content-Type-Options header" "$BACKEND_PATH/middleware/security_headers.py" "X-Content-Type-Options"
check "X-Frame-Options header" "$BACKEND_PATH/middleware/security_headers.py" "X-Frame-Options"
check "Strict-Transport-Security header" "$BACKEND_PATH/middleware/security_headers.py" "Strict-Transport-Security"
check "Content-Security-Policy header" "$BACKEND_PATH/middleware/security_headers.py" "Content-Security-Policy"
check "Security headers in main.py" "$BACKEND_PATH/main.py" "SecurityHeadersMiddleware"
echo ""

# 7. Request Logging
echo "7️⃣  Request Logging Middleware:"
check "Request logging middleware exists" "$BACKEND_PATH/middleware/logging.py" "RequestLoggingMiddleware"
check "JSON structured logging" "$BACKEND_PATH/middleware/logging.py" "json.dumps"
check "Method logging" "$BACKEND_PATH/middleware/logging.py" "request.method"
check "Status code logging" "$BACKEND_PATH/middleware/logging.py" "status_code"
check "Response time logging" "$BACKEND_PATH/middleware/logging.py" "response_time_ms"
check "Client IP handling" "$BACKEND_PATH/middleware/logging.py" "x-forwarded-for"
check "Request logging in main.py" "$BACKEND_PATH/main.py" "RequestLoggingMiddleware"
echo ""

# 8. Health Check
echo "8️⃣  Enhanced Health Check:"
check "Health check endpoint" "$BACKEND_PATH/main.py" "@app.get.*health"
check "Database health check" "$BACKEND_PATH/main.py" "SELECT 1"
check "Redis health check" "$BACKEND_PATH/main.py" "redis_client.ping"
check "503 status code" "$BACKEND_PATH/main.py" "HTTP_503_SERVICE_UNAVAILABLE"
check "Health check response format" "$BACKEND_PATH/main.py" "db_status\|redis_status"
echo ""

# Summary
echo "======================================="
echo "📊 Verification Results"
echo "======================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All production fixes verified!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run pytest to verify integration"
    echo "2. Test rate limiting: for i in {1..10}; do curl -X POST http://localhost:8000/api/v1/auth/login ...; done"
    echo "3. Test token blacklist: login -> logout -> verify access_token rejected"
    echo "4. Check /health endpoint: curl http://localhost:8000/health"
    echo "5. Review security headers: curl -i http://localhost:8000/health"
else
    echo -e "${RED}❌ Some checks failed. Please review the implementation.${NC}"
fi
