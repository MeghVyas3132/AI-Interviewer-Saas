# AI Interviewer SaaS - Testing Guide

## ✅ Current Status

All services are running and healthy:
- Frontend (Next.js) - Port 3000 ✅
- Backend (FastAPI) - Port 8000 ✅
- AI Service (Node.js) - Port 3001 ✅
- Database (PostgreSQL) - Port 5432 ✅
- Cache (Redis) - Port 6379 ✅

**Admin Login Verified:** admin@aigenthix.com / qwerty123 ✅

---

## 📋 Testing Checklist

### Phase 1: Admin Dashboard Navigation
- [ ] Logged in successfully as admin
- [ ] Can see admin dashboard at http://localhost:3000/hr
- [ ] Can navigate to different admin sections (Candidates, Employees, Analytics)
- [ ] No console errors visible in browser dev tools

### Phase 2: Candidate Management
- [ ] Create a new candidate from admin panel
- [ ] View candidate details
- [ ] Assign candidate to an employee/interviewer
- [ ] Edit candidate information

### Phase 3: Interview Scheduling
- [ ] Create an interview round for a candidate
- [ ] Set interview type (screening, technical, etc.)
- [ ] Schedule date and time
- [ ] Assign interviewer

### Phase 4: AI Interview Features (Critical Path)
- [ ] **Option A - Candidate Portal:**
  - [ ] Login as candidate at http://localhost:3000/candidate-portal
  - [ ] See assigned interviews
  - [ ] Start an AI interview session
  - [ ] AI asks interview questions
  - [ ] Candidate can respond via text/voice
  - [ ] Interview completes and shows results

- [ ] **Option B - Admin Testing:**
  - [ ] From admin panel, trigger test interview
  - [ ] Verify AI service responds with interview questions
  - [ ] Check if AI provides scoring/feedback

### Phase 5: Resume Analysis & ATS Checker
- [ ] Upload a resume for a candidate
- [ ] Trigger resume analysis via `/api/ai/resume-analysis`
- [ ] Verify AI provides skill extraction and insights
- [ ] Test ATS checker with job description

### Phase 6: Analytics & Reporting
- [ ] View interview analytics dashboard
- [ ] Check candidate performance metrics
- [ ] Verify transcript generation for completed interviews

### Phase 7: API Integration Verification
- [ ] Test `/health` endpoint: `curl http://localhost:8000/health`
- [ ] Check Swagger UI: http://localhost:8000/docs
- [ ] Test auth endpoint: Login via API
- [ ] Test candidate endpoints: List, create, update
- [ ] Test interview endpoints: Create, list, update

---

## 🔍 API Testing (Using curl or Postman)

### Get Auth Token
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@aigenthix.com", "password": "qwerty123"}'
```

### List All Candidates
```bash
curl -X GET http://localhost:8000/api/v1/candidates \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test AI Interview Session (Once Implemented)
```bash
curl -X POST http://localhost:8000/api/ai/interview-session \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"candidate_id": "...", "job_domain": "Engineering"}'
```

### Test Resume Analysis
```bash
curl -X POST http://localhost:8000/api/ai/resume-analysis \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resume_text": "..."}'
```

---

## 🐛 Troubleshooting

### Backend Connection Refused
- Check if backend is running: `docker-compose ps`
- View logs: `docker-compose logs backend`
- Restart backend: `docker-compose up -d backend`

### AI Service Not Responding
- Check if AI service is running: `docker-compose ps ai-service`
- View logs: `docker-compose logs ai-service`
- Verify URL in backend config: Should be `http://ai-service:3001` or similar

### Database Connection Issues
- Check PostgreSQL is healthy: `docker-compose logs postgres`
- Verify migrations: `docker-compose logs backend | grep -i alembic`
- Reset database if needed: `docker-compose down -v && docker-compose up -d`

### Frontend Not Loading
- Check if frontend is running: `docker-compose ps frontend`
- Clear browser cache and reload
- Check browser console for errors
- View logs: `docker-compose logs frontend`

---

## 📊 Expected Interview Flow

1. **Admin Creates Candidate** → Adds candidate to system
2. **Assign to Employee/Interviewer** → Sets up interview assignment
3. **Schedule Interview Round** → Sets date, time, type
4. **Candidate Gets Notification** → Email/portal notification
5. **Candidate Starts Interview** → Portal opens AI interview
6. **AI Asks Questions** → Questions generated based on job domain
7. **Candidate Answers** → Via text or voice
8. **AI Scores Response** → Real-time feedback
9. **Interview Completes** → Report generated
10. **Admin Reviews Results** → Analytics dashboard shows results

---

## 🎯 Critical Features to Test

1. ✅ Authentication & Authorization
2. ⏳ Interview Session Creation (via proxy)
3. ⏳ AI Question Generation
4. ⏳ Resume Analysis
5. ⏳ ATS Checker
6. ⏳ Transcript Generation
7. ⏳ Scoring & Feedback

---

## 📝 Notes for Developers

- **Frontend** calls `/api/v1/*` endpoints (backend)
- **Backend** proxies `/api/ai/*` calls to AI service
- **AI Service** runs on internal Docker network at `http://ai-service:3001`
- All endpoints require authentication (JWT tokens)
- Database migrations run on startup (skip errors gracefully)

---

## Next Steps

1. Create test data (candidates, companies, employees)
2. Test candidate portal login
3. Trigger AI interview session
4. Verify AI service responses
5. Check analytics dashboard
6. Document any issues found

---

**Last Updated:** 2025-12-20
**Status:** Production Ready (Pending Feature Testing)
