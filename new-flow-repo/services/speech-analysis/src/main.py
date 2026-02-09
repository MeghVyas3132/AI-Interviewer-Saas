"""
Speech Analysis Service - Main FastAPI Application
"""
import asyncio
import base64
import json
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any, Optional

import numpy as np
import redis.asyncio as redis
from fastapi import FastAPI, HTTPException, Header, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import settings
from .stt import stt_service
from .analyzer import audio_analyzer, HesitationResult

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Redis client
redis_client: Optional[redis.Redis] = None


# =============================================================================
# Lifespan Management
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    global redis_client
    
    # Startup
    logger.info("Starting Speech Analysis Service...")
    
    # Connect to Redis
    redis_client = redis.from_url(settings.redis_url, decode_responses=False)
    await redis_client.ping()
    logger.info("Connected to Redis")
    
    # Start stream consumer
    asyncio.create_task(consume_audio_streams())
    
    yield
    
    # Shutdown
    logger.info("Shutting down Speech Analysis Service...")
    if redis_client:
        await redis_client.close()


# =============================================================================
# FastAPI App
# =============================================================================

app = FastAPI(
    title="Speech Analysis Service",
    description="Real-time speech analysis for AI Interview Assistant",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Request/Response Models
# =============================================================================

class AudioAnalysisRequest(BaseModel):
    """Request for audio analysis."""
    round_id: str
    audio_base64: str  # Base64 encoded audio
    timestamp_ms: int
    sample_rate: int = 16000
    format: str = "pcm"  # pcm, wav


class TranscriptResponse(BaseModel):
    """Transcript response."""
    transcript: str
    words: list
    confidence: float
    provider: str


class AnalysisResponse(BaseModel):
    """Full analysis response."""
    round_id: str
    timestamp_ms: int
    transcript: Optional[TranscriptResponse] = None
    hesitations: list = []
    confidence: Optional[Dict[str, Any]] = None
    response_latency_ms: Optional[int] = None


# =============================================================================
# Middleware
# =============================================================================

async def verify_internal_api_key(x_internal_api_key: str = Header(None)):
    """Verify internal API key for service-to-service calls."""
    if x_internal_api_key != settings.internal_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


# =============================================================================
# Health Check
# =============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    redis_healthy = False
    try:
        if redis_client:
            await redis_client.ping()
            redis_healthy = True
    except Exception:
        pass
    
    stt_available = stt_service.deepgram_client is not None or stt_service.whisper_model is not None
    
    return {
        "status": "healthy" if redis_healthy and stt_available else "degraded",
        "redis": "up" if redis_healthy else "down",
        "stt_deepgram": "available" if stt_service.deepgram_client else "unavailable",
        "stt_whisper": "available" if stt_service.whisper_model else "unavailable",
    }


# =============================================================================
# API Endpoints
# =============================================================================

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_audio(
    request: AudioAnalysisRequest,
    background_tasks: BackgroundTasks,
    x_internal_api_key: str = Header(None),
):
    """
    Analyze audio chunk for speech patterns.
    
    This endpoint:
    1. Transcribes audio using STT
    2. Detects hesitations (filler words, long pauses)
    3. Calculates speech confidence score
    4. Publishes results to Redis for real-time delivery
    """
    # Verify API key
    if x_internal_api_key != settings.internal_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    try:
        # Decode audio
        audio_bytes = base64.b64decode(request.audio_base64)
        audio_np = np.frombuffer(audio_bytes, dtype=np.int16)
        
        # Transcribe
        transcript_result = await stt_service.transcribe_audio(
            audio_bytes,
            sample_rate=request.sample_rate
        )
        
        # Detect hesitations
        hesitations = audio_analyzer.detect_hesitations(
            transcript_result["words"],
            transcript_result["transcript"]
        )
        
        # Analyze audio features
        audio_features = audio_analyzer.analyze_audio_features(
            audio_np,
            sample_rate=request.sample_rate
        )
        
        # Calculate confidence
        confidence_result = audio_analyzer.calculate_confidence(
            transcript_result["words"],
            audio_features=audio_features,
            window_start_ms=request.timestamp_ms,
        )
        
        # Build response
        response = AnalysisResponse(
            round_id=request.round_id,
            timestamp_ms=request.timestamp_ms,
            transcript=TranscriptResponse(
                transcript=transcript_result["transcript"],
                words=transcript_result["words"],
                confidence=transcript_result["confidence"],
                provider=transcript_result["provider"],
            ),
            hesitations=[{
                "type": h.type,
                "start_ms": h.start_ms,
                "end_ms": h.end_ms,
                "duration_ms": h.duration_ms,
                "word": h.word,
            } for h in hesitations],
            confidence={
                "score": confidence_result.score,
                "indicators": confidence_result.indicators,
            },
        )
        
        # Publish results to Redis (background task)
        background_tasks.add_task(
            publish_results,
            request.round_id,
            response.model_dump()
        )
        
        return response
        
    except Exception as e:
        logger.error(f"Audio analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/transcribe")
async def transcribe_only(
    request: AudioAnalysisRequest,
    x_internal_api_key: str = Header(None),
):
    """Transcribe audio without full analysis."""
    if x_internal_api_key != settings.internal_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    try:
        audio_bytes = base64.b64decode(request.audio_base64)
        result = await stt_service.transcribe_audio(
            audio_bytes,
            sample_rate=request.sample_rate
        )
        return result
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Redis Stream Consumer
# =============================================================================

async def consume_audio_streams():
    """
    Consume audio chunks from Redis streams and process them.
    This allows the API Gateway to push audio chunks without waiting for analysis.
    """
    logger.info("Starting audio stream consumer...")
    
    # Consumer group name
    group_name = "speech-analysis-group"
    consumer_name = "speech-consumer-1"
    
    while True:
        try:
            # Get list of active interview streams
            # In production, this would be more sophisticated
            keys = await redis_client.keys("stream:audio:*")
            
            for key in keys:
                key_str = key.decode() if isinstance(key, bytes) else key
                round_id = key_str.split(":")[-1]
                
                # Try to create consumer group (ignore if exists)
                try:
                    await redis_client.xgroup_create(key_str, group_name, id="0", mkstream=True)
                except Exception:
                    pass  # Group already exists
                
                # Read from stream
                try:
                    messages = await redis_client.xreadgroup(
                        group_name,
                        consumer_name,
                        {key_str: ">"},
                        count=10,
                        block=1000
                    )
                    
                    for stream_key, stream_messages in messages:
                        for message_id, data in stream_messages:
                            try:
                                await process_audio_chunk(round_id, data)
                                await redis_client.xack(key_str, group_name, message_id)
                            except Exception as e:
                                logger.error(f"Error processing audio chunk: {e}")
                                
                except Exception as e:
                    if "NOGROUP" not in str(e):
                        logger.error(f"Error reading from stream {key_str}: {e}")
            
            await asyncio.sleep(0.1)  # Small delay between iterations
            
        except Exception as e:
            logger.error(f"Stream consumer error: {e}")
            await asyncio.sleep(1)


async def process_audio_chunk(round_id: str, data: dict):
    """Process a single audio chunk from the stream."""
    try:
        # Extract data
        chunk_b64 = data.get(b"chunk", data.get("chunk", ""))
        timestamp = int(data.get(b"timestamp", data.get("timestamp", 0)))
        
        if isinstance(chunk_b64, bytes):
            chunk_b64 = chunk_b64.decode()
        
        # Decode audio
        audio_bytes = base64.b64decode(chunk_b64)
        audio_np = np.frombuffer(audio_bytes, dtype=np.int16)
        
        # Transcribe
        transcript_result = await stt_service.transcribe_audio(audio_bytes)
        
        # Skip if no speech detected
        if not transcript_result["transcript"].strip():
            return
        
        # Detect hesitations
        hesitations = audio_analyzer.detect_hesitations(
            transcript_result["words"],
            transcript_result["transcript"]
        )
        
        # Calculate confidence
        confidence_result = audio_analyzer.calculate_confidence(
            transcript_result["words"]
        )
        
        # Publish transcript insight
        await publish_insight(round_id, {
            "insightType": "SPEECH_CONFIDENCE",
            "timestampMs": timestamp,
            "severity": get_confidence_severity(confidence_result.score),
            "value": {
                "score": confidence_result.score,
                "indicators": confidence_result.indicators,
                "transcript": transcript_result["transcript"],
            },
            "explanation": f"Speech confidence: {int(confidence_result.score * 100)}%",
            "modelVersion": "speech-v1.0",
        })
        
        # Publish hesitation insights
        for hesitation in hesitations:
            await publish_insight(round_id, {
                "insightType": "HESITATION",
                "timestampMs": hesitation.start_ms + timestamp,
                "severity": "LOW" if hesitation.type == "filler_word" else "MEDIUM",
                "value": {
                    "type": hesitation.type,
                    "duration_ms": hesitation.duration_ms,
                    "word": hesitation.word,
                },
                "explanation": f"Hesitation detected: {hesitation.type}",
                "modelVersion": "speech-v1.0",
            })
        
        # Publish transcript for storage
        await publish_transcript(round_id, {
            "timestampMs": timestamp,
            "transcript": transcript_result["transcript"],
            "words": transcript_result["words"],
            "speaker": "CANDIDATE",
            "confidence": transcript_result["confidence"],
            "provider": transcript_result["provider"],
        })
        
    except Exception as e:
        logger.error(f"Error processing audio chunk for round {round_id}: {e}")


def get_confidence_severity(score: float) -> str:
    """Map confidence score to severity level."""
    if score >= 0.7:
        return "INFO"
    elif score >= 0.5:
        return "LOW"
    elif score >= 0.3:
        return "MEDIUM"
    else:
        return "HIGH"


async def publish_insight(round_id: str, insight: dict):
    """Publish insight to Redis channel."""
    try:
        message = json.dumps({"roundId": round_id, **insight})
        await redis_client.publish("service:speech:results", message)
    except Exception as e:
        logger.error(f"Failed to publish insight: {e}")


async def publish_transcript(round_id: str, transcript: dict):
    """Publish transcript to Redis for storage."""
    try:
        message = json.dumps({"roundId": round_id, **transcript})
        await redis_client.publish(f"interview:{round_id}:transcript", message)
    except Exception as e:
        logger.error(f"Failed to publish transcript: {e}")


async def publish_results(round_id: str, results: dict):
    """Publish full analysis results."""
    try:
        message = json.dumps(results)
        await redis_client.publish("service:speech:results", message)
    except Exception as e:
        logger.error(f"Failed to publish results: {e}")


# =============================================================================
# Run
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.port)
