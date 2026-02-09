# AI-Assisted Interview Platform

A production-grade, real-time AI assistant for human-conducted video interviews. AI provides live insights to interviewers while humans make all hiring decisions.

## 🎯 Core Philosophy

> **"AI Assists, Humans Decide"**

- AI **never** conducts interviews - humans do
- All AI insights are shown **only** to interviewers
- Candidates see a simple, clean video interface
- Final hiring decisions are **always** made by humans
- All AI contributions are logged for audit

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
│  ┌──────────────────────────────┐    ┌──────────────────────────────────┐   │
│  │   Interviewer Dashboard      │    │      Candidate Interface         │   │
│  │   (Rich UI + AI Insights)    │    │      (Simple GMeet-like)         │   │
│  └──────────────┬───────────────┘    └────────────────┬─────────────────┘   │
│                 │         VideoSDK React SDK          │                      │
└─────────────────┼─────────────────────────────────────┼─────────────────────┘
                  │                                      │
┌─────────────────▼──────────────────────────────────────▼─────────────────────┐
│                            API GATEWAY (Node.js)                             │
│              Express + Socket.io + JWT Auth + Circuit Breaker                │
├──────────────────────────────────────────────────────────────────────────────┤
│                           Redis (Pub/Sub + Streams)                          │
├──────────────────────────────────────────────────────────────────────────────┤
│   ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  ┌────────────────┐   │
│   │   Speech    │  │    Video     │  │    Fraud      │  │      NLP       │   │
│   │  Analysis   │  │  Analysis    │  │  Detection    │  │    Engine      │   │
│   │   (8001)    │  │   (8002)     │  │    (8003)     │  │    (8004)      │   │
│   └──────┬──────┘  └──────┬───────┘  └───────┬───────┘  └───────┬────────┘   │
│          │                │                   │                  │            │
│          └────────────────┴───────────────────┴──────────────────┘            │
│                                      │                                        │
│                       ┌──────────────▼──────────────┐                        │
│                       │    Insight Aggregator       │                        │
│                       │         (8005)              │                        │
│                       └──────────────┬──────────────┘                        │
├──────────────────────────────────────┼───────────────────────────────────────┤
│                           PostgreSQL Database                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

## ✨ Features

### Real-Time Analysis
| Feature | Description | Service |
|---------|-------------|---------|
| **Speech-to-Text** | Deepgram (primary) / Whisper (fallback) | Speech Analysis |
| **Confidence Detection** | Pitch, energy, filler words analysis | Speech Analysis |
| **Hesitation Analysis** | Pause patterns, filler words | Speech Analysis |
| **Head Movement** | MediaPipe Face Mesh tracking | Video Analysis |
| **Video Quality** | Lighting, blur detection | Video Analysis |
| **Multiple Face Detection** | MTCNN/MediaPipe | Fraud Detection |
| **Face Switch Detection** | FaceNet embeddings comparison | Fraud Detection |
| **Background Voice Detection** | Spectral analysis | Fraud Detection |
| **Resume Contradiction** | LLM-powered semantic analysis | NLP Engine |
| **Skill Verification** | Response vs resume claims | NLP Engine |
| **Follow-up Questions** | AI-generated clarifying questions | NLP Engine |

### Conservative Alert System
- High confidence thresholds (>80% for alerts)
- Aggregation to reduce noise
- Rate limiting to prevent alert fatigue
- All alerts logged for audit

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development)
- Python 3.11+ (for local development)

### 1. Clone and Setup

```bash
git clone <repository-url>
cd AI-Interviwer-Saas-New-Flow

# Copy environment file
cp .env.example .env

# Edit with your API keys
nano .env
```

### 2. Configure Environment

```bash
# Required API Keys
DEEPGRAM_API_KEY=your_deepgram_key
OPENAI_API_KEY=your_openai_key
VIDEOSDK_API_KEY=your_videosdk_key
VIDEOSDK_SECRET=your_videosdk_secret

# Security
JWT_SECRET=your_jwt_secret_min_32_chars
INTERNAL_API_KEY=your_internal_service_key

# Optional
ANTHROPIC_API_KEY=your_anthropic_key
```

### 3. Start Services

```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f api-gateway
```

### 4. Verify Health

```bash
# API Gateway
curl http://localhost:3000/health

# All ML Services
curl http://localhost:8001/health  # Speech
curl http://localhost:8002/health  # Video
curl http://localhost:8003/health  # Fraud
curl http://localhost:8004/health  # NLP
curl http://localhost:8005/health  # Aggregator
```

## 📁 Project Structure

