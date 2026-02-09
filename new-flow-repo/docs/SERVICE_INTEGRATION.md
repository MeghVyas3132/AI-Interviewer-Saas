# Service Integration Guide

## AI-Assisted Interview Platform - Connecting All Services

**Purpose:** Detailed guide for integrating each microservice  
**Audience:** Backend developers

---

## Table of Contents

1. [Service Architecture](#1-service-architecture)
2. [API Gateway Integration](#2-api-gateway-integration)
3. [Speech Analysis Integration](#3-speech-analysis-integration)
4. [Video Analysis Integration](#4-video-analysis-integration)
5. [Fraud Detection Integration](#5-fraud-detection-integration)
6. [NLP Engine Integration](#6-nlp-engine-integration)
7. [Insight Aggregator Integration](#7-insight-aggregator-integration)
8. [Redis Streams Protocol](#8-redis-streams-protocol)
9. [WebSocket Protocol](#9-websocket-protocol)
10. [Error Handling](#10-error-handling)

---

## 1. Service Architecture

### Service Discovery

All services communicate through known ports in Docker network:

```yaml
Services:
  api-gateway:
    internal: http://api-gateway:3000
    external: http://localhost:3000
    
  speech-service:
    internal: http://speech-service:8001
    external: http://localhost:8001
    
  video-service:
    internal: http://video-service:8002
    external: http://localhost:8002
    
  fraud-service:
    internal: http://fraud-service:8003
    external: http://localhost:8003
    
  nlp-service:
    internal: http://nlp-service:8004
    external: http://localhost:8004
    
  insight-aggregator:
    internal: http://insight-aggregator:8005
    external: http://localhost:8005
```

### Communication Patterns

```
┌─────────────────────────────────────────────────────────────┐
│                    Communication Matrix                      │
├─────────────────┬───────────────────────────────────────────┤
│ Pattern         │ Usage                                     │
├─────────────────┼───────────────────────────────────────────┤
│ REST            │ Client → API Gateway                      │
│ WebSocket       │ Client ↔ API Gateway (bidirectional)      │
│ Redis Streams   │ API Gateway → ML Services (async data)    │
│ Redis Pub/Sub   │ ML Services → Aggregator → API Gateway    │
│ HTTP (internal) │ API Gateway → ML Services (sync requests) │
└─────────────────┴───────────────────────────────────────────┘
```

---

## 2. API Gateway Integration

### Environment Variables

```env
# Service URLs (set in docker-compose)
SPEECH_SERVICE_URL=http://speech-service:8001
VIDEO_SERVICE_URL=http://video-service:8002
FRAUD_SERVICE_URL=http://fraud-service:8003
NLP_SERVICE_URL=http://nlp-service:8004
AGGREGATOR_SERVICE_URL=http://insight-aggregator:8005

# Internal communication
INTERNAL_API_KEY=your_internal_key
```

### Circuit Breaker Configuration

```typescript
// services/api-gateway/src/utils/circuitBreaker.ts

const circuitBreakerConfig = {
  timeout: 10000,       // 10 second timeout
  errorThreshold: 50,   // 50% error threshold
  resetTimeout: 30000,  // 30 seconds before retry
};

// Usage
const speechBreaker = new CircuitBreaker(callSpeechService, circuitBreakerConfig);
const result = await speechBreaker.fire(audioData);
```

### Health Check Aggregation

```typescript
// Check all downstream services
app.get('/health/detailed', async (req, res) => {
  const services = [
    { name: 'speech', url: `${SPEECH_SERVICE_URL}/health` },
    { name: 'video', url: `${VIDEO_SERVICE_URL}/health` },
    { name: 'fraud', url: `${FRAUD_SERVICE_URL}/health` },
    { name: 'nlp', url: `${NLP_SERVICE_URL}/health` },
  ];
  
  const results = await Promise.allSettled(
    services.map(s => fetch(s.url).then(r => r.ok))
  );
  
  const status = results.every(r => r.status === 'fulfilled' && r.value)
    ? 'healthy'
    : 'degraded';
    
  res.json({ status, services: results });
});
```

---

## 3. Speech Analysis Integration

### Input: Audio Chunks via Redis Streams

```typescript
// API Gateway: Write audio to stream
await redis.xadd(
  `stream:audio:${roundId}`,
  '*',
  'chunk', base64AudioData,
  'timestamp', timestamp.toString(),
  'candidateId', candidateId,
  'sampleRate', '16000'
);
```

### Stream Consumer (Python Service)

```python
# services/speech-analysis/src/main.py

async def consume_audio_stream():
    """Consume audio chunks from Redis stream."""
    last_id = '0'
    
    while True:
        results = await redis.xread(
            {'stream:audio:*': last_id},
            count=10,
            block=1000
        )
        
        for stream_name, messages in results:
            round_id = stream_name.split(':')[2]
            
            for msg_id, fields in messages:
                audio_data = base64.b64decode(fields['chunk'])
                timestamp = int(fields['timestamp'])
                
                # Process audio
                result = await process_audio(audio_data, round_id, timestamp)
                
                # Publish insight
                if result.confidence >= settings.min_confidence:
                    await publish_insight(round_id, result)
                
                last_id = msg_id
```

### Output: Speech Insights

```python
# Insight structure
speech_insight = {
    "source": "speech-analysis",
    "type": "confidence",
    "roundId": round_id,
    "timestamp": timestamp,
    "data": {
        "score": 0.82,
        "indicators": ["optimal_pace", "minimal_fillers"],
        "transcript": "...",
        "filler_count": 2,
        "pause_count": 1
    }
}

# Publish to Redis
await redis.publish('insights:new', json.dumps(speech_insight))
```

### REST Endpoints

```yaml
POST /analyze/audio:
  description: Synchronous audio analysis
  request:
    audio: base64 encoded audio
    sampleRate: 16000
    format: pcm16
  response:
    transcript: string
    confidence: float
    hesitations: array

POST /transcribe:
  description: Speech-to-text only
  request:
    audio: base64 encoded audio
  response:
    transcript: string
    words: array of word timings

GET /health:
  description: Service health check
  response:
    status: healthy|degraded
    stt_provider: deepgram|whisper
```

---

## 4. Video Analysis Integration

### Input: Video Frames via Redis Streams

```typescript
// API Gateway: Write frame to stream
await redis.xadd(
  `stream:video:${roundId}`,
  '*',
  'frame', base64JpegData,  // JPEG encoded
  'timestamp', timestamp.toString(),
  'candidateId', candidateId,
  'width', '640',
  'height', '480'
);
```

### Frame Processing Rate

```python
# services/video-analysis/src/main.py

# Process at 5 FPS (every 200ms)
FRAME_INTERVAL_MS = 200

async def consume_video_stream():
    last_processed = {}
    
    while True:
        results = await redis.xread(...)
        
        for stream_name, messages in results:
            round_id = stream_name.split(':')[2]
            
            for msg_id, fields in messages:
                timestamp = int(fields['timestamp'])
                
                # Rate limiting: skip if too soon
                if round_id in last_processed:
                    if timestamp - last_processed[round_id] < FRAME_INTERVAL_MS:
                        continue
                
                last_processed[round_id] = timestamp
                
                # Process frame
                await process_frame(fields, round_id, timestamp)
```

### Output: Video Insights

```python
video_insight = {
    "source": "video-analysis",
    "type": "head_movement",
    "roundId": round_id,
    "timestamp": timestamp,
    "data": {
        "movement_score": 0.15,  # 0 = still, 1 = very active
        "head_pose": {
            "pitch": 5.2,
            "yaw": -3.1,
            "roll": 1.0
        },
        "engagement_score": 0.78,
        "face_detected": True
    }
}
```

### REST Endpoints

```yaml
POST /analyze/frame:
  description: Single frame analysis
  request:
    frame: base64 JPEG
    timestamp: number
  response:
    faceDetected: boolean
    headPose: object
    engagement: float
    quality: object

POST /analyze/batch:
  description: Batch frame analysis
  request:
    frames: array of base64 JPEG
  response:
    results: array of analysis

GET /health:
  response:
    status: healthy
    models_loaded: boolean
```

---

## 5. Fraud Detection Integration

### Multi-Source Input

Fraud detection consumes from multiple streams:

```python
# services/fraud-detection/src/main.py

async def run_fraud_detection():
    """Multi-stream fraud detection."""
    
    # Parallel consumers
    await asyncio.gather(
        consume_video_for_faces(),    # Multiple face detection
        consume_video_for_switch(),   # Face switch detection
        consume_audio_for_voices(),   # Background voice detection
    )
```

### Face Detection Flow

```python
async def detect_multiple_faces(frame_data: bytes, round_id: str):
    """Detect if multiple faces are present."""
    
    detector = MultipleFaceDetector()
    result = detector.detect(frame_data)
    
    if result.is_alert and result.confidence >= 0.95:
        alert = {
            "source": "fraud-detection",
            "type": "multiple_faces",
            "roundId": round_id,
            "severity": "HIGH",
            "confidence": result.confidence,
            "data": {
                "face_count": result.face_count,
                "bounding_boxes": result.bounding_boxes
            }
        }
        
        # Publish as fraud alert (high priority)
        await redis.publish('insights:fraud', json.dumps(alert))
        
        # Also save to database
        await save_fraud_alert(round_id, alert)
```

### Face Switch Detection

```python
class FaceSwitchDetector:
    """Detect if the person changed during interview."""
    
    def __init__(self):
        self.reference_embedding = None
        
    def check(self, frame: np.ndarray, timestamp_ms: int) -> FaceSwitchResult:
        # Extract face embedding
        embedding = self.extract_embedding(frame)
        
        if self.reference_embedding is None:
            # First frame: set reference
            self.reference_embedding = embedding
            return FaceSwitchResult(is_same_person=True)
        
        # Compare with reference
        distance = cosine_distance(self.reference_embedding, embedding)
        
        is_same = distance < 0.6  # Threshold
        
        return FaceSwitchResult(
            is_same_person=is_same,
            confidence=1 - distance,
            distance=distance,
            is_alert=not is_same and distance > 0.4
        )
```

### Tab Switch Alerts (Client-Side)

```typescript
// Frontend: Detect tab visibility
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    socket.emit('tab-visibility', {
      roundId,
      visible: false,
      timestamp: Date.now()
    });
  }
});
```

```typescript
// API Gateway: Handle tab switch
socket.on('tab-visibility', async (data) => {
  if (!data.visible) {
    const alert = {
      type: 'TAB_SWITCH',
      severity: 'MEDIUM',
      roundId: data.roundId,
      timestamp: data.timestamp
    };
    
    await saveFraudAlert(data.roundId, alert);
    
    io.to(`interview:${data.roundId}`).emit('fraud-alert', alert);
  }
});
```

---

## 6. NLP Engine Integration

### Resume-Based Analysis

```python
# services/nlp-engine/src/main.py

@app.post("/analyze/contradiction")
async def analyze_contradiction(request: ContradictionRequest):
    """
    Analyze transcript against resume for contradictions.
    
    Called by Insight Aggregator when new transcript is available.
    """
    analyzer = ResumeContradictionAnalyzer(openai_client)
    
    result = await analyzer.analyze_contradiction(
        resume_data=request.resume_json,
        transcript=request.transcript,
        job_title=request.job_title
    )
    
    if result.has_contradiction and result.confidence >= 0.8:
        return {
            "has_contradiction": True,
            "type": result.contradiction_type,
            "description": result.description,
            "resume_claim": result.resume_claim,
            "spoken_claim": result.spoken_claim,
            "severity": result.severity,
            "followup_questions": result.followup_questions
        }
    
    return {"has_contradiction": False}
```

### Follow-up Question Generation

```python
@app.post("/generate/questions")
async def generate_questions(request: QuestionRequest):
    """Generate follow-up questions based on transcript."""
    
    analyzer = ResumeContradictionAnalyzer(openai_client)
    
    questions = await analyzer.generate_followup_questions(
        resume_data=request.resume_json,
        transcript=request.transcript,
        job_title=request.job_title,
        gap_areas=request.gap_areas,
        num_questions=3
    )
    
    return {"questions": questions}
```

### Skill Verification

```python
@app.post("/verify/skill")
async def verify_skill(request: SkillVerifyRequest):
    """Verify if demonstrated skill matches claimed level."""
    
    result = await analyzer.verify_skill(
        skill_name=request.skill_name,
        claimed_level=request.claimed_level,
        responses=request.responses
    )
    
    return {
        "skill": request.skill_name,
        "claimed_level": request.claimed_level,
        "demonstrated_level": result.demonstrated_level,
        "is_consistent": result.is_consistent,
        "evidence": result.evidence
    }
```

---

## 7. Insight Aggregator Integration

### Collecting Insights from All Services

```python
# services/insight-aggregator/src/main.py

async def subscribe_to_insights():
    """Subscribe to all insight channels."""
    
    pubsub = redis.pubsub()
    await pubsub.subscribe(
        'insights:new',          # General insights
        'insights:fraud',        # High-priority fraud
        'insights:speech',       # Speech-specific
        'insights:video'         # Video-specific
    )
    
    async for message in pubsub.listen():
        if message['type'] == 'message':
            insight = json.loads(message['data'])
            await aggregator.add_insight(insight['roundId'], insight)
```

### Aggregation Algorithm

```python
class InsightAggregator:
    def __init__(self):
        self.buffer = defaultdict(list)  # Per-round buffer
        self.recent_alerts = {}           # Dedup window
    
    async def aggregate(self, round_id: str) -> InsightBatch:
        """Aggregate buffered insights."""
        
        raw_insights = self.buffer[round_id]
        
        # 1. Group by category and type
        grouped = self._group_insights(raw_insights)
        
        # 2. Aggregate each group
        aggregated = []
        for key, insights in grouped.items():
            agg = self._aggregate_group(key, insights)
            if agg and agg.confidence >= MIN_CONFIDENCE:
                aggregated.append(agg)
        
        # 3. Sort by priority
        aggregated.sort(key=lambda x: (
            CATEGORY_PRIORITY[x.category],
            -x.confidence
        ))
        
        # 4. Rate limit alerts
        aggregated = self._apply_rate_limit(aggregated)
        
        # 5. Generate recommendations
        recommendations = self._generate_recommendations(aggregated)
        
        return InsightBatch(
            round_id=round_id,
            insights=aggregated[:MAX_INSIGHTS],
            recommendations=recommendations
        )
```

### Delivering to Clients

```python
async def deliver_insights():
    """Periodic insight delivery."""
    
    while True:
        for round_id in active_rounds:
            batch = await aggregator.aggregate(round_id)
            
            if batch.insights:
                # Publish to API Gateway
                await redis.publish(
                    f'insights:round:{round_id}',
                    batch.to_json()
                )
        
        await asyncio.sleep(AGGREGATION_INTERVAL)  # 2 seconds
```

### API Gateway Receiving

```typescript
// services/api-gateway/src/websocket/index.ts

// Subscribe to aggregated insights
redisSub.subscribe('insights:round:*');

redisSub.on('message', (channel, message) => {
  const roundId = channel.split(':')[2];
  const batch = JSON.parse(message);
  
  // Send to all interviewers in the room
  io.to(`interview:${roundId}`).emit('insights-batch', batch.insights);
  
  // Send high-priority alerts separately
  const alerts = batch.insights.filter(i => i.isAlert);
  if (alerts.length > 0) {
    io.to(`interview:${roundId}`).emit('alerts', alerts);
  }
});
```

---

## 8. Redis Streams Protocol

### Stream Keys

```yaml
Audio Streams:
  key: stream:audio:{roundId}
  fields:
    - chunk: base64 encoded PCM audio
    - timestamp: Unix ms
    - candidateId: string
    - sampleRate: number

Video Streams:
  key: stream:video:{roundId}
  fields:
    - frame: base64 encoded JPEG
    - timestamp: Unix ms
    - candidateId: string
    - width: number
    - height: number
```

### Consumer Groups

```python
# Create consumer group (run once)
await redis.xgroup_create(
    'stream:audio:*',
    'speech-processors',
    mkstream=True
)

# Consumer with group
async def consume_with_group():
    while True:
        results = await redis.xreadgroup(
            groupname='speech-processors',
            consumername='processor-1',
            streams={'stream:audio:*': '>'},
            count=10,
            block=1000
        )
        
        for stream, messages in results:
            for msg_id, fields in messages:
                await process_message(fields)
                await redis.xack(stream, 'speech-processors', msg_id)
```

### Stream Cleanup

```python
# Trim streams to prevent memory growth
async def cleanup_streams():
    while True:
        streams = await redis.keys('stream:*')
        
        for stream in streams:
            # Keep last 1000 messages
            await redis.xtrim(stream, maxlen=1000, approximate=True)
        
        await asyncio.sleep(60)  # Every minute
```

---

## 9. WebSocket Protocol

### Event Flow Diagram

```
Client                    API Gateway              ML Services
  |                           |                        |
  |--connect(token)---------->|                        |
  |<--connect_ack-------------|                        |
  |                           |                        |
  |--join-interview---------->|                        |
  |<--joined-interview--------|                        |
  |                           |                        |
  |--audio-chunk------------->|                        |
  |                           |--Redis XADD----------->|
  |                           |                        |
  |                           |<--Redis PUB------------|
  |<--insight-----------------|                        |
  |                           |                        |
  |--video-frame------------->|                        |
  |                           |--Redis XADD----------->|
  |                           |                        |
  |                           |<--Redis PUB------------|
  |<--fraud-alert-------------|                        |
  |                           |                        |
  |--leave-interview--------->|                        |
  |--disconnect-------------->|                        |
```

### Reconnection Handling

```typescript
// Frontend reconnection logic
const socket = io({
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

socket.on('reconnect', () => {
  // Rejoin interview room
  socket.emit('join-interview', { roundId: currentRoundId });
});

socket.on('reconnect_error', (error) => {
  console.error('Reconnection failed:', error);
  // Show user-friendly error
});
```

---

## 10. Error Handling

### Service Unavailability

```typescript
// Circuit breaker pattern
const speechBreaker = new CircuitBreaker(async (data) => {
  const response = await fetch(`${SPEECH_SERVICE_URL}/analyze`, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { 'X-API-Key': INTERNAL_API_KEY }
  });
  
  if (!response.ok) throw new Error('Service error');
  return response.json();
}, {
  timeout: 5000,
  errorThreshold: 50,
  resetTimeout: 30000
});

// Usage
try {
  const result = await speechBreaker.fire(audioData);
} catch (error) {
  if (error.code === 'EOPENBREAKER') {
    logger.warn('Speech service circuit open');
    // Use fallback or skip
  }
}
```

### Graceful Degradation

```typescript
// Continue interview even if ML services fail
async function processInsightWithFallback(roundId, data) {
  try {
    await forwardToMLService(data);
  } catch (error) {
    logger.error('ML service failed', { error, roundId });
    
    // Don't fail the interview - just skip insights
    // Optionally notify interviewer
    io.to(`interview:${roundId}`).emit('service-warning', {
      message: 'Some AI features temporarily unavailable'
    });
  }
}
```

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Speech analysis service temporarily unavailable",
    "retryAfter": 30
  }
}
```

---

*For more details, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) and [WEBSOCKET_EVENTS.md](./WEBSOCKET_EVENTS.md)*
