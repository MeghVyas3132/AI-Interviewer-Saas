# API Documentation

## Document Information

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Date | 2026-01-30 |
| Base URL | `/api` |

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Interview Rounds](#2-interview-rounds)
3. [Resume Files](#3-resume-files)
4. [Verdicts](#4-verdicts)
5. [Insights](#5-insights)
6. [Error Responses](#6-error-responses)

---

## 1. Authentication

All API endpoints require authentication via JWT token in the Authorization header.

### Header Format

```
Authorization: Bearer <jwt_token>
```

### Token Payload Structure

```json
{
  "userId": "string",
  "role": "hr" | "interviewer" | "candidate",
  "iat": number,
  "exp": number
}
```

### POST /api/auth/login

Authenticate user and obtain JWT token.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | User email address |
| password | string | Yes | User password |

**Response 200:**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "role": "interviewer"
    }
  }
}
```

**Response 401:**

```json
{
  "success": false,
  "error": "Invalid credentials"
}
```

---

## 2. Interview Rounds

### GET /api/rounds

Retrieve list of interview rounds based on user role.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| status | string | No | Filter by status (SCHEDULED, IN_PROGRESS, COMPLETED) |
| limit | number | No | Maximum results (default: 50) |
| offset | number | No | Pagination offset (default: 0) |

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": "round-123",
      "interviewId": "interview-456",
      "externalCandidateId": "cand-789",
      "interviewerId": "int-012",
      "roundNumber": 1,
      "roundType": "TECHNICAL_AI",
      "interviewMode": "HUMAN_AI_ASSISTED",
      "status": "SCHEDULED",
      "scheduledAt": "2026-01-30T10:00:00Z",
      "durationMinutes": 60,
      "meetingId": "abc-xyz-123",
      "createdAt": "2026-01-29T15:30:00Z"
    }
  ]
}
```

### POST /api/rounds

Create a new interview round.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| interviewId | string | Yes | Parent interview ID |
| externalCandidateId | string | Yes | Candidate ID |
| interviewerId | string | No | Interviewer ID (required for HUMAN modes) |
| jobRoleId | string | Yes | Job role ID |
| roundNumber | number | Yes | Round sequence number |
| roundType | string | Yes | Type of round |
| interviewMode | string | Yes | AI_CONDUCTED, HUMAN_AI_ASSISTED, HUMAN_ONLY |
| scheduledAt | string | Yes | ISO 8601 datetime |
| durationMinutes | number | Yes | Expected duration |

**Round Types:**
- TECHNICAL_AI
- SCREENING_HUMAN
- HR_HUMAN
- MANAGERIAL_HUMAN
- CULTURAL_FIT_HUMAN

**Response 201:**

```json
{
  "success": true,
  "data": {
    "id": "round-123",
    "interviewId": "interview-456",
    "externalCandidateId": "cand-789",
    "interviewerId": "int-012",
    "roundNumber": 1,
    "roundType": "TECHNICAL_AI",
    "interviewMode": "HUMAN_AI_ASSISTED",
    "status": "SCHEDULED",
    "scheduledAt": "2026-01-30T10:00:00Z",
    "durationMinutes": 60,
    "meetingId": "abc-xyz-123",
    "createdAt": "2026-01-29T15:30:00Z"
  }
}
```

### GET /api/rounds/:id

Retrieve a specific interview round with participant token.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Round ID |

**Response 200:**

Returns round details with a VideoSDK participant token generated for the authenticated user.

```json
{
  "success": true,
  "data": {
    "id": "round-123",
    "interviewId": "interview-456",
    "externalCandidateId": "cand-789",
    "interviewerId": "int-012",
    "roundNumber": 1,
    "roundType": "TECHNICAL_AI",
    "interviewMode": "HUMAN_AI_ASSISTED",
    "status": "SCHEDULED",
    "scheduledAt": "2026-01-30T10:00:00Z",
    "durationMinutes": 60,
    "meetingId": "abc-xyz-123",
    "participantToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "createdAt": "2026-01-29T15:30:00Z"
  }
}
```

### PATCH /api/rounds/:id/status

Update interview round status.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Round ID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| status | string | Yes | New status value |

**Valid Status Values:**
- SCHEDULED
- WAITING_FOR_CANDIDATE
- WAITING_FOR_INTERVIEWER
- IN_PROGRESS
- COMPLETED
- CANCELLED
- NO_SHOW

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": "round-123",
    "status": "IN_PROGRESS",
    "updatedAt": "2026-01-30T10:05:00Z"
  }
}
```

---

## 3. Resume Files

### POST /api/resumes/upload

Upload a candidate resume file.

**Headers:**

```
Content-Type: multipart/form-data
```

**Request Body (multipart/form-data):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| resume | file | Yes | PDF file (recommended) |
| roundId | string | Yes | Associated round ID |

**Response 201:**

```json
{
  "success": true,
  "data": {
    "id": "resume-123",
    "fileName": "john_doe_resume.pdf",
    "fileUrl": "/api/resumes/files/1706612400000-john_doe_resume.pdf",
    "roundId": "round-123",
    "mimeType": "application/pdf",
    "uploadedAt": "2026-01-30T09:00:00Z"
  }
}
```

### GET /api/resumes/files/:filename

Retrieve an uploaded resume file.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| filename | string | Yes | Stored filename |

**Response 200:**

Binary file content with appropriate Content-Type header.

**Response Headers:**

```
Content-Type: application/pdf
Content-Disposition: inline
X-Frame-Options: SAMEORIGIN
```

### GET /api/resumes/round/:roundId

Retrieve resume metadata for a specific round.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| roundId | string | Yes | Round ID |

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": "resume-123",
    "externalCandidateId": "cand-789",
    "roundId": "round-123",
    "fileName": "john_doe_resume.pdf",
    "filePath": "/app/uploads/resumes/1706612400000-john_doe_resume.pdf",
    "fileUrl": "/api/resumes/files/1706612400000-john_doe_resume.pdf",
    "mimeType": "application/pdf",
    "createdAt": "2026-01-30T09:00:00Z"
  }
}
```