```
.
├── docker-compose.yml           # Container orchestration
├── .env.example                 # Environment template
├── database/
│   └── init/
│       └── 001_init.sql         # Database schema
├── docs/
│   └── FRONTEND_SPEC.md         # Frontend specification
├── services/
│   ├── api-gateway/             # Node.js API Gateway
│   │   ├── src/
│   │   │   ├── index.ts         # Main app
│   │   │   ├── routes/          # API routes
│   │   │   ├── middleware/      # Auth, error handling
│   │   │   ├── websocket/       # Socket.io handlers
│   │   │   ├── db/              # Database clients
│   │   │   └── utils/           # Logger, circuit breaker
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── speech-analysis/         # Python STT service
│   │   ├── src/
│   │   │   ├── main.py          # FastAPI app
│   │   │   ├── stt.py           # Deepgram/Whisper
│   │   │   └── analyzer.py      # Confidence/hesitation
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   ├── video-analysis/          # Python video service
│   │   ├── src/
│   │   │   ├── main.py          # FastAPI app
│   │   │   └── analyzer.py      # Head tracking, quality
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   ├── fraud-detection/         # Python fraud service
│   │   ├── src/
│   │   │   ├── main.py          # FastAPI app
│   │   │   └── detectors.py     # Face/voice detection
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   ├── nlp-engine/              # Python NLP service
│   │   ├── src/
│   │   │   ├── main.py          # FastAPI app
│   │   │   └── analyzer.py      # Resume contradiction
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   └── insight-aggregator/      # Python aggregator
│       ├── src/
│       │   ├── main.py          # FastAPI app
│       │   └── aggregator.py    # Insight aggregation
│       ├── Dockerfile
│       └── requirements.txt
└── models/                      # Shared ML models (mounted)
```

## 🔌 API Reference

### REST Endpoints

#### Interview Rounds
```bash
# Create a new round
POST /api/v1/rounds
{
  "interview_id": "uuid",
  "round_number": 1,
  "round_type": "technical",
  "scheduled_at": "2024-01-15T10:00:00Z",
  "interviewer_id": "uuid",
  "candidate_id": "uuid"
}

# Start a round
PATCH /api/v1/rounds/:id/start

# End a round
PATCH /api/v1/rounds/:id/end

# Create VideoSDK room
POST /api/v1/rounds/:id/create-room
```

#### Verdicts
```bash
# Submit verdict
POST /api/v1/verdicts
{
  "round_id": "uuid",
  "decision": "proceed|reject|on_hold|needs_discussion",
  "technical_score": 4,
  "communication_score": 5,
  "notes": "Detailed feedback...",
  "ai_contributions": ["Fraud alert", "Resume contradiction"]
}
```

#### Insights
```bash
# Get insights for a round
GET /api/v1/insights/round/:roundId

# Get aggregated insights (immediate)
GET /api/v1/insights/:roundId/aggregate
```

### WebSocket Events

#### Client → Server
```javascript
// Join interview room
socket.emit('interview:join', { roundId: 'uuid' });

// Leave interview room
socket.emit('interview:leave', { roundId: 'uuid' });

// Send video frame for analysis
socket.emit('video:frame', { 
  roundId: 'uuid',
  frame: 'base64...',
  timestamp: 1234567890
});

// Send audio chunk
socket.emit('audio:chunk', {
  roundId: 'uuid',
  chunk: 'base64...',
  timestamp: 1234567890
});
```

#### Server → Client
```javascript
// Aggregated insights
socket.on('insight:aggregated', (data) => {
  // { insights: [], recommendations: [], summary: {} }
});

// Real-time alert
socket.on('insight:alert', (alert) => {
  // High-priority insight
});

// Transcript update
socket.on('transcript:update', (data) => {
  // Real-time transcription
});
```

## 🗃️ Database Schema

### Core Tables
- `interview_rounds` - Interview round metadata
- `live_insights` - AI-generated insights
- `ai_recommendations` - AI suggestions for interviewer
- `human_verdicts` - Interviewer decisions
- `interview_transcripts` - Full transcripts
- `fraud_alerts` - Fraud detection logs
- `ai_audit_logs` - All AI contributions
- `candidate_resumes` - Parsed resume JSON

See `database/init/001_init.sql` for full schema.

## 🔧 Development

### Local Development

```bash
# API Gateway
cd services/api-gateway
npm install
npm run dev

# Python services
cd services/speech-analysis
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8001
```

### Running Tests

```bash
# API Gateway
cd services/api-gateway
npm test

# Python services
cd services/speech-analysis
pytest
```

### Adding a New ML Service

1. Create service directory under `services/`
2. Add `requirements.txt`, `Dockerfile`, `src/main.py`
3. Add to `docker-compose.yml`
4. Register in API Gateway routes
5. Subscribe to Redis streams

## 📊 Monitoring

### Health Checks
All services expose:
- `GET /health` - Basic liveness
- `GET /health/ready` - Detailed readiness with dependencies

### Logging
- Structured JSON logs
- Request/response logging
- Error tracking with stack traces

### Metrics (Future)
- Prometheus metrics
- Grafana dashboards

## 🔒 Security

### Authentication
- JWT tokens for external requests
- Internal API keys for service-to-service

### Data Protection
- All data encrypted at rest
- TLS for all connections
- PII handling compliance

### Audit Trail
- All AI insights logged
- Human decisions tracked
- Full interview transcripts stored

## 🚢 Deployment

### Docker Compose (Development)
```bash
docker-compose up -d
```

### Kubernetes (Production)
Helm charts coming soon.

### Environment Variables
See `.env.example` for all configuration options.

## 📝 License

Proprietary - All rights reserved

## 🤝 Contributing

1. Create feature branch
2. Make changes
3. Submit PR for review

## 📞 Support

Contact the engineering team for issues.
