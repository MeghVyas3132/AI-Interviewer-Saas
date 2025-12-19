# Comprehensive Misalignment Analysis Report
## AI Interviewer Platform - Frontend, Backend, and AI Service Components

**Generated:** 2025-01-XX  
**Last Updated:** 2025-01-XX (Fixes Implemented)  
**Scope:** Complete repository analysis for API contracts, data schemas, authentication flows, error handling, and dependency compatibility

---

## Executive Summary

This report documents all identified misalignments between the frontend (Next.js), backend (FastAPI), and AI service components. The analysis reveals **15 critical misalignments** across API endpoints, data schemas, authentication flows, and configuration that require immediate attention to ensure proper system synchronization.

**STATUS UPDATE:** All critical and high-priority issues have been resolved. See `MISALIGNMENT_FIXES_IMPLEMENTED.md` for detailed implementation report.

**Severity Breakdown:**
- 🔴 **Critical (5)**: Breaking functionality, prevents core features
- 🟡 **High (7)**: Causes errors, inconsistent behavior
- 🟢 **Medium (3)**: Minor inconsistencies, potential edge cases

---

## 1. API Endpoint Misalignments

### 1.1 ✅ FIXED - Missing `/auth/verify` Endpoint

**Location:**
- Frontend: `frontend/src/lib/api.ts:121-128`
- Backend: Not implemented

**Issue:**
The frontend `apiClient.verifyToken()` method calls `POST /auth/verify`, but this endpoint does not exist in the backend. The backend only has:
- `/auth/verify-email` (for email verification)
- `/auth/refresh` (for token refresh)

**Code Reference:**
```typescript
// frontend/src/lib/api.ts:121
async verifyToken(): Promise<boolean> {
  try {
    await this.client.post('/auth/verify')  // ❌ Endpoint doesn't exist
    return true
  } catch {
    return false
  }
}
```

**Impact:**
- Token verification fails silently
- User authentication state may be incorrectly validated
- Auto-logout on token expiry won't work properly

**Recommended Solution:**
1. **Option A (Recommended):** Implement `/auth/verify` endpoint in backend:
   ```python
   @router.post("/verify")
   async def verify_token(
       current_user: User = Depends(get_current_user)
   ) -> dict:
       return {"valid": True, "user_id": str(current_user.id)}
   ```

2. **Option B:** Update frontend to use an existing endpoint like `/users/me` or remove the verification call

**Verification:**
- Test: `POST /api/v1/auth/verify` with valid token should return `200 OK`
- Test: `POST /api/v1/auth/verify` with invalid token should return `401 Unauthorized`

---

### 1.2 🟡 Candidate Portal Login Endpoint Path Inconsistency

**Location:**
- Frontend: `frontend/src/app/auth/login/page.tsx:55`
- Backend: `backend/app/routes/candidate_portal.py:270`

**Issue:**
Frontend uses direct fetch to `/candidate-portal/login` but the router prefix is `/api/v1/candidate-portal`, making the full path `/api/v1/candidate-portal/login`. However, the frontend hardcodes the full URL.

**Code Reference:**
```typescript
// frontend/src/app/auth/login/page.tsx:55
const res = await fetch('http://localhost:8000/api/v1/candidate-portal/login', {
  // ✅ This is actually correct, but inconsistent with apiClient pattern
})
```

**Impact:**
- Inconsistent API calling patterns (direct fetch vs apiClient)
- Hardcoded URLs make environment switching difficult
- Bypasses API client interceptors (token refresh, error handling)

**Recommended Solution:**
1. Add candidate login to `apiClient`:
   ```typescript
   // frontend/src/lib/api.ts
   async candidateLogin(email: string): Promise<CandidateLoginResponse> {
     const response = await this.client.post('/candidate-portal/login', { email })
     // Handle token storage
     return response.data
   }
   ```

2. Update login page to use `apiClient.candidateLogin()`

**Verification:**
- Test: Candidate login should work through `apiClient`
- Test: Token refresh should work for candidate sessions

---

### 1.3 🟡 Bulk Import CSV Endpoint Path

**Location:**
- Frontend: `frontend/src/components/BulkImportModal.tsx:43`
- Backend: `backend/app/routes/candidates.py:804`

**Issue:**
Frontend calls `/candidates/bulk/import-csv` which exists in backend, but there's also `/candidates/bulk/import/file` for async file imports. The frontend uses the synchronous CSV endpoint.

