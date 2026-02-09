# Documentation Index

## AI-Assisted Interview Platform - Feature Release v1.0

---

## Quick Links

| Document | Purpose | Audience |
|----------|---------|----------|
| [FEATURE_RELEASE_v1.0.md](./FEATURE_RELEASE_v1.0.md) | Complete feature documentation | All developers |
| [DEVELOPER_QUICKSTART.md](./DEVELOPER_QUICKSTART.md) | 5-minute setup guide | New developers |
| [CLAUDE_RULES.md](./CLAUDE_RULES.md) | AI assistant guidelines | AI assistants |

---

## Documentation Map

### 🚀 Getting Started

1. **[DEVELOPER_QUICKSTART.md](./DEVELOPER_QUICKSTART.md)** - Start here!
   - 5-minute Docker setup
   - Environment configuration
   - Health checks
   - Quick commands

2. **[FEATURE_RELEASE_v1.0.md](./FEATURE_RELEASE_v1.0.md)** - Feature overview
   - Executive summary
   - Feature capabilities
   - Architecture overview
   - Data flows

### 🏗️ Architecture

3. **[ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md)** - Visual architecture
   - System architecture diagrams
   - Interview flow sequences
   - Deployment architecture
   - Data flow diagrams

4. **[DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)** - Database design
   - Entity relationship diagram
   - Table definitions
   - Indexes and constraints
   - Enumerations

### 🔌 Integration Guides

5. **[SERVICE_INTEGRATION.md](./SERVICE_INTEGRATION.md)** - Backend integration
   - Service architecture
   - Redis streams protocol
   - Inter-service communication
   - Error handling patterns

6. **[FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md)** - Frontend integration
   - VideoSDK integration
   - WebSocket hooks
   - AI Insights panel
   - Media capture

7. **[MICROSERVICES_REFERENCE.md](./MICROSERVICES_REFERENCE.md)** - Python services
   - Speech analysis
   - Video analysis
   - Fraud detection
   - NLP engine
   - Insight aggregator

### 📡 API Reference

8. **[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)** - REST API
   - Authentication
   - Interview rounds
   - Resume management
   - Verdicts
   - Error responses

9. **[WEBSOCKET_EVENTS.md](./WEBSOCKET_EVENTS.md)** - Real-time events
   - Connection handling
   - Client-to-server events
   - Server-to-client events
   - Event payloads

### 📖 User Guides

10. **[INTERVIEWER_GUIDE.md](./INTERVIEWER_GUIDE.md)** - Interviewer usage
    - Interview workflow
    - AI insights interpretation
    - Verdict submission

11. **[HR_USER_GUIDE.md](./HR_USER_GUIDE.md)** - HR/Admin usage
    - Dashboard overview
    - Analytics
    - Interview management

### 🤖 AI Guidelines

12. **[CLAUDE_RULES.md](./CLAUDE_RULES.md)** - AI coding rules
    - Senior developer role
    - Zero hallucination policy
    - Codebase conventions
    - Code quality standards

---

## Documentation by Role

### For Backend Developers

1. [DEVELOPER_QUICKSTART.md](./DEVELOPER_QUICKSTART.md)
2. [SERVICE_INTEGRATION.md](./SERVICE_INTEGRATION.md)
3. [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
4. [WEBSOCKET_EVENTS.md](./WEBSOCKET_EVENTS.md)
5. [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)

### For Frontend Developers

1. [DEVELOPER_QUICKSTART.md](./DEVELOPER_QUICKSTART.md)
2. [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md)
3. [WEBSOCKET_EVENTS.md](./WEBSOCKET_EVENTS.md)
4. [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)

### For ML Engineers

1. [MICROSERVICES_REFERENCE.md](./MICROSERVICES_REFERENCE.md)
2. [SERVICE_INTEGRATION.md](./SERVICE_INTEGRATION.md)
3. [FEATURE_RELEASE_v1.0.md](./FEATURE_RELEASE_v1.0.md)

### For DevOps

1. [DEVELOPER_QUICKSTART.md](./DEVELOPER_QUICKSTART.md)
2. [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md)
3. [FEATURE_RELEASE_v1.0.md](./FEATURE_RELEASE_v1.0.md) (Deployment section)

---

## Core Concepts

### "AI Assists, Humans Decide"

This is the foundational principle of the platform:

- AI **NEVER** conducts interviews
- AI insights visible **ONLY** to interviewers
- Candidates see simple, clean video interface
- All hiring decisions made by humans
- All AI contributions logged for audit

### Key Features

| Feature | Service | Description |
|---------|---------|-------------|
| Speech-to-Text | speech-analysis:8001 | Real-time transcription |
| Confidence Scoring | speech-analysis:8001 | Speaker confidence metrics |
| Head Tracking | video-analysis:8002 | Engagement detection |
| Multi-Face Detection | fraud-detection:8003 | Multiple people alert |
| Face Switch | fraud-detection:8003 | Identity change alert |
| Resume Contradiction | nlp-engine:8004 | Claim verification |
| Insight Aggregation | insight-aggregator:8005 | Priority & deduplication |

### Conservative Alert System

- Minimum 80% confidence for alerts
- 30-second cooldown between same-type alerts
- Maximum 5 insights per batch
- All alerts logged for review

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Feb 2026 | Initial release |

---

## Support

- **Backend Team:** backend@company.com
- **ML Team:** ml@company.com
- **DevOps:** devops@company.com

---

*Last Updated: February 2026*
