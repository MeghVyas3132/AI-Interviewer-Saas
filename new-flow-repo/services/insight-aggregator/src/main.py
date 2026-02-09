"""
Insight Aggregator Service - Main FastAPI Application

Central hub for combining insights from all ML services:
- Receives insights from speech, video, fraud, and NLP services
- Aggregates and deduplicates
- Applies confidence thresholds
- Generates recommendations
- Delivers to API Gateway via Redis
"""
import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict, Any, List, Optional
from dataclasses import asdict

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import redis.asyncio as redis
import asyncpg

from .config import settings
from .aggregator import InsightAggregator, RecommendationEngine, AggregatedInsight

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global clients
redis_client: Optional[redis.Redis] = None
db_pool: Optional[asyncpg.Pool] = None
aggregator: Optional[InsightAggregator] = None
recommendation_engine: Optional[RecommendationEngine] = None

# Background task for periodic aggregation
aggregation_task: Optional[asyncio.Task] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    global redis_client, db_pool, aggregator, recommendation_engine, aggregation_task
    
    # Initialize Redis
    redis_client = redis.from_url(settings.redis_url, decode_responses=True)
    logger.info("Redis connection established")
    
    # Initialize database pool
    try:
        db_pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=2,
            max_size=10
        )
        logger.info("Database pool created")
    except Exception as e:
        logger.warning(f"Database connection failed (will retry): {e}")
        db_pool = None
    
    # Initialize aggregator and recommendation engine
    aggregator = InsightAggregator()
    recommendation_engine = RecommendationEngine()
    
    # Start Redis stream consumers for all ML services
    consumer_task = asyncio.create_task(multi_stream_consumer())
    
    # Start periodic aggregation task
    aggregation_task = asyncio.create_task(periodic_aggregation())
    
    logger.info(f"Insight Aggregator Service started - {settings.service_name}")
    
    yield
    
    # Cleanup
    consumer_task.cancel()
    aggregation_task.cancel()
    
    try:
        await consumer_task
        await aggregation_task
    except asyncio.CancelledError:
        pass
    
    if redis_client:
        await redis_client.close()
    
    if db_pool:
        await db_pool.close()
    
    logger.info("Insight Aggregator Service shutdown complete")


