# Developer Quick Start Guide

## AI-Assisted Interview Platform - Getting Started

**Audience:** Development Team  
**Time to Setup:** ~30 minutes  
**Prerequisites:** Docker, Node.js 18+, Python 3.11+

---

## Quick Reference

| Service | Port | Technology | Purpose |
|---------|------|------------|---------|
| Frontend | 3001 | Next.js 14 | React UI |
| API Gateway | 3000 | Node.js/Express | REST + WebSocket |
| Speech Analysis | 8001 | Python/FastAPI | Audio processing |
| Video Analysis | 8002 | Python/FastAPI | Video processing |
| Fraud Detection | 8003 | Python/FastAPI | Fraud alerts |
| NLP Engine | 8004 | Python/FastAPI | Resume analysis |
| Insight Aggregator | 8005 | Python/FastAPI | Insight consolidation |
| PostgreSQL | 5432 | PostgreSQL 15 | Database |
| Redis | 6379 | Redis 7 | Cache/Streams |

---

## 5-Minute Setup

### Step 1: Clone and Configure

```powershell
# Clone the repository
git clone <repository-url>
cd AI-Interviwer-Saas-New-Flow

# Copy environment template
Copy-Item .env.example .env

# Edit environment variables
notepad .env
```

### Step 2: Add Required API Keys

```env
# .env - MINIMUM REQUIRED
DEEPGRAM_API_KEY=your_key
OPENAI_API_KEY=your_key
VIDEOSDK_API_KEY=your_key
VIDEOSDK_SECRET=your_secret
JWT_SECRET=minimum_32_character_secret_key
INTERNAL_API_KEY=internal_service_key
```

### Step 3: Start Services

```powershell
# Start all services with Docker
docker-compose up -d

# Wait for services to initialize (~60 seconds)
Start-Sleep -Seconds 60

# Verify all services are running
docker-compose ps
```

### Step 4: Verify Health

```powershell
# Check each service
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod http://localhost:8001/health
Invoke-RestMethod http://localhost:8002/health
Invoke-RestMethod http://localhost:8003/health
Invoke-RestMethod http://localhost:8004/health
Invoke-RestMethod http://localhost:8005/health
```

**Expected output:** All services return `{"status": "healthy"}`

---

## Development Workflow

### Frontend Development

```powershell
cd frontend
npm install
npm run dev  # Starts on http://localhost:3001
```

### API Gateway Development

```powershell
cd services/api-gateway
npm install
npm run dev  # Starts on http://localhost:3000
```

### Python Service Development

```powershell
# Each service in separate terminal
cd services/speech-analysis
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8001

# Repeat for other Python services
```

---

## Key Files to Understand

### Backend (API Gateway)

| File | Purpose |
|------|---------|
| `services/api-gateway/src/index.ts` | Main Express app + Socket.io |
| `services/api-gateway/src/websocket/index.ts` | WebSocket event handlers |
| `services/api-gateway/src/routes/rounds.ts` | Interview round endpoints |
| `services/api-gateway/src/routes/insights.ts` | Insight retrieval |
| `services/api-gateway/src/db/redis.ts` | Redis streams integration |

### ML Services

| File | Purpose |
|------|---------|
| `services/speech-analysis/src/analyzer.py` | Confidence/hesitation logic |
| `services/speech-analysis/src/stt.py` | Deepgram/Whisper integration |
| `services/fraud-detection/src/detectors.py` | Face/voice detection |
| `services/nlp-engine/src/analyzer.py` | Resume contradiction |
| `services/insight-aggregator/src/aggregator.py` | Insight consolidation |

### Frontend

| File | Purpose |
|------|---------|
| `frontend/src/app/interviewer/interview/page.tsx` | Interviewer view |
| `frontend/src/app/candidate/interview/page.tsx` | Candidate view |
| `frontend/src/components/video/` | Video components |
| `frontend/src/hooks/useInsights.ts` | Insight subscription |
| `frontend/src/hooks/useSocket.ts` | WebSocket hook |

### Database

| File | Purpose |
|------|---------|
| `database/init/001_init.sql` | Full database schema |