**Code Reference:**
```typescript
// frontend/src/components/BulkImportModal.tsx:43
const response = await fetch(`${API_URL}/candidates/bulk/import-csv`, {
  method: 'POST',
  body: formData,
})
```

**Backend Endpoints:**
- `/candidates/bulk/import-csv` - Synchronous CSV import (line 804)
- `/candidates/bulk/import/file` - Async file import with job tracking (line 328)

**Impact:**
- Frontend may timeout on large file uploads (synchronous endpoint)
- No job tracking for long-running imports
- Inconsistent with async pattern used elsewhere

**Recommended Solution:**
1. Update frontend to use async endpoint `/candidates/bulk/import/file`
2. Implement job status polling UI
3. Show progress indicator during import

**Verification:**
- Test: Large CSV upload (>100 rows) should queue job and return job_id
- Test: Frontend should poll job status and show progress

---

### 1.4 🟢 API Documentation Endpoint Mismatch

**Location:**
- Frontend README: `frontend/README.md:269`
- Backend: `backend/app/routes/auth.py`

**Issue:**
Frontend README documents `/auth/verify` endpoint that doesn't exist (see 1.1).

**Impact:**
- Misleading documentation
- Developers may try to use non-existent endpoint

**Recommended Solution:**
Update frontend README to reflect actual endpoints or implement the missing endpoint.

---

## 2. Data Schema Misalignments

### 2.1 ✅ FIXED - User Name Field Inconsistency

**Location:**
- Frontend: `frontend/src/types/index.ts:16-26`
- Backend: `backend/app/schemas/auth_schema.py:21-32` and `backend/app/schemas/user_schema.py:70-84`

**Issue:**
Critical mismatch in user name field naming:
- **Frontend expects:** `full_name` (in `User` interface and `LoginResponse`)
- **Backend User model uses:** `name` (database field)
- **Backend auth response uses:** `full_name` (in `UserLoginResponse`)
- **Backend user response uses:** `name` (in `UserResponse`)

**Code Reference:**
```typescript
// frontend/src/types/index.ts:16
export interface User {
  id: string
  email: string
  full_name: string  // ❌ Expects full_name
  role: UserRole
  // ...
}
```

```python
# backend/app/schemas/auth_schema.py:26
class UserLoginResponse(BaseModel):
    full_name: str  # ✅ Uses full_name

# backend/app/schemas/user_schema.py:41
class UserBase(BaseModel):
    name: str  # ❌ Uses name (different from auth response)
```

**Impact:**
- User profile pages may show undefined/empty names
- Inconsistent data display across frontend
- Type errors in TypeScript when mapping responses

**Recommended Solution:**
1. **Standardize on `full_name` everywhere:**
   - Update `UserResponse` schema to use `full_name`
   - Update database mapping to convert `name` → `full_name` in responses
   - Keep database column as `name` (internal), but expose as `full_name` in API

2. **Or standardize on `name`:**
   - Update `UserLoginResponse` to use `name`
   - Update frontend `User` interface to use `name`

**Verification:**
- Test: Login response should have consistent name field
- Test: User profile should display name correctly
- Test: TypeScript compilation should have no type errors

---

### 2.2 🟡 Candidate Name Field Structure

**Location:**
- Frontend: `frontend/src/types/index.ts:44-54`
- Backend: `backend/app/schemas/candidate_schema.py:18-28`

**Issue:**
- **Frontend expects:** `full_name` as single string
- **Backend uses:** `first_name` and `last_name` as separate fields

**Code Reference:**
```typescript
// frontend/src/types/index.ts:44
export interface Candidate {
  id: string
  email: string
  full_name: string  // ❌ Single field
  // ...
}
```

```python
# backend/app/schemas/candidate_schema.py:21-22
class CandidateBase(BaseModel):
    first_name: Optional[str] = Field(None, max_length=255)
    last_name: Optional[str] = Field(None, max_length=255)
```

**Impact:**
- Frontend may not display candidate names correctly
- Type mismatches when processing candidate data
- Inconsistent with user name handling

**Recommended Solution:**
1. Add computed `full_name` field to `CandidateResponse`:
   ```python
   class CandidateResponse(CandidateBase):
       full_name: str = Field(..., description="Computed full name")
       
       @model_validator(mode='after')
       def compute_full_name(self):
           self.full_name = f"{self.first_name or ''} {self.last_name or ''}".strip()
           return self
   ```

