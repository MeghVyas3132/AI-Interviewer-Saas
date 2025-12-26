# AI Interviewer Platform

Enterprise-grade AI-powered technical interview automation platform.

**Version:** 2.0.0  
**Status:** Production Ready  
**License:** Proprietary

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [API Documentation](#api-documentation)
7. [Development](#development)
8. [Testing](#testing)
9. [Deployment](#deployment)
10. [Troubleshooting](#troubleshooting)
11. [Contributing](#contributing)

---

## Overview

The AI Interviewer Platform automates technical interviews using artificial intelligence, providing consistent candidate evaluation at scale. The system conducts real-time voice interviews, transcribes responses, and generates objective hiring recommendations.

### Key Features

- **AI-Powered Interviews**: Automated technical interviews with real-time speech recognition
- **ATS Integration**: Resume parsing and compatibility scoring
- **Multi-Role Access**: Admin, HR, Employee, and Candidate portals
- **Real-Time Evaluation**: Instant scoring and verdict generation
- **Transcript Analysis**: Complete interview recording with Q&A breakdown
- **Pipeline Management**: Full candidate lifecycle tracking

### Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 18, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.11, SQLAlchemy 2.0, Pydantic 2.0 |
| AI Service | Node.js, WebSocket, LLM Integration |
| Database | PostgreSQL 15 |
| Cache | Redis |
| Task Queue | Celery |
| Containerization | Docker, Docker Compose |

---

## Quick Start

### Prerequisites

- Docker Desktop 24.0+
- Docker Compose 2.0+
- Git

### Launch Application

```bash
# Clone the repository
git clone https://github.com/MeghVyas3132/AI_Interviewer_Saas.git
cd AI_Interviewer_Saas

# Start all services
docker compose up -d

# Wait for services to be healthy (approximately 30 seconds)
docker compose ps

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API Documentation: http://localhost:8000/docs
```

### Default Credentials

After initial setup, use these credentials for testing:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@system.local | AdminPass123!@ |
| HR | hr@techcorp.com | HRPass123!@ |

---

## Architecture

### System Components

```
                        +-------------------+
                        |   Load Balancer   |
                        +--------+----------+
                                 |
         +-----------------------+-----------------------+
         |                       |                       |
+--------+--------+    +---------+---------+   +---------+---------+
|    Frontend     |    |     Backend       |   |    AI Service     |
|   (Next.js)     |    |    (FastAPI)      |   |    (Node.js)      |
|   Port: 3000    |    |    Port: 8000     |   |    Port: 9002     |
+--------+--------+    +---------+---------+   +---------+---------+
         |                       |                       |
         |              +--------+--------+              |
         |              |                 |              |
         |       +------+------+  +-------+------+       |
         |       | PostgreSQL  |  |    Redis     |       |
         |       |  Port: 5432 |  |  Port: 6379  |       |
         |       +-------------+  +--------------+       |
         |                                               |
         +------------------+----------------------------+
                            |
                  +---------+---------+
                  |   AI WS Proxy     |
                  |    Port: 9003     |
                  +-------------------+
```

### Service Responsibilities

| Service | Responsibility |
|---------|----------------|
| Frontend | User interface, SSR, routing |
| Backend | REST API, business logic, authentication |
| AI Service | Interview AI, question generation, evaluation |
| AI WS Proxy | Real-time WebSocket communication |
| PostgreSQL | Primary data persistence |
| Redis | Session caching, rate limiting |
| Celery | Background task processing |

### Data Flow

1. **User Authentication**: Frontend -> Backend -> PostgreSQL
2. **Interview Session**: Frontend -> AI WS Proxy -> AI Service
3. **Transcript Storage**: AI Service -> Backend -> PostgreSQL
4. **ATS Analysis**: Backend -> AI Service -> Backend

---

## Installation

### Development Environment

```bash
# 1. Clone repository
git clone https://github.com/MeghVyas3132/AI_Interviewer_Saas.git
cd AI_Interviewer_Saas

# 2. Create environment file
cp .env.example .env

# 3. Configure environment variables (see Configuration section)

# 4. Build and start services
docker compose up -d --build

# 5. Run database migrations
docker compose exec backend alembic upgrade head

# 6. Seed initial data (development only)
docker compose exec backend python reset_and_seed.py

# 7. Verify services
docker compose ps
```

### Manual Installation (Without Docker)

#### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/macOS
# or: venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/ai_interviewer"
export SECRET_KEY="your-256-bit-secret-key"
export REDIS_URL="redis://localhost:6379/0"

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Set environment variables
export NEXT_PUBLIC_API_URL="http://localhost:8000/api/v1"

# Start development server
npm run dev
```

---

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Required - Security
SECRET_KEY=your-super-secret-256-bit-key-here

# Required - Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/ai_interviewer
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=ai_interviewer

# Required - Redis
REDIS_URL=redis://redis:6379/0

# Required - Service URLs
AI_SERVICE_URL=http://ai-service:9002
BACKEND_URL=http://backend:8000

# Optional - Email (SendGrid)
SENDGRID_API_KEY=
FROM_EMAIL=noreply@yourcompany.com

# Optional - Email (SMTP)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

# Optional - AI Providers
GROQ_API_KEY=

# Optional - Security Settings
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
PASSWORD_MIN_LENGTH=8

# Optional - Rate Limiting
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60
```

### Security Configuration

Generate a secure secret key:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## API Documentation

### Authentication

All API endpoints require authentication except:
- `POST /api/v1/auth/login` - User login
- `GET /api/v1/interviews/validate/{token}` - Interview token validation

#### Login

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password"}'
```

Response:
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "HR"
  }
}
```

### Core Endpoints

#### Candidates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/candidates | List all candidates |
| POST | /api/v1/candidates | Create candidate |
| GET | /api/v1/candidates/{id} | Get candidate details |
| PATCH | /api/v1/candidates/{id} | Update candidate |
| DELETE | /api/v1/candidates/{id} | Delete candidate |
| POST | /api/v1/candidates/bulk-import | Bulk import from CSV |

#### Interviews

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/interviews | List interviews |
| POST | /api/v1/interviews | Schedule interview |
| GET | /api/v1/interviews/{id} | Get interview details |
| PATCH | /api/v1/interviews/{id} | Update interview |
| GET | /api/v1/interviews/validate/{token} | Validate token |

#### AI Services

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/ai/ats/check | ATS resume analysis |
| POST | /api/v1/ai/questions/generate | Generate questions |
| GET | /api/v1/ai/reports | List AI reports |

### Interactive Documentation

Access Swagger UI at: `http://localhost:8000/docs`

Access ReDoc at: `http://localhost:8000/redoc`

---

## Development

### Project Structure

```
ai-interviewer/
├── backend/
│   ├── app/
│   │   ├── core/           # Configuration, database
│   │   ├── middleware/     # Auth, logging, rate limiting
│   │   ├── models/         # SQLAlchemy models
│   │   ├── routes/         # API endpoints
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── services/       # Business logic
│   │   ├── tasks/          # Celery tasks
│   │   └── utils/          # Helpers
│   ├── alembic/            # Database migrations
│   └── tests/              # Test suite
├── frontend/
│   ├── src/
│   │   ├── app/            # Next.js pages
│   │   ├── components/     # React components
│   │   ├── contexts/       # React contexts
│   │   ├── hooks/          # Custom hooks
│   │   ├── lib/            # Utilities
│   │   └── types/          # TypeScript types
│   └── public/             # Static assets
├── AI/                     # AI service
├── docker-compose.yml
├── PRD.md                  # Product Requirements
├── TRD.md                  # Technical Requirements
└── README.md
```

### Code Style

#### Python (Backend)

- Follow PEP 8 guidelines
- Use type hints
- Document with docstrings
- Run `black` for formatting
- Run `isort` for imports

```bash
# Format code
black backend/
isort backend/

# Type checking
mypy backend/
```

#### TypeScript (Frontend)

- Follow Airbnb style guide
- Use TypeScript strict mode
- Document complex functions

```bash
# Lint code
npm run lint

# Type checking
npm run type-check
```

### Adding New Features

1. Create database migration (if needed):
```bash
docker compose exec backend alembic revision --autogenerate -m "description"
docker compose exec backend alembic upgrade head
```

2. Add model in `backend/app/models/`
3. Add schema in `backend/app/schemas/`
4. Add route in `backend/app/routes/`
5. Add frontend components
6. Write tests

---

## Testing

### Backend Tests

```bash
# Run all tests
docker compose exec backend pytest

# Run with coverage
docker compose exec backend pytest --cov=app --cov-report=html

# Run specific test file
docker compose exec backend pytest tests/test_auth.py -v
```

### Frontend Tests

```bash
cd frontend

# Run tests
npm test

# Run with coverage
npm test -- --coverage
```

### Integration Tests

```bash
# Run integration test script
./integration_test.sh
```

---

## Deployment

### Production Checklist

- [ ] Set secure `SECRET_KEY` (256-bit minimum)
- [ ] Configure production database
- [ ] Enable HTTPS/TLS
- [ ] Set up monitoring and alerting
- [ ] Configure backup strategy
- [ ] Review rate limiting settings
- [ ] Remove seed data scripts
- [ ] Disable debug logging

### Docker Production Build

```bash
# Build production images
docker compose -f docker-compose.prod.yml build

# Deploy
docker compose -f docker-compose.prod.yml up -d
```

### Health Checks

```bash
# Backend health
curl http://localhost:8000/health

# Database connectivity
curl http://localhost:8000/health/db
```

---

## Troubleshooting

### Common Issues

#### Database Connection Failed

```bash
# Check PostgreSQL is running
docker compose ps postgres

# View logs
docker compose logs postgres

# Reset database
docker compose down -v
docker compose up -d
docker compose exec backend alembic upgrade head
```

#### Frontend Build Errors

```bash
# Clear Next.js cache
cd frontend
rm -rf .next node_modules
npm install
npm run build
```

#### Redis Connection Issues

```bash
# Check Redis status
docker compose exec redis redis-cli ping
# Expected: PONG

# View Redis logs
docker compose logs redis
```

#### AI Service Not Responding

```bash
# Check AI service logs
docker compose logs ai-service

# Verify WebSocket proxy
docker compose logs ai-ws-proxy
```

### Logs

```bash
# View all logs
docker compose logs -f

# View specific service
docker compose logs -f backend

# Last 100 lines
docker compose logs --tail=100 backend
```

### Performance Issues

1. Check database query performance
2. Monitor Redis memory usage
3. Review API response times
4. Check container resource limits

---

## Contributing

### Development Workflow

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Make changes with tests
4. Run linting and tests
5. Commit with conventional commits
6. Push and create pull request

### Commit Convention

```
type(scope): description

Types: feat, fix, docs, style, refactor, test, chore
```

Examples:
```
feat(auth): add password reset functionality
fix(interview): resolve WebSocket disconnection issue
docs(readme): update installation instructions
```

### Pull Request Requirements

- [ ] All tests passing
- [ ] Code formatted and linted
- [ ] Documentation updated
- [ ] No security vulnerabilities
- [ ] Review checklist completed

---

## Support

For issues and feature requests, please use the GitHub issue tracker.

---

## License

This software is proprietary. All rights reserved.

Copyright 2024 Aigenthix. Unauthorized copying, modification, or distribution is prohibited.
