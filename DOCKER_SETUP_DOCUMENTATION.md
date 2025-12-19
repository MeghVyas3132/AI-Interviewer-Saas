# Docker Container Setup Documentation

**Date:** 2025-12-17  
**Status:** All Containers Running  
**Docker Version:** 28.5.1  
**Docker Compose Version:** v2.40.2-desktop.1

---

## Executive Summary

All Docker containers for the AI Interviewer application are successfully running. The setup includes:
- ✅ PostgreSQL database (healthy)
- ✅ Redis cache (healthy)
- ✅ FastAPI backend
- ✅ Next.js frontend
- ✅ AI Service (Next.js)

---

## 1. Docker Installation Verification

### System Requirements
- **Docker Version:** 28.5.1
- **Docker Compose Version:** v2.40.2-desktop.1
- **Status:** ✅ Installed and running

### Verification Commands
```bash
docker --version
docker-compose --version
docker ps
```

---

## 2. Container Configuration

### 2.1 Main Services (docker-compose.yml)

#### PostgreSQL Database
- **Container Name:** `ai-interviewer-db`
- **Image:** `postgres:15-alpine`
- **Port:** `5432:5432`
- **Status:** ✅ Running (healthy)
- **Health Check:** `pg_isready -U ai_interviewer_user -d ai_interviewer_db`
- **Volume:** `postgres_data:/var/lib/postgresql/data`
- **Environment:**
  - `POSTGRES_USER: ai_interviewer_user`
  - `POSTGRES_PASSWORD: ai_interviewer_password`
  - `POSTGRES_DB: ai_interviewer_db`

#### Redis Cache
- **Container Name:** `ai-interviewer-redis`
- **Image:** `redis:7-alpine`
- **Port:** `6379:6379`
- **Status:** ✅ Running (healthy)
- **Health Check:** `redis-cli ping`
- **Environment:** Default configuration

#### FastAPI Backend
- **Container Name:** `ai-interviewer-backend`
- **Build Context:** `./backend`
- **Port:** `8000:8000`
- **Status:** ✅ Running
- **Dependencies:** postgres (healthy), redis (healthy)
- **Command:** `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`
- **Environment:**
  - `ENVIRONMENT: development`
  - `DATABASE_URL: postgresql://ai_interviewer_user:ai_interviewer_password@postgres:5432/ai_interviewer_db`
  - `REDIS_URL: redis://redis:6379/0`
  - `SECRET_KEY: Ut3RpYgBSUHf8_Y6xfyJvdjAwTiQh0eR2JmZrBPfDcw`
  - `CORS_ORIGINS: ["http://localhost:3000","http://localhost:8080","http://frontend:3000","http://localhost:3001"]`
- **Volumes:**
  - `./backend:/app` (hot reload enabled)

#### Next.js Frontend
- **Container Name:** `ai-interviewer-frontend`
- **Build Context:** `./frontend`
- **Port:** `3000:3000`
- **Status:** ✅ Running
- **Dependencies:** backend
- **Command:** `npm run dev`
- **Environment:**
  - `NEXT_PUBLIC_API_URL: http://localhost:8000/api/v1`
  - `NODE_ENV: development`
- **Volumes:**
  - `./frontend:/app`
  - `/app/node_modules` (anonymous volume)

#### AI Service (Next.js)
- **Container Name:** `ai-interviewer-coach`
- **Build Context:** `./AI/Aigenthix_AI_Interviewer`
- **Port:** `3001:3000`
- **Status:** ✅ Running
- **Command:** `npm run dev`
- **Environment:**
  - `NEXT_PUBLIC_APP_NAME: "AI Interviewer Coach"`
  - `PORT: 3000`
  - `HOSTNAME: "0.0.0.0"`
  - `GOOGLE_API_KEY: "AIzaSyCxIzvk0SM9kL8iUPWlPr_C7NzEUEdqp00"`
- **Volumes:**
  - `./AI/Aigenthix_AI_Interviewer:/app`
  - `/app/node_modules` (anonymous volume)

