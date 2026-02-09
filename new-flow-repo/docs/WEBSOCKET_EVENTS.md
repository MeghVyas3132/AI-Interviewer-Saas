# WebSocket Events Documentation

## Document Information

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Date | 2026-01-30 |
| Namespace | `/interview` |

---

## Table of Contents

1. [Connection](#1-connection)
2. [Client-to-Server Events](#2-client-to-server-events)
3. [Server-to-Client Events](#3-server-to-client-events)
4. [Event Payloads](#4-event-payloads)
5. [Error Handling](#5-error-handling)

---

## 1. Connection

### Connection URL

```
wss://<host>/interview
```

### Authentication

Pass JWT token as query parameter or in auth object:

```javascript
const socket = io('/interview', {
  auth: {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  }
});
```

### Connection Events

| Event | Description |
|-------|-------------|
| connect | Successfully connected to server |
| connect_error | Connection failed |
| disconnect | Disconnected from server |

---

## 2. Client-to-Server Events

### join-room

Join an interview room.

**Payload:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| roundId | string | Yes | Interview round ID |
| participantType | string | Yes | "interviewer" or "candidate" |

**Example:**

```javascript
socket.emit('join-room', {
  roundId: 'round-123',
  participantType: 'interviewer'
});
```

### leave-room

Leave an interview room.

**Payload:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| roundId | string | Yes | Interview round ID |

**Example:**

```javascript
socket.emit('leave-room', {
  roundId: 'round-123'
});
```

### audio-chunk

Send audio data for speech analysis.

**Payload:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| roundId | string | Yes | Interview round ID |
| participantId | string | Yes | Participant identifier |
| chunk | ArrayBuffer | Yes | Audio data (16-bit PCM) |
| timestamp | number | Yes | Unix timestamp in milliseconds |
| sampleRate | number | Yes | Audio sample rate (e.g., 16000) |

**Example:**

```javascript
socket.emit('audio-chunk', {
  roundId: 'round-123',
  participantId: 'candidate-456',
  chunk: audioBuffer,
  timestamp: Date.now(),
  sampleRate: 16000
});
```

### video-frame

Send video frame for analysis.

**Payload:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| roundId | string | Yes | Interview round ID |
| participantId | string | Yes | Participant identifier |
| frame | ArrayBuffer | Yes | JPEG-encoded frame |
| timestamp | number | Yes | Unix timestamp in milliseconds |
| width | number | Yes | Frame width in pixels |
| height | number | Yes | Frame height in pixels |

**Example:**

```javascript
socket.emit('video-frame', {
  roundId: 'round-123',
  participantId: 'candidate-456',
  frame: jpegBuffer,
  timestamp: Date.now(),
  width: 640,
  height: 480
});
```

### screen-frame

Send screen share frame for analysis.

**Payload:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| roundId | string | Yes | Interview round ID |
| participantId | string | Yes | Participant identifier |
| frame | ArrayBuffer | Yes | JPEG-encoded frame |
| timestamp | number | Yes | Unix timestamp in milliseconds |

**Example:**

```javascript
socket.emit('screen-frame', {
  roundId: 'round-123',
  participantId: 'candidate-456',
  frame: jpegBuffer,
  timestamp: Date.now()
});
```

### fraud-alert

Report a fraud detection event from client.

**Payload:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| roundId | string | Yes | Interview round ID |
| alertType | string | Yes | Type of alert |
| severity | string | Yes | LOW, MEDIUM, HIGH, CRITICAL |
| details | string | No | Additional details |

**Alert Types:**
- TAB_SWITCH
- WINDOW_BLUR
- COPY_PASTE
- RIGHT_CLICK
- KEYBOARD_SHORTCUT

**Example:**

```javascript
socket.emit('fraud-alert', {
  roundId: 'round-123',
  alertType: 'TAB_SWITCH',
  severity: 'MEDIUM',
  details: 'User switched to another tab'
});
```

### end-interview

Signal interview completion.

**Payload:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| roundId | string | Yes | Interview round ID |
| reason | string | No | Reason for ending |

**Example:**

```javascript
socket.emit('end-interview', {
  roundId: 'round-123',
  reason: 'completed'
});
```

---

## 3. Server-to-Client Events

### room-joined

Confirmation of successful room join.

**Payload:**

| Field | Type | Description |
|-------|------|-------------|
| roundId | string | Interview round ID |
| participants | array | List of current participants |
| status | string | Current room status |

**Example:**

```javascript
socket.on('room-joined', (data) => {
  console.log('Joined room:', data.roundId);
  console.log('Participants:', data.participants);
});
```

### participant-joined

Another participant joined the room.

**Payload:**

| Field | Type | Description |
|-------|------|-------------|
| participantId | string | Participant identifier |
| participantType | string | "interviewer" or "candidate" |
| timestamp | number | Join timestamp |

**Example:**

```javascript
socket.on('participant-joined', (data) => {
  console.log('Participant joined:', data.participantType);
});
```

### participant-left

A participant left the room.

**Payload:**

| Field | Type | Description |
|-------|------|-------------|
| participantId | string | Participant identifier |
| participantType | string | "interviewer" or "candidate" |
| timestamp | number | Leave timestamp |

**Example:**

```javascript
socket.on('participant-left', (data) => {
  console.log('Participant left:', data.participantType);
});
```

### ai-insight

Real-time AI analysis result.

**Payload:**

| Field | Type | Description |
|-------|------|-------------|
| roundId | string | Interview round ID |
| type | string | Insight type |
| timestamp | number | Analysis timestamp |
| data | object | Insight data (varies by type) |

**Insight Types:**

1. **speech_analysis**
```javascript
{
  type: 'speech_analysis',
  data: {
    confidence: 82,
    sentiment: 'positive',
    wordsPerMinute: 145,
    fillerCount: 3,
    transcript: 'I have experience with...'
  }
}
```

2. **nlp_analysis**
```javascript
{
  type: 'nlp_analysis',
  data: {
    answerQuality: 78,
    topicRelevance: 85,
    technicalDepth: 72,
    suggestedFollowup: 'Can you elaborate on...'
  }
}
```

3. **engagement_analysis**
```javascript
{
  type: 'engagement_analysis',
  data: {
    engagementScore: 85,
    eyeContact: 78,
    attentiveness: 90
  }
}
```

**Example:**

```javascript
socket.on('ai-insight', (data) => {
  if (data.type === 'speech_analysis') {
    updateConfidenceScore(data.data.confidence);
  }
});
```

### fraud-detected

Server-detected fraud alert.

**Payload:**

| Field | Type | Description |
|-------|------|-------------|
| roundId | string | Interview round ID |
| alertType | string | Type of fraud detected |
| severity | string | Alert severity level |
| timestamp | number | Detection timestamp |
| details | string | Additional information |

**Server-Detected Alert Types:**
- MULTIPLE_FACES
- FACE_SWITCH
- BACKGROUND_VOICE
- SUSPICIOUS_AUDIO
- SCREEN_PROMPT

**Example:**

```javascript
socket.on('fraud-detected', (data) => {
  showFraudAlert(data.alertType, data.severity);
});
```

### interview-status

Interview status update.

**Payload:**

| Field | Type | Description |
|-------|------|-------------|
| roundId | string | Interview round ID |
| status | string | New status |
| timestamp | number | Status change timestamp |

**Status Values:**
- WAITING_FOR_CANDIDATE
- WAITING_FOR_INTERVIEWER
- IN_PROGRESS
- COMPLETED
- PAUSED

**Example:**

```javascript
socket.on('interview-status', (data) => {
  updateInterviewStatus(data.status);
});
```

### interview-ended

Interview has ended.

**Payload:**

| Field | Type | Description |
|-------|------|-------------|
| roundId | string | Interview round ID |
| reason | string | End reason |
| duration | number | Interview duration in seconds |
| timestamp | number | End timestamp |

**Example:**

```javascript
socket.on('interview-ended', (data) => {
  redirectToVerdictPage(data.roundId);
});
```

### error

Error notification.

**Payload:**

| Field | Type | Description |
|-------|------|-------------|
| code | string | Error code |
| message | string | Error message |
| details | object | Additional error details |

**Example:**

```javascript
socket.on('error', (data) => {
  console.error('Socket error:', data.code, data.message);
});
```

---

## 4. Event Payloads

### Audio Chunk Format

| Property | Value |
|----------|-------|
| Format | Linear PCM |
| Bit Depth | 16-bit |
| Channels | 1 (Mono) |
| Sample Rate | 16000 Hz |
| Chunk Duration | 250ms (4000 samples) |

### Video Frame Format

| Property | Value |
|----------|-------|
| Format | JPEG |
| Quality | 80% |
| Max Width | 640px |
| Max Height | 480px |
| Frame Rate | 1-2 FPS |

### Timestamp Format

All timestamps are Unix timestamps in milliseconds (e.g., 1706612400000).

---

## 5. Error Handling

### Error Codes

| Code | Description |
|------|-------------|
| AUTH_FAILED | Authentication failed |
| ROOM_NOT_FOUND | Interview room does not exist |
| ALREADY_IN_ROOM | Already joined this room |
| NOT_IN_ROOM | Not a member of this room |
| INVALID_PAYLOAD | Invalid event payload |
| RATE_LIMITED | Too many events |
| SERVICE_ERROR | Internal service error |

### Reconnection Strategy

The client should implement exponential backoff for reconnection:

```javascript
const socket = io('/interview', {
  auth: { token },
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000
});
```

### Connection State Management

```javascript
socket.on('connect', () => {
  // Rejoin rooms if needed
  if (currentRoundId) {
    socket.emit('join-room', {
      roundId: currentRoundId,
      participantType: userRole
    });
  }
});

socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    // Server disconnected, attempt reconnect
    socket.connect();
  }
});
```

---

## Event Flow Diagrams

### Interview Start Flow

```
Client (Interviewer)              Server              Client (Candidate)
        |                           |                         |
        |---join-room-------------->|                         |
        |<--room-joined-------------|                         |
        |                           |<---join-room------------|
        |<--participant-joined------|---room-joined---------->|
        |<--interview-status--------|---participant-joined--->|
        |      (IN_PROGRESS)        |---interview-status----->|
        |                           |                         |
```

### AI Insight Flow

```
Client (Candidate)                 Server                ML Services
        |                           |                         |
        |---audio-chunk------------>|                         |
        |                           |---Redis Stream--------->|
        |                           |                         |
        |                           |<---analysis result------|
        |<--ai-insight--------------|                         |
        |                           |                         |
```

### Fraud Detection Flow

```
Client (Candidate)                 Server              Client (Interviewer)
        |                           |                         |
        |---fraud-alert------------>|                         |
        |    (TAB_SWITCH)           |---fraud-detected------->|
        |                           |                         |
        |---video-frame------------>|                         |
        |                           |---ML analysis---------->|
        |                           |<--MULTIPLE_FACES--------|
        |                           |---fraud-detected------->|
        |                           |                         |
```

---

## Document Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-30 | Initial version |