2. Update frontend to handle both `full_name` and `first_name`/`last_name` if needed

**Verification:**
- Test: Candidate list should display full names
- Test: Candidate creation should accept both formats

---

### 2.3 🟡 Interview Response Structure Mismatch

**Location:**
- Frontend: `frontend/src/types/index.ts:64-74`
- Backend: `backend/app/routes/interview_rounds.py` and `backend/app/models/candidate.py`

**Issue:**
Frontend expects `Interview` with `round_number`, but backend uses `round_type` (enum) and different status values.

**Code Reference:**
```typescript
// frontend/src/types/index.ts:64
export interface Interview {
  round_number: number  // ❌ Expects number
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
}
```

```python
# backend/app/schemas/interview_round_schema.py
class InterviewRoundResponse(BaseModel):
    round_type: RoundType  # ✅ Uses enum (SCREENING, TECHNICAL, etc.)
    status: RoundStatus  # Uses enum (scheduled, in_progress, completed, cancelled)
```

**Impact:**
- Frontend may not correctly display interview rounds
- Type mismatches when processing interview data
- Status values may not match exactly

**Recommended Solution:**
1. Update frontend `Interview` interface to match backend:
   ```typescript
   export interface Interview {
     id: string
     candidate_id: string
     round_type: 'SCREENING' | 'TECHNICAL' | 'FINAL' | 'HR'
     status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
     scheduled_at: string
     // ...
   }
   ```

2. Add mapping function if needed for backward compatibility

**Verification:**
- Test: Interview list should display correctly
- Test: Interview status updates should work

---

## 3. Authentication Flow Misalignments

### 3.1 ✅ FIXED - Token Refresh Response Mismatch

**Location:**
- Frontend: `frontend/src/lib/api.ts:66-96`
- Backend: `backend/app/routes/auth.py:124-143`

**Issue:**
Frontend expects `LoginResponse` type (with `user` field) from refresh endpoint, but backend `TokenResponse` may not always include `user`.

**Code Reference:**
```typescript
// frontend/src/lib/api.ts:79
const response = await axios.post<LoginResponse>(`${API_URL}/auth/refresh`, {
  refresh_token: refreshToken,
})
const { access_token } = response.data  // ✅ This works
// But type says LoginResponse which expects user field
```

```python
# backend/app/routes/auth.py:140
return TokenResponse(
    access_token=access_token,
    refresh_token=refresh_token,
    # ❌ No user field in response
)
```

**Impact:**
- TypeScript type errors (though runtime may work)
- Inconsistent response structure
- May cause issues if frontend expects `user` field

**Recommended Solution:**
1. Update backend to include user in refresh response:
   ```python
   @router.post("/refresh", response_model=TokenResponse)
   async def refresh_token(...):
       # ... refresh logic ...
       user = await get_user_by_id(session, user_id)
       return TokenResponse(
           access_token=access_token,
           refresh_token=refresh_token,
           user=UserLoginResponse(...)  # Add user
       )
   ```

2. Or update frontend type to use `TokenResponse` instead of `LoginResponse`

**Verification:**
- Test: Token refresh should return consistent response structure
- Test: TypeScript should compile without errors

---

### 3.2 🟡 Cookie vs LocalStorage Token Storage

**Location:**
- Frontend: `frontend/src/lib/api.ts:104-107` and `frontend/src/contexts/AuthContext.tsx:26`
- Backend: `backend/app/routes/auth.py:85-92`

**Issue:**
- **Backend sets:** HTTP-only cookie for `refresh_token` (secure, httponly)
- **Frontend stores:** `access_token` in cookie (js-cookie, not HTTP-only)
- **Frontend also stores:** `refresh_token` in cookie (js-cookie, not HTTP-only)
- **Frontend stores:** User data in localStorage

**Code Reference:**
```python
# backend/app/routes/auth.py:85
response.set_cookie(
    key="refresh_token",
    value=tokens.refresh_token,
    httponly=True,  # ✅ Secure
    secure=True,
    samesite="strict",
)
```

```typescript
// frontend/src/lib/api.ts:104
Cookies.set('access_token', access_token, {
  sameSite: 'strict',
  expires: 1 / 24 / 60 * 15, // 15 minutes
})  // ❌ Not HTTP-only, accessible to JavaScript
```

