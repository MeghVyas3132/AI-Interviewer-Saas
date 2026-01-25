# AI Interviewer

A multi-tenant AI-powered interview management platform with role-based access control, built with FastAPI (backend) and Next.js (frontend).

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Configuration](#configuration)
5. [User Roles](#user-roles)
6. [Features](#features)
7. [API Reference](#api-reference)
8. [Frontend Structure](#frontend-structure)
9. [Development](#development)
10. [Troubleshooting](#troubleshooting)

---

## Overview

AI Interviewer is a comprehensive platform for managing technical interviews. It supports multi-tenant architecture where companies can register, add employees, import candidates, and conduct AI-assisted interviews.

### Key Capabilities

- Multi-tenant company management with unique join codes
- Role-based access control (System Admin, HR, Employee, Team Lead, Candidate)
- Bulk candidate import via CSV
- Employee assignment with capacity limits (max 10 candidates per employee)
- Interview scheduling and tracking
- AI-powered interview sessions

---

## Architecture

### Technology Stack

| Component | Technology |
|-----------|------------|
| Backend API | FastAPI (Python 3.11+) |
| Frontend | Next.js 14 with TypeScript |
| Database | PostgreSQL 15 |
| Cache | Redis 7 |
| Styling | Tailwind CSS |
| Authentication | JWT with httpOnly cookies |

### Services Overview

```
+------------------+     +------------------+     +------------------+
|    Frontend      |     |     Backend      |     |    PostgreSQL    |
|   Next.js:3000   |---->|   FastAPI:8000   |---->|      :5432       |
+------------------+     +------------------+     +------------------+
                                  |
                                  v
                         +------------------+
                         |      Redis       |
                         |      :6379       |
                         +------------------+
```

---

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local frontend development)
- Python 3.11+ (for local backend development)

### Running with Docker Compose

1. Clone the repository and navigate to the project root:

```bash
cd AI_Interviewer
```

2. Start all services:

```bash
docker-compose up -d
```

3. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

4. Check service status:

```bash
docker-compose ps
```

5. View logs:

```bash
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Docker Compose Configuration

```yaml
services:
  postgres:
    image: postgres:15-alpine
    container_name: ai-interviewer-db
    environment:
      POSTGRES_USER: ai_interviewer_user
      POSTGRES_PASSWORD: ai_interviewer_password
      POSTGRES_DB: ai_interviewer_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: ai-interviewer-redis
    ports:
      - "6379:6379"

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: ai-interviewer-backend
    environment:
      DATABASE_URL: postgresql://ai_interviewer_user:ai_interviewer_password@postgres:5432/ai_interviewer_db
      REDIS_URL: redis://redis:6379/0
      SECRET_KEY: your-secret-key-here
      CORS_ORIGINS: '["http://localhost:3000"]'
    ports:
      - "8000:8000"
    depends_on:
      - postgres
      - redis

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: ai-interviewer-frontend
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000/api/v1
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  postgres_data:
```

---

## Configuration

### Environment Variables

#### Backend

| Variable | Description | Default |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | Required |
| REDIS_URL | Redis connection string | Required |
| SECRET_KEY | JWT signing key | Required |
| CORS_ORIGINS | Allowed CORS origins (JSON array) | `["http://localhost:3000"]` |
| DATABASE_POOL_SIZE | Connection pool size | 20 |
| DATABASE_MAX_OVERFLOW | Max overflow connections | 10 |

#### Frontend

| Variable | Description | Default |
|----------|-------------|---------|
| NEXT_PUBLIC_API_URL | Backend API base URL | `http://localhost:8000/api/v1` |

---

## User Roles

### Role Hierarchy

| Role | Permissions |
|------|-------------|
| SYSTEM_ADMIN | Full platform access, manage all companies |
| HR | Manage company users, candidates, and assignments |
| EMPLOYEE | Conduct assigned interviews, view own candidates |
| CANDIDATE | Take interviews, view own status |

### Registration Flow

1. **System Admin**: Created during initial setup
2. **Company Registration**: HR registers company, receives unique join code (format: XXXX-XXXX)
3. **Employee Registration**: Employees register using company join code
4. **Candidate Import**: HR imports candidates via CSV or creates individually

---

## Features

### HR Dashboard

- View all candidates in the company
- Bulk import candidates from CSV
- Assign candidates to employees (max 10 per employee)
- View employee capacity and availability
- Track interview progress

### Employee Dashboard

- View assigned candidates
- Conduct interviews
- Submit interview feedback
- View interview history

### Candidate Management

- CSV bulk import with validation
- Individual candidate creation
- Assignment to multiple employees
- Status tracking (pending, in_progress, completed)

### Bulk Import CSV Format

```csv
name,email,phone,resume_url,notes
John Doe,john@example.com,+1234567890,https://example.com/resume.pdf,Senior developer
Jane Smith,jane@example.com,+0987654321,https://example.com/resume2.pdf,Frontend specialist
```

### Assignment Limits

- Each employee can have maximum 10 assigned candidates
- UI displays available slots for each employee
- Bulk assignment validates capacity before processing

---

## API Reference

### Base URL

```
http://localhost:8000/api/v1
```

### Authentication

All authenticated endpoints require:
```
Authorization: Bearer <access_token>
```

### Core Endpoints

#### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/register | Register new user |
| POST | /auth/login | User login |
| POST | /auth/logout | User logout |
| GET | /auth/verify | Verify token |

#### Companies

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /companies | Create company (HR registration) |
| GET | /companies/{id} | Get company details |
| GET | /companies/by-join-code/{code} | Lookup by join code |

#### Candidates (HR)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /candidates | List all candidates |
| POST | /candidates | Create candidate |
| POST | /candidates/bulk-import | Import from CSV |
| POST | /candidates/bulk-assign | Assign to employee |
| DELETE | /candidates/{id} | Delete candidate |

#### HR Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /hr/employees | List employees with capacity info |
| GET | /hr/dashboard | HR dashboard statistics |

#### Employee

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /employee/my-candidates | Get assigned candidates |
| GET | /employee/my-interviews | Get assigned interviews |
| GET | /employee/dashboard | Employee dashboard stats |

### Response Formats

#### Success Response

```json
{
  "id": "uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "created_at": "2024-01-01T00:00:00Z"
}
```

#### Error Response

```json
{
  "detail": "Error message here"
}
```

#### Validation Error

```json
{
  "detail": [
    {
      "loc": ["body", "email"],
      "msg": "Invalid email format",
      "type": "value_error"
    }
  ]
}
```

---

## Frontend Structure

```
src/
├── app/                      # Next.js App Router
│   ├── layout.tsx           # Root layout with AuthProvider
│   ├── page.tsx             # Landing page
│   ├── globals.css          # Global styles
│   ├── admin/               # Admin pages
│   ├── auth/
│   │   ├── login/           # Login page
│   │   └── register/        # Registration page
│   ├── candidates/          # Candidate management (HR)
│   ├── dashboard/           # Main dashboard
│   ├── employee-interviews/ # Employee interview view
│   └── hr/                  # HR dashboard
├── components/              # Reusable components
│   ├── BulkImportModal.tsx  # CSV import modal
│   ├── Button.tsx           # Button component
│   ├── Card.tsx             # Card component
│   └── Navigation.tsx       # Navigation bar
├── contexts/
│   └── AuthContext.tsx      # Authentication context
├── hooks/
│   └── useProtectedRoute.ts # Route protection hook
├── lib/
│   ├── api.ts               # API client
│   ├── constants.ts         # App constants
│   └── utils.ts             # Utility functions
└── types/
    └── index.ts             # TypeScript definitions
```

### Key Components

#### API Client (src/lib/api.ts)

```typescript
const apiClient = new APIClient();

// GET request
const data = await apiClient.get('/candidates');

// POST request
const result = await apiClient.post('/candidates', { name, email });

// POST with query params
const response = await apiClient.post('/candidates/bulk-assign?employee_id=xxx&candidate_ids=yyy');
```

#### Authentication Context

```typescript
const { user, isAuthenticated, login, logout } = useAuth();
```

#### Protected Routes

```typescript
import { useProtectedRoute } from '@/hooks/useProtectedRoute';

export default function HRPage() {
  useProtectedRoute(['HR', 'SYSTEM_ADMIN']);
  // ... component code
}
```

---

## Development

### Local Frontend Development

```bash
cd frontend
npm install
npm run dev
```

### Local Backend Development

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Available Scripts

#### Frontend

| Command | Description |
|---------|-------------|
| npm run dev | Start development server |
| npm run build | Build for production |
| npm start | Start production server |
| npm run lint | Run ESLint |

#### Backend

| Command | Description |
|---------|-------------|
| uvicorn app.main:app --reload | Start with hot reload |
| pytest | Run tests |
| alembic upgrade head | Run migrations |

### Adding New Features

1. Define types in `src/types/index.ts`
2. Add API methods to `src/lib/api.ts`
3. Create page in `src/app/[feature]/page.tsx`
4. Use `useAuth()` for authentication
5. Use `apiClient` for API calls

---

## Troubleshooting

### Common Issues

#### CORS Errors

Ensure the frontend URL is in the backend CORS_ORIGINS:

```bash
CORS_ORIGINS='["http://localhost:3000"]'
```

#### 401 Unauthorized

1. Clear browser cookies
2. Login again
3. Check token expiration

#### API Connection Failed

1. Verify backend is running:
```bash
curl http://localhost:8000/health
```

2. Check NEXT_PUBLIC_API_URL in frontend

#### Database Connection Issues

1. Verify PostgreSQL is running:
```bash
docker-compose ps postgres
```

2. Check connection string in DATABASE_URL

#### Employee Not Seeing Candidates

1. Verify assignment was successful
2. Check employee ID matches logged-in user
3. Verify API response format (direct array, not wrapped object)

### Logs

```bash
# Backend logs
docker-compose logs -f backend

# Frontend logs
docker-compose logs -f frontend

# Database logs
docker-compose logs -f postgres
```

### Reset Database

```bash
docker-compose down -v
docker-compose up -d
```

---

## License

MIT
# Trigger redeploy Sun Dec 28 22:59:36 IST 2025
