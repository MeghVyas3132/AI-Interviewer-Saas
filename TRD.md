# Technical Requirements Document (TRD)# Technical Requirements Document (TRD)



## AI Interviewer Platform## AI Interviewer Platform



**Version:** 2.1.0  **Version:** 2.0.0  

**Last Updated:** January 2026  **Last Updated:** December 2024  

**Document Owner:** Engineering Team  **Document Owner:** Engineering Team  

**Status:** Production Ready**Status:** Production Ready



------



## Table of Contents## Table of Contents



1. [System Overview](#1-system-overview)1. [System Overview](#1-system-overview)

2. [Architecture](#2-architecture)2. [Architecture](#2-architecture)

3. [Technology Stack](#3-technology-stack)3. [Technology Stack](#3-technology-stack)

4. [Database Design](#4-database-design)4. [API Specifications](#4-api-specifications)

5. [API Specifications](#5-api-specifications)5. [Database Design](#5-database-design)

6. [Authentication and Security](#6-authentication-and-security)6. [Security Architecture](#6-security-architecture)

7. [AI Service Integration](#7-ai-service-integration)7. [Infrastructure Requirements](#7-infrastructure-requirements)

8. [Background Task Processing](#8-background-task-processing)8. [Integration Points](#8-integration-points)

9. [Infrastructure Requirements](#9-infrastructure-requirements)9. [Performance Requirements](#9-performance-requirements)

10. [Monitoring and Observability](#10-monitoring-and-observability)10. [Monitoring and Observability](#10-monitoring-and-observability)

11. [Deployment Guidelines](#11-deployment-guidelines)11. [Deployment Guidelines](#11-deployment-guidelines)

12. [Performance Optimization](#12-performance-optimization)12. [Known Issues and Mitigations](#12-known-issues-and-mitigations)



------



## 1. System Overview## 1. System Overview



### 1.1 Purpose### 1.1 Purpose



This document provides comprehensive technical specifications for the AI Interviewer Platform, a microservices-based application designed to automate technical interviews using artificial intelligence.This document provides comprehensive technical specifications for the AI Interviewer Platform, a microservices-based application designed to automate technical interviews using artificial intelligence.



### 1.2 Scope### 1.2 Scope



The system encompasses:The system encompasses:

- RESTful API backend (FastAPI/Python)

- RESTful API backend (FastAPI/Python)- Single-page application frontend (Next.js/React)

- Single-page application frontend (Next.js/React)- AI service for interview processing

- AI interview service for real-time interactions- Real-time communication via WebSockets

- Real-time audio communication via WebSockets- Asynchronous task processing (Celery)

- Asynchronous task processing (Celery)- Data persistence (PostgreSQL)

- Data persistence (PostgreSQL)- Caching layer (Redis)

- Caching layer (Redis)

- External AI integrations (Google Gemini, AssemblyAI)### 1.3 System Boundaries



### 1.3 System Boundaries```

                                    External Systems

```                                          |

                                    External Services    +-------------------------------------|-----------------------------------+

                                          |    |                              Load Balancer                               |

                            +-------------+-------------+    |                                     |                                    |

                            |             |             |    |    +----------------+    +------------------+    +------------------+    |

                      Google Gemini  AssemblyAI    Email Service    |    |   Frontend     |    |    Backend       |    |   AI Service     |    |

                            |             |             |    |    |  (Next.js)     |<-->|   (FastAPI)      |<-->|   (Node.js)      |    |

    +-------------------+---|-------------|-------------|-------------------+    |    +----------------+    +------------------+    +------------------+    |

    |                   |   |             |             |                   |    |           |                    |      |                   |              |

    |    +--------------+---+-------------+-------------+---------------+   |    |           |              +-----+------+-----+             |              |

    |    |                        Backend API                           |   |    |           |              |                  |             |              |

    |    |                       (FastAPI:8000)                         |   |    |    +------+------+  +----+----+      +------+------+      |              |

    |    +------------------+-------------------+-----------------------+   |    |    |   Redis     |  | PostgreSQL|    |   Celery    |      |              |

    |                       |                   |                           |    |    |   Cache     |  | Database  |    |   Workers   |      |              |

    |    +------------------+--+    +-----------+-----------+               |    |    +-------------+  +-----------+    +-------------+      |              |

    |    |    Frontend         |    |     AI Service        |               |    +---------------------------------------------------------------------- ---+

    |    |   (Next.js:3000)    |    |   (Internal:3000)     |               |```

    |    +---------------------+    +-----------+-----------+               |

    |                                           |                           |---

    |                               +-----------+-----------+               |

    |                               |   WebSocket Proxy     |               |## 2. Architecture

    |                               |      (Node:9003)      |               |

    |                               +-----------------------+               |### 2.1 Microservices Architecture

    |                                                                       |

    |    +------------------+    +------------------+    +---------------+  || Service | Port | Technology | Responsibility |

    |    |   PostgreSQL     |    |      Redis       |    |    Celery     |  ||---------|------|------------|----------------|

    |    |     (5432)       |    |     (6379)       |    |    Worker     |  || Frontend | 3000 | Next.js 15 | User interface, SSR |

    |    +------------------+    +------------------+    +---------------+  || Backend | 8000 | FastAPI | REST API, business logic |

    |                                                                       || AI Service | 9002 | Node.js | Interview AI, LLM integration |

    +-----------------------------------------------------------------------+| AI WS Proxy | 9003 | Node.js | WebSocket real-time communication |

```| PostgreSQL | 5432 | PostgreSQL 15 | Primary data store |

| Redis | 6379 | Redis Alpine | Caching, session store |

---| Celery | - | Python | Async task processing |



## 2. Architecture### 2.2 Data Flow Architecture



### 2.1 Microservices Architecture```

[Candidate Browser]

| Service | Container Name | Port | Technology | Responsibility |        |

|---------|----------------|------|------------|----------------|        v

| Frontend | ai_interviewer_frontend | 3000 | Next.js 15, React 18, TypeScript | User interface, SSR, client routing |[Next.js Frontend] --HTTP--> [FastAPI Backend] --SQL--> [PostgreSQL]

| Backend | ai_interviewer_backend | 8000 | FastAPI, Python 3.11 | REST API, business logic, authentication |        |                           |

| AI Service | ai-interviewer-coach | Internal | Next.js, Node.js | AI interview conductor, LLM integration |        |                           +--Redis--> [Cache/Sessions]

| WS Proxy | ai_interviewer_ws_proxy | 9003 | Node.js | WebSocket real-time audio streaming |        |                           |

| Database | ai_interviewer_db | 5432 | PostgreSQL 15 | Primary data store |        +--WebSocket--> [AI WS Proxy] --gRPC--> [AI Service] --HTTP--> [LLM API]

| Cache | ai_interviewer_redis | 6379 | Redis Alpine | Caching, session management, task broker |```

| Worker | ai_interviewer_celery | N/A | Python, Celery | Background task processing |

### 2.3 Component Interactions

### 2.2 Data Flow Architecture

#### 2.3.1 Authentication Flow

```

[User Browser]```

      |1. Client sends credentials to /api/v1/auth/login

      v2. Backend validates against PostgreSQL

[Next.js Frontend :3000] --HTTP REST--> [FastAPI Backend :8000] --SQL--> [PostgreSQL :5432]3. JWT tokens generated (access + refresh)

      |                                         |4. Access token returned in response body

      |                                         +--Redis--> [Cache/Sessions :6379]5. Refresh token set as HTTP-only cookie

      |                                         |6. Subsequent requests include Bearer token

      |                                         +--Task Queue--> [Celery Worker]7. Backend validates token, checks blacklist in Redis

      |                                                               |8. User context attached to request

      +--WebSocket--> [WS Proxy :9003] --Audio--> [AssemblyAI STT]    +--HTTP--> [Google Gemini API]```

      |

      +--HTTP Proxy--> [AI Service :3000] --HTTP--> [Google Gemini API]#### 2.3.2 Interview Flow

```

```

### 2.3 Component Interactions1. HR schedules interview, token generated

2. Candidate accesses /interview/{token}

#### 2.3.1 Authentication Flow3. Frontend validates token via Backend

4. Resume upload, ATS analysis triggered

```5. Device check (camera/microphone)

1. Client sends credentials to POST /api/v1/auth/login6. WebSocket connection established to AI WS Proxy

2. Backend validates credentials against PostgreSQL7. AI Service generates questions

3. JWT tokens generated (access token + refresh token)8. Speech-to-text captures responses

4. Access token returned in response body9. AI evaluates answers in real-time

5. Refresh token set as HTTP-only cookie10. Transcript saved to Backend

6. Subsequent requests include Authorization: Bearer <token>11. Verdict generated and stored

7. Backend validates token signature and expiry```

8. Backend checks token blacklist in Redis (for logout)

9. User context attached to request for authorization---

```

## 3. Technology Stack

#### 2.3.2 Interview Flow

### 3.1 Backend

```

1. HR schedules interview via POST /api/v1/interviews| Component | Technology | Version | Purpose |

2. Unique interview token generated and stored|-----------|------------|---------|---------|

3. Candidate accesses interview via /interview/{token}| Framework | FastAPI | 0.104+ | REST API framework |

4. Frontend validates token via GET /api/v1/interviews/validate/{token}| Runtime | Python | 3.11 | Application runtime |

5. Candidate grants microphone permission| ORM | SQLAlchemy | 2.0 | Database abstraction |

6. WebSocket connection established to WS Proxy (port 9003)| Migration | Alembic | 1.13 | Schema migrations |

7. AI Service generates questions based on job template| Validation | Pydantic | 2.0 | Data validation |

8. Audio streamed to AssemblyAI for real-time transcription| Task Queue | Celery | 5.3 | Async processing |

9. Transcribed text sent to AI for evaluation| HTTP Client | httpx | 0.25 | External API calls |

10. AI provides follow-up questions and feedback| Testing | pytest | 7.4 | Unit/integration tests |

11. Interview transcript saved to PostgreSQL

12. Verdict generated via Celery background task### 3.2 Frontend

13. Results available to HR and assigned employees

```| Component | Technology | Version | Purpose |

|-----------|------------|---------|---------|

#### 2.3.3 ATS Analysis Flow| Framework | Next.js | 15.x | React framework |

| Runtime | Node.js | 18+ | JavaScript runtime |

```| UI Library | React | 18.x | Component library |

1. Candidate uploads resume via POST /api/v1/ai/ats-check| Styling | Tailwind CSS | 3.x | Utility-first CSS |

2. Backend extracts text from PDF/DOCX/TXT file| Type Safety | TypeScript | 5.x | Static typing |

3. Resume text sent to Google Gemini API| State | React Context | - | State management |

4. AI analyzes resume against 7 scoring categories| HTTP Client | Axios | 1.x | API communication |

5. Each category scored out of 5 points

6. Overall score calculated (0-100)### 3.3 Infrastructure

7. Detailed feedback, keywords, and improvements returned

8. Results displayed in frontend with visual indicators| Component | Technology | Version | Purpose |

```|-----------|------------|---------|---------|

| Container | Docker | 24+ | Containerization |

---| Orchestration | Docker Compose | 2.x | Local orchestration |

| Database | PostgreSQL | 15 | Primary data store |

## 3. Technology Stack| Cache | Redis | Alpine | Caching, sessions |

| Reverse Proxy | Nginx | 1.25 | Load balancing |

### 3.1 Backend

### 3.4 External Services

| Component | Technology | Version | Purpose |

|-----------|------------|---------|---------|| Service | Purpose | Integration |

| Framework | FastAPI | 0.104+ | Async REST API framework ||---------|---------|-------------|

| Runtime | Python | 3.11 | Application runtime || Google Gemini | LLM for AI interviews | REST API |

| ORM | SQLAlchemy | 2.0 | Async database abstraction || Groq | Alternative LLM provider | REST API |

| Migration | Alembic | 1.13 | Database schema migrations || SendGrid | Email notifications | REST API |

| Validation | Pydantic | 2.0 | Request/response validation || AWS SES | Email (alternative) | AWS SDK |

| Task Queue | Celery | 5.3 | Async background processing |

| HTTP Client | httpx | 0.25 | Async external API calls |---

| PDF Parser | PyPDF2, pdfplumber | 3.0, 0.10 | Resume PDF text extraction |

| DOCX Parser | python-docx | 0.8 | Resume DOCX text extraction |## 4. API Specifications

| Testing | pytest | 7.4 | Unit and integration tests |

| Password Hashing | passlib[bcrypt] | 1.7 | Secure password storage |### 4.1 API Versioning

| JWT | python-jose | 3.3 | Token generation and validation |

All API endpoints are prefixed with `/api/v1/` for version control.

### 3.2 Frontend

### 4.2 Core Endpoints

| Component | Technology | Version | Purpose |

|-----------|------------|---------|---------|#### 4.2.1 Authentication

| Framework | Next.js | 15.x | React framework with SSR |

| Runtime | Node.js | 18+ | JavaScript runtime || Method | Endpoint | Description | Auth |

| UI Library | React | 18.x | Component library ||--------|----------|-------------|------|

| Styling | Tailwind CSS | 3.x | Utility-first CSS framework || POST | /auth/login | User login | None |

| Type Safety | TypeScript | 5.x | Static typing || POST | /auth/logout | User logout | Required |

| State Management | React Context | Built-in | Application state || POST | /auth/refresh | Refresh token | Cookie |

| HTTP Client | Fetch API | Built-in | API communication || GET | /auth/me | Current user info | Required |

| Cookie Management | js-cookie | 3.x | Client-side cookies |

#### 4.2.2 Candidates

### 3.3 AI Service

| Method | Endpoint | Description | Auth |

| Component | Technology | Version | Purpose ||--------|----------|-------------|------|

|-----------|------------|---------|---------|| GET | /candidates | List candidates | HR/Admin |

| Framework | Next.js | 15.x | AI interview interface || POST | /candidates | Create candidate | HR/Admin |

| Runtime | Node.js | 18+ | JavaScript runtime || GET | /candidates/{id} | Get candidate | HR/Admin |

| WebSocket | ws | 8.x | Real-time communication || PATCH | /candidates/{id} | Update candidate | HR/Admin |

| Audio Processing | AssemblyAI SDK | Latest | Speech-to-text || DELETE | /candidates/{id} | Delete candidate | HR/Admin |

| POST | /candidates/bulk-import | Import CSV | HR/Admin |

### 3.4 Infrastructure

#### 4.2.3 Interviews

| Component | Technology | Version | Purpose |

|-----------|------------|---------|---------|| Method | Endpoint | Description | Auth |

| Container Runtime | Docker | 24+ | Application containerization ||--------|----------|-------------|------|

| Orchestration | Docker Compose | 2.x | Local service orchestration || GET | /interviews | List interviews | HR/Admin |

| Database | PostgreSQL | 15 | Primary relational data store || POST | /interviews | Create interview | HR/Admin |

| Cache/Broker | Redis | Alpine | Caching, sessions, Celery broker || GET | /interviews/{id} | Get interview | HR/Admin |

| PATCH | /interviews/{id} | Update interview | HR/Admin |

### 3.5 External Services| POST | /interviews/{id}/complete | Complete interview | System |

| GET | /interviews/validate/{token} | Validate token | None |

| Service | Provider | Purpose | Integration Method |

|---------|----------|---------|-------------------|#### 4.2.4 AI Services

| LLM | Google Gemini 2.5 Flash | Question generation, ATS analysis, interview evaluation | REST API |

| Speech-to-Text | AssemblyAI | Real-time audio transcription | WebSocket || Method | Endpoint | Description | Auth |

|--------|----------|-------------|------|

---| POST | /ai/ats/check | ATS resume check | Optional |

| POST | /ai/questions/generate | Generate questions | HR/Admin |

## 4. Database Design| POST | /ai/transcript-callback | Save transcript | System |

| GET | /ai/reports | List AI reports | HR/Admin |

### 4.1 Entity Relationship Overview

#### 4.2.5 HR Management

```

companies (1) ----< (N) users| Method | Endpoint | Description | Auth |

companies (1) ----< (N) candidates|--------|----------|-------------|------|

companies (1) ----< (N) job_templates| GET | /hr/dashboard | Dashboard metrics | HR |

job_templates (1) ----< (N) questions| GET | /hr/candidates | Assigned candidates | HR |

candidates (1) ----< (N) interviews| POST | /hr/candidates/schedule | Schedule interview | HR |

candidates (1) ----< (N) interview_rounds| POST | /hr/interviews/{id}/transcript | Save transcript | HR |

users (1) ----< (N) interviews (as interviewer)

users (1) ----< (N) candidates (as assigned_to)#### 4.2.6 Employee Portal

```

| Method | Endpoint | Description | Auth |

### 4.2 Core Tables|--------|----------|-------------|------|

| GET | /employee/my-candidates | Assigned candidates | Employee |

#### 4.2.1 Users Table| GET | /employee/my-interviews | Employee interviews | Employee |

| GET | /employee/candidate-profile/{id} | Detailed profile | Employee |

| Column | Type | Constraints | Description || PUT | /employee/my-candidates/{id}/status | Update status | Employee |

|--------|------|-------------|-------------|

| id | UUID | PRIMARY KEY | Unique identifier |#### 4.2.7 Candidate Portal

| company_id | UUID | FOREIGN KEY | Company association |

| email | VARCHAR(255) | UNIQUE, NOT NULL | Login email || Method | Endpoint | Description | Auth |

| password_hash | VARCHAR(255) | NOT NULL | bcrypt hashed password ||--------|----------|-------------|------|

| name | VARCHAR(255) | NOT NULL | Full name || GET | /candidate-portal/profile | Candidate profile | Candidate |

| role | ENUM | NOT NULL | SYSTEM_ADMIN, HR, EMPLOYEE, CANDIDATE || GET | /candidate-portal/interviews | Candidate interviews | Candidate |

| custom_role_id | UUID | FOREIGN KEY, NULLABLE | Custom role reference || GET | /candidate-portal/my-interview-results | Interview results | Candidate |

| manager_id | UUID | FOREIGN KEY, NULLABLE | Reporting manager |

| department | VARCHAR(100) | NULLABLE | Department name |### 4.3 Request/Response Formats

| is_active | BOOLEAN | DEFAULT TRUE | Account status |

| email_verified | BOOLEAN | DEFAULT FALSE | Email verification status |#### 4.3.1 Standard Error Response

| verification_token | VARCHAR(255) | NULLABLE | Email verification token |

| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |```json

| updated_at | TIMESTAMP | ON UPDATE | Last update timestamp |{

  "detail": "Error message description",

#### 4.2.2 Companies Table  "code": "ERROR_CODE",

  "timestamp": "2024-12-24T12:00:00Z"

| Column | Type | Constraints | Description |}

|--------|------|-------------|-------------|```

| id | UUID | PRIMARY KEY | Unique identifier |

| name | VARCHAR(255) | NOT NULL | Company name |#### 4.3.2 Pagination Response

| domain | VARCHAR(255) | NULLABLE | Company domain |

| is_active | BOOLEAN | DEFAULT TRUE | Active status |```json

| settings | JSONB | DEFAULT '{}' | Company configuration |{

| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |  "items": [...],

  "total": 100,

#### 4.2.3 Candidates Table  "page": 1,

  "page_size": 20,

| Column | Type | Constraints | Description |  "pages": 5

|--------|------|-------------|-------------|}

| id | UUID | PRIMARY KEY | Unique identifier |```

| company_id | UUID | FOREIGN KEY | Company association |

| email | VARCHAR(255) | NOT NULL | Candidate email |### 4.4 Rate Limiting

| name | VARCHAR(255) | NOT NULL | Full name |

| phone | VARCHAR(50) | NULLABLE | Phone number || Endpoint Category | Limit | Window |

| resume_url | TEXT | NULLABLE | Resume file path ||-------------------|-------|--------|

| resume_text | TEXT | NULLABLE | Extracted resume text || Authentication | 10 | 1 minute |

| status | ENUM | DEFAULT 'new' | Pipeline status || Standard API | 100 | 1 minute |

| assigned_to | UUID | FOREIGN KEY, NULLABLE | Assigned employee || AI Operations | 20 | 1 minute |

| job_template_id | UUID | FOREIGN KEY, NULLABLE | Applied job || File Upload | 5 | 1 minute |

| source | VARCHAR(100) | NULLABLE | Application source |

| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |---



#### 4.2.4 Job Templates Table## 5. Database Design



| Column | Type | Constraints | Description |### 5.1 Entity Relationship Diagram

|--------|------|-------------|-------------|

| id | UUID | PRIMARY KEY | Unique identifier |```

| company_id | UUID | FOREIGN KEY | Company association |+---------------+       +----------------+       +---------------+

| created_by | UUID | FOREIGN KEY | Creator user ID ||   companies   |       |     users      |       |  candidates   |

| title | VARCHAR(255) | NOT NULL | Job title |+---------------+       +----------------+       +---------------+

| description | TEXT | NULLABLE | Job description || id (PK)       |<----->| id (PK)        |<----->| id (PK)       |

| ai_prompt | TEXT | NULLABLE | Custom AI prompt || name          |       | email          |       | email         |

| ai_model | VARCHAR(100) | DEFAULT 'gemini-2.5-flash' | AI model to use || domain        |       | password_hash  |       | first_name    |

| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp || status        |       | role           |       | last_name     |

| created_at    |       | company_id(FK) |       | company_id(FK)|

#### 4.2.5 Questions Table+---------------+       | is_active      |       | status        |

                        +----------------+       | assigned_to   |

| Column | Type | Constraints | Description |                                                 +---------------+

|--------|------|-------------|-------------|                                                        |

| id | UUID | PRIMARY KEY | Unique identifier |                                                        v

| job_template_id | UUID | FOREIGN KEY | Associated job |+---------------+       +----------------+       +---------------+

| text | TEXT | NOT NULL | Question text ||     jobs      |       |   interviews   |       |  ai_reports   |

| created_by | UUID | FOREIGN KEY | Creator user ID |+---------------+       +----------------+       +---------------+

| weight | INTEGER | DEFAULT 1 | Question weight || id (PK)       |<----->| id (PK)        |<----->| id (PK)       |

| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp || title         |       | candidate_id   |       | interview_id  |

| description   |       | job_id (FK)    |       | report_type   |

#### 4.2.6 Interviews Table| company_id    |       | round          |       | score         |

| status        |       | status         |       | summary       |

| Column | Type | Constraints | Description || requirements  |       | token          |       | provider_resp |

|--------|------|-------------|-------------|+---------------+       | scheduled_time |       +---------------+

| id | UUID | PRIMARY KEY | Unique identifier |                        +----------------+

| candidate_id | UUID | FOREIGN KEY | Candidate reference |```

| job_template_id | UUID | FOREIGN KEY | Job template reference |

| interviewer_id | UUID | FOREIGN KEY, NULLABLE | Interviewer reference |### 5.2 Core Tables

| token | VARCHAR(255) | UNIQUE | Access token |

| status | ENUM | DEFAULT 'scheduled' | Interview status |#### 5.2.1 users

| scheduled_at | TIMESTAMP | NULLABLE | Scheduled time |

| started_at | TIMESTAMP | NULLABLE | Actual start time || Column | Type | Constraints | Description |

| completed_at | TIMESTAMP | NULLABLE | Completion time ||--------|------|-------------|-------------|

| transcript | TEXT | NULLABLE | Full transcript || id | UUID | PK | Unique identifier |

| score | INTEGER | NULLABLE | Overall score || email | VARCHAR(255) | UNIQUE, NOT NULL | User email |

| verdict | ENUM | NULLABLE | PASS, REVIEW, FAIL || password_hash | VARCHAR(255) | NOT NULL | Bcrypt hash |

| ai_report | JSONB | NULLABLE | Detailed AI analysis || role | ENUM | NOT NULL | ADMIN/HR/EMPLOYEE/CANDIDATE |

| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp || company_id | UUID | FK | Company reference |

| first_name | VARCHAR(100) | | User first name |

#### 4.2.7 Interview Rounds Table| last_name | VARCHAR(100) | | User last name |

| is_active | BOOLEAN | DEFAULT TRUE | Account status |

| Column | Type | Constraints | Description || is_verified | BOOLEAN | DEFAULT FALSE | Email verified |

|--------|------|-------------|-------------|| created_at | TIMESTAMP | DEFAULT NOW() | Creation time |

| id | UUID | PRIMARY KEY | Unique identifier || updated_at | TIMESTAMP | | Last update |

| candidate_id | UUID | FOREIGN KEY | Candidate reference |

| job_template_id | UUID | FOREIGN KEY | Job template reference |#### 5.2.2 candidates

| round_number | INTEGER | NOT NULL | Round sequence |

| round_type | VARCHAR(50) | NOT NULL | Round type (technical, hr, etc.) || Column | Type | Constraints | Description |

| status | ENUM | DEFAULT 'pending' | Round status ||--------|------|-------------|-------------|

| scheduled_at | TIMESTAMP | NULLABLE | Scheduled time || id | UUID | PK | Unique identifier |

| interview_link | TEXT | NULLABLE | Interview access link || user_id | UUID | FK UNIQUE | Linked user account |

| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp || company_id | UUID | FK NOT NULL | Company reference |

| email | VARCHAR(255) | NOT NULL | Contact email |

### 4.3 Database Indexes| first_name | VARCHAR(100) | | Candidate name |

| last_name | VARCHAR(100) | | Candidate surname |

```sql| phone | VARCHAR(50) | | Contact phone |

-- Performance indexes| position | VARCHAR(200) | | Applied position |

CREATE INDEX idx_users_company_id ON users(company_id);| domain | VARCHAR(100) | | Technical domain |

CREATE INDEX idx_users_email ON users(email);| status | ENUM | DEFAULT SCREENING | Pipeline status |

CREATE INDEX idx_candidates_company_id ON candidates(company_id);| experience_years | INTEGER | | Years experience |

CREATE INDEX idx_candidates_status ON candidates(status);| qualifications | TEXT | | Qualifications |

CREATE INDEX idx_candidates_assigned_to ON candidates(assigned_to);| assigned_to | UUID | FK | Assigned employee |

CREATE INDEX idx_interviews_candidate_id ON interviews(candidate_id);| created_at | TIMESTAMP | DEFAULT NOW() | Creation time |

CREATE INDEX idx_interviews_token ON interviews(token);

CREATE INDEX idx_questions_job_template_id ON questions(job_template_id);#### 5.2.3 interviews

```

| Column | Type | Constraints | Description |

### 4.4 Migration Management|--------|------|-------------|-------------|

| id | UUID | PK | Unique identifier |

Database migrations are managed via Alembic:| candidate_id | UUID | FK NOT NULL | Candidate reference |

| company_id | UUID | FK NOT NULL | Company reference |

```bash| job_id | UUID | FK | Job reference |

# Create new migration| round | ENUM | NOT NULL | Interview round |

docker compose exec backend alembic revision --autogenerate -m "description"| status | ENUM | DEFAULT SCHEDULED | Interview status |

| scheduled_time | TIMESTAMP | | Scheduled datetime |

# Apply migrations| ai_interview_token | VARCHAR(255) | UNIQUE | Access token |

docker compose exec backend alembic upgrade head| notes | TEXT | | Interview notes |

| created_by | UUID | FK | Creator reference |

# Rollback one migration| created_at | TIMESTAMP | DEFAULT NOW() | Creation time |

docker compose exec backend alembic downgrade -1

#### 5.2.4 ai_reports

# View migration history

docker compose exec backend alembic history| Column | Type | Constraints | Description |

```|--------|------|-------------|-------------|

| id | UUID | PK | Unique identifier |

---| interview_id | UUID | FK | Interview reference |

| company_id | UUID | FK NOT NULL | Company reference |

## 5. API Specifications| report_type | VARCHAR(50) | NOT NULL | Report type |

| score | DECIMAL(5,2) | | Overall score |

### 5.1 API Conventions| summary | TEXT | | AI summary |

| provider_response | JSONB | | Full AI response |

- Base URL: `/api/v1/`| created_at | TIMESTAMP | DEFAULT NOW() | Creation time |

- Authentication: Bearer token in Authorization header

- Content-Type: `application/json` (except file uploads)### 5.3 Indexes

- Date format: ISO 8601 (YYYY-MM-DDTHH:MM:SSZ)

```sql

### 5.2 Authentication Endpoints-- Performance indexes

CREATE INDEX idx_candidates_company ON candidates(company_id);

| Method | Endpoint | Description | Auth Required |CREATE INDEX idx_candidates_status ON candidates(status);

|--------|----------|-------------|---------------|CREATE INDEX idx_candidates_assigned ON candidates(assigned_to);

| POST | /auth/login | User authentication | No |CREATE INDEX idx_interviews_candidate ON interviews(candidate_id);

| POST | /auth/logout | Token invalidation | Yes |CREATE INDEX idx_interviews_token ON interviews(ai_interview_token);

| POST | /auth/refresh | Refresh access token | Cookie |CREATE INDEX idx_interviews_status ON interviews(status);

| GET | /auth/me | Current user info | Yes |CREATE INDEX idx_ai_reports_interview ON ai_reports(interview_id);

CREATE INDEX idx_users_email ON users(email);

#### Login RequestCREATE INDEX idx_users_company ON users(company_id);

```

```json

POST /api/v1/auth/login### 5.4 Migrations

Content-Type: application/json

Migrations are managed via Alembic with the following structure:

{

  "email": "user@example.com",```

  "password": "securepassword"backend/alembic/versions/

}├── 001_initial.py

```├── 002_add_roles.py

├── 003_email_verification.py

#### Login Response├── 004_phase_2_candidates.py

├── 005_import_jobs.py

```json├── 006_interview_rounds.py

{├── 007_ai_reports.py

  "access_token": "eyJhbGciOiJIUzI1NiIs...",├── 008_audit_logs.py

  "token_type": "bearer",├── 009_availability_slots.py

  "user": {├── 010_interview_sessions.py

    "id": "uuid",└── 011_ai_service_compatibility.py

    "email": "user@example.com",```

    "name": "User Name",

    "role": "HR",---

    "company_id": "uuid"

  }## 6. Security Architecture

}

```### 6.1 Authentication



### 5.3 User Management Endpoints#### 6.1.1 JWT Token Structure



| Method | Endpoint | Description | Auth/Role |```json

|--------|----------|-------------|-----------|{

| GET | /users | List users (company-scoped) | HR, Admin |  "sub": "user_uuid",

| POST | /users | Create user | HR, Admin |  "email": "user@example.com",

| GET | /users/{id} | Get user details | HR, Admin |  "role": "HR",

| PUT | /users/{id} | Update user | HR, Admin |  "company_id": "company_uuid",

| DELETE | /users/{id} | Deactivate user | Admin |  "exp": 1735200000,

  "iat": 1735199000,

### 5.4 Candidate Endpoints  "type": "access"

}

| Method | Endpoint | Description | Auth/Role |```

|--------|----------|-------------|-----------|

| GET | /candidates | List candidates (paginated) | HR, Admin |#### 6.1.2 Token Lifetimes

| POST | /candidates | Create candidate | HR, Admin |

| GET | /candidates/{id} | Get candidate details | HR, Admin, Employee || Token Type | Lifetime | Storage |

| PUT | /candidates/{id} | Update candidate | HR, Admin ||------------|----------|---------|

| DELETE | /candidates/{id} | Delete candidate | HR, Admin || Access Token | 15 minutes | Memory/LocalStorage |

| POST | /candidates/bulk-import | Bulk import via CSV | HR, Admin || Refresh Token | 7 days | HTTP-only Cookie |

| DELETE | /candidates/bulk-delete | Delete multiple candidates | HR, Admin || Interview Token | 7 days | Database |

| Verification Token | 24 hours | Database |

#### List Candidates Request

### 6.2 Authorization

```

GET /api/v1/candidates?page=1&per_page=20&status=new#### 6.2.1 Role Hierarchy

Authorization: Bearer <token>

``````

ADMIN

#### List Candidates Response  |

  +-- Full system access

```json  +-- Company management

{  +-- User management

  "candidates": [  

    {HR

      "id": "uuid",  |

      "name": "John Doe",  +-- Company-scoped access

      "email": "john@example.com",  +-- Candidate management

      "status": "new",  +-- Interview scheduling

      "created_at": "2026-01-04T10:00:00Z"  +-- Employee management

    }  

  ],EMPLOYEE

  "total": 150,  |

  "page": 1,  +-- Assigned candidate access

  "per_page": 20,  +-- Interview viewing

  "pages": 8  +-- Status updates

}  

```CANDIDATE

  |

### 5.5 Job Management Endpoints  +-- Own profile access

  +-- Interview participation

| Method | Endpoint | Description | Auth/Role |  +-- Results viewing

|--------|----------|-------------|-----------|```

| GET | /jobs | List job templates | HR, Admin |

| POST | /jobs | Create job template | HR, Admin |#### 6.2.2 Endpoint Protection

| GET | /jobs/{id} | Get job details | HR, Admin |

| PUT | /jobs/{id} | Update job | HR, Admin |```python

| DELETE | /jobs/{id} | Delete job | HR, Admin |# Role-based decorators

| POST | /jobs/{id}/generate-questions | Generate AI questions | HR, Admin |@router.get("/admin/endpoint")

| GET | /jobs/{id}/questions | List job questions | HR, Admin |async def admin_only(user: User = Depends(require_admin)):

    pass

#### Generate Questions Request

@router.get("/hr/endpoint")

```async def hr_only(user: User = Depends(require_hr)):

POST /api/v1/jobs/{job_id}/generate-questions    pass

Authorization: Bearer <token>

```@router.get("/employee/endpoint")

async def employee_only(user: User = Depends(require_employee)):

#### Generate Questions Response    pass

```

```json

{### 6.3 Data Protection

  "status": "queued"

}#### 6.3.1 Encryption

```

| Data Type | At Rest | In Transit |

### 5.6 Interview Endpoints|-----------|---------|------------|

| Passwords | bcrypt (12 rounds) | TLS 1.3 |

| Method | Endpoint | Description | Auth/Role || PII | Database encryption | TLS 1.3 |

|--------|----------|-------------|-----------|| Tokens | N/A | TLS 1.3 |

| GET | /interviews | List interviews | HR, Admin || Files | AES-256 | TLS 1.3 |

| POST | /interviews | Schedule interview | HR, Admin |

| GET | /interviews/{id} | Get interview details | HR, Admin, Employee |#### 6.3.2 Data Isolation

| GET | /interviews/validate/{token} | Validate interview token | None |

| PUT | /interviews/{id}/complete | Mark interview complete | System |- Multi-tenant isolation via company_id

| GET | /interviews/{id}/transcript | Get interview transcript | HR, Admin, Employee |- Row-level security in queries

- API responses filtered by company context

### 5.7 AI Service Endpoints

### 6.4 Security Headers

| Method | Endpoint | Description | Auth/Role |

|--------|----------|-------------|-----------|```python

| POST | /ai/ats-check | Analyze resume for ATS compatibility | Candidate |# Applied via middleware

| POST | /ai/generate-questions | Generate interview questions | HR, Admin |X-Content-Type-Options: nosniff

X-Frame-Options: DENY

#### ATS Check RequestX-XSS-Protection: 1; mode=block

Strict-Transport-Security: max-age=31536000; includeSubDomains

```Content-Security-Policy: default-src 'self'

POST /api/v1/ai/ats-check```

Authorization: Bearer <token>

Content-Type: multipart/form-data### 6.5 Known Vulnerabilities and Mitigations



resume: <file>| Issue | Risk Level | Mitigation |

job_description: <optional text>|-------|------------|------------|

```| Hardcoded API keys in seed data | Medium | Use environment variables in production |

| Broad exception handling | Low | Implement specific exception types |

#### ATS Check Response| Console logging in production | Low | Use proper logging framework |

| Token in localStorage | Medium | Already using HTTP-only cookies for refresh |

```json

{---

  "score": 75,

  "summary": "Resume shows strong technical background...",## 7. Infrastructure Requirements

  "section_scores": {

    "contact_info": {### 7.1 Minimum Hardware Requirements

      "score": 4,

      "feedback": "Contact information is complete..."| Component | Development | Production |

    },|-----------|-------------|------------|

    "format_structure": {| CPU | 2 cores | 4+ cores |

      "score": 5,| RAM | 4 GB | 16+ GB |

      "feedback": "Clear headings and structure..."| Storage | 20 GB SSD | 100+ GB SSD |

    },| Network | 100 Mbps | 1 Gbps |

    "professional_summary": {

      "score": 4,### 7.2 Container Resources

      "feedback": "Summary effectively highlights..."

    },| Service | CPU Limit | Memory Limit | Replicas |

    "work_experience": {|---------|-----------|--------------|----------|

      "score": 3,| Frontend | 0.5 | 512 MB | 2 |

      "feedback": "Experience section needs..."| Backend | 1.0 | 1 GB | 3 |

    },| AI Service | 2.0 | 2 GB | 2 |

    "technical_skills": {| PostgreSQL | 2.0 | 4 GB | 1 (primary) |

      "score": 4,| Redis | 0.5 | 512 MB | 1 |

      "feedback": "Skills well-categorized..."| Celery | 1.0 | 1 GB | 2 |

    },

    "education": {### 7.3 Network Configuration

      "score": 3,

      "feedback": "Education section present..."| Service | Internal Port | External Port | Protocol |

    },|---------|---------------|---------------|----------|

    "keyword_optimization": {| Frontend | 3000 | 443 | HTTPS |

      "score": 4,| Backend | 8000 | 443/api | HTTPS |

      "feedback": "Good keyword density..."| AI WS Proxy | 9003 | 443/ws | WSS |

    }| PostgreSQL | 5432 | - | TCP |

  },| Redis | 6379 | - | TCP |

  "highlights": ["Strong technical skills", "Clear formatting"],

  "improvements": ["Add more quantified achievements", "Include certifications"],### 7.4 Environment Variables

  "keywords_found": ["Python", "Docker", "AWS"],

  "keywords_missing": ["Kubernetes", "CI/CD"],```bash

  "formatting_issues": [],# Required for all environments

  "ats_friendly": trueSECRET_KEY=your-256-bit-secret-key

}DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db

```REDIS_URL=redis://localhost:6379/0



### 5.8 Company Endpoints# Optional - Email

SENDGRID_API_KEY=

| Method | Endpoint | Description | Auth/Role |SMTP_HOST=

|--------|----------|-------------|-----------|SMTP_USER=

| GET | /companies | List companies | System Admin |SMTP_PASSWORD=

| GET | /companies/{id} | Get company details | System Admin |

| PUT | /companies/{id} | Update company | System Admin |# Optional - AI

| POST | /register/company | Request company registration | None |AI_SERVICE_URL=http://ai-service:9002

| GET | /admin/company-requests | List pending requests | System Admin |GROQ_API_KEY=

| POST | /admin/company-requests/{id}/approve | Approve request | System Admin |```

| POST | /admin/company-requests/{id}/reject | Reject request | System Admin |

---

### 5.9 Error Response Format

## 8. Integration Points

```json

{### 8.1 AI Service Integration

  "detail": "Error message describing the issue",

  "error_code": "AUTH_001",#### 8.1.1 Question Generation

  "timestamp": "2026-01-04T10:00:00Z"

}```

```POST /ai/questions/generate

Request:

### 5.10 HTTP Status Codes{

  "job_description": "...",

| Code | Description | Usage |  "domain": "backend",

|------|-------------|-------|  "experience_level": "senior",

| 200 | OK | Successful GET, PUT, PATCH |  "count": 10

| 201 | Created | Successful POST (resource created) |}

| 204 | No Content | Successful DELETE |

| 400 | Bad Request | Invalid request data |Response:

| 401 | Unauthorized | Missing or invalid authentication |{

| 403 | Forbidden | Insufficient permissions |  "questions": [

| 404 | Not Found | Resource does not exist |    {

| 409 | Conflict | Duplicate resource |      "id": "q1",

| 422 | Unprocessable Entity | Validation error |      "text": "...",

| 429 | Too Many Requests | Rate limit exceeded |      "category": "technical",

| 500 | Internal Server Error | Server-side error |      "difficulty": "medium"

    }

---  ]

}

## 6. Authentication and Security```



### 6.1 JWT Token Structure#### 8.1.2 ATS Check



**Access Token Payload:**```

POST /ai/ats/check

```jsonRequest:

{{

  "sub": "user-uuid",  "resume_text": "...",

  "email": "user@example.com",  "job_description": "..."

  "role": "HR",}

  "company_id": "company-uuid",

  "exp": 1704369600,Response:

  "iat": 1704366000{

}  "score": 75,

```  "summary": "...",

  "keywords_found": [...],

**Token Configuration:**  "keywords_missing": [...]

}

| Parameter | Value | Description |```

|-----------|-------|-------------|

| Access Token Expiry | 30 minutes | Short-lived for security |### 8.2 WebSocket Protocol

| Refresh Token Expiry | 7 days | Long-lived for convenience |

| Algorithm | HS256 | HMAC with SHA-256 |#### 8.2.1 Connection

| Secret Key | 256-bit | Environment variable |

```javascript

### 6.2 Password Securityws://localhost:9003/ws/interview/{token}

```

- Hashing: bcrypt with configurable rounds (default: 12)

- Minimum length: 8 characters#### 8.2.2 Message Types

- Complexity: Mixed case, numbers, special characters recommended

```json

### 6.3 Role-Based Access Control (RBAC)// Client -> Server

{

| Role | Company Scope | Candidates | Jobs | Users | System |  "type": "user_message",

|------|---------------|------------|------|-------|--------|  "content": "candidate answer text"

| SYSTEM_ADMIN | All | Read/Write | Read/Write | Read/Write | Full |}

| HR | Own | Read/Write | Read/Write | Read/Write | None |

| EMPLOYEE | Own | Read (assigned) | Read | Read | None |// Server -> Client

| CANDIDATE | N/A | Self only | Read | Self only | None |{

  "type": "ai_response",

### 6.4 Security Headers  "content": "AI question or feedback"

}

```python

# Implemented via middleware{

{  "type": "interview_complete",

    "X-Content-Type-Options": "nosniff",  "verdict": "PASS",

    "X-Frame-Options": "DENY",  "score": 85

    "X-XSS-Protection": "1; mode=block",}

    "Strict-Transport-Security": "max-age=31536000; includeSubDomains"```

}

```### 8.3 Email Integration



### 6.5 Rate Limiting#### 8.3.1 SendGrid Template IDs



| Endpoint Category | Limit | Window || Template | Purpose |

|-------------------|-------|--------||----------|---------|

| Authentication | 5 requests | 1 minute || interview_scheduled | Interview scheduling notification |

| API General | 100 requests | 1 minute || interview_reminder | 24-hour reminder |

| AI Endpoints | 10 requests | 1 minute || results_available | Results notification |

| File Upload | 10 requests | 5 minutes || verification | Email verification |



### 6.6 CORS Configuration---



```python## 9. Performance Requirements

CORS_ORIGINS = [

    "http://localhost:3000",    # Frontend### 9.1 Response Time SLAs

    "http://localhost:3001",    # AI Service

    "http://localhost:9002",    # Legacy| Operation | Target (p95) | Maximum |

]|-----------|--------------|---------|

```| API Read | 100ms | 500ms |

| API Write | 200ms | 1000ms |

---| Auth Operations | 150ms | 500ms |

| AI Operations | 2000ms | 10000ms |

## 7. AI Service Integration| File Upload | 5000ms | 30000ms |



### 7.1 Google Gemini Integration### 9.2 Throughput Requirements



**Configuration:**| Metric | Target |

|--------|--------|

| Parameter | Value || Concurrent Users | 1000 |

|-----------|-------|| Requests/Second | 500 |

| Model | gemini-2.5-flash || Concurrent Interviews | 100 |

| API Base | https://generativelanguage.googleapis.com/v1beta || Database Connections | 50 |

| Max Output Tokens | 8000 (ATS), 2048 (questions) |

| Temperature | 0.0 (deterministic) |### 9.3 Caching Strategy



**Retry Strategy:**| Data Type | Cache Duration | Invalidation |

|-----------|----------------|--------------|

- Maximum attempts: 3| User Sessions | 15 minutes | On logout |

- Backoff: 3, 6, 9 seconds| Company Settings | 1 hour | On update |

- Rate limit handling: 5, 10, 15 seconds| Job Listings | 5 minutes | On update |

| Static Content | 24 hours | On deploy |

### 7.2 Question Generation

---

**Prompt Template:**

## 10. Monitoring and Observability

```

Generate {max_questions} technical interview questions for the following job role.### 10.1 Health Checks



Job Context:| Endpoint | Interval | Timeout |

{job_description}|----------|----------|---------|

| /health | 30s | 5s |

Requirements:| /health/db | 60s | 10s |

1. Questions should assess technical competency| /health/redis | 60s | 5s |

2. Include a mix of theoretical and practical questions

3. Vary difficulty from intermediate to advanced### 10.2 Logging

4. Questions should be clear and unambiguous

#### 10.2.1 Log Levels

Return as JSON: {"questions": ["question1", "question2", ...]}

```| Level | Usage |

|-------|-------|

### 7.3 ATS Resume Analysis| ERROR | Exceptions, failures |

| WARN | Degraded operations |

**Scoring Categories:**| INFO | Business events |

| DEBUG | Development only |

| Category | Max Score | Weight |

|----------|-----------|--------|#### 10.2.2 Log Format

| Contact Info | 5 | Completeness, professional email |

| Format Structure | 5 | Headings, bullet points, readability |```json

| Professional Summary | 5 | Keywords, clarity, relevance |{

| Work Experience | 5 | Relevance, quantification, recency |  "timestamp": "2024-12-24T12:00:00Z",

| Technical Skills | 5 | Categorization, relevance, depth |  "level": "INFO",

| Education | 5 | Completeness, relevance |  "service": "backend",

| Keyword Optimization | 5 | Density, relevance, placement |  "request_id": "uuid",

  "user_id": "uuid",

**Overall Score Calculation:**  "message": "Description",

- Sum of section scores normalized to 0-100 scale  "metadata": {}

- Additional factors: keyword density, formatting issues}

```

### 7.4 AssemblyAI Integration

### 10.3 Metrics

**WebSocket Configuration:**

| Metric | Type | Labels |

| Parameter | Value ||--------|------|--------|

|-----------|-------|| http_requests_total | Counter | method, path, status |

| Sample Rate | 16000 Hz || http_request_duration | Histogram | method, path |

| Encoding | PCM signed 16-bit || active_interviews | Gauge | company |

| Endpoint | wss://api.assemblyai.com/v2/realtime/ws || db_connections | Gauge | pool |



**Connection Flow:**### 10.4 Alerting Rules



```| Alert | Condition | Severity |

1. Client connects to WS Proxy (port 9003)|-------|-----------|----------|

2. WS Proxy authenticates with AssemblyAI| High Error Rate | error_rate > 5% for 5m | Critical |

3. Audio chunks streamed from browser| Slow Response | p95 > 2s for 10m | Warning |

4. Real-time transcription returned| Database Down | health check fails 3x | Critical |

5. Transcripts forwarded to AI service| High Memory | memory > 90% for 5m | Warning |

```

---

---

## 11. Deployment Guidelines

## 8. Background Task Processing

### 11.1 Development Setup

### 8.1 Celery Configuration

```bash

```python# Clone repository

CELERY_BROKER_URL = "redis://redis:6379/0"git clone https://github.com/org/ai-interviewer.git

CELERY_RESULT_BACKEND = "redis://redis:6379/0"cd ai-interviewer



CELERY_TASK_QUEUES = {# Start services

    "default": {"exchange": "tasks", "routing_key": "task.default"},docker compose up -d

    "email_default": {"exchange": "tasks", "routing_key": "email.default"},

    "email_high": {"exchange": "tasks", "routing_key": "email.high"},# Run migrations

    "bulk_import": {"exchange": "tasks", "routing_key": "bulk_import.default"},docker compose exec backend alembic upgrade head

}

```# Seed data (development only)

docker compose exec backend python reset_and_seed.py

### 8.2 Task Definitions```



| Task | Queue | Description | Retry Policy |### 11.2 Production Deployment

|------|-------|-------------|--------------|

| generate_questions_task | default | AI question generation | 3 retries, exponential backoff |```bash

| generate_verdict_task | default | Interview verdict generation | 3 retries |# Build images

| send_notification_task | email_default | Email notifications | 5 retries |docker compose -f docker-compose.prod.yml build

| process_bulk_import | bulk_import | CSV candidate import | No retry |

# Deploy with secrets

### 8.3 Task Implementation Patterndocker compose -f docker-compose.prod.yml up -d



```python# Verify health

@celery.task(name="ai.generate_questions_task", bind=True, max_retries=3)curl https://api.example.com/health

def generate_questions_task(self, job_template_id: str, max_questions: int = 10):```

    async def _run():

        # Create fresh database connection### 11.3 CI/CD Pipeline

        async_session, engine = get_fresh_async_session()

        async with async_session() as session:```yaml

            try:stages:

                # Task implementation  - lint

                pass  - test

            finally:  - security-scan

                await session.close()  - build

        await engine.dispose()  - deploy-staging

  - integration-test

    try:  - deploy-production

        asyncio.run(_run())```

    except Exception as e:

        raise self.retry(exc=e, countdown=2 ** self.request.retries)### 11.4 Rollback Procedure

```

```bash

---# Quick rollback

docker compose down

## 9. Infrastructure Requirementsdocker compose up -d --no-build



### 9.1 Docker Compose Services# Database rollback (if needed)

docker compose exec backend alembic downgrade -1

```yaml```

services:

  postgres:---

    image: postgres:15-alpine

    container_name: ai_interviewer_db## 12. Known Issues and Mitigations

    ports: ["5432:5432"]

    volumes: [postgres_data:/var/lib/postgresql/data]### 12.1 Security Issues

    healthcheck:

      test: ["CMD-SHELL", "pg_isready -U ai_interviewer_user"]| Issue | Location | Risk | Mitigation |

      interval: 5s|-------|----------|------|------------|

      timeout: 5s| Hardcoded passwords in seed script | reset_and_seed.py | Medium | Remove for production; use env vars |

      retries: 5| Default API key fallback | ai_service.py | Medium | Require API key in production |

| Broad exception handling | Multiple routes | Low | Implement specific exception types |

  redis:

    image: redis:alpine### 12.2 Technical Debt

    container_name: ai_interviewer_redis

    ports: ["6379:6379"]| Issue | Location | Impact | Resolution |

    healthcheck:|-------|----------|--------|------------|

      test: ["CMD", "redis-cli", "ping"]| Console.log statements | Frontend | Low | Replace with proper logger |

      interval: 5s| TODO comments | Multiple files | Low | Address in future sprints |

      timeout: 5s| Duplicate code patterns | Employee/HR routes | Medium | Extract to shared services |

      retries: 5

### 12.3 Edge Cases

  backend:

    build: ./backend| Scenario | Current Behavior | Recommended Fix |

    container_name: ai_interviewer_backend|----------|------------------|-----------------|

    ports: ["8000:8000"]| Interview timeout | Session abandoned | Implement auto-save |

    depends_on:| Network disconnect | Data loss possible | Add offline queue |

      postgres: {condition: service_healthy}| Concurrent updates | Last write wins | Implement optimistic locking |

      redis: {condition: service_healthy}| Large file upload | May timeout | Add chunked upload |

    healthcheck:

      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]### 12.4 Performance Concerns

      interval: 30s

      timeout: 10s| Issue | Impact | Mitigation |

      retries: 3|-------|--------|------------|

| N+1 queries in candidate listing | Slow page load | Add eager loading |

  frontend:| No connection pooling for AI service | Resource exhaustion | Implement httpx pool |

    build: ./frontend| Large transcript storage | DB bloat | Implement compression |

    container_name: ai_interviewer_frontend

    ports: ["3000:3000"]---

    depends_on: [backend]

## Appendix A: Error Codes

  ai-service:

    build: ./AI/Aigenthix_AI_Interviewer| Code | HTTP Status | Description |

    container_name: ai-interviewer-coach|------|-------------|-------------|

    depends_on: [backend, postgres]| AUTH_001 | 401 | Invalid credentials |

| AUTH_002 | 401 | Token expired |

  ai-ws-proxy:| AUTH_003 | 403 | Insufficient permissions |

    build: ./AI/Aigenthix_AI_Interviewer| CAND_001 | 404 | Candidate not found |

    container_name: ai_interviewer_ws_proxy| CAND_002 | 409 | Candidate already exists |

    ports: ["9003:9003"]| INT_001 | 404 | Interview not found |

    command: node ws-proxy-server.js| INT_002 | 400 | Invalid interview token |

| INT_003 | 409 | Interview already completed |

  celery_worker:

    build: ./backend## Appendix B: API Response Codes

    container_name: ai_interviewer_celery

    depends_on:| HTTP Status | Usage |

      postgres: {condition: service_healthy}|-------------|-------|

      redis: {condition: service_healthy}| 200 | Successful GET, PUT, PATCH |

    command: celery -A app.core.celery_config.celery_app worker -Q default,email_default,email_high,bulk_import -l info| 201 | Successful POST (created) |

```| 204 | Successful DELETE |

| 400 | Invalid request data |

### 9.2 Resource Requirements| 401 | Authentication required |

| 403 | Permission denied |

| Service | CPU | Memory | Storage || 404 | Resource not found |

|---------|-----|--------|---------|| 409 | Conflict (duplicate) |

| PostgreSQL | 2 cores | 4 GB | 50 GB SSD || 422 | Validation error |

| Redis | 1 core | 1 GB | 1 GB || 500 | Internal server error |

| Backend | 2 cores | 2 GB | - |

| Frontend | 1 core | 1 GB | - |---

| AI Service | 1 core | 1 GB | - |

| WS Proxy | 1 core | 512 MB | - |*This document is maintained by the Engineering Team and should be updated with each major release.*

| Celery | 2 cores | 2 GB | - |

### 9.3 Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@postgres:5432/ai_interviewer_db

# Redis
REDIS_URL=redis://redis:6379/0

# Security
SECRET_KEY=your-256-bit-secret-key
ALGORITHM=HS256

# AI Service
AI_SERVICE_API_KEY=your-gemini-api-key
AI_SERVICE_MODEL=gemini-2.5-flash

# External Services
ASSEMBLYAI_API_KEY=your-assemblyai-key
GOOGLE_API_KEY=your-google-api-key

# CORS
CORS_ORIGINS=["http://localhost:3000"]
```

---

## 10. Monitoring and Observability

### 10.1 Health Check Endpoints

| Endpoint | Interval | Timeout | Description |
|----------|----------|---------|-------------|
| /health | 30s | 5s | Basic service health |
| /health/db | 60s | 10s | Database connectivity |
| /health/redis | 60s | 5s | Redis connectivity |

### 10.2 Logging Configuration

**Log Format:**

```json
{
  "timestamp": "2026-01-04T12:00:00Z",
  "level": "INFO",
  "service": "backend",
  "request_id": "uuid",
  "user_id": "uuid",
  "message": "Request processed",
  "metadata": {
    "method": "POST",
    "path": "/api/v1/candidates",
    "duration_ms": 45
  }
}
```

**Log Levels:**

| Level | Usage |
|-------|-------|
| ERROR | Exceptions, failures requiring attention |
| WARNING | Degraded operations, rate limits |
| INFO | Business events, request/response |
| DEBUG | Development debugging only |

### 10.3 Key Metrics

| Metric | Type | Labels |
|--------|------|--------|
| http_requests_total | Counter | method, path, status |
| http_request_duration_seconds | Histogram | method, path |
| active_interviews | Gauge | company_id |
| db_connections_active | Gauge | pool |
| celery_tasks_total | Counter | task_name, status |
| ai_api_requests_total | Counter | provider, endpoint, status |

---

## 11. Deployment Guidelines

### 11.1 Development Setup

```bash
# Clone repository
git clone https://github.com/Aigenthix/MicroServices_AI_Interviewer.git
cd AI_Interviewer

# Configure environment
cp .env.example .env
# Edit .env with required API keys

# Start all services
docker compose up -d

# Wait for services to be healthy
docker compose ps

# Run database migrations
docker compose exec backend alembic upgrade head

# Seed development data (optional)
docker compose exec backend python reset_and_seed.py

# Access application
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

### 11.2 Production Deployment

```bash
# Build production images
docker compose -f docker-compose.prod.yml build

# Deploy with secrets management
docker compose -f docker-compose.prod.yml up -d

# Verify deployment
curl https://api.yourdomain.com/health
```

### 11.3 Production Checklist

- [ ] Set secure SECRET_KEY (256-bit minimum)
- [ ] Configure production database with backups
- [ ] Enable HTTPS/TLS termination
- [ ] Set up monitoring and alerting
- [ ] Configure log aggregation
- [ ] Review and set rate limiting
- [ ] Remove seed data scripts
- [ ] Disable debug logging
- [ ] Configure CORS for production domains
- [ ] Set up database connection pooling
- [ ] Configure Redis persistence

### 11.4 Rollback Procedure

```bash
# Quick rollback to previous deployment
docker compose down
docker compose up -d --no-build

# Database rollback (if needed)
docker compose exec backend alembic downgrade -1

# Verify rollback
docker compose ps
curl http://localhost:8000/health
```

---

## 12. Performance Optimization

### 12.1 Database Optimization

**Connection Pooling:**

```python
engine = create_async_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=3600,
)
```

**Query Optimization:**
- Use eager loading for related entities
- Implement pagination for list endpoints
- Add appropriate indexes for frequently queried columns

### 12.2 Caching Strategy

| Data Type | Cache Duration | Invalidation |
|-----------|----------------|--------------|
| User sessions | 30 minutes | On logout |
| Company settings | 1 hour | On update |
| Job templates | 5 minutes | On update |
| Static content | 24 hours | On deploy |

### 12.3 API Response Optimization

- Enable response compression (gzip)
- Implement ETags for cacheable resources
- Use streaming for large file downloads
- Paginate all list endpoints

### 12.4 Frontend Optimization

- Server-side rendering for initial page load
- Code splitting and lazy loading
- Image optimization
- Static asset caching

---

## Appendix A: Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| AUTH_001 | 401 | Invalid credentials |
| AUTH_002 | 401 | Token expired |
| AUTH_003 | 403 | Insufficient permissions |
| AUTH_004 | 401 | Token blacklisted |
| CAND_001 | 404 | Candidate not found |
| CAND_002 | 409 | Candidate already exists |
| INT_001 | 404 | Interview not found |
| INT_002 | 400 | Invalid interview token |
| INT_003 | 409 | Interview already completed |
| JOB_001 | 404 | Job template not found |
| AI_001 | 503 | AI service unavailable |
| AI_002 | 429 | AI rate limit exceeded |

## Appendix B: Migration Scripts

| Migration | Description |
|-----------|-------------|
| 001_initial | Base schema with users, companies |
| 002_add_roles | Custom roles support |
| 003_email_verification | Email verification fields |
| 004_phase_2_candidates | Candidate management enhancements |
| 005_import_jobs | Bulk import tracking |
| 006_interview_rounds | Multiple interview rounds |

---

This document is maintained by the Engineering Team and should be updated with each major release.