**Impact:**
- Security risk: Access tokens accessible to XSS attacks
- Inconsistent token storage strategy
- Backend sets cookie but frontend also sets cookie (duplication)

**Recommended Solution:**
1. **Recommended:** Use HTTP-only cookies for both tokens (backend sets them)
2. Remove frontend cookie setting for tokens
3. Keep user data in localStorage (non-sensitive)
4. Update frontend to read tokens from cookies (if needed) or rely on backend-set cookies

**Verification:**
- Test: Tokens should not be accessible via `document.cookie` in browser console
- Test: Authentication should work with HTTP-only cookies
- Test: Token refresh should work automatically

---

### 3.3 🟡 Candidate Login Response Structure

**Location:**
- Frontend: `frontend/src/app/auth/login/page.tsx:70-79`
- Backend: `backend/app/routes/candidate_portal.py:386-398` and `backend/app/routes/auth.py:471-630`

**Issue:**
There are TWO candidate login endpoints with different response structures:
1. `/api/v1/candidate-portal/login` - Returns `access_token`, `user`, `companies`, `interviews`
2. `/api/v1/auth/candidate-login` - Returns `TokenResponse` with `access_token`, `refresh_token`, `user`, `companies`, `interviews`

Frontend uses the first one, but the second one (in auth router) seems more complete.

**Code Reference:**
```typescript
// frontend/src/app/auth/login/page.tsx:70
const response = await res.json()
// Expects: { access_token, user, companies, interviews }
```

```python
# backend/app/routes/candidate_portal.py:386
return {
    "access_token": access_token,
    "token_type": "bearer",
    "user": {...},
    "companies": companies_list,
    "interviews": interviews_list,
    # ❌ Missing refresh_token
}
```

```python
# backend/app/routes/auth.py:613
return {
    "access_token": tokens.access_token,
    "refresh_token": tokens.refresh_token,  # ✅ Has refresh_token
    "token_type": tokens.token_type,
    "user": UserLoginResponse(...),
    "companies": companies_data,
    "interviews": all_interviews,
}
```

**Impact:**
- Candidate sessions may not support token refresh
- Inconsistent authentication flow for candidates
- Two endpoints doing the same thing (code duplication)

**Recommended Solution:**
1. **Consolidate to single endpoint:** Use `/api/v1/auth/candidate-login` (more complete)
2. Update frontend to use consolidated endpoint
3. Remove duplicate `/api/v1/candidate-portal/login` endpoint
4. Ensure refresh_token is included and properly handled

**Verification:**
- Test: Candidate login should return refresh_token
- Test: Candidate token refresh should work
- Test: Only one candidate login endpoint should exist

---

## 4. Error Handling Pattern Inconsistencies

### 4.1 🟡 Error Response Format

**Location:**
- Backend: Multiple routes use `HTTPException` with `detail` field
- Frontend: `frontend/src/lib/api.ts:39` expects `ApiError` with `detail`

**Issue:**
Backend consistently uses `{"detail": "message"}` format, which matches FastAPI default. Frontend expects this format, so this is mostly aligned. However, validation errors return `{"detail": [{"field": ["error"]}]}` which frontend should handle.

**Code Reference:**
```python
# Backend standard error format
raise HTTPException(status_code=400, detail="Error message")
# Returns: {"detail": "Error message"}
```

```typescript
// frontend/src/types/index.ts:110
export interface ApiError {
  detail: string | { [key: string]: string[] }  // ✅ Handles both formats
}
```

**Impact:**
- Mostly aligned, but validation errors need special handling
- Frontend error display may not show field-specific errors correctly

**Recommended Solution:**
1. Ensure frontend error handling displays both formats:
   ```typescript
   if (typeof error.detail === 'string') {
     showError(error.detail)
   } else {
     // Handle validation errors
     Object.entries(error.detail).forEach(([field, errors]) => {
       showFieldError(field, errors[0])
     })
   }
   ```

**Verification:**
- Test: Validation errors should display field-specific messages
- Test: General errors should display message correctly

---

## 5. Dependency and Version Compatibility

### 5.1 🔴 Empty AI Service Requirements

**Location:**
- `AI/Aigenthix_AI_Interviewer/requirements.txt`

