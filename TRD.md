# Technical Requirements Document (TRD)

## AI Interviewer Platform

**Version:** 2.0.0  
**Last Updated:** December 2024  
**Document Owner:** Engineering Team  
**Status:** Production Ready

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [API Specifications](#4-api-specifications)
5. [Database Design](#5-database-design)
6. [Security Architecture](#6-security-architecture)
7. [Infrastructure Requirements](#7-infrastructure-requirements)
8. [Integration Points](#8-integration-points)
9. [Performance Requirements](#9-performance-requirements)
10. [Monitoring and Observability](#10-monitoring-and-observability)
11. [Deployment Guidelines](#11-deployment-guidelines)
12. [Known Issues and Mitigations](#12-known-issues-and-mitigations)

---

## 1. System Overview

### 1.1 Purpose

This document provides comprehensive technical specifications for the AI Interviewer Platform, a microservices-based application designed to automate technical interviews using artificial intelligence.

### 1.2 Scope

The system encompasses:
- RESTful API backend (FastAPI/Python)
- Single-page application frontend (Next.js/React)
- AI service for interview processing
- Real-time communication via WebSockets
- Asynchronous task processing (Celery)
- Data persistence (PostgreSQL)
- Caching layer (Redis)

### 1.3 System Boundaries

```
                                    External Systems
                                          |
    +-------------------------------------|-----------------------------------+
    |                              Load Balancer                               |
    |                                     |                                    |
    |    +----------------+    +------------------+    +------------------+    |
    |    |   Frontend     |    |    Backend       |    |   AI Service     |    |
    |    |  (Next.js)     |<-->|   (FastAPI)      |<-->|   (Node.js)      |    |
    |    +----------------+    +------------------+    +------------------+    |
    |           |                    |      |                   |              |
    |           |              +-----+------+-----+             |              |
    |           |              |                  |             |              |
    |    +------+------+  +----+----+      +------+------+      |              |
    |    |   Redis     |  | PostgreSQL|    |   Celery    |      |              |
    |    |   Cache     |  | Database  |    |   Workers   |      |              |
    |    +-------------+  +-----------+    +-------------+      |              |
    +---------------------------------------------------------------------- ---+
```

---

## 2. Architecture

### 2.1 Microservices Architecture

| Service | Port | Technology | Responsibility |
|---------|------|------------|----------------|
| Frontend | 3000 | Next.js 15 | User interface, SSR |
| Backend | 8000 | FastAPI | REST API, business logic |
| AI Service | 9002 | Node.js | Interview AI, LLM integration |
| AI WS Proxy | 9003 | Node.js | WebSocket real-time communication |
| PostgreSQL | 5432 | PostgreSQL 15 | Primary data store |
| Redis | 6379 | Redis Alpine | Caching, session store |
| Celery | - | Python | Async task processing |

### 2.2 Data Flow Architecture

```
[Candidate Browser]
        |
        v
[Next.js Frontend] --HTTP--> [FastAPI Backend] --SQL--> [PostgreSQL]
        |                           |
        |                           +--Redis--> [Cache/Sessions]
        |                           |
        +--WebSocket--> [AI WS Proxy] --gRPC--> [AI Service] --HTTP--> [LLM API]
```

### 2.3 Component Interactions

#### 2.3.1 Authentication Flow

```
1. Client sends credentials to /api/v1/auth/login
2. Backend validates against PostgreSQL
3. JWT tokens generated (access + refresh)
4. Access token returned in response body
5. Refresh token set as HTTP-only cookie
6. Subsequent requests include Bearer token
7. Backend validates token, checks blacklist in Redis
8. User context attached to request
```

#### 2.3.2 Interview Flow

```
1. HR schedules interview, token generated
2. Candidate accesses /interview/{token}
3. Frontend validates token via Backend
4. Resume upload, ATS analysis triggered
5. Device check (camera/microphone)
6. WebSocket connection established to AI WS Proxy
7. AI Service generates questions
8. Speech-to-text captures responses
9. AI evaluates answers in real-time
10. Transcript saved to Backend
11. Verdict generated and stored
```

---

## 3. Technology Stack

### 3.1 Backend

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Framework | FastAPI | 0.104+ | REST API framework |
| Runtime | Python | 3.11 | Application runtime |
| ORM | SQLAlchemy | 2.0 | Database abstraction |
| Migration | Alembic | 1.13 | Schema migrations |
| Validation | Pydantic | 2.0 | Data validation |
| Task Queue | Celery | 5.3 | Async processing |
| HTTP Client | httpx | 0.25 | External API calls |
| Testing | pytest | 7.4 | Unit/integration tests |

### 3.2 Frontend

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Framework | Next.js | 15.x | React framework |
| Runtime | Node.js | 18+ | JavaScript runtime |
| UI Library | React | 18.x | Component library |
| Styling | Tailwind CSS | 3.x | Utility-first CSS |
| Type Safety | TypeScript | 5.x | Static typing |
| State | React Context | - | State management |
| HTTP Client | Axios | 1.x | API communication |

### 3.3 Infrastructure

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Container | Docker | 24+ | Containerization |
| Orchestration | Docker Compose | 2.x | Local orchestration |
| Database | PostgreSQL | 15 | Primary data store |
| Cache | Redis | Alpine | Caching, sessions |
| Reverse Proxy | Nginx | 1.25 | Load balancing |

### 3.4 External Services

| Service | Purpose | Integration |
|---------|---------|-------------|
| Google Gemini | LLM for AI interviews | REST API |
| Groq | Alternative LLM provider | REST API |
| SendGrid | Email notifications | REST API |
| AWS SES | Email (alternative) | AWS SDK |

---

## 4. API Specifications

### 4.1 API Versioning

All API endpoints are prefixed with `/api/v1/` for version control.

### 4.2 Core Endpoints

#### 4.2.1 Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /auth/login | User login | None |
| POST | /auth/logout | User logout | Required |
| POST | /auth/refresh | Refresh token | Cookie |
| GET | /auth/me | Current user info | Required |

#### 4.2.2 Candidates

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /candidates | List candidates | HR/Admin |
| POST | /candidates | Create candidate | HR/Admin |
| GET | /candidates/{id} | Get candidate | HR/Admin |
| PATCH | /candidates/{id} | Update candidate | HR/Admin |
| DELETE | /candidates/{id} | Delete candidate | HR/Admin |
| POST | /candidates/bulk-import | Import CSV | HR/Admin |

#### 4.2.3 Interviews

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /interviews | List interviews | HR/Admin |
| POST | /interviews | Create interview | HR/Admin |
| GET | /interviews/{id} | Get interview | HR/Admin |
| PATCH | /interviews/{id} | Update interview | HR/Admin |
| POST | /interviews/{id}/complete | Complete interview | System |
| GET | /interviews/validate/{token} | Validate token | None |

#### 4.2.4 AI Services

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /ai/ats/check | ATS resume check | Optional |
| POST | /ai/questions/generate | Generate questions | HR/Admin |
| POST | /ai/transcript-callback | Save transcript | System |
| GET | /ai/reports | List AI reports | HR/Admin |

#### 4.2.5 HR Management

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /hr/dashboard | Dashboard metrics | HR |
| GET | /hr/candidates | Assigned candidates | HR |
| POST | /hr/candidates/schedule | Schedule interview | HR |
| POST | /hr/interviews/{id}/transcript | Save transcript | HR |

#### 4.2.6 Employee Portal

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /employee/my-candidates | Assigned candidates | Employee |
| GET | /employee/my-interviews | Employee interviews | Employee |
| GET | /employee/candidate-profile/{id} | Detailed profile | Employee |
| PUT | /employee/my-candidates/{id}/status | Update status | Employee |

#### 4.2.7 Candidate Portal

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /candidate-portal/profile | Candidate profile | Candidate |
| GET | /candidate-portal/interviews | Candidate interviews | Candidate |
| GET | /candidate-portal/my-interview-results | Interview results | Candidate |

### 4.3 Request/Response Formats

#### 4.3.1 Standard Error Response

```json
{
  "detail": "Error message description",
  "code": "ERROR_CODE",
  "timestamp": "2024-12-24T12:00:00Z"
}
```

#### 4.3.2 Pagination Response

```json
{
  "items": [...],
  "total": 100,
  "page": 1,
  "page_size": 20,
  "pages": 5
}
```

### 4.4 Rate Limiting

| Endpoint Category | Limit | Window |
|-------------------|-------|--------|
| Authentication | 10 | 1 minute |
| Standard API | 100 | 1 minute |
| AI Operations | 20 | 1 minute |
| File Upload | 5 | 1 minute |

---

## 5. Database Design

### 5.1 Entity Relationship Diagram

```
+---------------+       +----------------+       +---------------+
|   companies   |       |     users      |       |  candidates   |
+---------------+       +----------------+       +---------------+
| id (PK)       |<----->| id (PK)        |<----->| id (PK)       |
| name          |       | email          |       | email         |
| domain        |       | password_hash  |       | first_name    |
| status        |       | role           |       | last_name     |
| created_at    |       | company_id(FK) |       | company_id(FK)|
+---------------+       | is_active      |       | status        |
                        +----------------+       | assigned_to   |
                                                 +---------------+
                                                        |
                                                        v
+---------------+       +----------------+       +---------------+
|     jobs      |       |   interviews   |       |  ai_reports   |
+---------------+       +----------------+       +---------------+
| id (PK)       |<----->| id (PK)        |<----->| id (PK)       |
| title         |       | candidate_id   |       | interview_id  |
| description   |       | job_id (FK)    |       | report_type   |
| company_id    |       | round          |       | score         |
| status        |       | status         |       | summary       |
| requirements  |       | token          |       | provider_resp |
+---------------+       | scheduled_time |       +---------------+
                        +----------------+
```

### 5.2 Core Tables

#### 5.2.1 users

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| email | VARCHAR(255) | UNIQUE, NOT NULL | User email |
| password_hash | VARCHAR(255) | NOT NULL | Bcrypt hash |
| role | ENUM | NOT NULL | ADMIN/HR/EMPLOYEE/CANDIDATE |
| company_id | UUID | FK | Company reference |
| first_name | VARCHAR(100) | | User first name |
| last_name | VARCHAR(100) | | User last name |
| is_active | BOOLEAN | DEFAULT TRUE | Account status |
| is_verified | BOOLEAN | DEFAULT FALSE | Email verified |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation time |
| updated_at | TIMESTAMP | | Last update |

#### 5.2.2 candidates

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| user_id | UUID | FK UNIQUE | Linked user account |
| company_id | UUID | FK NOT NULL | Company reference |
| email | VARCHAR(255) | NOT NULL | Contact email |
| first_name | VARCHAR(100) | | Candidate name |
| last_name | VARCHAR(100) | | Candidate surname |
| phone | VARCHAR(50) | | Contact phone |
| position | VARCHAR(200) | | Applied position |
| domain | VARCHAR(100) | | Technical domain |
| status | ENUM | DEFAULT SCREENING | Pipeline status |
| experience_years | INTEGER | | Years experience |
| qualifications | TEXT | | Qualifications |
| assigned_to | UUID | FK | Assigned employee |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation time |

#### 5.2.3 interviews

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| candidate_id | UUID | FK NOT NULL | Candidate reference |
| company_id | UUID | FK NOT NULL | Company reference |
| job_id | UUID | FK | Job reference |
| round | ENUM | NOT NULL | Interview round |
| status | ENUM | DEFAULT SCHEDULED | Interview status |
| scheduled_time | TIMESTAMP | | Scheduled datetime |
| ai_interview_token | VARCHAR(255) | UNIQUE | Access token |
| notes | TEXT | | Interview notes |
| created_by | UUID | FK | Creator reference |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation time |

#### 5.2.4 ai_reports

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| interview_id | UUID | FK | Interview reference |
| company_id | UUID | FK NOT NULL | Company reference |
| report_type | VARCHAR(50) | NOT NULL | Report type |
| score | DECIMAL(5,2) | | Overall score |
| summary | TEXT | | AI summary |
| provider_response | JSONB | | Full AI response |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation time |

### 5.3 Indexes

```sql
-- Performance indexes
CREATE INDEX idx_candidates_company ON candidates(company_id);
CREATE INDEX idx_candidates_status ON candidates(status);
CREATE INDEX idx_candidates_assigned ON candidates(assigned_to);
CREATE INDEX idx_interviews_candidate ON interviews(candidate_id);
CREATE INDEX idx_interviews_token ON interviews(ai_interview_token);
CREATE INDEX idx_interviews_status ON interviews(status);
CREATE INDEX idx_ai_reports_interview ON ai_reports(interview_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_company ON users(company_id);
```

### 5.4 Migrations

Migrations are managed via Alembic with the following structure:

```
backend/alembic/versions/
├── 001_initial.py
├── 002_add_roles.py
├── 003_email_verification.py
├── 004_phase_2_candidates.py
├── 005_import_jobs.py
├── 006_interview_rounds.py
├── 007_ai_reports.py
├── 008_audit_logs.py
├── 009_availability_slots.py
├── 010_interview_sessions.py
└── 011_ai_service_compatibility.py
```

---

## 6. Security Architecture

### 6.1 Authentication

#### 6.1.1 JWT Token Structure

```json
{
  "sub": "user_uuid",
  "email": "user@example.com",
  "role": "HR",
  "company_id": "company_uuid",
  "exp": 1735200000,
  "iat": 1735199000,
  "type": "access"
}
```

#### 6.1.2 Token Lifetimes

| Token Type | Lifetime | Storage |
|------------|----------|---------|
| Access Token | 15 minutes | Memory/LocalStorage |
| Refresh Token | 7 days | HTTP-only Cookie |
| Interview Token | 7 days | Database |
| Verification Token | 24 hours | Database |

### 6.2 Authorization

#### 6.2.1 Role Hierarchy

```
ADMIN
  |
  +-- Full system access
  +-- Company management
  +-- User management
  
HR
  |
  +-- Company-scoped access
  +-- Candidate management
  +-- Interview scheduling
  +-- Employee management
  
EMPLOYEE
  |
  +-- Assigned candidate access
  +-- Interview viewing
  +-- Status updates
  
CANDIDATE
  |
  +-- Own profile access
  +-- Interview participation
  +-- Results viewing
```

#### 6.2.2 Endpoint Protection

```python
# Role-based decorators
@router.get("/admin/endpoint")
async def admin_only(user: User = Depends(require_admin)):
    pass

@router.get("/hr/endpoint")
async def hr_only(user: User = Depends(require_hr)):
    pass

@router.get("/employee/endpoint")
async def employee_only(user: User = Depends(require_employee)):
    pass
```

### 6.3 Data Protection

#### 6.3.1 Encryption

| Data Type | At Rest | In Transit |
|-----------|---------|------------|
| Passwords | bcrypt (12 rounds) | TLS 1.3 |
| PII | Database encryption | TLS 1.3 |
| Tokens | N/A | TLS 1.3 |
| Files | AES-256 | TLS 1.3 |

#### 6.3.2 Data Isolation

- Multi-tenant isolation via company_id
- Row-level security in queries
- API responses filtered by company context

### 6.4 Security Headers

```python
# Applied via middleware
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

### 6.5 Known Vulnerabilities and Mitigations

| Issue | Risk Level | Mitigation |
|-------|------------|------------|
| Hardcoded API keys in seed data | Medium | Use environment variables in production |
| Broad exception handling | Low | Implement specific exception types |
| Console logging in production | Low | Use proper logging framework |
| Token in localStorage | Medium | Already using HTTP-only cookies for refresh |

---

## 7. Infrastructure Requirements

### 7.1 Minimum Hardware Requirements

| Component | Development | Production |
|-----------|-------------|------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 16+ GB |
| Storage | 20 GB SSD | 100+ GB SSD |
| Network | 100 Mbps | 1 Gbps |

### 7.2 Container Resources

| Service | CPU Limit | Memory Limit | Replicas |
|---------|-----------|--------------|----------|
| Frontend | 0.5 | 512 MB | 2 |
| Backend | 1.0 | 1 GB | 3 |
| AI Service | 2.0 | 2 GB | 2 |
| PostgreSQL | 2.0 | 4 GB | 1 (primary) |
| Redis | 0.5 | 512 MB | 1 |
| Celery | 1.0 | 1 GB | 2 |

### 7.3 Network Configuration

| Service | Internal Port | External Port | Protocol |
|---------|---------------|---------------|----------|
| Frontend | 3000 | 443 | HTTPS |
| Backend | 8000 | 443/api | HTTPS |
| AI WS Proxy | 9003 | 443/ws | WSS |
| PostgreSQL | 5432 | - | TCP |
| Redis | 6379 | - | TCP |

### 7.4 Environment Variables

```bash
# Required for all environments
SECRET_KEY=your-256-bit-secret-key
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db
REDIS_URL=redis://localhost:6379/0

# Optional - Email
SENDGRID_API_KEY=
SMTP_HOST=
SMTP_USER=
SMTP_PASSWORD=

# Optional - AI
AI_SERVICE_URL=http://ai-service:9002
GROQ_API_KEY=
```

---

## 8. Integration Points

### 8.1 AI Service Integration

#### 8.1.1 Question Generation

```
POST /ai/questions/generate
Request:
{
  "job_description": "...",
  "domain": "backend",
  "experience_level": "senior",
  "count": 10
}

Response:
{
  "questions": [
    {
      "id": "q1",
      "text": "...",
      "category": "technical",
      "difficulty": "medium"
    }
  ]
}
```

#### 8.1.2 ATS Check

```
POST /ai/ats/check
Request:
{
  "resume_text": "...",
  "job_description": "..."
}

Response:
{
  "score": 75,
  "summary": "...",
  "keywords_found": [...],
  "keywords_missing": [...]
}
```

### 8.2 WebSocket Protocol

#### 8.2.1 Connection

```javascript
ws://localhost:9003/ws/interview/{token}
```

#### 8.2.2 Message Types

```json
// Client -> Server
{
  "type": "user_message",
  "content": "candidate answer text"
}

// Server -> Client
{
  "type": "ai_response",
  "content": "AI question or feedback"
}

{
  "type": "interview_complete",
  "verdict": "PASS",
  "score": 85
}
```

### 8.3 Email Integration

#### 8.3.1 SendGrid Template IDs

| Template | Purpose |
|----------|---------|
| interview_scheduled | Interview scheduling notification |
| interview_reminder | 24-hour reminder |
| results_available | Results notification |
| verification | Email verification |

---

## 9. Performance Requirements

### 9.1 Response Time SLAs

| Operation | Target (p95) | Maximum |
|-----------|--------------|---------|
| API Read | 100ms | 500ms |
| API Write | 200ms | 1000ms |
| Auth Operations | 150ms | 500ms |
| AI Operations | 2000ms | 10000ms |
| File Upload | 5000ms | 30000ms |

### 9.2 Throughput Requirements

| Metric | Target |
|--------|--------|
| Concurrent Users | 1000 |
| Requests/Second | 500 |
| Concurrent Interviews | 100 |
| Database Connections | 50 |

### 9.3 Caching Strategy

| Data Type | Cache Duration | Invalidation |
|-----------|----------------|--------------|
| User Sessions | 15 minutes | On logout |
| Company Settings | 1 hour | On update |
| Job Listings | 5 minutes | On update |
| Static Content | 24 hours | On deploy |

---

## 10. Monitoring and Observability

### 10.1 Health Checks

| Endpoint | Interval | Timeout |
|----------|----------|---------|
| /health | 30s | 5s |
| /health/db | 60s | 10s |
| /health/redis | 60s | 5s |

### 10.2 Logging

#### 10.2.1 Log Levels

| Level | Usage |
|-------|-------|
| ERROR | Exceptions, failures |
| WARN | Degraded operations |
| INFO | Business events |
| DEBUG | Development only |

#### 10.2.2 Log Format

```json
{
  "timestamp": "2024-12-24T12:00:00Z",
  "level": "INFO",
  "service": "backend",
  "request_id": "uuid",
  "user_id": "uuid",
  "message": "Description",
  "metadata": {}
}
```

### 10.3 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| http_requests_total | Counter | method, path, status |
| http_request_duration | Histogram | method, path |
| active_interviews | Gauge | company |
| db_connections | Gauge | pool |

### 10.4 Alerting Rules

| Alert | Condition | Severity |
|-------|-----------|----------|
| High Error Rate | error_rate > 5% for 5m | Critical |
| Slow Response | p95 > 2s for 10m | Warning |
| Database Down | health check fails 3x | Critical |
| High Memory | memory > 90% for 5m | Warning |

---

## 11. Deployment Guidelines

### 11.1 Development Setup

```bash
# Clone repository
git clone https://github.com/org/ai-interviewer.git
cd ai-interviewer

# Start services
docker compose up -d

# Run migrations
docker compose exec backend alembic upgrade head

# Seed data (development only)
docker compose exec backend python reset_and_seed.py
```

### 11.2 Production Deployment

```bash
# Build images
docker compose -f docker-compose.prod.yml build

# Deploy with secrets
docker compose -f docker-compose.prod.yml up -d

# Verify health
curl https://api.example.com/health
```

### 11.3 CI/CD Pipeline

```yaml
stages:
  - lint
  - test
  - security-scan
  - build
  - deploy-staging
  - integration-test
  - deploy-production
```

### 11.4 Rollback Procedure

```bash
# Quick rollback
docker compose down
docker compose up -d --no-build

# Database rollback (if needed)
docker compose exec backend alembic downgrade -1
```

---

## 12. Known Issues and Mitigations

### 12.1 Security Issues

| Issue | Location | Risk | Mitigation |
|-------|----------|------|------------|
| Hardcoded passwords in seed script | reset_and_seed.py | Medium | Remove for production; use env vars |
| Default API key fallback | ai_service.py | Medium | Require API key in production |
| Broad exception handling | Multiple routes | Low | Implement specific exception types |

### 12.2 Technical Debt

| Issue | Location | Impact | Resolution |
|-------|----------|--------|------------|
| Console.log statements | Frontend | Low | Replace with proper logger |
| TODO comments | Multiple files | Low | Address in future sprints |
| Duplicate code patterns | Employee/HR routes | Medium | Extract to shared services |

### 12.3 Edge Cases

| Scenario | Current Behavior | Recommended Fix |
|----------|------------------|-----------------|
| Interview timeout | Session abandoned | Implement auto-save |
| Network disconnect | Data loss possible | Add offline queue |
| Concurrent updates | Last write wins | Implement optimistic locking |
| Large file upload | May timeout | Add chunked upload |

### 12.4 Performance Concerns

| Issue | Impact | Mitigation |
|-------|--------|------------|
| N+1 queries in candidate listing | Slow page load | Add eager loading |
| No connection pooling for AI service | Resource exhaustion | Implement httpx pool |
| Large transcript storage | DB bloat | Implement compression |

---

## Appendix A: Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| AUTH_001 | 401 | Invalid credentials |
| AUTH_002 | 401 | Token expired |
| AUTH_003 | 403 | Insufficient permissions |
| CAND_001 | 404 | Candidate not found |
| CAND_002 | 409 | Candidate already exists |
| INT_001 | 404 | Interview not found |
| INT_002 | 400 | Invalid interview token |
| INT_003 | 409 | Interview already completed |

## Appendix B: API Response Codes

| HTTP Status | Usage |
|-------------|-------|
| 200 | Successful GET, PUT, PATCH |
| 201 | Successful POST (created) |
| 204 | Successful DELETE |
| 400 | Invalid request data |
| 401 | Authentication required |
| 403 | Permission denied |
| 404 | Resource not found |
| 409 | Conflict (duplicate) |
| 422 | Validation error |
| 500 | Internal server error |

---

*This document is maintained by the Engineering Team and should be updated with each major release.*