app = FastAPI(
    title="Insight Aggregator Service",
    description="Central hub for aggregating insights from all ML services",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Pydantic Models
# =============================================================================

class InsightInput(BaseModel):
    """Raw insight from an ML service"""
    round_id: str
    type: str
    source: str
    timestamp: str
    data: Dict[str, Any]


class AggregatedInsightResponse(BaseModel):
    """Response model for aggregated insight"""
    id: str
    round_id: str
    category: str
    insight_type: str
    confidence: float
    severity: str
    title: str
    description: str
    evidence: List[str] = Field(default_factory=list)
    source_services: List[str] = Field(default_factory=list)
    followup_questions: List[str] = Field(default_factory=list)
    is_alert: bool


class InsightBatchResponse(BaseModel):
    """Response model for insight batch"""
    round_id: str
    insights: List[AggregatedInsightResponse]
    recommendations: List[Dict[str, Any]]
    summary: Dict[str, Any]
    timestamp: str


class AssessmentResponse(BaseModel):
    """Response model for overall assessment"""
    round_id: str
    risk_level: str
    risk_explanation: str
    fraud_indicators: int
    contradictions_found: int
    total_insights: int
    next_steps: List[str]
    generated_at: str


# =============================================================================
# Health Check Endpoints
# =============================================================================

@app.get("/health")
async def health_check():
    """Basic health check"""
    return {"status": "healthy", "service": settings.service_name}


@app.get("/health/ready")
async def readiness_check():
    """Detailed readiness check"""
    checks = {
        "redis": False,
        "database": False
    }
    
    # Check Redis
    try:
        if redis_client:
            await redis_client.ping()
            checks["redis"] = True
    except Exception:
        pass
    
    # Check Database
    try:
        if db_pool:
            async with db_pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            checks["database"] = True
    except Exception:
        pass
    
    all_ready = checks["redis"]  # Redis is required, DB is optional
    
    return {
        "status": "ready" if all_ready else "degraded",
        "checks": checks,
        "timestamp": datetime.utcnow().isoformat()
    }


# =============================================================================
# Insight Endpoints
# =============================================================================

@app.post("/insights/receive")
async def receive_insight(insight: InsightInput):
    """
    Receive a raw insight from an ML service.
    
    This endpoint is called by ML services to submit insights
    for aggregation and delivery.
    """
    if not aggregator:
        raise HTTPException(status_code=503, detail="Aggregator not initialized")
    
    try:
        # Add to aggregation buffer
        aggregator.add_insight(
            round_id=insight.round_id,
            insight={
                "type": insight.type,
                "source": insight.source,
                "timestamp": insight.timestamp,
                "data": insight.data
            }
        )
        
        # Get current buffer size
        buffer_size = aggregator.get_buffer_size(insight.round_id)
        
        return {
            "status": "received",
            "round_id": insight.round_id,
            "buffer_size": buffer_size
        }
        
    except Exception as e:
        logger.error(f"Failed to receive insight: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/insights/{round_id}/aggregate", response_model=InsightBatchResponse)
async def get_aggregated_insights(round_id: str):
    """
    Get aggregated insights for a round.
    
    Triggers immediate aggregation and returns the result.
    """
    if not aggregator:
        raise HTTPException(status_code=503, detail="Aggregator not initialized")
    
    try:
        batch = await aggregator.aggregate(round_id)
        
        return InsightBatchResponse(
            round_id=batch.round_id,
            insights=[
                AggregatedInsightResponse(
                    id=i.id,
                    round_id=i.round_id,
                    category=i.category,
                    insight_type=i.insight_type,
                    confidence=i.confidence,
                    severity=i.severity,
                    title=i.title,
                    description=i.description,
                    evidence=i.evidence,
                    source_services=i.source_services,
                    followup_questions=i.followup_questions,
                    is_alert=i.is_alert
                )
                for i in batch.insights
            ],
            recommendations=batch.recommendations,
            summary=batch.summary,
            timestamp=batch.timestamp.isoformat()
        )
        
    except Exception as e:
        logger.error(f"Failed to aggregate insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/insights/{round_id}/assessment", response_model=AssessmentResponse)
async def get_assessment(round_id: str, duration_minutes: int = 30):
    """
    Get overall assessment for an interview round.
    
    Generates a risk assessment and recommendations based on
    all insights collected during the interview.
    """
    if not aggregator or not recommendation_engine:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    try:
        # Get all aggregated insights
        batch = await aggregator.aggregate(round_id)
        
        # Generate assessment
        assessment = recommendation_engine.generate_overall_assessment(
            round_id=round_id,
            insights=batch.insights,
            interview_duration_minutes=duration_minutes
        )
        
        return AssessmentResponse(**assessment)
        
    except Exception as e:
        logger.error(f"Failed to generate assessment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/insights/{round_id}/clear")
async def clear_insights(round_id: str):
    """
    Clear the insight buffer for a round.
    
    Called when an interview round ends or is cancelled.
    """
    if not aggregator:
        raise HTTPException(status_code=503, detail="Aggregator not initialized")
    
    try:
        aggregator.clear_buffer(round_id)
        
        return {
            "status": "cleared",
            "round_id": round_id
        }
        
    except Exception as e:
        logger.error(f"Failed to clear insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/insights/{round_id}/buffer-status")
async def get_buffer_status(round_id: str):
    """
    Get the current buffer status for a round.
    
    Useful for monitoring and debugging.
    """
    if not aggregator:
        raise HTTPException(status_code=503, detail="Aggregator not initialized")
    
    return {
        "round_id": round_id,
        "buffer_size": aggregator.get_buffer_size(round_id),
        "timestamp": datetime.utcnow().isoformat()
    }


# =============================================================================
# Database Persistence
# =============================================================================

async def persist_insight(insight: AggregatedInsight):
    """
    Persist an aggregated insight to the database.
    
    Args:
        insight: The aggregated insight to persist
    """
    if not db_pool:
        return
    
    try:
        async with db_pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO live_insights (
                    round_id, insight_type, category, severity,
                    confidence_score, content, source_service, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """,
                insight.round_id,
                insight.insight_type,
                insight.category,
                insight.severity,
                insight.confidence,
                json.dumps({
                    "title": insight.title,
                    "description": insight.description,
                    "evidence": insight.evidence,
                    "followup_questions": insight.followup_questions
                }),
                ','.join(insight.source_services),
                insight.timestamp
            )
            
    except Exception as e:
        logger.error(f"Failed to persist insight: {e}")


async def persist_recommendation(round_id: str, recommendation: Dict[str, Any]):
    """
    Persist a recommendation to the database.
    
    Args:
        round_id: Interview round ID
        recommendation: The recommendation to persist
    """
    if not db_pool:
        return
    
    try:
        async with db_pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO ai_recommendations (
                    round_id, recommendation_type, priority,
                    content, status, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6)
            """,
                round_id,
                recommendation.get("type", "observation"),
                recommendation.get("priority", "low"),
                json.dumps(recommendation),
                "pending",
                datetime.utcnow()
            )
            
    except Exception as e:
        logger.error(f"Failed to persist recommendation: {e}")


# =============================================================================
# Redis Stream Consumer
# =============================================================================

async def multi_stream_consumer():
    """
    Consume insights from multiple Redis streams.
    
    Listens to:
    - speech:insights
    - video:insights
    - fraud:insights
    - nlp:insights
    """
    streams = [
        "speech:insights",
        "video:insights",
        "fraud:insights",
        "nlp:insights"
    ]
    consumer_group = "aggregator-group"
    consumer_name = f"aggregator-{settings.service_name}"
    
    # Wait for Redis connection
    while not redis_client:
        await asyncio.sleep(1)
    
    # Create consumer groups for each stream
    for stream in streams:
        try:
            await redis_client.xgroup_create(stream, consumer_group, id="0", mkstream=True)
            logger.info(f"Created consumer group for {stream}")
        except redis.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                logger.error(f"Failed to create consumer group for {stream}: {e}")
    
    logger.info(f"Starting multi-stream consumer for {len(streams)} streams")
    
    while True:
        try:
            # Read from all streams
            messages = await redis_client.xreadgroup(
                groupname=consumer_group,
                consumername=consumer_name,
                streams={stream: ">" for stream in streams},
                count=20,
                block=5000
            )
            
            for stream, entries in messages:
                for entry_id, data in entries:
                    try:
                        await process_stream_message(stream, data)
                        await redis_client.xack(stream, consumer_group, entry_id)
                    except Exception as e:
                        logger.error(f"Failed to process message {entry_id} from {stream}: {e}")
                        
        except asyncio.CancelledError:
            logger.info("Stream consumer cancelled")
            break
        except Exception as e:
            logger.error(f"Stream consumer error: {e}")
            await asyncio.sleep(5)


async def process_stream_message(stream: str, data: Dict[str, str]):
    """
    Process a message from a Redis stream.
    
    Args:
        stream: The stream name
        data: Message data
    """
    try:
        # Parse the insight
        insight_json = data.get("insight")
        if not insight_json:
            return
        
        insight = json.loads(insight_json)
        round_id = insight.get("round_id")
        
        if not round_id:
            return
        
        # Add to aggregator buffer
        if aggregator:
            aggregator.add_insight(round_id, insight)
            logger.debug(f"Added insight from {stream} for round {round_id}")
            
    except Exception as e:
        logger.error(f"Failed to process stream message: {e}")


# =============================================================================
# Periodic Aggregation
# =============================================================================

async def periodic_aggregation():
    """
    Periodically aggregate and publish insights.
    
    Runs every few seconds to aggregate buffered insights
    and publish them to the API Gateway.
    """
    aggregation_interval = settings.insight_window_seconds / 2
    
    while True:
        try:
            await asyncio.sleep(aggregation_interval)
            
            if not aggregator:
                continue
            
            # Get all active rounds from buffer
            active_rounds = list(aggregator.insight_buffer.keys())
            
            for round_id in active_rounds:
                buffer_size = aggregator.get_buffer_size(round_id)
                
                if buffer_size == 0:
                    continue
                
                try:
                    # Aggregate insights
                    batch = await aggregator.aggregate(round_id)
                    
                    if not batch.insights:
                        continue
                    
                    # Publish aggregated insights to API Gateway
                    await publish_aggregated_batch(batch)
                    
                    # Persist alerts and recommendations to database
                    for insight in batch.insights:
                        if insight.is_alert:
                            await persist_insight(insight)
                    
                    for recommendation in batch.recommendations:
                        await persist_recommendation(round_id, recommendation)
                        
                except Exception as e:
                    logger.error(f"Failed to aggregate for round {round_id}: {e}")
                    
        except asyncio.CancelledError:
            logger.info("Periodic aggregation cancelled")
            break
        except Exception as e:
            logger.error(f"Periodic aggregation error: {e}")
            await asyncio.sleep(5)


async def publish_aggregated_batch(batch):
    """
    Publish aggregated insights to the API Gateway.
    
    Args:
        batch: InsightBatch to publish
    """
    if not redis_client:
        return
    
    try:
        # Convert to serializable format
        payload = {
            "round_id": batch.round_id,
            "insights": [
                {
                    "id": i.id,
                    "category": i.category,
                    "insight_type": i.insight_type,
                    "confidence": i.confidence,
                    "severity": i.severity,
                    "title": i.title,
                    "description": i.description,
                    "evidence": i.evidence,
                    "followup_questions": i.followup_questions,
                    "is_alert": i.is_alert
                }
                for i in batch.insights
            ],
            "recommendations": batch.recommendations,
            "summary": batch.summary,
            "timestamp": batch.timestamp.isoformat()
        }
        
        # Publish to channel for real-time delivery
        await redis_client.publish(
            f"insights:aggregated:{batch.round_id}",
            json.dumps(payload)
        )
        
        logger.debug(f"Published aggregated batch for round {batch.round_id}: {len(batch.insights)} insights")
        
    except Exception as e:
        logger.error(f"Failed to publish aggregated batch: {e}")


# =============================================================================
# Entry Point
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)
