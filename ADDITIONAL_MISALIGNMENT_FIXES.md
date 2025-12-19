# Additional Misalignment Fixes - Professional Interview Focus

**Date:** 2025-01-XX  
**Status:** In Progress  
**Scope:** Remove academic/educational content, fix remaining API issues, resolve port conflicts

---

## Executive Summary

This document addresses the additional misalignments identified, specifically:
1. Removal of all academic/educational exam content (CAT, NEET, JEE, college assessments)
2. Fixing remaining API endpoint mismatches
3. Resolving port conflicts between services
4. Creating integration layer between Main Backend and AI Service

---

## 1. API Endpoint Fixes

### 1.1 ✅ Single Candidate Assign Endpoint

**Status:** FIXED - Endpoint already exists at `/api/v1/hr/candidates/{candidate_id}/assign`

**Verification:**
- Backend: `backend/app/routes/hr.py:171-253` - POST endpoint exists
- Frontend: `frontend/src/app/assign-candidates/page.tsx:94` - Calls correct endpoint
- ✅ Endpoint path matches: `/hr/candidates/{id}/assign`

**Note:** The endpoint was already implemented. No changes needed.

---

### 1.2 ✅ Unassign Endpoint

**Status:** FIXED - Added DELETE endpoint

**Implementation:**
- Added `DELETE /api/v1/hr/candidates/{candidate_id}/assign` endpoint
- Matches frontend expectation: `apiClient.delete(\`/hr/candidates/${candidateId}/assign\`)`
- Maintains backward compatibility with POST `/revoke` endpoint

**Code Location:**
- `backend/app/routes/hr.py:256-306` - DELETE endpoint added

---

### 1.3 ✅ Candidate Name Field

**Status:** FIXED - Already resolved in previous fixes

**Implementation:**
- `CandidateResponse` now includes computed `full_name` field
- Frontend can access both `full_name` and `first_name`/`last_name`
- No breaking changes

---

## 2. Academic Content Removal Plan

### 2.1 Files to Remove/Update

**Academic Question Files:**
- ❌ `AI/Aigenthix_AI_Interviewer/cat_interview_questions.json` - CAT (MBA entrance) questions
- ❌ `AI/Aigenthix_AI_Interviewer/crt_interview_questions.json` - CRT (Campus Recruitment Test) questions
- ❌ `AI/Aigenthix_AI_Interviewer/src/ai/cat-question-reference.ts` - CAT question reference system
- ❌ `AI/Aigenthix_AI_Interviewer/src/ai/test-cat-questions.ts` - CAT testing utilities

**Files Requiring Content Updates:**
- `AI/Aigenthix_AI_Interviewer/src/ai/flows/interview-agent.ts` - Remove NEET, JEE, CAT, college references
- `AI/Aigenthix_AI_Interviewer/src/ai/flows/interview-question-generator.ts` - Remove college/CAT logic
- `AI/Aigenthix_AI_Interviewer/src/components/prepare-flow.tsx` - Remove academic exam options
- All API routes and components referencing academic exams

### 2.2 Content to Remove

**From Interview Agent:**
- NEET exam detection and handling
- JEE exam detection and handling  
- IIT Foundation exam handling
- CAT/MBA college-specific logic
- College admission process references
- Academic background detection
- Subject-specific academic questions (Physics, Chemistry, Biology for NEET)

**From Question Generator:**
- College-specific question generation
- CAT interview insights
- Academic exam question patterns
- College admission criteria references

**From UI Components:**
- Academic exam selection options
- College/university references
- Educational testing terminology

---

## 3. Port Conflict Resolution

### 3.1 Current Port Usage

**Main Frontend:**
- Development: Port 3000
- Docker: Port 3000 (mapped from container)

**AI Service:**
- Development: Port 9002 (from package.json)
- Docker: Port 9002 (exposed, mapped to 80 via nginx)

**Conflict:** Both services try to use port 9002 in Docker

### 3.2 Solution

**Recommended Configuration:**
- Main Frontend: Port 3000 (dev), Port 3000 (Docker)
- AI Service: Port 9004 (dev), Port 9004 (Docker, proxied via nginx on port 80)
- Backend: Port 8000 (both)

**Implementation:**
1. Update AI Service docker-compose.yml to use port 9004
2. Update nginx configuration to proxy to 9004
3. Update environment variables
4. Document port usage

---

## 4. Integration Architecture

### 4.1 Current State

**Main Backend (FastAPI):**
- Manages: Users, Companies, Candidates, Interview Rounds
- Database: PostgreSQL
- API: `/api/v1/*`

**AI Service (Next.js):**
- Manages: Interview Sessions, Questions, Exam Configs
- Database: MongoDB/PostgreSQL (separate)
- API: `/api/*` (different base path)

**Problem:** No shared data model or synchronization

### 4.2 Recommended Integration Approach

**Option A: Unified Database (Recommended)**
1. Migrate AI Service data models to Main Backend PostgreSQL
2. Add `exam_id` foreign key to `InterviewRound` table
3. AI Service reads from Main Backend database
4. Single source of truth

**Option B: API Integration**
1. AI Service exposes REST API for exam/question management
2. Main Backend calls AI Service API when scheduling interviews
3. Maintain separate databases but sync via API

**Option C: Event-Driven**
1. Main Backend publishes events when interviews scheduled
2. AI Service subscribes and creates InterviewSession
3. Async synchronization

---

## 5. Implementation Priority

### Phase 1: Critical Fixes (Immediate)
1. ✅ Fix single assign endpoint (already exists)
2. ✅ Add DELETE unassign endpoint (done)
3. ⏳ Remove academic content from core flows
4. ⏳ Fix port conflicts

### Phase 2: Content Cleanup (High Priority)
1. Remove CAT/NEET/JEE question files
2. Update interview agent prompts
3. Update question generator
4. Clean UI components

### Phase 3: Integration (Medium Priority)
1. Design unified data model
2. Implement database migration
3. Create sync logic
4. Test integration

---

## 6. Verification Checklist

### API Endpoints
- [x] POST `/hr/candidates/{id}/assign` works
- [x] DELETE `/hr/candidates/{id}/assign` works
- [ ] All endpoints return consistent data formats

### Academic Content Removal
- [ ] No CAT references in codebase
- [ ] No NEET references in codebase
- [ ] No JEE references in codebase
- [ ] No college/university admission references
- [ ] All prompts focus on professional interviews only

### Port Configuration
- [ ] No port conflicts in docker-compose files
- [ ] All services accessible on expected ports
- [ ] Nginx routing works correctly

### Integration
- [ ] Data model designed
- [ ] Sync mechanism implemented
- [ ] End-to-end flow tested

---

**Next Steps:** Begin systematic removal of academic content and port conflict resolution.