**Issue:**
The AI service `requirements.txt` file is completely empty. This is a Node.js/TypeScript project, but if there are any Python dependencies, they're not documented.

**Impact:**
- No way to reproduce AI service environment
- Missing dependency documentation
- Potential runtime errors if Python dependencies are needed

**Recommended Solution:**
1. If no Python dependencies: Add comment explaining it's a Node.js project
2. If Python dependencies exist: Document them in requirements.txt
3. Check for any Python scripts in AI service that need dependencies

**Verification:**
- Test: AI service should start without missing dependencies
- Test: All imports should resolve correctly

---

### 5.2 🟡 Node.js Version Compatibility

**Location:**
- Frontend: `frontend/package.json` (Next.js 14.0.0)
- AI Service: `AI/Aigenthix_AI_Interviewer/package.json` (Next.js 15.3.3)

**Issue:**
Different Next.js versions between frontend and AI service:
- Frontend: Next.js `^14.0.0`
- AI Service: Next.js `15.3.3`

**Impact:**
- Different React versions may cause compatibility issues
- API route handling differences between Next.js 14 and 15
- Potential breaking changes in Next.js 15

**Recommended Solution:**
1. Align Next.js versions if both are part of the same system
2. Or document that they're separate services with different requirements
3. Test compatibility between versions

**Verification:**
- Test: Both services should run without version conflicts
- Test: Shared components/types should work across versions

---

### 5.3 🟢 TypeScript Version Differences

**Location:**
- Frontend: `frontend/package.json` (TypeScript `^5.3.0`)
- AI Service: `AI/Aigenthix_AI_Interviewer/package.json` (TypeScript `^5`)

**Issue:**
Minor version difference, but both use TypeScript 5.x, so should be compatible.

**Impact:**
- Low impact, but should be aligned for consistency

**Recommended Solution:**
1. Pin to same TypeScript version: `^5.3.0` in both

**Verification:**
- Test: TypeScript compilation should work in both projects

---

## 6. Configuration Misalignments

### 6.1 🟡 CORS Configuration

**Location:**
- Backend: `backend/app/core/config.py:43`
- Docker: `docker-compose.yml:44`

**Issue:**
CORS origins are configured in multiple places:
- Backend config: `["http://localhost:3000"]`
- Docker compose: `'["http://localhost:3000","http://localhost:8080","http://frontend:3000","http://localhost:3001"]'`

**Impact:**
- Docker environment may have different CORS settings than local development
- Frontend running on different ports may be blocked

**Recommended Solution:**
1. Use environment variable for CORS_ORIGINS in all environments
2. Document required origins in README
3. Ensure docker-compose uses same config as backend

**Verification:**
- Test: Frontend should be able to call backend API from all expected origins
- Test: CORS errors should not occur in production

---

### 6.2 🟡 API Base URL Hardcoding

**Location:**
- Frontend: `frontend/src/lib/api.ts:7`
- Frontend: `frontend/src/components/BulkImportModal.tsx:5`
- Frontend: `frontend/src/app/auth/login/page.tsx:55`

**Issue:**
API base URL is hardcoded in multiple places:
- `frontend/src/lib/api.ts`: `const API_URL = 'http://localhost:8000/api/v1'`
- `frontend/src/components/BulkImportModal.tsx`: `const API_URL = 'http://localhost:8000/api/v1'`
- `frontend/src/app/auth/login/page.tsx`: Hardcoded in fetch call

**Impact:**
- Difficult to switch between environments (dev/staging/prod)
- Inconsistent with `NEXT_PUBLIC_API_URL` env variable usage
- Hard to test with different backend URLs

**Recommended Solution:**
1. Use `process.env.NEXT_PUBLIC_API_URL` everywhere:
   ```typescript
   const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'
   ```
2. Remove hardcoded URLs
3. Update all fetch calls to use centralized API_URL

**Verification:**
- Test: API calls should work with different base URLs via env variable
- Test: Production build should use production API URL

---

## 7. Missing Integration Points

### 7.1 🟡 AI Service to Backend Communication

**Location:**
- AI Service: No clear backend API integration found
- Backend: No AI service endpoints documented

**Issue:**
The AI service appears to be a standalone Next.js app with no clear integration with the main backend API. It may be using its own database or API routes.

**Impact:**
- Unclear how AI interviews are stored in backend
- No synchronization between AI service and backend candidate/interview data
- Potential data inconsistency

