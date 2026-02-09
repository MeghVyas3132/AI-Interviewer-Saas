# Feature Release Documentation v1.0

## AI-Assisted Interview Platform - Real-Time Insight Engine

**Release Date:** February 2026  
**Version:** 1.0.0  
**Classification:** Production Release

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Feature Overview](#2-feature-overview)
3. [Architecture Overview](#3-architecture-overview)
4. [Microservices Breakdown](#4-microservices-breakdown)
5. [Integration Points](#5-integration-points)
6. [Data Flow](#6-data-flow)
7. [API Contracts](#7-api-contracts)
8. [Environment Setup](#8-environment-setup)
9. [Testing Guidelines](#9-testing-guidelines)
10. [Deployment Checklist](#10-deployment-checklist)

---

## 1. Executive Summary

### Core Philosophy

> **"AI Assists, Humans Decide"**

This release introduces a production-grade, real-time AI assistant for human-conducted video interviews. The platform provides live insights to interviewers while ensuring all hiring decisions remain with human decision-makers.

### Key Principles

- AI **NEVER** conducts interviews - humans do
- All AI insights are shown **ONLY** to interviewers
- Candidates see a simple, clean video interface (no AI elements visible)
- Final hiring decisions are **ALWAYS** made by humans
- All AI contributions are logged for audit and compliance

### What This Release Delivers

| Feature | Description | Business Value |
|---------|-------------|----------------|
| Real-Time Speech Analysis | Live transcription + confidence scoring | Objective behavior metrics |
| Video Analysis | Head movement, engagement, video quality | Non-verbal cue detection |
| Fraud Detection | Multi-face, face switch, background voice | Interview integrity |
| Resume Contradiction | AI-powered semantic mismatch detection | Claim verification |
| Insight Aggregation | Consolidated, prioritized recommendations | Reduced cognitive load |
| Conservative Alerts | High-confidence (>80%) threshold alerts | Low false positive rate |

---

## 2. Feature Overview

### 2.1 Real-Time Analysis Capabilities

#### Speech Analysis Service (Port 8001)

| Capability | Technology | Output |
|------------|------------|--------|
| Speech-to-Text | Deepgram (primary) / Whisper (fallback) | Timestamped transcripts |
| Confidence Detection | Pitch, energy, filler words analysis | 0.0-1.0 confidence score |
| Hesitation Analysis | Pause patterns, filler word frequency | Hesitation indicators |
| Response Latency | Time between question end and answer start | Latency metrics |

**Configuration Options:**
```env
DEEPGRAM_API_KEY=<required>
WHISPER_MODEL_SIZE=base|small|medium|large
```

#### Video Analysis Service (Port 8002)

| Capability | Technology | Output |
|------------|------------|--------|
| Head Movement Tracking | MediaPipe Face Mesh | Movement metrics |
| Engagement Scoring | Gaze direction, head pose | Engagement score |
| Video Quality | Lighting, blur detection | Quality indicators |
| Frame Analysis | OpenCV, NumPy | Per-frame metrics |

#### Fraud Detection Service (Port 8003)

| Capability | Technology | Threshold |
|------------|------------|-----------|
| Multiple Face Detection | MediaPipe/MTCNN | 95% confidence |
| Face Switch Detection | FaceNet embeddings | Cosine distance < 0.6 |
| Background Voice Detection | Spectral analysis | Multiple voice signatures |
| Tab Switch Monitoring | Client-side events | Immediate alert |

#### NLP Engine (Port 8004)

| Capability | Technology | Output |
|------------|------------|--------|
| Resume Contradiction | OpenAI GPT-4 / Claude | Contradiction flags |
| Skill Verification | Semantic matching | Skill level assessment |
| Follow-up Generation | LLM-powered | Suggested questions |
| Response Quality | Semantic analysis | Quality metrics |

### 2.2 Conservative Alert System

Alerts are designed to minimize false positives:

- **High Confidence Threshold:** Only alerts with >80% confidence are surfaced
- **Aggregation Window:** 10-second windows for pattern detection
- **Rate Limiting:** Maximum 1 alert per category per 30 seconds
- **Severity Levels:** INFO → LOW → MEDIUM → HIGH → CRITICAL
- **Audit Logging:** All alerts logged for post-interview review

---

## 3. Architecture Overview

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
                  │             WebSocket                │
                  │            (Socket.io)               │
                  ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            API GATEWAY (Node.js :3000)                       │
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

### Infrastructure Components

| Component | Image | Purpose | Port |
|-----------|-------|---------|------|
| PostgreSQL | postgres:15-alpine | Primary database | 5432 |
| Redis | redis:7-alpine | Cache + Pub/Sub + Streams | 6379 |
| API Gateway | Custom Node.js | Request routing, auth, WebSocket | 3000 |
| Speech Service | Custom Python | Audio analysis | 8001 |
| Video Service | Custom Python | Video analysis | 8002 |
| Fraud Service | Custom Python | Fraud detection | 8003 |
| NLP Service | Custom Python | NLP processing | 8004 |
| Insight Aggregator | Custom Python | Insight consolidation | 8005 |

---

## 4. Microservices Breakdown

### 4.1 API Gateway (Node.js/TypeScript)

**Location:** `services/api-gateway/`

**Responsibilities:**
- JWT authentication and authorization
- WebSocket connection management (Socket.io)
- REST API routing
- Request rate limiting
- Circuit breaker for downstream services
- Redis pub/sub integration

**Key Files:**
```
src/
├── index.ts              # Main application entry
├── config/index.ts       # Environment configuration
├── db/
│   ├── index.ts          # PostgreSQL connection pool
│   └── redis.ts          # Redis client + streams
├── middleware/
│   └── auth.ts           # JWT authentication
├── routes/
│   ├── auth.ts           # Authentication endpoints
│   ├── rounds.ts         # Interview round management
│   ├── insights.ts       # Insight retrieval
│   ├── verdicts.ts       # Verdict submission
│   └── resumes.ts        # Resume upload/retrieval
├── websocket/
│   └── index.ts          # Socket.io event handlers
└── utils/
    ├── logger.ts         # Winston logger
    └── circuitBreaker.ts # Circuit breaker implementation
```

### 4.2 Speech Analysis Service (Python/FastAPI)

**Location:** `services/speech-analysis/`

**Responsibilities:**
- Real-time speech-to-text transcription
- Confidence and hesitation detection
- Filler word analysis
- Pause pattern recognition

**Key Files:**
```
src/
├── main.py               # FastAPI application
├── config.py             # Service configuration
├── analyzer.py           # Audio analysis logic
└── stt.py                # Deepgram/Whisper integration
```

**Filler Words Detected:**
```python
FILLER_WORDS = [
    "um", "uh", "er", "ah", "like", "you know",
    "basically", "actually", "literally", "so",
    "well", "right", "okay", "I mean"
]
```

### 4.3 Video Analysis Service (Python/FastAPI)

**Location:** `services/video-analysis/`

**Responsibilities:**
- Face mesh detection and tracking
- Head movement analysis
- Engagement scoring
- Video quality assessment

**Key Files:**
```
src/
├── main.py               # FastAPI application
├── config.py             # Service configuration
└── analyzer.py           # Video analysis logic
```

### 4.4 Fraud Detection Service (Python/FastAPI)

**Location:** `services/fraud-detection/`

**Responsibilities:**
- Multiple face detection
- Face switch detection (identity verification)
- Background voice detection
- Fraud alert generation

**Key Classes:**
```python
class MultipleFaceDetector:
    """Detects multiple faces using MediaPipe."""
    
class FaceSwitchDetector:
    """Detects identity changes using FaceNet embeddings."""
    
class BackgroundVoiceDetector:
    """Detects multiple speakers using spectral analysis."""
```

### 4.5 NLP Engine (Python/FastAPI)

**Location:** `services/nlp-engine/`

**Responsibilities:**
- Resume contradiction detection
- Skill verification against claims
- Follow-up question generation
- Response quality analysis

**Key Classes:**
```python
class ResumeContradictionAnalyzer:
    """Analyzes responses against resume claims."""
    
    # Contradiction types:
    # - TIMELINE: Date/duration mismatches
    # - SKILL: Expertise level discrepancies
    # - EXPERIENCE: Years/scope mismatches
    # - ROLE: Responsibility contradictions
```

### 4.6 Insight Aggregator (Python/FastAPI)

**Location:** `services/insight-aggregator/`

**Responsibilities:**
- Collect insights from all services
- Deduplicate and merge similar insights
- Apply confidence thresholds
- Generate prioritized recommendations
- Rate limit alert delivery

**Aggregation Logic:**
```python
# Priority order (highest first)
CATEGORY_PRIORITY = {
    "fraud": 1,       # Most critical
    "contradiction": 2,
    "speech": 3,
    "video": 4        # Least critical
}

# Confidence thresholds
MIN_CONFIDENCE = 0.8  # 80% minimum for alerts
ALERT_COOLDOWN = 30   # 30 seconds between same-category alerts
```

---

## 5. Integration Points

### 5.1 VideoSDK Integration

The platform uses VideoSDK for video conferencing:

```typescript
// Required environment variables
VIDEOSDK_API_KEY=<your_api_key>
VIDEOSDK_SECRET=<your_secret>

// Room creation flow
POST /api/rounds → Creates VideoSDK room
GET /api/rounds/:id → Returns participant token
```

**Frontend Integration:**
```typescript
import { MeetingProvider } from "@videosdk.live/react-sdk";

<MeetingProvider
  config={{
    meetingId: round.meetingId,
    participantId: user.id,
    name: user.name,
    micEnabled: true,
    webcamEnabled: true,
    maxResolution: "hd",
  }}
  token={round.participantToken}
>
  {/* Meeting components */}
</MeetingProvider>
```

### 5.2 Redis Integration

Redis serves three purposes:

1. **Caching:** Session data, interview state
2. **Pub/Sub:** Real-time insight broadcasting
3. **Streams:** Audio/video chunk queuing

**Stream Keys:**
```
stream:audio:{roundId}  # Audio chunks from candidate
stream:video:{roundId}  # Video frames from candidate
```

**Pub/Sub Channels:**
```
insights:new            # New insight generated
insights:round:{id}     # Round-specific insights
```

### 5.3 Database Schema

Key tables for this feature:

| Table | Purpose |
|-------|---------|
| `interview_rounds` | Round metadata and status |
| `live_insights` | Real-time insight storage |
| `fraud_alerts` | Fraud detection alerts |
| `interview_transcripts` | Speech transcription |
| `human_verdicts` | Interviewer decisions |
| `candidate_resumes` | Parsed resume data |

---

## 6. Data Flow

### 6.1 Audio Analysis Flow

```
Candidate Browser
      │
      ▼ WebSocket (audio-chunk event)
API Gateway
      │
      ▼ Redis XADD
stream:audio:{roundId}
      │
      ▼ Redis XREAD
Speech Analysis Service
      │
      ├─► Deepgram STT
      │
      ▼ Confidence Analysis
      │
      ▼ Redis PUBLISH (insights:new)
      │
      ▼ Insight Aggregator
      │
      ▼ WebSocket EMIT (insight event)
      │
      ▼
Interviewer Dashboard (AI Panel)
```

### 6.2 Video Analysis Flow

```
Candidate Browser
      │
      ▼ Capture frame (5 FPS)
      │
      ▼ WebSocket (video-frame event)
API Gateway
      │
      ▼ Redis XADD
stream:video:{roundId}
      │
      ▼ Redis XREAD
Video Analysis + Fraud Detection
      │
      ├─► Face Detection
      ├─► Head Movement Analysis
      ├─► Multiple Face Check
      │
      ▼ Redis PUBLISH
      │
      ▼ Insight Aggregator
      │
      ▼ WebSocket EMIT
      │
      ▼
Interviewer Dashboard
```

### 6.3 Insight Aggregation Flow

```
                    ┌─────────────────┐
                    │ Speech Service  │
                    └────────┬────────┘
                             │
┌─────────────────┐          │          ┌─────────────────┐
│ Video Service   │──────────┼──────────│ Fraud Service   │
└────────┬────────┘          │          └────────┬────────┘
         │                   │                   │
         │          ┌────────▼────────┐          │
         └──────────│   Redis Pub/Sub │──────────┘
                    │  insights:new   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ NLP Engine      │
                    │ (Contradiction) │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │    Aggregator   │
                    │ - Deduplication │
                    │ - Thresholding  │
                    │ - Prioritization│
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ API Gateway     │
                    │ Socket.io EMIT  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Interviewer UI  │
                    │ Insights Panel  │
                    └─────────────────┘
```

---

## 7. API Contracts

### 7.1 REST Endpoints

#### Create Interview Round

```http
POST /api/rounds
Authorization: Bearer <token>
Content-Type: application/json

{
  "interviewId": "uuid",
  "externalCandidateId": "string",
  "interviewerId": "uuid",
  "jobRoleId": "uuid",
  "roundNumber": 1,
  "roundType": "TECHNICAL_AI",
  "interviewMode": "HUMAN_AI_ASSISTED",
  "scheduledAt": "2026-02-01T10:00:00Z",
  "durationMinutes": 60
}
```

#### Get Round with Token

```http
GET /api/rounds/:id
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "meetingId": "abc-xyz-123",
    "participantToken": "jwt_token",
    "status": "SCHEDULED",
    ...
  }
}
```

#### Submit Verdict

```http
POST /api/verdicts
Authorization: Bearer <token>
Content-Type: application/json

{
  "roundId": "uuid",
  "decision": "ADVANCE",
  "overallRating": 4,
  "criteriaScores": {
    "technical": 4,
    "communication": 5,
    "problemSolving": 4
  },
  "notes": "Strong candidate...",
  "aiInsightsHelpful": true
}
```

### 7.2 WebSocket Events

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join-interview` | `{ roundId }` | Join interview room |
| `leave-interview` | `{}` | Leave interview room |
| `audio-chunk` | `{ roundId, chunk, timestamp }` | Send audio data |
| `video-frame` | `{ roundId, frame, timestamp }` | Send video frame |
| `tab-visibility` | `{ roundId, visible, timestamp }` | Tab visibility change |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `joined-interview` | `{ roundId }` | Confirmed room join |
| `insight` | `Insight` object | New insight |
| `insights-batch` | `Insight[]` | Multiple insights |
| `fraud-alert` | `Alert` object | Fraud detection alert |
| `transcript-update` | `Transcript` | New transcription |

### 7.3 Insight Object Schema

```typescript
interface Insight {
  id: string;
  roundId: string;
  category: 'fraud' | 'contradiction' | 'speech' | 'video';
  insightType: string;
  severity: 'low' | 'medium' | 'high';
  confidence: number;  // 0.0 - 1.0
  title: string;
  description: string;
  evidence: string[];
  followupQuestions: string[];
  isAlert: boolean;
  timestamp: string;
}
```

---

## 8. Environment Setup

### 8.1 Required Environment Variables

```env
# API Keys (Required)
DEEPGRAM_API_KEY=your_deepgram_key
OPENAI_API_KEY=your_openai_key
VIDEOSDK_API_KEY=your_videosdk_key
VIDEOSDK_SECRET=your_videosdk_secret

# Security (Required)
JWT_SECRET=your_jwt_secret_min_32_chars
INTERNAL_API_KEY=your_internal_service_key

# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=secure_password
POSTGRES_DB=ai_interview_assistant

# Optional
ANTHROPIC_API_KEY=your_anthropic_key
WHISPER_MODEL_SIZE=base
NODE_ENV=development
```

### 8.2 Docker Compose Setup

```bash
# Clone repository
git clone <repository-url>
cd AI-Interviwer-Saas-New-Flow

# Copy environment template
cp .env.example .env

# Edit with your API keys
nano .env

# Start all services
docker-compose up -d

# Verify health
curl http://localhost:3000/health
curl http://localhost:8001/health
curl http://localhost:8002/health
curl http://localhost:8003/health
curl http://localhost:8004/health
curl http://localhost:8005/health
```

### 8.3 Local Development Setup

```bash
# API Gateway
cd services/api-gateway
npm install
npm run dev

# Python services (each in separate terminal)
cd services/speech-analysis
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8001

cd services/video-analysis
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8002

# ... repeat for other services
```

---

## 9. Testing Guidelines

### 9.1 Service Health Checks

```bash
# All services should return 200
curl http://localhost:3000/health
curl http://localhost:8001/health
curl http://localhost:8002/health
curl http://localhost:8003/health
curl http://localhost:8004/health
curl http://localhost:8005/health
```

### 9.2 Integration Test Flow

1. Create a test interview round
2. Join as interviewer (verify WebSocket connection)
3. Join as candidate (verify video stream)
4. Send test audio chunks
5. Verify insights appear on interviewer dashboard
6. Submit verdict
7. Verify audit log entries

### 9.3 Load Testing

```bash
# Use k6 or artillery for load testing
# Target: 100 concurrent interviews
# Expected: <200ms insight latency
```

---

## 10. Deployment Checklist

### Pre-Deployment

- [ ] All environment variables configured
- [ ] Database migrations applied
- [ ] Redis cluster deployed
- [ ] SSL certificates installed
- [ ] Health checks passing
- [ ] Logging configured (ELK/CloudWatch)
- [ ] Monitoring alerts set up

### Post-Deployment

- [ ] Smoke test: Create interview round
- [ ] Smoke test: WebSocket connection
- [ ] Smoke test: Video streaming
- [ ] Smoke test: Insight generation
- [ ] Performance: <200ms insight latency
- [ ] Audit: Verify logging
- [ ] Security: Penetration test passed

---

## Appendix A: Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| WebSocket disconnects | Token expired | Refresh JWT token |
| No insights generated | Service not running | Check service health |
| High latency | Redis congestion | Scale Redis cluster |
| Face detection fails | Poor lighting | Guide candidate |
| Transcription errors | Background noise | Audio preprocessing |

### Support Contacts

- **DevOps:** devops@company.com
- **Backend Team:** backend@company.com
- **ML Team:** ml@company.com

---

*Document Version: 1.0.0*  
*Last Updated: February 2026*