**Response 404:**

```json
{
  "success": false,
  "error": "No resume found for this round"
}
```

---

## 4. Verdicts

### POST /api/verdicts

Submit interview verdict.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| roundId | string | Yes | Round ID |
| decision | string | Yes | ADVANCE, REJECT, HOLD, REASSESS |
| confidence | number | Yes | 1-5 confidence level |
| technicalScore | number | No | Technical competency (0-100) |
| communicationScore | number | No | Communication skills (0-100) |
| overallScore | number | Yes | Overall rating (0-100) |
| notes | string | Yes | Detailed feedback |
| recommendation | string | No | Next round suggestions |

**Response 201:**

```json
{
  "success": true,
  "data": {
    "id": "verdict-123",
    "roundId": "round-123",
    "interviewerId": "int-012",
    "decision": "ADVANCE",
    "confidence": 4,
    "technicalScore": 85,
    "communicationScore": 90,
    "overallScore": 87,
    "notes": "Strong technical background...",
    "recommendation": "Proceed to managerial round",
    "createdAt": "2026-01-30T11:15:00Z"
  }
}
```

### GET /api/verdicts/round/:roundId

Get verdict for a specific round.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| roundId | string | Yes | Round ID |

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": "verdict-123",
    "roundId": "round-123",
    "interviewerId": "int-012",
    "decision": "ADVANCE",
    "confidence": 4,
    "technicalScore": 85,
    "communicationScore": 90,
    "overallScore": 87,
    "notes": "Strong technical background...",
    "recommendation": "Proceed to managerial round",
    "aiInsightsSummary": {
      "averageConfidence": 78,
      "sentimentTrend": "positive",
      "engagementScore": 85,
      "fraudAlerts": 0
    },
    "createdAt": "2026-01-30T11:15:00Z"
  }
}
```

---

## 5. Insights

### GET /api/insights/round/:roundId

Get AI insights for a specific round.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| roundId | string | Yes | Round ID |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | string | No | Filter by insight type |
| from | string | No | Start timestamp (ISO 8601) |
| to | string | No | End timestamp (ISO 8601) |

**Response 200:**

```json
{
  "success": true,
  "data": {
    "roundId": "round-123",
    "insights": [
      {
        "timestamp": "2026-01-30T10:05:00Z",
        "type": "speech_analysis",
        "confidence": 82,
        "sentiment": "positive",
        "fillerCount": 3,
        "wordsPerMinute": 145
      },
      {
        "timestamp": "2026-01-30T10:10:00Z",
        "type": "nlp_analysis",
        "answerQuality": 78,
        "topicRelevance": 85,
        "suggestedFollowup": "Can you elaborate on your experience with microservices?"
      }
    ],
    "summary": {
      "averageConfidence": 78,
      "averageSentiment": "positive",
      "totalFraudAlerts": 0,
      "engagementScore": 85
    }
  }
}
```

### GET /api/insights/round/:roundId/fraud

Get fraud detection alerts for a specific round.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| roundId | string | Yes | Round ID |

**Response 200:**

```json
{
  "success": true,
  "data": {
    "roundId": "round-123",
    "alerts": [
      {
        "timestamp": "2026-01-30T10:25:00Z",
        "type": "TAB_SWITCH",
        "severity": "MEDIUM",
        "details": "Candidate switched to another browser tab"
      }
    ],
    "totalAlerts": 1,
    "highSeverityCount": 0
  }
}
```

---

## 6. Error Responses

### Standard Error Format

All error responses follow this structure:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### HTTP Status Codes

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Invalid or missing token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource does not exist |
| 409 | Conflict - Resource already exists |
| 422 | Unprocessable Entity - Validation failed |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

### Common Error Codes

| Code | Description |
|------|-------------|
| AUTH_REQUIRED | Authentication required |
| INVALID_TOKEN | Token is invalid or expired |
| PERMISSION_DENIED | User lacks required permissions |
| RESOURCE_NOT_FOUND | Requested resource not found |
| VALIDATION_ERROR | Request validation failed |
| RATE_LIMIT_EXCEEDED | Too many requests |
| SERVICE_UNAVAILABLE | Downstream service unavailable |

### Rate Limiting

- Limit: 100 requests per minute per user
- Headers returned:
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Requests remaining
  - `X-RateLimit-Reset`: Unix timestamp when limit resets

**Response 429:**

```json
{
  "success": false,
  "error": "Too many requests, please try again later",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 45
}
```

---

## Document Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-30 | Initial version |
