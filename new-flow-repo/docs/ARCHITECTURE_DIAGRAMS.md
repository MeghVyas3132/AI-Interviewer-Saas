# Architecture Diagrams

## Document Information

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Date | 2026-01-30 |

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Interview Flow Sequence](#2-interview-flow-sequence)
3. [Deployment Architecture](#3-deployment-architecture)
4. [Data Flow Diagram](#4-data-flow-diagram)

---

## 1. System Architecture

### High-Level Overview

```
+------------------------------------------------------------------+
|                         CLIENT LAYER                              |
+------------------------------------------------------------------+
|                                                                   |
|   +------------------+    +------------------+    +-----------+   |
|   |   HR Dashboard   |    |   Interviewer    |    | Candidate |   |
|   |    (Next.js)     |    |     Portal       |    |  Portal   |   |
|   +--------+---------+    +--------+---------+    +-----+-----+   |
|            |                       |                    |         |
+------------+-----------------------+--------------------+---------+
             |                       |                    |
             v                       v                    v
+------------------------------------------------------------------+
|                        API GATEWAY                                |
+------------------------------------------------------------------+
|                                                                   |
|   +------------------+    +------------------+    +------------+  |
|   |   REST API       |    |   WebSocket      |    |   Auth     |  |
|   |   (Express)      |    |   (Socket.IO)    |    | Middleware |  |
|   +--------+---------+    +--------+---------+    +------+-----+  |
|            |                       |                     |        |
|            +---------------+-------+---------------------+        |
|                            |                                      |
|   +------------------+     |     +------------------+             |
|   |   Rate Limiter   |<----+---->|  Circuit Breaker |             |
|   +------------------+           +------------------+             |
|                                                                   |
+----------------------------+--------------------------------------+
                             |
             +---------------+---------------+
             |               |               |
             v               v               v
+------------+---+   +-------+-------+   +---+------------+
|   PostgreSQL   |   |     Redis     |   |   VideoSDK    |
|   (Primary DB) |   | (Cache/PubSub)|   |   (Meetings)  |
+----------------+   +-------+-------+   +----------------+
                             |
                    +--------+--------+
                    |                 |
                    v                 v
+-------------------+--+   +--+-------------------+
|   Redis Streams      |   |   Redis Pub/Sub     |
|   (Audio/Video Data) |   |   (Real-time Sync)  |
+----------+-----------+   +----------+----------+
           |                          |
           +------------+-------------+
                        |
    +-------------------+-------------------+
    |                   |                   |
    v                   v                   v
+---+----+         +----+---+         +-----+--+
| Speech |         | Video  |         | NLP    |
|Analysis|         |Analysis|         | Engine |
+---+----+         +----+---+         +----+---+
    |                   |                  |
    v                   v                  v
+---+-------------------+------------------+---+
|              Insight Aggregator              |
+----------------------+-----------------------+
                       |
                       v
+----------------------+-----------------------+
|             Fraud Detection                  |
+----------------------+-----------------------+
                       |
                       v
            (Insights to WebSocket)
```

### Component Details

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | Next.js 14, React 18 | User interfaces |
| API Gateway | Express.js, Socket.IO | Request routing, WebSocket |
| PostgreSQL | PostgreSQL 15 | Primary data storage |
| Redis | Redis 7 | Caching, pub/sub, streams |
| VideoSDK | VideoSDK.live | Video conferencing |
| Speech Analysis | Python, Whisper | Speech-to-text, confidence |
| Video Analysis | Python, OpenCV | Face detection, engagement |
| NLP Engine | Python, Transformers | Answer quality analysis |
| Insight Aggregator | Python | Combines analysis results |
| Fraud Detection | Python | Integrity monitoring |

---

## 2. Interview Flow Sequence

### Complete Interview Lifecycle

```
HR          Candidate      System         Interviewer     ML Services
|               |             |                |               |
|--Create Round->             |                |               |
|               |             |                |               |
|               |<--Link------|                |               |
|               |             |----Link------->|               |
|               |             |                |               |
|               |--Join------>|                |               |
|               |             |<---Join--------|               |
|               |             |                |               |
|               |--Resume---->|                |               |
|               |             |--Resume URL--->|               |
|               |             |                |               |
|               |<--VideoSDK--|--VideoSDK----->|               |
|               |   Token     |    Token       |               |
|               |             |                |               |
|               |<============|=INTERVIEW======|               |
|               |             |                |               |
|               |--Audio----->|                |               |
|               |--Video----->|                |               |
|               |             |--Streams------>|               |
|               |             |                |               |
|               |             |<--Analysis-----|               |
|               |             |                |               |
|               |             |--Insights----->|               |
|               |             |                |               |
|               |<============|=END============|               |
|               |             |                |               |
|               |             |                |--Verdict----->|
|               |             |<---------------|               |
|               |             |                |               |
|<--Results-----|             |                |               |
|               |             |                |               |
```

### Detailed Join Sequence

```
Candidate                API Gateway              VideoSDK           Interviewer
    |                         |                       |                   |
    |---GET /rounds/:id------>|                       |                   |
    |                         |---Generate Token----->|                   |
    |<--Round + Token---------|                       |                   |
    |                         |                       |                   |
    |---POST /resumes/upload->|                       |                   |
    |<--Resume URL------------|                       |                   |
    |                         |                       |                   |
    |---WS: join-room-------->|                       |                   |
    |<--WS: room-joined-------|                       |                   |
    |                         |                       |                   |
    |---VideoSDK.init-------->|                       |                   |
    |                         |---Validate Token----->|                   |
    |<--Meeting Connected-----|<----------------------|                   |
    |                         |                       |                   |
    |                         |                       |                   |
    |                         |<--------GET /rounds/:id------------------|
    |                         |---Generate Token----->|                   |
    |                         |---------Round + Token------------------->|
    |                         |                       |                   |
    |                         |<--------WS: join-room--------------------|
    |                         |---WS: participant-joined---------------->|
    |<--WS: participant-joined|                       |                   |
    |                         |---------WS: room-joined----------------->|
    |                         |                       |                   |
    |                         |                       |<--VideoSDK.init---|
    |                         |---Validate Token----->|                   |
    |                         |<----------------------|--Meeting Connected|
    |                         |                       |                   |
```

### AI Insight Generation Flow

```
Candidate        API Gateway        Redis          ML Service       Interviewer
    |                 |               |                |                 |
    |--audio-chunk--->|               |                |                 |
    |                 |--XADD-------->|                |                 |
    |                 |               |                |                 |
    |                 |               |<--XREAD--------|                 |
    |                 |               |                |                 |
    |                 |               |---audio data-->|                 |
    |                 |               |                |                 |
    |                 |               |                |--Whisper STT--> |
    |                 |               |                |--Sentiment----> |
    |                 |               |                |--Confidence---> |
    |                 |               |                |                 |
    |                 |               |<--PUBLISH------|                 |
    |                 |<--SUBSCRIBE---|                |                 |
    |                 |                                                  |
    |                 |---WS: ai-insight------------------------------------>|
    |                 |                                                  |
```

---

## 3. Deployment Architecture

### Docker Compose Topology

```
+------------------------------------------------------------------+
|                     Docker Network: interview-net                 |
+------------------------------------------------------------------+
|                                                                   |
|  +-----------------+                      +-----------------+     |
|  |    Frontend     |                      |   API Gateway   |     |
|  |   (Next.js)     |                      |   (Express)     |     |
|  |   Port: 3001    |--------------------->|   Port: 3000    |     |
|  +-----------------+                      +--------+--------+     |
|                                                    |              |
|                    +-------------------------------+              |
|                    |                               |              |
|                    v                               v              |
|  +-----------------+                      +-----------------+     |
|  |   PostgreSQL    |                      |      Redis      |     |
|  |   Port: 5432    |                      |   Port: 6379    |     |
|  +-----------------+                      +--------+--------+     |
|                                                    |              |
|           +----------------------------------------+              |
|           |            |            |              |              |
|           v            v            v              v              |
|  +--------+--+  +------+---+  +-----+----+  +------+-----+       |
|  |  Speech   |  |  Video   |  |   NLP    |  |  Insight   |       |
|  | Analysis  |  | Analysis |  |  Engine  |  | Aggregator |       |
|  | Port:8001 |  | Port:8002|  | Port:8003|  | Port:8004  |       |
|  +-----------+  +----------+  +----------+  +------+-----+       |
|                                                    |              |
|                                                    v              |
|                                             +------+-----+       |
|                                             |   Fraud    |       |
|                                             | Detection  |       |
|                                             | Port:8005  |       |
|                                             +------------+       |
|                                                                   |
+------------------------------------------------------------------+
                              |
                              | External
                              v
                    +-----------------+
                    |    VideoSDK     |
                    |   (External)    |
                    |  api.videosdk.  |
                    |     live        |
                    +-----------------+
```

### Production Deployment (Kubernetes)

```
+------------------------------------------------------------------+
|                        Kubernetes Cluster                         |
+------------------------------------------------------------------+
|                                                                   |
|  +---------------------------+  +---------------------------+     |
|  |     Ingress Controller    |  |     Cert Manager          |     |
|  |     (nginx/traefik)       |  |     (TLS)                 |     |
|  +-------------+-------------+  +---------------------------+     |
|                |                                                  |
|                v                                                  |
|  +---------------------------+                                    |
|  |   Frontend Deployment     |                                    |
|  |   - 3 replicas            |                                    |
|  |   - HPA: 3-10 pods        |                                    |
|  +---------------------------+                                    |
|                                                                   |
|  +---------------------------+                                    |
|  |   API Gateway Deployment  |                                    |
|  |   - 3 replicas            |                                    |
|  |   - HPA: 3-15 pods        |                                    |
|  |   - Redis adapter for WS  |                                    |
|  +---------------------------+                                    |
|                                                                   |
|  +---------------------------+  +---------------------------+     |
|  |   PostgreSQL StatefulSet  |  |   Redis StatefulSet       |     |
|  |   - 1 primary             |  |   - 1 primary             |     |
|  |   - 2 replicas            |  |   - 2 replicas            |     |
|  |   - PVC: 100Gi            |  |   - PVC: 10Gi             |     |
|  +---------------------------+  +---------------------------+     |
|                                                                   |
|  +---------------------------+                                    |
|  |   ML Services Deployment  |                                    |
|  |   - 2 replicas each       |                                    |
|  |   - GPU nodes for video   |                                    |
|  +---------------------------+                                    |
|                                                                   |
+------------------------------------------------------------------+
```

### Resource Requirements

| Service | CPU Request | CPU Limit | Memory Request | Memory Limit |
|---------|-------------|-----------|----------------|--------------|
| Frontend | 100m | 500m | 256Mi | 512Mi |
| API Gateway | 250m | 1000m | 512Mi | 1Gi |
| PostgreSQL | 500m | 2000m | 1Gi | 4Gi |
| Redis | 100m | 500m | 256Mi | 1Gi |
| Speech Analysis | 500m | 2000m | 1Gi | 4Gi |
| Video Analysis | 1000m | 4000m | 2Gi | 8Gi |
| NLP Engine | 500m | 2000m | 2Gi | 4Gi |
| Insight Aggregator | 100m | 500m | 256Mi | 512Mi |
| Fraud Detection | 250m | 1000m | 512Mi | 2Gi |

---

## 4. Data Flow Diagram

### Resume Upload Flow

```
+----------+     +----------+     +----------+     +----------+
| Candidate|---->| Frontend |---->|   API    |---->| Database |
|          |     |          |     | Gateway  |     |          |
+----------+     +----+-----+     +----+-----+     +----------+
                      |                |
                      | 1. Select      | 3. Save file
                      |    file        |    to disk
                      |                |
                      | 2. Upload      | 4. Save metadata
                      |    multipart   |    to DB
                      |                |
                      v                v
               +------+------+   +-----+------+
               | File Picker |   | File System|
               +-------------+   +------------+
```

### Interview Data Flow

```
                                 +------------------+
                                 |   Interview      |
                                 |   Round Data     |
                                 +--------+---------+
                                          |
              +---------------------------+---------------------------+
              |                           |                           |
              v                           v                           v
     +--------+--------+         +--------+--------+         +--------+--------+
     | Participant     |         | AI Insights     |         | Fraud Alerts    |
     | Media Streams   |         | (Aggregated)    |         | (Real-time)     |
     +-----------------+         +-----------------+         +-----------------+
              |                           |                           |
              v                           v                           v
     +--------+--------+         +--------+--------+         +--------+--------+
     | VideoSDK        |         | PostgreSQL      |         | PostgreSQL      |
     | (Video/Audio)   |         | (ai_insights)   |         | (fraud_alerts)  |
     +-----------------+         +-----------------+         +-----------------+
              |
              +---------------------------+
              |                           |
              v                           v
     +--------+--------+         +--------+--------+
     | Redis Streams   |         | ML Services     |
     | (Raw Data)      |-------->| (Analysis)      |
     +-----------------+         +-----------------+
```

---

## Port Mapping Summary

| Service | Internal Port | External Port | Protocol |
|---------|---------------|---------------|----------|
| Frontend | 3000 | 3001 | HTTP |
| API Gateway | 3000 | 3000 | HTTP/WS |
| PostgreSQL | 5432 | 5432 | TCP |
| Redis | 6379 | 6379 | TCP |
| Speech Analysis | 8001 | - | HTTP |
| Video Analysis | 8002 | - | HTTP |
| NLP Engine | 8003 | - | HTTP |
| Insight Aggregator | 8004 | - | HTTP |
| Fraud Detection | 8005 | - | HTTP |

---

## Document Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-30 | Initial version |