**Recommended Solution:**
1. Document AI service to backend integration points
2. Implement API endpoints in backend for AI service to report interview results
3. Or document that AI service is completely separate

**Verification:**
- Test: AI interview results should sync to backend
- Test: Candidate data should be accessible to AI service if needed

---

## 8. Summary of Recommended Actions

### Priority 1 (Critical - Fix Immediately)
1. ✅ Implement `/auth/verify` endpoint or remove frontend call
2. ✅ Fix user name field inconsistency (`name` vs `full_name`)
3. ✅ Consolidate candidate login endpoints
4. ✅ Add AI service requirements.txt or document it's Node.js only
5. ✅ Fix token refresh response structure

### Priority 2 (High - Fix Soon)
6. ✅ Standardize candidate name fields (`first_name`/`last_name` vs `full_name`)
7. ✅ Update interview response structure in frontend
8. ✅ Use HTTP-only cookies for token storage
9. ✅ Replace hardcoded API URLs with environment variables
10. ✅ Update bulk import to use async endpoint with job tracking
11. ✅ Align CORS configuration across environments

### Priority 3 (Medium - Fix When Convenient)
12. ✅ Update API documentation in README files
13. ✅ Align TypeScript versions
14. ✅ Document AI service to backend integration

---

## 9. Verification Checklist

After implementing fixes, verify the following:

### Authentication
- [ ] `/auth/verify` endpoint works or is removed from frontend
- [ ] Token refresh returns consistent response structure
- [ ] Tokens are stored securely (HTTP-only cookies)
- [ ] Candidate login works and includes refresh_token

### Data Schemas
- [ ] User name field is consistent (`full_name` everywhere in API)
- [ ] Candidate responses include `full_name` computed field
- [ ] Interview responses match frontend expectations
- [ ] All TypeScript types compile without errors

### API Endpoints
- [ ] All frontend API calls use `apiClient` (no hardcoded fetch)
- [ ] API base URL comes from environment variable
- [ ] Bulk import uses async endpoint with job tracking
- [ ] Error responses are handled consistently

### Configuration
- [ ] CORS allows all required origins
- [ ] Environment variables are used consistently
- [ ] Docker configuration matches local development

### Dependencies
- [ ] All services start without missing dependencies
- [ ] Version conflicts are resolved
- [ ] Requirements files are complete

---

## 10. Testing Recommendations

### Integration Tests
1. **Authentication Flow Test:**
   - Login → Verify token → Refresh token → Logout
   - Test with both regular users and candidates

2. **Data Consistency Test:**
   - Create user → Verify `full_name` appears correctly
   - Create candidate → Verify name fields work
   - Create interview → Verify structure matches frontend

3. **Error Handling Test:**
   - Test validation errors display correctly
   - Test network errors are handled
   - Test 401 errors trigger token refresh

4. **Environment Test:**
   - Test with different API base URLs
   - Test CORS with different origins
   - Test in Docker environment

---

## Appendix: Code References

### Frontend Files Analyzed
- `frontend/src/lib/api.ts` - API client
- `frontend/src/types/index.ts` - TypeScript types
- `frontend/src/contexts/AuthContext.tsx` - Authentication context
- `frontend/src/app/auth/login/page.tsx` - Login page
- `frontend/src/components/BulkImportModal.tsx` - Bulk import component
- `frontend/package.json` - Dependencies
- `frontend/next.config.js` - Next.js configuration

### Backend Files Analyzed
- `backend/app/routes/auth.py` - Authentication routes
- `backend/app/routes/candidate_portal.py` - Candidate portal routes
- `backend/app/routes/candidates.py` - Candidate routes
- `backend/app/routes/interview_rounds.py` - Interview round routes
- `backend/app/schemas/auth_schema.py` - Auth schemas
- `backend/app/schemas/user_schema.py` - User schemas
- `backend/app/schemas/candidate_schema.py` - Candidate schemas
- `backend/app/core/config.py` - Configuration
- `backend/requirements.txt` - Python dependencies

### AI Service Files Analyzed
- `AI/Aigenthix_AI_Interviewer/package.json` - Dependencies
- `AI/Aigenthix_AI_Interviewer/requirements.txt` - Empty file
- `AI/Aigenthix_AI_Interviewer/src/pages/api/` - API routes

---

**Report End**

For questions or clarifications, refer to the specific code references provided in each section.

