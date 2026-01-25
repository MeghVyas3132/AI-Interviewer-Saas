# Technical Requirements Document (TRD)

## AI Interviewer Platform

**Version:** 2.1.0  
**Last Updated:** January 2026  
**Document Owner:** Engineering Team  
**Status:** Production Ready

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Database Design](#4-database-design)
5. [API Specifications](#5-api-specifications)
6. [Authentication and Security](#6-authentication-and-security)
7. [AI Service Integration](#7-ai-service-integration)
8. [Background Task Processing](#8-background-task-processing)
9. [Infrastructure Requirements](#9-infrastructure-requirements)
10. [Monitoring and Observability](#10-monitoring-and-observability)
11. [Deployment Guidelines](#11-deployment-guidelines)
12. [Performance Optimization](#12-performance-optimization)

---

## 1. System Overview

### 1.1 Purpose

This document provides comprehensive technical specifications for the AI Interviewer Platform, a microservices-based application designed to automate technical interviews using artificial intelligence.

### 1.2 Scope

The system encompasses:
- RESTful API backend (FastAPI/Python)
- Single-page application frontend (Next.js/React)
- AI interview service for real-time interactions
- Real-time audio communication via WebSockets
- Asynchronous task processing (Celery)
- Data persistence (PostgreSQL)
- Caching layer (Redis)
- External AI integrations (Google Gemini, AssemblyAI)

### 1.3 System Boundaries

```
                                    External Services
                                          |
                            +-------------+-------------+
                            |             |             |
                      Google Gemini  AssemblyAI    Email Service
                            |             |             |
    +-------------------+---|-------------|-------------|-------------------+
    |                   |   |             |             |                   |
    |    +--------------+---+-------------+-------------+---------------+   |
    |    |                        Backend API                           |   |
    |    |                       (FastAPI:8000)                         |   |
    |    +------------------+-------------------+-----------------------+   |
    |                       |                   |                           |
    |    +------------------+--+    +-----------+-----------+               |
    |    |    Frontend         |    |     AI Service        |               |
    |    |   (Next.js:3000)    |    |   (Internal:9002)     |               |
    |    +---------------------+    +-----------+-----------+               |
    |                                           |                           |
    |                               +-----------+-----------+               |
    |                               |   WebSocket Proxy     |               |
    |                               |      (Node:9003)      |               |
    |                               +-----------------------+               |
    |                                                                       |
    |    +------------------+    +------------------+    +---------------+  |
    |    |   PostgreSQL     |    |      Redis       |    |    Celery     |  |
    |    |     (5432)       |    |     (6379)       |    |    Worker     |  |
    |    +------------------+    +------------------+    +---------------+  |
    |                                                                       |
    +-----------------------------------------------------------------------+
```

---

## 2. Architecture

### 2.1 Microservices Architecture

| Service | Container Name | Port | Technology | Responsibility |
|---------|----------------|------|------------|----------------|
| Frontend | ai_interviewer_frontend | 3000 | Next.js 15, React 18, TypeScript | User interface, SSR, client routing |
| Backend | ai_interviewer_backend | 8000 | FastAPI, Python 3.11 | REST API, business logic, authentication |
| AI Service | ai-interviewer-coach | 9002 | Next.js, Node.js | AI interview conductor, LLM integration |
| WS Proxy | ai_interviewer_ws_proxy | 9003 | Node.js | WebSocket real-time audio streaming |
| Database | ai_interviewer_db | 5432 | PostgreSQL 15 | Primary data store |
| Cache | ai_interviewer_redis | 6379 | Redis Alpine | Caching, session management, task broker |
| Worker | ai_interviewer_celery | N/A | Python, Celery | Background task processing |

### 2.2 Data Flow Architecture

```
[User Browser]
      |
      v
[Next.js Frontend :3000] --HTTP REST--> [FastAPI Backend :8000] --SQL--> [PostgreSQL :5432]
      |                                         |
      |                                         +--Redis--> [Cache/Sessions :6379]
      |                                         |
      |                                         +--Task Queue--> [Celery Worker]
      |                                                               |
      +--WebSocket--> [WS Proxy :9003] --Audio--> [AssemblyAI STT]    +--HTTP--> [Google Gemini API]
      |
      +--HTTP Proxy--> [AI Service :9002] --HTTP--> [Google Gemini API]
```

### 2.3 Component Interactions

#### 2.3.1 Authentication Flow

```
1. Client sends credentials to POST /api/v1/auth/login
2. Backend validates credentials against PostgreSQL
3. JWT tokens generated (access token + refresh token)
4. Access token returned in response body
5. Refresh token set as HTTP-only cookie
6. Subsequent requests include Authorization: Bearer <token>
7. Backend validates token signature and expiry
8. Backend checks token blacklist in Redis (for logout)
9. User context attached to request for authorization
```

#### 2.3.2 Interview Flow

```
1. HR schedules interview via POST /api/v1/interviews
2. Unique interview token generated and stored
3. Candidate accesses interview via /interview/{token}
4. Frontend validates token via GET /api/v1/interviews/validate/{token}
5. Candidate grants microphone permission
6. WebSocket connection established to WS Proxy (port 9003)
7. AI Service generates questions based on job template
8. Audio streamed to AssemblyAI for real-time transcription
9. Transcribed text sent to AI for evaluation
10. AI provides follow-up questions and feedback
11. Interview transcript saved to PostgreSQL
12. Verdict generated via Celery background task
13. Results available to HR and assigned employees
```

#### 2.3.3 ATS Analysis Flow

```
1. Candidate uploads resume via POST /api/v1/ai/ats-check
2. Backend extracts text from PDF/DOCX/TXT file
3. Resume text sent to Google Gemini API
4. AI analyzes resume against 7 scoring categories
5. Each category scored out of 5 points
6. Overall score calculated (0-100)
7. Detailed feedback, keywords, and improvements returned
8. Results displayed in frontend with visual indicators
```

---

## 3. Technology Stack

### 3.1 Backend

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Framework | FastAPI | 0.104+ | Async REST API framework |
| Runtime | Python | 3.11 | Application runtime |
| ORM | SQLAlchemy | 2.0 | Async database abstraction |
| Migration | Alembic | 1.13 | Database schema migrations |
| Validation | Pydantic | 2.0 | Request/response validation |
| Task Queue | Celery | 5.3 | Async background processing |
| HTTP Client | httpx | 0.25 | Async external API calls |
| PDF Parser | PyPDF2, pdfplumber | 3.0, 0.10 | Resume PDF text extraction |
| DOCX Parser | python-docx | 0.8 | Resume DOCX text extraction |
| Testing | pytest | 7.4 | Unit and integration tests |
| Password Hashing | passlib[bcrypt] | 1.7 | Secure password storage |
| JWT | python-jose | 3.3 | Token generation and validation |

### 3.2 Frontend

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Framework | Next.js | 15.x | React framework with SSR |
| Runtime | Node.js | 18+ | JavaScript runtime |
| UI Library | React | 18.x | Component library |
| Styling | Tailwind CSS | 3.x | Utility-first CSS framework |
| Type Safety | TypeScript | 5.x | Static typing |
| State Management | React Context | Built-in | Application state |
| HTTP Client | Fetch API | Built-in | API communication |
| Cookie Management | js-cookie | 3.x | Client-side cookies |

### 3.3 AI Service

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Framework | Next.js | 15.x | AI interview interface |
| Runtime | Node.js | 18+ | JavaScript runtime |
| WebSocket | ws | 8.x | Real-time communication |
| Audio Processing | AssemblyAI SDK | Latest | Speech-to-text |

### 3.4 Infrastructure

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Container Runtime | Docker | 24+ | Application containerization |
| Orchestration | Docker Compose | 2.x | Local service orchestration |
| Database | PostgreSQL | 15 | Primary relational data store |
| Cache/Broker | Redis | Alpine | Caching, sessions, Celery broker |

### 3.5 External Services

| Service | Provider | Purpose | Integration Method |
|---------|----------|---------|-------------------|
| LLM | Google Gemini 2.5 Flash | Question generation, ATS analysis, interview evaluation | REST API |
| Speech-to-Text | AssemblyAI | Real-time audio transcription | WebSocket |

---

## 4. Database Design

### 4.1 Entity Relationship Overview

```
companies (1) ----< (N) users
companies (1) ----< (N) candidates
companies (1) ----< (N) job_templates
job_templates (1) ----< (N) questions
candidates (1) ----< (N) interviews
candidates (1) ----< (N) interview_rounds
users (1) ----< (N) interviews (as interviewer)
users (1) ----< (N) candidates (as assigned_to)
```

### 4.2 Core Tables

#### 4.2.1 Users Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique identifier |
| company_id | UUID | FOREIGN KEY | Company association |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Login email |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt hashed password |
| name | VARCHAR(255) | NOT NULL | Full name |
| role | ENUM | NOT NULL | SYSTEM_ADMIN, HR, EMPLOYEE, CANDIDATE |
| custom_role_id | UUID | FOREIGN KEY, NULLABLE | Custom role reference |
| manager_id | UUID | FOREIGN KEY, NULLABLE | Reporting manager |
| department | VARCHAR(100) | NULLABLE | Department name |
| is_active | BOOLEAN | DEFAULT TRUE | Account status |
| email_verified | BOOLEAN | DEFAULT FALSE | Email verification status |
| verification_token | VARCHAR(255) | NULLABLE | Email verification token |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | ON UPDATE | Last update timestamp |

#### 4.2.2 Companies Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique identifier |
| name | VARCHAR(255) | NOT NULL | Company name |
| domain | VARCHAR(255) | NULLABLE | Company domain |
| is_active | BOOLEAN | DEFAULT TRUE | Active status |
| settings | JSONB | DEFAULT '{}' | Company configuration |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |

#### 4.2.3 Candidates Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique identifier |
| company_id | UUID | FOREIGN KEY | Company association |
| email | VARCHAR(255) | NOT NULL | Candidate email |
| name | VARCHAR(255) | NOT NULL | Full name |
| phone | VARCHAR(50) | NULLABLE | Phone number |
| resume_url | TEXT | NULLABLE | Resume file path |
| resume_text | TEXT | NULLABLE | Extracted resume text |
| status | ENUM | DEFAULT 'new' | Pipeline status |
| assigned_to | UUID | FOREIGN KEY, NULLABLE | Assigned employee |
| job_template_id | UUID | FOREIGN KEY, NULLABLE | Applied job |
| source | VARCHAR(100) | NULLABLE | Application source |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |

#### 4.2.4 Job Templates Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique identifier |
| company_id | UUID | FOREIGN KEY | Company association |
| created_by | UUID | FOREIGN KEY | Creator user ID |
| title | VARCHAR(255) | NOT NULL | Job title |
| description | TEXT | NULLABLE | Job description |
| ai_prompt | TEXT | NULLABLE | Custom AI prompt |
| ai_model | VARCHAR(100) | DEFAULT 'gemini-2.5-flash' | AI model to use |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |

#### 4.2.5 Questions Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique identifier |
| job_template_id | UUID | FOREIGN KEY | Associated job |
| text | TEXT | NOT NULL | Question text |
| created_by | UUID | FOREIGN KEY | Creator user ID |
| weight | INTEGER | DEFAULT 1 | Question weight |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |

#### 4.2.6 Interviews Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique identifier |
| candidate_id | UUID | FOREIGN KEY | Candidate reference |
| job_template_id | UUID | FOREIGN KEY | Job template reference |
| interviewer_id | UUID | FOREIGN KEY, NULLABLE | Interviewer reference |
| token | VARCHAR(255) | UNIQUE | Access token |
| status | ENUM | DEFAULT 'scheduled' | Interview status |
| scheduled_at | TIMESTAMP | NULLABLE | Scheduled time |
| started_at | TIMESTAMP | NULLABLE | Actual start time |
| completed_at | TIMESTAMP | NULLABLE | Completion time |
| transcript | TEXT | NULLABLE | Full transcript |
| score | INTEGER | NULLABLE | Overall score |
| verdict | ENUM | NULLABLE | PASS, REVIEW, FAIL |
| ai_report | JSONB | NULLABLE | Detailed AI analysis |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |

#### 4.2.7 Interview Rounds Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique identifier |
| candidate_id | UUID | FOREIGN KEY | Candidate reference |
| job_template_id | UUID | FOREIGN KEY | Job template reference |
| round_number | INTEGER | NOT NULL | Round sequence |
| round_type | VARCHAR(50) | NOT NULL | Round type (technical, hr, etc.) |
| status | ENUM | DEFAULT 'pending' | Round status |
| scheduled_at | TIMESTAMP | NULLABLE | Scheduled time |
| interview_link | TEXT | NULLABLE | Interview access link |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |

### 4.3 Database Indexes

```sql
-- Performance indexes
CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_candidates_company_id ON candidates(company_id);
CREATE INDEX idx_candidates_status ON candidates(status);
CREATE INDEX idx_candidates_assigned_to ON candidates(assigned_to);
CREATE INDEX idx_interviews_candidate_id ON interviews(candidate_id);
CREATE INDEX idx_interviews_token ON interviews(token);
CREATE INDEX idx_questions_job_template_id ON questions(job_template_id);
```

### 4.4 Migration Management

Database migrations are managed via Alembic:

```bash
# Create new migration
docker compose exec backend alembic revision --autogenerate -m "description"

# Apply migrations
docker compose exec backend alembic upgrade head

# Rollback one migration
docker compose exec backend alembic downgrade -1

# View migration history
docker compose exec backend alembic history
```

### 4.5 Migration Files

```
backend/alembic/versions/
├── 001_initial.py
├── 002_add_roles.py
├── 003_email_verification.py
├── 004_phase_2_candidates.py
├── 005_import_jobs.py
├── 006_interview_rounds.py
├── 007_add_ai_candidate_id.py
├── 009_add_ai_reports.py
├── 010_add_jobs_and_questions.py
├── 011_ai_service_compatibility.py
├── 012_candidate_job_link.py
├── 013_employee_availability.py
├── 014_company_ai_config.py
├── 015_interview_verdict.py
├── 016_performance_indexes.py
├── 017_candidate_ats_fields.py
├── 018_pipeline_statuses.py
└── add_ai_interview_token.py
```

---

## 5. API Specifications

### 5.1 API Conventions

- Base URL: `/api/v1/`
- Authentication: Bearer token in Authorization header
- Content-Type: `application/json` (except file uploads)
- Date format: ISO 8601 (YYYY-MM-DDTHH:MM:SSZ)

### 5.2 Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | /auth/login | User authentication | No |
| POST | /auth/logout | Token invalidation | Yes |
| POST | /auth/refresh | Refresh access token | Cookie |
| GET | /auth/me | Current user info | Yes |

#### Login Request

```json
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}
```

#### Login Response

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "role": "HR",
    "company_id": "uuid"
  }
}
```

### 5.3 User Management Endpoints

| Method | Endpoint | Description | Auth/Role |
|--------|----------|-------------|-----------|
| GET | /users | List users (company-scoped) | HR, Admin |
| POST | /users | Create user | HR, Admin |
| GET | /users/{id} | Get user details | HR, Admin |
| PUT | /users/{id} | Update user | HR, Admin |
| DELETE | /users/{id} | Deactivate user | Admin |

### 5.4 Candidate Endpoints

| Method | Endpoint | Description | Auth/Role |
|--------|----------|-------------|-----------|
| GET | /candidates | List candidates (paginated) | HR, Admin |
| POST | /candidates | Create candidate | HR, Admin |
| GET | /candidates/{id} | Get candidate details | HR, Admin, Employee |
| PUT | /candidates/{id} | Update candidate | HR, Admin |
| DELETE | /candidates/{id} | Delete candidate | HR, Admin |
| POST | /candidates/bulk-import | Bulk import via CSV | HR, Admin |
| DELETE | /candidates/bulk-delete | Delete multiple candidates | HR, Admin |

#### List Candidates Request

```
GET /api/v1/candidates?page=1&per_page=20&status=new
Authorization: Bearer <token>
```

#### List Candidates Response

```json
{
  "candidates": [
    {
      "id": "uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "status": "new",
      "created_at": "2026-01-04T10:00:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "per_page": 20,
  "pages": 8
}
```

### 5.5 Job Management Endpoints

| Method | Endpoint | Description | Auth/Role |
|--------|----------|-------------|-----------|
| GET | /jobs | List job templates | HR, Admin |
| POST | /jobs | Create job template | HR, Admin |
| GET | /jobs/{id} | Get job details | HR, Admin |
| PUT | /jobs/{id} | Update job | HR, Admin |
| DELETE | /jobs/{id} | Delete job | HR, Admin |
| POST | /jobs/{id}/generate-questions | Generate AI questions | HR, Admin |
| GET | /jobs/{id}/questions | List job questions | HR, Admin |

### 5.6 Interview Endpoints

| Method | Endpoint | Description | Auth/Role |
|--------|----------|-------------|-----------|
| GET | /interviews | List interviews | HR, Admin |
| POST | /interviews | Schedule interview | HR, Admin |
| GET | /interviews/{id} | Get interview details | HR, Admin, Employee |
| GET | /interviews/validate/{token} | Validate interview token | None |
| PUT | /interviews/{id}/complete | Mark interview complete | System |
| GET | /interviews/{id}/transcript | Get interview transcript | HR, Admin, Employee |

### 5.7 AI Service Endpoints

| Method | Endpoint | Description | Auth/Role |
|--------|----------|-------------|-----------|
| POST | /ai/ats-check | Analyze resume for ATS compatibility | Candidate |
| POST | /ai/generate-questions | Generate interview questions | HR, Admin |

#### ATS Check Request

```
POST /api/v1/ai/ats-check
Authorization: Bearer <token>
Content-Type: multipart/form-data

resume: <file>
job_description: <optional text>
```

#### ATS Check Response

```json
{
  "score": 75,
  "summary": "Resume shows strong technical background...",
  "section_scores": {
    "contact_info": {
      "score": 4,
      "feedback": "Contact information is complete..."
    },
    "format_structure": {
      "score": 5,
      "feedback": "Clear headings and structure..."
    },
    "professional_summary": {
      "score": 4,
      "feedback": "Summary effectively highlights..."
    },
    "work_experience": {
      "score": 3,
      "feedback": "Experience section needs..."
    },
    "technical_skills": {
      "score": 4,
      "feedback": "Skills well-categorized..."
    },
    "education": {
      "score": 3,
      "feedback": "Education section present..."
    },
    "keyword_optimization": {
      "score": 4,
      "feedback": "Good keyword density..."
    }
  },
  "highlights": ["Strong technical skills", "Clear formatting"],
  "improvements": ["Add more quantified achievements", "Include certifications"],
  "keywords_found": ["Python", "Docker", "AWS"],
  "keywords_missing": ["Kubernetes", "CI/CD"],
  "formatting_issues": [],
  "ats_friendly": true
}
```

### 5.8 Company Endpoints

| Method | Endpoint | Description | Auth/Role |
|--------|----------|-------------|-----------|
| GET | /companies | List companies | System Admin |
| GET | /companies/{id} | Get company details | System Admin |
| PUT | /companies/{id} | Update company | System Admin |
| POST | /register/company | Request company registration | None |
| GET | /admin/company-requests | List pending requests | System Admin |
| POST | /admin/company-requests/{id}/approve | Approve request | System Admin |
| POST | /admin/company-requests/{id}/reject | Reject request | System Admin |

### 5.9 Error Response Format

```json
{
  "detail": "Error message describing the issue",
  "error_code": "AUTH_001",
  "timestamp": "2026-01-04T10:00:00Z"
}
```

### 5.10 HTTP Status Codes

| Code | Description | Usage |
|------|-------------|-------|
| 200 | OK | Successful GET, PUT, PATCH |
| 201 | Created | Successful POST (resource created) |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Invalid request data |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | Duplicate resource |
| 422 | Unprocessable Entity | Validation error |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |

---

## 6. Authentication and Security

### 6.1 JWT Token Structure

**Access Token Payload:**

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "HR",
  "company_id": "company-uuid",
  "exp": 1704369600,
  "iat": 1704366000
}
```

**Token Configuration:**

| Parameter | Value | Description |
|-----------|-------|-------------|
| Access Token Expiry | 30 minutes | Short-lived for security |
| Refresh Token Expiry | 7 days | Long-lived for convenience |
| Algorithm | HS256 | HMAC with SHA-256 |
| Secret Key | 256-bit | Environment variable |

### 6.2 Password Security

- Hashing: bcrypt with configurable rounds (default: 12)
- Minimum length: 8 characters
- Complexity: Mixed case, numbers, special characters recommended

### 6.3 Role-Based Access Control (RBAC)

| Role | Company Scope | Candidates | Jobs | Users | System |
|------|---------------|------------|------|-------|--------|
| SYSTEM_ADMIN | All | Read/Write | Read/Write | Read/Write | Full |
| HR | Own | Read/Write | Read/Write | Read/Write | None |
| EMPLOYEE | Own | Read (assigned) | Read | Read | None |
| CANDIDATE | N/A | Self only | Read | Self only | None |

### 6.4 Security Headers

```python
# Implemented via middleware
{
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
}
```

### 6.5 Rate Limiting

| Endpoint Category | Limit | Window |
|-------------------|-------|--------|
| Authentication | 5 requests | 1 minute |
| API General | 100 requests | 1 minute |
| AI Endpoints | 10 requests | 1 minute |
| File Upload | 10 requests | 5 minutes |

### 6.6 CORS Configuration

```python
CORS_ORIGINS = [
    "http://localhost:3000",    # Frontend
    "http://localhost:3001",    # AI Service
    "http://localhost:9002",    # Legacy
]
```

---

## 7. AI Service Integration

### 7.1 Google Gemini Integration

**Configuration:**

| Parameter | Value |
|-----------|-------|
| Model | gemini-2.5-flash |
| API Base | https://generativelanguage.googleapis.com/v1beta |
| Max Output Tokens | 8000 (ATS), 2048 (questions) |
| Temperature | 0.0 (deterministic) |

**Retry Strategy:**

- Maximum attempts: 3
- Backoff: 3, 6, 9 seconds
- Rate limit handling: 5, 10, 15 seconds

### 7.2 Question Generation

**Prompt Template:**

```
Generate {max_questions} technical interview questions for the following job role.

Job Context:
{job_description}

Requirements:
1. Questions should assess technical competency
2. Include a mix of theoretical and practical questions
3. Vary difficulty from intermediate to advanced
4. Questions should be clear and unambiguous

Return as JSON: {"questions": ["question1", "question2", ...]}
```

### 7.3 ATS Resume Analysis

**Scoring Categories:**

| Category | Max Score | Weight |
|----------|-----------|--------|
| Contact Info | 5 | Completeness, professional email |
| Format Structure | 5 | Headings, bullet points, readability |
| Professional Summary | 5 | Keywords, clarity, relevance |
| Work Experience | 5 | Relevance, quantification, recency |
| Technical Skills | 5 | Categorization, relevance, depth |
| Education | 5 | Completeness, relevance |
| Keyword Optimization | 5 | Density, relevance, placement |

**Overall Score Calculation:**
- Sum of section scores normalized to 0-100 scale
- Additional factors: keyword density, formatting issues

### 7.4 AssemblyAI Integration

**WebSocket Configuration:**

| Parameter | Value |
|-----------|-------|
| Sample Rate | 16000 Hz |
| Encoding | PCM signed 16-bit |
| Endpoint | wss://api.assemblyai.com/v2/realtime/ws |
| Format | Raw audio stream |

---

## 8. Background Task Processing

### 8.1 Celery Configuration

```python
CELERY_BROKER_URL = "redis://redis:6379/0"
CELERY_RESULT_BACKEND = "redis://redis:6379/0"
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TIMEZONE = "UTC"
```

### 8.2 Task Types

| Task | Queue | Priority | Timeout |
|------|-------|----------|---------|
| generate_questions | default | Normal | 5 minutes |
| analyze_resume | default | Normal | 3 minutes |
| process_interview | high | High | 10 minutes |
| send_email | email | Low | 1 minute |
| bulk_import | default | Normal | 30 minutes |

### 8.3 Task Monitoring

```bash
# View active workers
celery -A app.core.celery inspect active

# View task queue
celery -A app.core.celery inspect reserved

# Monitor tasks
celery -A app.core.celery events
```

---

## 9. Infrastructure Requirements

### 9.1 Minimum Hardware Requirements

| Component | Development | Production |
|-----------|-------------|------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 16+ GB |
| Storage | 20 GB SSD | 100+ GB SSD |
| Network | 100 Mbps | 1 Gbps |

### 9.2 Container Resources

| Service | CPU Limit | Memory Limit | Replicas |
|---------|-----------|--------------|----------|
| Frontend | 0.5 | 512 MB | 2 |
| Backend | 1.0 | 1 GB | 3 |
| AI Service | 2.0 | 2 GB | 2 |
| PostgreSQL | 2.0 | 4 GB | 1 (primary) |
| Redis | 0.5 | 512 MB | 1 |
| Celery | 1.0 | 1 GB | 2 |

### 9.3 Network Configuration

| Service | Internal Port | External Port | Protocol |
|---------|---------------|---------------|----------|
| Frontend | 3000 | 443 | HTTPS |
| Backend | 8000 | 443/api | HTTPS |
| AI WS Proxy | 9003 | 443/ws | WSS |
| PostgreSQL | 5432 | - | TCP |
| Redis | 6379 | - | TCP |

### 9.4 Environment Variables

```bash
# Required for all environments
SECRET_KEY=your-256-bit-secret-key
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db
REDIS_URL=redis://localhost:6379/0

# AI Configuration
AI_SERVICE_API_KEY=your-gemini-api-key
GOOGLE_API_KEY=your-gemini-api-key
ASSEMBLYAI_API_KEY=your-assemblyai-api-key
AI_SERVICE_URL=http://ai-service:9002

# Optional - Email
SENDGRID_API_KEY=
SMTP_HOST=
SMTP_USER=
SMTP_PASSWORD=
```

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
  "timestamp": "2026-01-24T12:00:00Z",
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
| db_connections_active | Gauge | pool |
| celery_tasks_total | Counter | task, state |

---

## 11. Deployment Guidelines

### 11.1 Production Checklist

- [ ] Generate secure SECRET_KEY (256-bit minimum)
- [ ] Configure production database with SSL
- [ ] Enable HTTPS/TLS termination
- [ ] Set secure CORS origins
- [ ] Review rate limiting configuration
- [ ] Configure log aggregation
- [ ] Set up monitoring and alerting
- [ ] Configure database backups
- [ ] Set resource limits on containers
- [ ] Remove seed data scripts

### 11.2 Docker Production Build

```bash
# Build production images
docker compose -f docker-compose.prod.yml build

# Deploy
docker compose -f docker-compose.prod.yml up -d

# Verify health
docker compose -f docker-compose.prod.yml ps
curl https://api.yourdomain.com/health
```

### 11.3 Database Migrations

```bash
# Apply migrations in production
docker compose exec backend alembic upgrade head

# Verify migration status
docker compose exec backend alembic current
```

---

## 12. Performance Optimization

### 12.1 Response Time SLAs

| Operation | Target (p95) | Maximum |
|-----------|--------------|---------|
| API Read | 100ms | 500ms |
| API Write | 200ms | 1000ms |
| Auth Operations | 150ms | 500ms |
| AI Operations | 2000ms | 10000ms |
| File Upload | 5000ms | 30000ms |

### 12.2 Database Optimization

- Connection pooling (20 connections default)
- Query optimization with EXPLAIN ANALYZE
- Index coverage for common queries
- Read replicas for scaling reads

### 12.3 Caching Strategy

| Data Type | Cache Duration | Invalidation |
|-----------|----------------|--------------|
| User Sessions | 15 minutes | On logout |
| Company Settings | 1 hour | On update |
| Job Listings | 5 minutes | On update |
| Static Content | 24 hours | On deploy |

### 12.4 API Optimization

- Pagination for list endpoints (default: 20 items)
- Field filtering for large responses
- Gzip compression for responses
- Connection keep-alive

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| JWT | JSON Web Token - secure token format for authentication |
| ORM | Object-Relational Mapping - database abstraction layer |
| SSR | Server-Side Rendering - Next.js rendering strategy |
| STT | Speech-to-Text - converting audio to text |
| Celery | Distributed task queue for background processing |
| Alembic | Database migration tool for SQLAlchemy |

## Appendix B: Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | October 2024 | Engineering Team | Initial release |
| 1.5.0 | November 2024 | Engineering Team | Added AI integration specs |
| 2.0.0 | December 2024 | Engineering Team | Production release |
| 2.1.0 | January 2026 | Engineering Team | Updated architecture, migration files, comprehensive API documentation |

---

This document is confidential and intended for internal use only.