### 2.2 Network Configuration

- **Network Name:** `ai-interviewer-network`
- **Type:** bridge
- **Status:** ✅ Active
- **Containers Connected:**
  - ai-interviewer-db
  - ai-interviewer-redis
  - ai-interviewer-backend
  - ai-interviewer-frontend
  - ai-interviewer-coach

### 2.3 Volumes

- **postgres_data:** Persistent storage for PostgreSQL database
- **Anonymous volumes:** Used for node_modules in frontend and AI service

---

## 3. Container Startup Order

The containers start in the following order due to dependencies:

1. **PostgreSQL** (no dependencies)
2. **Redis** (no dependencies)
3. **Backend** (waits for postgres and redis to be healthy)
4. **Frontend** (waits for backend)
5. **AI Service** (independent)

### Dependency Chain
```
postgres (healthy) ──┐
                     ├──> backend ──> frontend
redis (healthy) ─────┘

ai-service (independent)
```

---

## 4. Startup Commands

### Start All Services
```bash
cd /Users/meghvyas/Desktop/AI_Interviewer
docker-compose up -d
```

### Start Specific Service
```bash
docker-compose up -d <service-name>
# Example: docker-compose up -d backend
```

### Build and Start (if images need rebuilding)
```bash
docker-compose up -d --build
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Stop All Services
```bash
docker-compose down
```

### Stop and Remove Volumes
```bash
docker-compose down -v
```

---

## 5. Health Checks

### Database Health
```bash
docker exec ai-interviewer-db pg_isready -U ai_interviewer_user -d ai_interviewer_db
```

### Redis Health
```bash
docker exec ai-interviewer-redis redis-cli ping
```

### Backend Health
```bash
curl http://localhost:8000/health
```

### Frontend Health
```bash
curl http://localhost:3000
```

### AI Service Health
```bash
curl http://localhost:3001
```

---

## 6. Inter-Container Communication

### Verified Connections

✅ **Backend → PostgreSQL**
- Connection string: `postgresql://ai_interviewer_user:ai_interviewer_password@postgres:5432/ai_interviewer_db`
- Status: Working

✅ **Backend → Redis**
- Connection string: `redis://redis:6379/0`
- Status: Working

✅ **Frontend → Backend**
- API URL: `http://localhost:8000/api/v1` (from host)
- Internal: `http://backend:8000/api/v1` (from container)
- Status: Working

### Network Connectivity Test
```bash
# Test backend to postgres
docker exec ai-interviewer-backend ping -c 2 postgres

# Test backend to redis
docker exec ai-interviewer-backend ping -c 2 redis

# Test frontend to backend
docker exec ai-interviewer-frontend ping -c 2 backend
```

---

## 7. Port Mapping

| Service | Container Port | Host Port | Access URL |
|---------|---------------|-----------|------------|
| PostgreSQL | 5432 | 5432 | `localhost:5432` |
| Redis | 6379 | 6379 | `localhost:6379` |
| Backend | 8000 | 8000 | `http://localhost:8000` |
| Frontend | 3000 | 3000 | `http://localhost:3000` |
| AI Service | 3000 | 3001 | `http://localhost:3001` |

---

## 8. Environment Variables

### Backend Environment Variables
```bash
ENVIRONMENT=development
DATABASE_URL=postgresql://ai_interviewer_user:ai_interviewer_password@postgres:5432/ai_interviewer_db
REDIS_URL=redis://redis:6379/0
SECRET_KEY=Ut3RpYgBSUHf8_Y6xfyJvdjAwTiQh0eR2JmZrBPfDcw
DEBUG=False
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=10
DATABASE_QUERY_TIMEOUT=30
CORS_ORIGINS=["http://localhost:3000","http://localhost:8080","http://frontend:3000","http://localhost:3001"]
```

