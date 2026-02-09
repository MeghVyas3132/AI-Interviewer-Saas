"""
Video Analysis Service - Main FastAPI Application
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
from .analyzer import video_analyzer

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
    logger.info("Starting Video Analysis Service...")
    
    # Connect to Redis
    redis_client = redis.from_url(settings.redis_url, decode_responses=False)
    await redis_client.ping()
    logger.info("Connected to Redis")
    
    # Start stream consumer
    asyncio.create_task(consume_video_streams())
    
    yield
    
    # Shutdown
    logger.info("Shutting down Video Analysis Service...")
    if redis_client:
        await redis_client.close()


# =============================================================================
# FastAPI App
# =============================================================================

app = FastAPI(
    title="Video Analysis Service",
    description="Real-time video analysis for AI Interview Assistant",
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
    """Request for frame analysis."""
    round_id: str
    frame_base64: str  # Base64 encoded image (JPEG/PNG)
    timestamp_ms: int


class AnalysisResponse(BaseModel):
    """Analysis response."""
    round_id: str
    timestamp_ms: int
    head_movement: Dict[str, Any]
    video_quality: Dict[str, Any]


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
        "mediapipe": "available",
    }


# =============================================================================
# API Endpoints
# =============================================================================

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_frame(
    request: FrameAnalysisRequest,
    background_tasks: BackgroundTasks,
    x_internal_api_key: str = Header(None),
):
    """
    Analyze video frame for head movement and quality.
    """
    # Verify API key
    if x_internal_api_key != settings.internal_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    try:
        # Decode image
        image_bytes = base64.b64decode(request.frame_base64)
        image = Image.open(BytesIO(image_bytes))
        frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        
        # Analyze frame
        head_movement, video_quality = video_analyzer.analyze_frame(
            frame,
            round_id=request.round_id
        )
        
        # Build response
        response = AnalysisResponse(
            round_id=request.round_id,
            timestamp_ms=request.timestamp_ms,
            head_movement={
                "status": head_movement.status,
                "movement_score": head_movement.movement_score,
                "face_detected": head_movement.face_detected,
                "head_pose": {
                    "yaw": head_movement.head_pose.yaw,
                    "pitch": head_movement.head_pose.pitch,
                    "roll": head_movement.head_pose.roll,
                } if head_movement.head_pose else None,
            },
            video_quality={
                "status": video_quality.status,
                "brightness": video_quality.brightness,
                "contrast": video_quality.contrast,
                "face_visible": video_quality.face_visible,
            },
        )
        
        # Publish results to Redis (background task)
        background_tasks.add_task(
            publish_results,
            request.round_id,
            request.timestamp_ms,
            response.model_dump()
        )
        
        return response
        
    except Exception as e:
        logger.error(f"Frame analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/reset/{round_id}")
async def reset_analysis(
    round_id: str,
    x_internal_api_key: str = Header(None),
):
    """Reset analysis state for a new interview."""
    if x_internal_api_key != settings.internal_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    video_analyzer.reset_history()
    return {"status": "reset", "round_id": round_id}


# =============================================================================
# Redis Stream Consumer
# =============================================================================

async def consume_video_streams():
    """
    Consume video frames from Redis streams and process them.
    """
    logger.info("Starting video stream consumer...")
    
    group_name = "video-analysis-group"
    consumer_name = "video-consumer-1"
    
    while True:
        try:
            keys = await redis_client.keys("stream:video:*")
            
            for key in keys:
                key_str = key.decode() if isinstance(key, bytes) else key
                round_id = key_str.split(":")[-1]
                
                try:
                    await redis_client.xgroup_create(key_str, group_name, id="0", mkstream=True)
                except Exception:
                    pass
                
                try:
                    messages = await redis_client.xreadgroup(
                        group_name,
                        consumer_name,
                        {key_str: ">"},
                        count=5,  # Process fewer frames than audio
                        block=1000
                    )
                    
                    for stream_key, stream_messages in messages:
                        for message_id, data in stream_messages:
                            try:
                                await process_video_frame(round_id, data)
                                await redis_client.xack(key_str, group_name, message_id)
                            except Exception as e:
                                logger.error(f"Error processing video frame: {e}")
                                
                except Exception as e:
                    if "NOGROUP" not in str(e):
                        logger.error(f"Error reading from stream {key_str}: {e}")
            
            await asyncio.sleep(0.5)  # Longer delay for video
            
        except Exception as e:
            logger.error(f"Stream consumer error: {e}")
            await asyncio.sleep(1)


async def process_video_frame(round_id: str, data: dict):
    """Process a single video frame from the stream."""
    try:
        frame_b64 = data.get(b"frame", data.get("frame", ""))
        timestamp = int(data.get(b"timestamp", data.get("timestamp", 0)))
        
        if isinstance(frame_b64, bytes):
            frame_b64 = frame_b64.decode()
        
        # Decode image
        image_bytes = base64.b64decode(frame_b64)
        image = Image.open(BytesIO(image_bytes))
        frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        
        # Analyze
        head_movement, video_quality = video_analyzer.analyze_frame(frame, round_id)
        
        # Publish head movement insight
        await publish_insight(round_id, {
            "insightType": "HEAD_MOVEMENT",
            "timestampMs": timestamp,
            "severity": get_movement_severity(head_movement.status),
            "value": {
                "status": head_movement.status,
                "movement_score": head_movement.movement_score,
                "face_detected": head_movement.face_detected,
            },
            "explanation": f"Head movement: {head_movement.status}",
            "modelVersion": "video-v1.0",
        })
        
        # Publish video quality insight
        await publish_insight(round_id, {
            "insightType": "VIDEO_QUALITY",
            "timestampMs": timestamp,
            "severity": get_quality_severity(video_quality.status),
            "value": {
                "status": video_quality.status,
                "brightness": video_quality.brightness,
                "face_visible": video_quality.face_visible,
            },
            "explanation": f"Video quality: {video_quality.status}",
            "modelVersion": "video-v1.0",
        })
        
    except Exception as e:
        logger.error(f"Error processing video frame for round {round_id}: {e}")


def get_movement_severity(status: str) -> str:
    """Map movement status to severity."""
    return {
        "stable": "INFO",
        "fidgety": "LOW",
        "distracted": "MEDIUM",
    }.get(status, "LOW")


def get_quality_severity(status: str) -> str:
    """Map quality status to severity."""
    return {
        "good": "INFO",
        "acceptable": "LOW",
        "poor": "MEDIUM",
    }.get(status, "LOW")


async def publish_insight(round_id: str, insight: dict):
    """Publish insight to Redis channel."""
    try:
        message = json.dumps({"roundId": round_id, **insight})
        await redis_client.publish("service:video:results", message)
    except Exception as e:
        logger.error(f"Failed to publish insight: {e}")


async def publish_results(round_id: str, timestamp_ms: int, results: dict):
    """Publish full analysis results."""
    try:
        message = json.dumps(results)
        await redis_client.publish("service:video:results", message)
    except Exception as e:
        logger.error(f"Failed to publish results: {e}")


# =============================================================================
# Run
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.port)