---

## Testing the Integration

### 1. Create Test Interview Round

```bash
curl -X POST http://localhost:3000/api/rounds \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_jwt_token>" \
  -d '{
    "interviewId": "test-interview-001",
    "externalCandidateId": "candidate-001",
    "interviewerId": "interviewer-001",
    "jobRoleId": "role-001",
    "roundNumber": 1,
    "roundType": "TECHNICAL_AI",
    "interviewMode": "HUMAN_AI_ASSISTED",
    "scheduledAt": "2026-02-01T10:00:00Z",
    "durationMinutes": 60
  }'
```

### 2. Test WebSocket Connection

```javascript
// Browser console or Node.js
const io = require('socket.io-client');

const socket = io('http://localhost:3000', {
  auth: { token: 'your_jwt_token' }
});

socket.on('connect', () => {
  console.log('Connected!');
  socket.emit('join-interview', { roundId: 'round-id' });
});

socket.on('insight', (data) => {
  console.log('New insight:', data);
});
```

### 3. Test Insight Generation (Dev Mode)

In development mode, the API Gateway generates simulated insights. Send video frames to trigger:

```javascript
socket.emit('video-frame', {
  roundId: 'round-id',
  frame: 'base64_encoded_jpeg',
  timestamp: Date.now()
});

// Should receive simulated insights on 'insight' event
```

---

## Common Development Tasks

### Add New Insight Type

1. Define insight type in `database/init/001_init.sql`:
```sql
ALTER TYPE insight_type ADD VALUE 'NEW_INSIGHT_TYPE';
```

2. Add detector in appropriate service (e.g., `fraud-detection/src/detectors.py`)

3. Update aggregator in `insight-aggregator/src/aggregator.py`

4. Add UI component in `frontend/src/components/insights/`

### Add New API Endpoint

1. Create route file in `services/api-gateway/src/routes/`
2. Register in `services/api-gateway/src/index.ts`
3. Add TypeScript types in `services/api-gateway/src/types/`

### Add New WebSocket Event

1. Add handler in `services/api-gateway/src/websocket/index.ts`
2. Add client hook in `frontend/src/hooks/`
3. Document in `docs/WEBSOCKET_EVENTS.md`

---

## Debugging Tips

### View Service Logs

```powershell
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api-gateway
docker-compose logs -f speech-service
```

### Check Redis Streams

```powershell
docker exec -it ai-interview-redis redis-cli

# List streams
KEYS stream:*

# Read stream contents
XREAD STREAMS stream:audio:round-id 0
```

### Check Database

```powershell
docker exec -it ai-interview-postgres psql -U postgres -d ai_interview_assistant

# List tables
\dt

# Query insights
SELECT * FROM live_insights ORDER BY created_at DESC LIMIT 10;
```

### Check Circuit Breaker Status

```powershell
Invoke-RestMethod http://localhost:3000/health/detailed
```

---

## Environment-Specific Notes

### Development

- `NODE_ENV=development` enables simulated insights
- Hot reload enabled for all services
- Detailed error messages in responses

### Staging

- Full service integration
- Test with real API keys
- Performance monitoring enabled

### Production

- All services containerized
- Redis cluster for scalability
- PostgreSQL replication
- CloudWatch/ELK logging

---

## Quick Commands Cheatsheet

```powershell
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Rebuild after code changes
docker-compose build <service-name>
docker-compose up -d <service-name>

# View real-time logs
docker-compose logs -f

# Reset database
docker-compose down -v
docker-compose up -d

# Run database migrations (if any)
docker exec ai-interview-postgres psql -U postgres -d ai_interview_assistant -f /path/to/migration.sql
```

---

## Next Steps

1. **Read:** [FEATURE_RELEASE_v1.0.md](./FEATURE_RELEASE_v1.0.md) - Full feature documentation
2. **Study:** [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md) - Visual architecture
3. **Reference:** [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - API contracts
4. **Follow:** [CLAUDE_RULES.md](./CLAUDE_RULES.md) - AI assistant guidelines

---

*Need help? Contact the team at backend@company.com*
