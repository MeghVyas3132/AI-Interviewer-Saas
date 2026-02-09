# AI Interview Assistant - Production Integration Guide

## Document Information

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Date | 2026-01-30 |
| Status | Draft |
| Classification | Internal |

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [API Documentation](#3-api-documentation)
4. [WebSocket Events](#4-websocket-events)
5. [Database Schema](#5-database-schema)
6. [Integration Flow](#6-integration-flow)
7. [Deployment Guide](#7-deployment-guide)
8. [Security Considerations](#8-security-considerations)

---

## 1. Overview

### 1.1 Purpose

The AI Interview Assistant is a real-time video interview system with AI-powered analysis capabilities. It provides:

- Video conferencing between interviewers and candidates
- Real-time speech analysis and transcription
- Video-based engagement and behavior analysis
- Fraud detection (tab switching, multiple faces, background voices)
- Live AI insights dashboard for interviewers
- Structured verdict submission with AI recommendations

### 1.2 Components

| Component | Technology | Port | Purpose |
|-----------|------------|------|---------|
| API Gateway | Node.js/Express | 3000 | REST API, WebSocket, routing |
| Frontend | Next.js | 5173 | User interface |
| Speech Analysis | Python/FastAPI | 8001 | STT, hesitation detection |
| Video Analysis | Python/FastAPI | 8002 | Face detection, engagement |
| Fraud Detection | Python/FastAPI | 8003 | Anomaly detection |
| NLP Engine | Python/FastAPI | 8004 | Response quality analysis |
| Insight Aggregator | Python/FastAPI | 8005 | Insight correlation |
| PostgreSQL | PostgreSQL 15 | 5432 | Primary database |
| Redis | Redis 7 | 6379 | Caching, pub/sub, streams |

### 1.3 External Dependencies

| Service | Purpose | Required |
|---------|---------|----------|
| VideoSDK.live | Video conferencing infrastructure | Yes |
| Deepgram (optional) | Speech-to-text | No (fallback to Whisper) |

---

## 2. Architecture

### 2.1 System Architecture Diagram

```
                                    +-------------------+
                                    |   VideoSDK.live   |
                                    |  (Video Server)   |
                                    +--------+----------+
                                             |
                                             | WebRTC
                                             |
+------------------+    HTTPS/WSS    +-------v---------+
|                  |<--------------->|                 |
|  Browser Client  |                 |   API Gateway   |
|  (Next.js SPA)   |                 |   (Express)     |
|                  |                 |                 |
+------------------+                 +-------+---------+
                                             |
                          +------------------+------------------+
                          |                  |                  |
                    +-----v-----+     +------v------+    +------v------+
                    | PostgreSQL|     |    Redis    |    |  ML Services|
                    |           |     | (Pub/Sub)   |    |  (Python)   |
                    +-----------+     +-------------+    +-------------+
```

### 2.2 Data Flow

```
1. Interview Creation
   HR Dashboard -> API Gateway -> PostgreSQL -> VideoSDK Room Creation

2. Interview Session
   Candidate Browser <-> VideoSDK <-> Interviewer Browser
          |                                    |
          v                                    v
   API Gateway (WebSocket) <---------> API Gateway (WebSocket)
          |                                    |
          v                                    v
   Redis Streams -----> ML Services -----> Redis Pub/Sub
                                               |
                                               v
                                    Interviewer Dashboard
```

### 2.3 Component Interactions

```
+-------------+     HTTP      +-------------+     Redis     +-------------+
|   Frontend  |-------------->| API Gateway |-------------->|    Redis    |
+-------------+               +-------------+               +-------------+
      |                             |                             |
      | WebSocket                   | HTTP                        | Pub/Sub
      v                             v                             v
+-------------+               +-------------+               +-------------+
| VideoSDK    |               | PostgreSQL  |               | ML Services |
+-------------+               +-------------+               +-------------+
```

---

## 3. API Documentation

### 3.1 Authentication

All API endpoints require JWT authentication via the Authorization header:

```
Authorization: Bearer <jwt_token>
```

JWT Payload Structure:
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "EMPLOYEE|CANDIDATE|HR|ADMIN",
  "companyId": "company-uuid",
  "iat": 1234567890,
  "exp": 1234567890
}
```

### 3.2 Interview Rounds API

#### Create Interview Round

```
POST /api/rounds
```

Request Body:
```json
{
  "externalInterviewId": "string (required)",
  "externalCandidateId": "string (required)",
  "externalInterviewerId": "string (optional)",
  "externalJobRoleId": "string (required)",
  "roundNumber": "integer (default: 1)",
  "roundType": "TECHNICAL_AI|SCREENING_HUMAN|HR_HUMAN|MANAGERIAL_HUMAN|CULTURAL_FIT_HUMAN",
  "interviewMode": "AI_CONDUCTED|HUMAN_AI_ASSISTED|HUMAN_ONLY",
  "scheduledAt": "ISO 8601 datetime",
  "scheduledDurationMinutes": "integer (default: 60)"
}
```

Response:
```json
{
  "id": "uuid",
  "external_interview_id": "string",
  "videosdk_meeting_id": "string",
  "videosdk_token": "string",
  "status": "SCHEDULED",
  "created_at": "ISO 8601 datetime"
}
```

Access: HR, ADMIN

---

#### Get Interview Round

```
GET /api/rounds/:roundId
```

Response:
```json
{
  "id": "uuid",
  "external_interview_id": "string",
  "external_candidate_id": "string",
  "external_interviewer_id": "string",
  "round_number": 1,
  "round_type": "TECHNICAL_AI",
  "interview_mode": "HUMAN_AI_ASSISTED",
  "status": "SCHEDULED|WAITING_FOR_CANDIDATE|IN_PROGRESS|COMPLETED|CANCELLED",
  "videosdk_meeting_id": "string",
  "videosdk_token": "string (participant-specific)",
  "scheduled_at": "ISO 8601 datetime",
  "started_at": "ISO 8601 datetime|null",
  "ended_at": "ISO 8601 datetime|null"
}
```

Access: Authenticated users with access to the round

---

#### Update Interview Round

```
PATCH /api/rounds/:roundId
```

Request Body:
```json
{
  "status": "IN_PROGRESS|COMPLETED|CANCELLED",
  "scheduledAt": "ISO 8601 datetime (optional)"
}
```

Access: HR, ADMIN, assigned interviewer

---

#### Record Consent

```
POST /api/rounds/:roundId/consent
```

Request Body:
```json
{
  "consent": true
}
```

Access: Assigned candidate

---

### 3.3 Resume API

#### Upload Resume

```
POST /api/resumes/upload
Content-Type: multipart/form-data
```

Form Fields:
- `resume`: File (PDF, DOC, DOCX)
- `roundId`: string
- `candidateId`: string

Response:
```json
{
  "success": true,
  "fileUrl": "/api/resumes/files/filename.pdf",
  "message": "Resume uploaded successfully"
}
```

Access: Authenticated users

---

#### Get Resume for Round

```
GET /api/resumes/round/:roundId
```

Response:
```json
{
  "id": "uuid",
  "external_candidate_id": "string",
  "file_name": "resume.pdf",
  "file_url": "/api/resumes/files/filename.pdf",
  "mime_type": "application/pdf",
  "created_at": "ISO 8601 datetime"
}
```

Access: Interviewer, HR, ADMIN

---

#### Serve Resume File

```
GET /api/resumes/files/:filename
```

Response: Binary file stream (application/pdf)

Access: Authenticated users

---

### 3.4 Insights API

#### Get Insights for Round

```
GET /api/insights/round/:roundId
```

Query Parameters:
- `since`: ISO 8601 datetime (optional)
- `limit`: integer (default: 100)

Response:
```json
{
  "insights": [
    {
      "id": "uuid",
      "round_id": "uuid",
      "timestamp_ms": 123456,
      "insight_type": "SPEECH_CONFIDENCE|HESITATION|RESPONSE_LATENCY|...",
      "severity": "INFO|LOW|MEDIUM|HIGH|CRITICAL",
      "value": {},
      "explanation": "string",
      "created_at": "ISO 8601 datetime"
    }
  ],
  "total": 50
}
```

Access: Interviewer, HR, ADMIN

---

#### Get Aggregated Insights

```
GET /api/insights/:roundId/aggregate
```

Response:
```json
{
  "round_id": "uuid",
  "aggregated_at": "ISO 8601 datetime",
  "speech": {
    "average_confidence": 0.85,
    "total_hesitations": 5,
    "average_response_time_ms": 2500
  },
  "video": {
    "engagement_score": 0.78,
    "eye_contact_percentage": 65,
    "head_movement": "stable"
  },
  "fraud": {
    "alerts_count": 1,
    "tab_switches": 2,
    "multiple_faces_detected": false
  },
  "recommendations": [
    {
      "category": "follow_up",
      "question": "Can you elaborate on your experience with...",
      "reason": "Candidate showed hesitation when discussing..."
    }
  ]
}
```

Access: Interviewer, HR, ADMIN

---

### 3.5 Verdicts API

#### Submit Verdict

```
POST /api/verdicts
```

Request Body:
```json
{
  "roundId": "uuid (required)",
  "decision": "ADVANCE|REJECT|HOLD|REASSESS",
  "overallScore": "integer 1-10",
  "technicalScore": "integer 1-10 (optional)",
  "communicationScore": "integer 1-10 (optional)",
  "culturalFitScore": "integer 1-10 (optional)",
  "strengths": ["string"],
  "weaknesses": ["string"],
  "notes": "string",
  "privateNotes": "string (HR/Admin only visible)"
}
```

Response:
```json
{
  "id": "uuid",
  "round_id": "uuid",
  "decision": "ADVANCE",
  "overall_score": 8,
  "created_at": "ISO 8601 datetime"
}
```

Access: Assigned interviewer, HR, ADMIN

---

#### Get Verdict

```
GET /api/verdicts/:roundId
```

Response: Verdict object as above

Access: Interviewer, HR, ADMIN

---

### 3.6 Health Check

```
GET /health
```

Response:
```json
{
  "status": "healthy|degraded",
  "timestamp": "ISO 8601 datetime",
  "services": {
    "database": "up|down",
    "redis": "up|down"
  }
}
```

Access: Public

---

## 4. WebSocket Events

### 4.1 Connection

```javascript
const socket = io('wss://api.example.com', {
  auth: { token: 'jwt_token' },
  transports: ['websocket']
});
```

### 4.2 Client-to-Server Events

#### Join Interview Room

```javascript
socket.emit('join-interview', { roundId: 'uuid' });
// or
socket.emit('interview:join', { roundId: 'uuid' });
```

#### Leave Interview Room

```javascript
socket.emit('leave-interview');
// or
socket.emit('interview:leave');
```

#### Send Audio Chunk (Candidate only)

```javascript
socket.emit('audio-chunk', {
  roundId: 'uuid',
  chunk: 'base64_encoded_audio',
  timestamp: Date.now()
});
```

#### Send Video Frame (Candidate only)

```javascript
socket.emit('video-frame', {
  roundId: 'uuid',
  frame: 'base64_encoded_jpeg',
  timestamp: Date.now()
});
```

#### Report Tab Visibility (Candidate only)

```javascript
socket.emit('tab-visibility', {
  roundId: 'uuid',
  visible: false,
  timestamp: Date.now()
});
```

### 4.3 Server-to-Client Events

#### Connection Confirmation

```javascript
socket.on('joined-interview', (data) => {
  // { roundId: 'uuid' }
});
```

#### Real-time Insight

```javascript
socket.on('insight', (data) => {
  // {
  //   roundId: 'uuid',
  //   timestampMs: 123456,
  //   insightType: 'SPEECH_CONFIDENCE',
  //   severity: 'INFO',
  //   value: { score: 0.85 },
  //   explanation: 'Candidate speaking confidently'
  // }
});
```

#### Fraud Alert

```javascript
socket.on('fraud-alert', (data) => {
  // {
  //   type: 'TAB_SWITCH',
  //   severity: 'MEDIUM',
  //   timestamp: 123456,
  //   message: 'Candidate switched away from interview tab'
  // }
});
```

#### Transcript Update

```javascript
socket.on('transcript', (data) => {
  // {
  //   roundId: 'uuid',
  //   speaker: 'candidate',
  //   text: 'Transcribed text...',
  //   timestamp: 123456,
  //   confidence: 0.95,
  //   isFinal: true
  // }
});
```

#### Aggregated Insights

```javascript
socket.on('insights-aggregated', (data) => {
  // {
  //   roundId: 'uuid',
  //   insights: [...],
  //   recommendations: [...]
  // }
});
```

#### Metrics Summary

```javascript
socket.on('metrics-summary', (data) => {
  // {
  //   roundId: 'uuid',
  //   speechConfidence: 0.85,
  //   engagementScore: 0.78,
  //   hesitationsCount: 5,
  //   avgResponseTime: 2500
  // }
});
```

---

## 5. Database Schema

### 5.1 Entity Relationship Diagram

```
+--------------------+       +----------------------+
|  interview_rounds  |       |  candidate_resumes   |
+--------------------+       +----------------------+
| id (PK)            |       | id (PK)              |
| external_interview |       | external_candidate_id|
| external_candidate |<------| resume_json          |
| external_interviewer       | key_facts            |
| round_number       |       +----------------------+
| round_type         |
| interview_mode     |       +----------------------+
| status             |       | candidate_resume_    |
| videosdk_meeting_id|       | files                |
| videosdk_token     |       +----------------------+
| scheduled_at       |       | id (PK)              |
| started_at         |       | external_candidate_id|
| ended_at           |       | round_id (FK)------->|
+--------+-----------+       | file_name            |
         |                   | file_path            |
         |                   | file_url             |
         |                   +----------------------+
         |
         |1:N
         v
+--------------------+       +----------------------+
|   live_insights    |       | insight_aggregates   |
+--------------------+       +----------------------+
| id (PK)            |       | id (PK)              |
| round_id (FK)      |       | round_id (FK)------->|
| timestamp_ms       |       | aggregated_at        |
| insight_type       |       | speech_metrics       |
| severity           |       | video_metrics        |
| value (JSONB)      |       | fraud_indicators     |
| explanation        |       | ai_recommendations   |
+--------------------+       +----------------------+
         |
         |1:N
         v
+--------------------+
| interview_verdicts |
+--------------------+
| id (PK)            |
| round_id (FK)      |
| interviewer_id     |
| decision           |
| overall_score      |
| technical_score    |
| communication_score|
| strengths (JSONB)  |
| weaknesses (JSONB) |
| notes              |
+--------------------+
```

### 5.2 Table Definitions

#### interview_rounds

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT uuid_generate_v4() | Primary key |
| external_interview_id | VARCHAR(255) | NOT NULL | Reference to main app interview |
| external_candidate_id | VARCHAR(255) | NOT NULL | Reference to main app candidate |
| external_interviewer_id | VARCHAR(255) | | Reference to main app interviewer |
| external_job_role_id | VARCHAR(255) | NOT NULL | Reference to main app job role |
| round_number | INTEGER | NOT NULL DEFAULT 1 | Round sequence number |
| round_type | interview_round_type | NOT NULL | Type of interview round |
| interview_mode | interview_mode | NOT NULL | Mode of interview |
| status | round_status | NOT NULL DEFAULT 'SCHEDULED' | Current status |
| videosdk_meeting_id | VARCHAR(255) | | VideoSDK room ID |
| videosdk_token | TEXT | | VideoSDK access token |
| scheduled_at | TIMESTAMPTZ | | Scheduled start time |
| scheduled_duration_minutes | INTEGER | DEFAULT 60 | Expected duration |
| started_at | TIMESTAMPTZ | | Actual start time |
| ended_at | TIMESTAMPTZ | | Actual end time |
| candidate_consent_given | BOOLEAN | DEFAULT FALSE | Consent status |
| candidate_consent_timestamp | TIMESTAMPTZ | | When consent was given |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Record creation time |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Last update time |

#### live_insights

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| round_id | UUID | FK -> interview_rounds | Associated round |
| timestamp_ms | BIGINT | NOT NULL | Milliseconds from interview start |
| insight_type | insight_type | NOT NULL | Type of insight |
| severity | alert_severity | NOT NULL DEFAULT 'INFO' | Severity level |
| value | JSONB | | Insight data |
| explanation | TEXT | | Human-readable explanation |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Record creation time |

#### interview_verdicts

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| round_id | UUID | FK -> interview_rounds, UNIQUE | Associated round |
| interviewer_id | VARCHAR(255) | NOT NULL | Interviewer who submitted |
| decision | verdict_decision | NOT NULL | Final decision |
| overall_score | INTEGER | CHECK 1-10 | Overall rating |
| technical_score | INTEGER | CHECK 1-10 | Technical skills rating |
| communication_score | INTEGER | CHECK 1-10 | Communication rating |
| cultural_fit_score | INTEGER | CHECK 1-10 | Cultural fit rating |
| strengths | JSONB | | List of strengths |
| weaknesses | JSONB | | List of weaknesses |
| notes | TEXT | | General notes |
| private_notes | TEXT | | HR-only notes |
| ai_summary | JSONB | | AI-generated summary |
| submitted_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Submission time |

### 5.3 Enum Types

```sql
-- Round types
CREATE TYPE interview_round_type AS ENUM (
    'TECHNICAL_AI',
    'SCREENING_HUMAN',
    'HR_HUMAN',
    'MANAGERIAL_HUMAN',
    'CULTURAL_FIT_HUMAN'
);

-- Interview modes
CREATE TYPE interview_mode AS ENUM (
    'AI_CONDUCTED',
    'HUMAN_AI_ASSISTED',
    'HUMAN_ONLY'
);

-- Round status
CREATE TYPE round_status AS ENUM (
    'SCHEDULED',
    'WAITING_FOR_CANDIDATE',
    'WAITING_FOR_INTERVIEWER',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW'
);

-- Insight types
CREATE TYPE insight_type AS ENUM (
    'SPEECH_CONFIDENCE',
    'HESITATION',
    'RESPONSE_LATENCY',
    'HEAD_MOVEMENT',
    'VIDEO_QUALITY',
    'MULTIPLE_FACES',
    'FACE_SWITCH',
    'TAB_SWITCH',
    'BACKGROUND_VOICE',
    'RESUME_CONTRADICTION'
);

-- Alert severity
CREATE TYPE alert_severity AS ENUM (
    'INFO',
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
);

-- Verdict decision
CREATE TYPE verdict_decision AS ENUM (
    'ADVANCE',
    'REJECT',
    'HOLD',
    'REASSESS'
);
```

---

## 6. Integration Flow

### 6.1 Interview Scheduling Sequence

```
HR User                API Gateway              Database           VideoSDK
   |                        |                       |                  |
   |  POST /api/rounds      |                       |                  |
   |----------------------->|                       |                  |
   |                        |  Create VideoSDK Room |                  |
   |                        |----------------------------------------->|
   |                        |                       |   Room Created   |
   |                        |<-----------------------------------------|
   |                        |  INSERT round         |                  |
   |                        |---------------------->|                  |
   |                        |   Round record        |                  |
   |                        |<----------------------|                  |
   |   Round created        |                       |                  |
   |<-----------------------|                       |                  |
```

### 6.2 Interview Session Sequence

```
Candidate           Interviewer          API Gateway          ML Services
    |                    |                    |                    |
    |  Join Interview    |                    |                    |
    |------------------->|                    |                    |
    |                    |  Join Interview    |                    |
    |                    |------------------->|                    |
    |                    |                    |                    |
    |  Video/Audio Stream|                    |                    |
    |========================================>|                    |
    |                    |                    |  Process Frame     |
    |                    |                    |------------------->|
    |                    |                    |  Insight           |
    |                    |                    |<-------------------|
    |                    |  Real-time Insight |                    |
    |                    |<-------------------|                    |
    |                    |                    |                    |
    |  Tab Switch        |                    |                    |
    |------------------->|                    |                    |
    |                    |  Fraud Alert       |                    |
    |                    |<-------------------|                    |
    |                    |                    |                    |
    |  Leave Interview   |                    |                    |
    |------------------->|                    |                    |
    |                    |  Submit Verdict    |                    |
    |                    |------------------->|                    |
```

### 6.3 Insight Processing Pipeline

```
                    +------------------+
                    |   Video Frame    |
                    | (from candidate) |
                    +--------+---------+
                             |
                             v
                    +------------------+
                    |   API Gateway    |
                    |   (WebSocket)    |
                    +--------+---------+
                             |
                             v
                    +------------------+
                    |   Redis Stream   |
                    | stream:video:xxx |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
              v              v              v
     +--------+-----+ +------+------+ +-----+-------+
     |Video Analysis| |Face Detection| |Engagement  |
     +--------------+ +-------------+ +-------------+
              |              |              |
              +--------------+--------------+
                             |
                             v
                    +------------------+
                    |   Redis Pub/Sub  |
                    |  insights:video  |
                    +--------+---------+
                             |
                             v
                    +------------------+
                    |   API Gateway    |
                    |  (subscriber)    |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
              v                             v
     +--------+-------+           +---------+--------+
     |  PostgreSQL    |           |  WebSocket       |
     |  (persist)     |           |  (broadcast)     |
     +----------------+           +------------------+
                                           |
                                           v
                                  +------------------+
                                  | Interviewer      |
                                  | Dashboard        |
                                  +------------------+
```

---

## 7. Deployment Guide

### 7.1 Infrastructure Requirements

| Resource | Minimum | Recommended | Purpose |
|----------|---------|-------------|---------|
| API Gateway | 2 vCPU, 2GB RAM | 4 vCPU, 4GB RAM | API and WebSocket |
| ML Services (each) | 2 vCPU, 4GB RAM | 4 vCPU, 8GB RAM | ML processing |
| PostgreSQL | 2 vCPU, 4GB RAM | 4 vCPU, 8GB RAM | Database |
| Redis | 1 vCPU, 2GB RAM | 2 vCPU, 4GB RAM | Cache and pub/sub |

### 7.2 Environment Variables

```bash
# API Gateway
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://host:6379
JWT_SECRET=<secure-random-string-min-32-chars>
INTERNAL_API_KEY=<secure-random-string>
VIDEOSDK_API_KEY=<from-videosdk-dashboard>
VIDEOSDK_SECRET=<from-videosdk-dashboard>
CORS_ORIGINS=https://app.example.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# ML Services
SPEECH_SERVICE_URL=http://speech-service:8001
VIDEO_SERVICE_URL=http://video-service:8002
FRAUD_SERVICE_URL=http://fraud-service:8003
NLP_SERVICE_URL=http://nlp-service:8004
```

### 7.3 Kubernetes Deployment

```yaml
# Example deployment for API Gateway
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-interview-api-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ai-interview-api-gateway
  template:
    metadata:
      labels:
        app: ai-interview-api-gateway
    spec:
      containers:
      - name: api-gateway
        image: ai-interview-api-gateway:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### 7.4 Scaling Considerations

| Component | Scaling Strategy | Notes |
|-----------|------------------|-------|
| API Gateway | Horizontal (3+ replicas) | Use Redis adapter for Socket.IO |
| ML Services | Horizontal (2+ replicas) | Stateless, load balance by round |
| PostgreSQL | Vertical + Read replicas | Connection pooling required |
| Redis | Cluster mode | For high availability |

---

## 8. Security Considerations

### 8.1 Authentication Requirements

- All API endpoints require valid JWT tokens
- WebSocket connections require authentication at connect time
- Internal service-to-service calls use X-Internal-API-Key header
- VideoSDK tokens are generated server-side with appropriate permissions

### 8.2 Data Protection

| Data Type | Protection Measure |
|-----------|-------------------|
| Video streams | End-to-end encryption via VideoSDK |
| Resume files | Encrypted at rest, authenticated access |
| Insights | Database encryption, role-based access |
| Verdicts | Private notes visible only to HR/Admin |

### 8.3 Rate Limiting

| Endpoint | Limit |
|----------|-------|
| API endpoints | 100 requests/minute/IP |
| Resume upload | 3 uploads/hour/user |
| WebSocket connections | 5 connections/minute/user |

### 8.4 Audit Logging

Log the following events:
- Interview creation and status changes
- Consent given by candidates
- Verdict submissions
- Fraud alerts triggered
- Resume uploads and access

---

## Appendix A: Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| AUTH_REQUIRED | 401 | Authorization header missing |
| INVALID_TOKEN | 401 | JWT verification failed |
| ACCESS_DENIED | 403 | User lacks permission |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_FAILED | 400 | Request validation error |
| INTERNAL_ERROR | 500 | Server error |

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| Round | A single interview session within a multi-stage interview process |
| Insight | An AI-generated observation about candidate behavior or performance |
| Verdict | The interviewer's final assessment of a round |
| Fraud Alert | A detection of potentially dishonest behavior |

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-30 | System | Initial draft |
