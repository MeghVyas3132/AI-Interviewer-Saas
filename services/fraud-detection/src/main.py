"""
Fraud Detection Service - Main FastAPI Application
"""
import asyncio
import base64
import json
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any, Optional
from io import BytesIO

import cv2
import numpy as np
from PIL import Image
import redis.asyncio as redis
from fastapi import FastAPI, HTTPException, Header, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import settings
from .detectors import (
    multiple_face_detector,
    face_switch_detector,
    background_voice_detector,
)

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
    logger.info("Starting Fraud Detection Service...")
    
    # Connect to Redis
    redis_client = redis.from_url(settings.redis_url, decode_responses=False)
    await redis_client.ping()
    logger.info("Connected to Redis")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Fraud Detection Service...")
    if redis_client:
        await redis_client.close()


# =============================================================================
# FastAPI App
# =============================================================================

app = FastAPI(
    title="Fraud Detection Service",
    description="Real-time fraud detection for AI Interview Assistant",
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

class FrameAnalysisRequest(BaseModel):
    """Request for video frame fraud analysis."""
    round_id: str
    frame_base64: str
    timestamp_ms: int


class AudioAnalysisRequest(BaseModel):
    """Request for audio fraud analysis."""
    round_id: str
    audio_base64: str
    timestamp_ms: int
    sample_rate: int = 16000


class FraudCheckResponse(BaseModel):
    """Fraud check response."""
    round_id: str
    timestamp_ms: int
    multiple_faces: Optional[Dict[str, Any]] = None
    face_switch: Optional[Dict[str, Any]] = None
    background_voice: Optional[Dict[str, Any]] = None
    alerts: list = []


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
    
    return {
        "status": "healthy" if redis_healthy else "degraded",
        "redis": "up" if redis_healthy else "down",
        "detectors": {
            "multiple_face": "available",
            "face_switch": "available" if face_switch_detector._available else "unavailable",
            "background_voice": "available" if background_voice_detector._available else "unavailable",
        },
    }


# =============================================================================
# API Endpoints
# =============================================================================

@app.post("/analyze/video", response_model=FraudCheckResponse)
async def analyze_video_frame(
    request: FrameAnalysisRequest,
    background_tasks: BackgroundTasks,
    x_internal_api_key: str = Header(None),
):
    """
    Analyze video frame for fraud indicators.
    
    Checks for:
    - Multiple faces in frame
    - Face switching (different person)
    """
    if x_internal_api_key != settings.internal_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    try:
        # Decode image
        image_bytes = base64.b64decode(request.frame_base64)
        image = Image.open(BytesIO(image_bytes))
        frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        
        # Check for multiple faces
        multiple_faces_result = multiple_face_detector.detect(frame)
        
        # Check for face switch
        face_switch_result = face_switch_detector.check(frame, request.timestamp_ms)
        
        # Collect alerts
        alerts = []
        
        if multiple_faces_result.is_alert:
            alerts.append({
                "type": "MULTIPLE_FACES",
                "severity": "HIGH",
                "message": multiple_faces_result.alert_message,
                "confidence": multiple_faces_result.confidence,
            })
        
        if face_switch_result.is_alert:
            alerts.append({
                "type": "FACE_SWITCH",
                "severity": "CRITICAL",
                "message": face_switch_result.alert_message,
                "confidence": face_switch_result.confidence,
            })
        
        response = FraudCheckResponse(
            round_id=request.round_id,
            timestamp_ms=request.timestamp_ms,
            multiple_faces={
                "face_count": multiple_faces_result.face_count,
                "confidence": multiple_faces_result.confidence,
                "is_alert": multiple_faces_result.is_alert,
            },
            face_switch={
                "is_same_person": face_switch_result.is_same_person,
                "confidence": face_switch_result.confidence,
                "distance": face_switch_result.distance,
                "is_alert": face_switch_result.is_alert,
            },
            alerts=alerts,
        )
        
        # Publish alerts to Redis
        if alerts:
            background_tasks.add_task(publish_alerts, request.round_id, request.timestamp_ms, alerts)
        
        return response
        
    except Exception as e:
        logger.error(f"Video fraud analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/audio")
async def analyze_audio(
    request: AudioAnalysisRequest,
    background_tasks: BackgroundTasks,
    x_internal_api_key: str = Header(None),
):
    """
    Analyze audio for background voices.
    """
    if x_internal_api_key != settings.internal_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    try:
        # Decode audio
        audio_bytes = base64.b64decode(request.audio_base64)
        audio_np = np.frombuffer(audio_bytes, dtype=np.int16)
        
        # Check for background voices
        voice_result = background_voice_detector.detect(audio_np, request.sample_rate)
        
        alerts = []
        if voice_result.is_alert:
            alerts.append({
                "type": "BACKGROUND_VOICE",
                "severity": "MEDIUM",
                "message": voice_result.alert_message,
                "confidence": voice_result.confidence,
            })
        
        response = {
            "round_id": request.round_id,
            "timestamp_ms": request.timestamp_ms,
            "background_voice": {
                "voices_detected": voice_result.voices_detected,
                "is_alert": voice_result.is_alert,
                "confidence": voice_result.confidence,
            },
            "alerts": alerts,
        }
        
        if alerts:
            background_tasks.add_task(publish_alerts, request.round_id, request.timestamp_ms, alerts)
        
        return response
        
    except Exception as e:
        logger.error(f"Audio fraud analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/reset/{round_id}")
async def reset_detectors(
    round_id: str,
    x_internal_api_key: str = Header(None),
):
    """Reset fraud detectors for a new interview."""
    if x_internal_api_key != settings.internal_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    multiple_face_detector.reset()
    face_switch_detector.reset()
    
    return {"status": "reset", "round_id": round_id}


# =============================================================================
# Redis Publishing
# =============================================================================

async def publish_alerts(round_id: str, timestamp_ms: int, alerts: list):
    """Publish fraud alerts to Redis."""
    try:
        for alert in alerts:
            insight = {
                "roundId": round_id,
                "insightType": alert["type"],
                "timestampMs": timestamp_ms,
                "severity": alert["severity"],
                "value": {
                    "confidence": alert["confidence"],
                },
                "explanation": alert["message"],
                "modelVersion": "fraud-v1.0",
            }
            
            message = json.dumps(insight)
            await redis_client.publish("service:fraud:results", message)
            
    except Exception as e:
        logger.error(f"Failed to publish alerts: {e}")


# =============================================================================
# Run
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.port)