### Frontend Environment Variables
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NODE_ENV=development
```

### AI Service Environment Variables
```bash
NEXT_PUBLIC_APP_NAME=AI Interviewer Coach
PORT=3000
HOSTNAME=0.0.0.0
GOOGLE_API_KEY=AIzaSyCxIzvk0SM9kL8iUPWlPr_C7NzEUEdqp00
```

---

## 9. Container Status

### Current Status (as of 2025-12-17)

| Container | Status | Health | Uptime |
|-----------|--------|--------|--------|
| ai-interviewer-db | ✅ Running | ✅ Healthy | ~1 hour |
| ai-interviewer-redis | ✅ Running | ✅ Healthy | ~1 hour |
| ai-interviewer-backend | ✅ Running | ✅ OK | ~1 hour |
| ai-interviewer-frontend | ✅ Running | ✅ OK | ~1 hour |
| ai-interviewer-coach | ✅ Running | ⚠️ OK* | ~1 hour |

*AI Service shows some database connection errors in logs but is running.

---

## 10. Troubleshooting

### Container Won't Start
```bash
# Check logs
docker-compose logs <service-name>

# Check if port is already in use
lsof -i :<port-number>

# Restart specific service
docker-compose restart <service-name>
```

### Database Connection Issues
```bash
# Verify database is healthy
docker exec ai-interviewer-db pg_isready -U ai_interviewer_user

# Check database logs
docker logs ai-interviewer-db

# Test connection from backend
docker exec ai-interviewer-backend python -c "import psycopg2; psycopg2.connect('postgresql://ai_interviewer_user:ai_interviewer_password@postgres:5432/ai_interviewer_db')"
```

### Redis Connection Issues
```bash
# Verify redis is healthy
docker exec ai-interviewer-redis redis-cli ping

# Check redis logs
docker logs ai-interviewer-redis
```

### Network Issues
```bash
# Inspect network
docker network inspect ai-interviewer-network

# Check container network connectivity
docker exec <container-name> ping <other-container-name>
```

### Rebuild Containers
```bash
# Rebuild all
docker-compose build --no-cache

# Rebuild specific service
docker-compose build --no-cache <service-name>

# Rebuild and restart
docker-compose up -d --build
```

---

## 11. Monitoring Commands

### View All Container Status
```bash
docker-compose ps
```

### View Resource Usage
```bash
docker stats
```

### View Container Logs (Real-time)
```bash
docker-compose logs -f
```

### View Specific Service Logs
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

### Check Container Health
```bash
docker inspect <container-name> | grep -A 10 Health
```

---

## 12. Additional Notes

### AI Service Separate Docker Compose

The AI service has its own `docker-compose.yml` in `AI/Aigenthix_AI_Interviewer/` that includes:
- Nginx proxy
- AssemblyAI WebSocket proxy
- AI Interviewer frontend

**Note:** This separate compose file is not currently running. The AI service is being run through the main docker-compose.yml. If you need the nginx proxy and WebSocket proxy, you would need to start this separately:

```bash
cd AI/Aigenthix_AI_Interviewer
docker-compose up -d
```

### Hot Reload

Both frontend and backend support hot reload:
- **Backend:** Uses uvicorn with `--reload` flag
- **Frontend:** Next.js development mode with Fast Refresh

### Volume Mounts

Development volumes are mounted to enable:
- Code changes without rebuilding
- Hot reload functionality
- Persistent database storage

---

## 13. Verification Checklist

- [x] Docker installed and running
- [x] All containers built successfully
- [x] All containers started successfully
- [x] PostgreSQL healthy
- [x] Redis healthy
- [x] Backend accessible
- [x] Frontend accessible
- [x] AI Service accessible
- [x] Network connectivity verified
- [x] Health endpoints responding
- [x] Inter-container communication working

---

## 14. Quick Reference

### Start Everything
```bash
cd /Users/meghvyas/Desktop/AI_Interviewer && docker-compose up -d
```

### Stop Everything
```bash
docker-compose down
```

### View Logs
```bash
docker-compose logs -f
```

### Restart Service
```bash
docker-compose restart <service-name>
```

### Rebuild Service
```bash
docker-compose up -d --build <service-name>
```

---

**Last Updated:** 2025-12-17  
**Status:** All systems operational

