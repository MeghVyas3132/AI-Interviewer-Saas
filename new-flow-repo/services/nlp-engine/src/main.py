"""
NLP Engine Service - Main FastAPI Application

Provides real-time NLP analysis for interview assistance:
- Resume contradiction detection
- Skill verification
- Follow-up question generation
- Transcript analysis
"""
import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict, Any, List, Optional

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import redis.asyncio as redis

from .config import settings
from .analyzer import ResumeContradictionAnalyzer, TranscriptAnalyzer

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global clients
redis_client: Optional[redis.Redis] = None
openai_client = None
anthropic_client = None
contradiction_analyzer: Optional[ResumeContradictionAnalyzer] = None
transcript_analyzer: Optional[TranscriptAnalyzer] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    global redis_client, openai_client, anthropic_client, contradiction_analyzer, transcript_analyzer
    
    # Initialize Redis
    redis_client = redis.from_url(settings.redis_url, decode_responses=True)
    logger.info("Redis connection established")
    
    # Initialize OpenAI client if configured
    if settings.openai_api_key:
        try:
            from openai import AsyncOpenAI
            openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
            logger.info("OpenAI client initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize OpenAI client: {e}")
    
    # Initialize Anthropic client if configured
    if settings.anthropic_api_key:
        try:
            from anthropic import AsyncAnthropic
            anthropic_client = AsyncAnthropic(api_key=settings.anthropic_api_key)
            logger.info("Anthropic client initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize Anthropic client: {e}")
    
    # Initialize analyzers
    contradiction_analyzer = ResumeContradictionAnalyzer(
        openai_client=openai_client,
        anthropic_client=anthropic_client
    )
    transcript_analyzer = TranscriptAnalyzer()
    
    # Start Redis stream consumer
    consumer_task = asyncio.create_task(redis_stream_consumer())
    
    logger.info(f"NLP Engine Service started - {settings.service_name}")
    
    yield
    
    # Cleanup
    consumer_task.cancel()
    try:
        await consumer_task
    except asyncio.CancelledError:
        pass
    
    if redis_client:
        await redis_client.close()
    
    logger.info("NLP Engine Service shutdown complete")


app = FastAPI(
    title="NLP Engine Service",
    description="Real-time NLP analysis for AI-assisted interviews",
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

class ResumeData(BaseModel):
    """Resume data model"""
    personal_info: Optional[Dict[str, Any]] = None
    experience: Optional[List[Dict[str, Any]]] = None
    education: Optional[List[Dict[str, Any]]] = None
    skills: Optional[Dict[str, Any]] = None
    projects: Optional[List[Dict[str, Any]]] = None
    certifications: Optional[List[Dict[str, Any]]] = None


class ContradictionRequest(BaseModel):
    """Request for contradiction analysis"""
    round_id: str
    resume_data: Dict[str, Any]
    transcript: str
    job_title: str = "Software Engineer"


class ContradictionResponse(BaseModel):
    """Response from contradiction analysis"""
    has_contradiction: bool
    confidence: float
    contradiction_type: Optional[str] = None
    description: Optional[str] = None
    resume_claim: Optional[str] = None
    spoken_claim: Optional[str] = None
    severity: str = "low"
    followup_questions: List[str] = Field(default_factory=list)


class SkillVerificationRequest(BaseModel):
    """Request for skill verification"""
    round_id: str
    skill_name: str
    claimed_level: str
    skill_context: str
    responses: List[str]


class SkillVerificationResponse(BaseModel):
    """Response from skill verification"""
    claimed_skill: str
    demonstrated_level: str
    expected_level: str
    is_consistent: bool
    confidence: float
    evidence: List[str] = Field(default_factory=list)


class QuestionGenerationRequest(BaseModel):
    """Request for follow-up question generation"""
    round_id: str
    resume_data: Dict[str, Any]
    transcript: str
    job_title: str = "Software Engineer"
    gap_areas: Optional[List[str]] = None
    num_questions: int = 3


class QuestionGenerationResponse(BaseModel):
    """Response with generated questions"""
    questions: List[Dict[str, str]]


class TranscriptAnalysisRequest(BaseModel):
    """Request for transcript analysis"""
    round_id: str
    response_text: str


class TranscriptAnalysisResponse(BaseModel):
    """Response from transcript analysis"""
    word_count: int
    sentence_count: int
    avg_sentence_length: float
    has_specific_examples: bool
    has_numbers: bool
    clarity_score: float
    detected_topic: Optional[str] = None


class StreamAnalysisRequest(BaseModel):
    """Request for streaming analysis via Redis"""
    round_id: str
    transcript_chunk: str
    resume_data: Dict[str, Any]
    job_title: str = "Software Engineer"


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
        "llm": False
    }
    
    # Check Redis
    try:
        if redis_client:
            await redis_client.ping()
            checks["redis"] = True
    except Exception:
        pass
    
    # Check LLM availability
    checks["llm"] = openai_client is not None or anthropic_client is not None
    
    all_ready = all(checks.values())
    
    return {
        "status": "ready" if all_ready else "degraded",
        "checks": checks,
        "timestamp": datetime.utcnow().isoformat()
    }


# =============================================================================
# Analysis Endpoints
# =============================================================================

@app.post("/analyze/contradiction", response_model=ContradictionResponse)
async def analyze_contradiction(request: ContradictionRequest):
    """
    Analyze transcript for contradictions with resume.
    
    This endpoint performs semantic analysis to detect:
    - Timeline inconsistencies
    - Skill/technology mismatches
    - Experience level discrepancies
    - Role responsibility contradictions
    """
    if not contradiction_analyzer:
        raise HTTPException(status_code=503, detail="Analyzer not initialized")
    
    try:
        result = await contradiction_analyzer.analyze_contradiction(
            resume_data=request.resume_data,
            transcript=request.transcript,
            job_title=request.job_title
        )
        
        # Publish to Redis for real-time delivery if contradiction found
        if result.has_contradiction and redis_client:
            await publish_insight(
                round_id=request.round_id,
                insight_type="contradiction",
                data={
                    "contradiction_type": result.contradiction_type,
                    "description": result.description,
                    "resume_claim": result.resume_claim,
                    "spoken_claim": result.spoken_claim,
                    "severity": result.severity,
                    "confidence": result.confidence,
                    "followup_questions": result.followup_questions
                }
            )
        
        return ContradictionResponse(
            has_contradiction=result.has_contradiction,
            confidence=result.confidence,
            contradiction_type=result.contradiction_type,
            description=result.description,
            resume_claim=result.resume_claim,
            spoken_claim=result.spoken_claim,
            severity=result.severity,
            followup_questions=result.followup_questions
        )
        
    except Exception as e:
        logger.error(f"Contradiction analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/skill", response_model=SkillVerificationResponse)
async def verify_skill(request: SkillVerificationRequest):
    """
    Verify if candidate demonstrates claimed skill level.
    
    Compares spoken responses about a skill against
    the claimed proficiency level on their resume.
    """
    if not contradiction_analyzer:
        raise HTTPException(status_code=503, detail="Analyzer not initialized")
    
    try:
        result = await contradiction_analyzer.verify_skill(
            skill_name=request.skill_name,
            claimed_level=request.claimed_level,
            skill_context=request.skill_context,
            responses=request.responses
        )
        
        # Publish insight if inconsistency found
        if not result.is_consistent and result.confidence > 0.7 and redis_client:
            await publish_insight(
                round_id=request.round_id,
                insight_type="skill_mismatch",
                data={
                    "skill": result.claimed_skill,
                    "claimed_level": result.expected_level,
                    "demonstrated_level": result.demonstrated_level,
                    "confidence": result.confidence,
                    "evidence": result.evidence
                }
            )
        
        return SkillVerificationResponse(
            claimed_skill=result.claimed_skill,
            demonstrated_level=result.demonstrated_level,
            expected_level=result.expected_level,
            is_consistent=result.is_consistent,
            confidence=result.confidence,
            evidence=result.evidence
        )
        
    except Exception as e:
        logger.error(f"Skill verification failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate/questions", response_model=QuestionGenerationResponse)
async def generate_questions(request: QuestionGenerationRequest):
    """
    Generate intelligent follow-up questions.
    
    Based on the resume and conversation so far,
    generates relevant questions to probe potential gaps.
    """
    if not contradiction_analyzer:
        raise HTTPException(status_code=503, detail="Analyzer not initialized")
    
    try:
        questions = await contradiction_analyzer.generate_followup_questions(
            resume_data=request.resume_data,
            transcript=request.transcript,
            job_title=request.job_title,
            gap_areas=request.gap_areas,
            num_questions=request.num_questions
        )
        
        return QuestionGenerationResponse(questions=questions)
        
    except Exception as e:
        logger.error(f"Question generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/transcript", response_model=TranscriptAnalysisResponse)
async def analyze_transcript(request: TranscriptAnalysisRequest):
    """
    Analyze response quality metrics.
    
    Provides quality indicators for interviewer:
    - Response length and structure
    - Specific examples detection
    - Clarity scoring
    - Topic detection
    """
    if not transcript_analyzer:
        raise HTTPException(status_code=503, detail="Analyzer not initialized")
    
    try:
        quality_metrics = transcript_analyzer.analyze_response_quality(request.response_text)
        detected_topic = transcript_analyzer.detect_topic(request.response_text)
        
        return TranscriptAnalysisResponse(
            word_count=quality_metrics["word_count"],
            sentence_count=quality_metrics["sentence_count"],
            avg_sentence_length=quality_metrics["avg_sentence_length"],
            has_specific_examples=quality_metrics["has_specific_examples"],
            has_numbers=quality_metrics["has_numbers"],
            clarity_score=quality_metrics["clarity_score"],
            detected_topic=detected_topic
        )
        
    except Exception as e:
        logger.error(f"Transcript analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/claims")
async def extract_claims(request: TranscriptAnalysisRequest):
    """
    Extract verifiable claims from transcript.
    
    Identifies statements that can be verified against resume:
    - Dates and timelines
    - Numbers and quantities
    - Organization names
    - Experience claims
    """
    if not contradiction_analyzer:
        raise HTTPException(status_code=503, detail="Analyzer not initialized")
    
    try:
        claims = await contradiction_analyzer.extract_key_claims(request.response_text)
        
        return {
            "round_id": request.round_id,
            "claims": claims,
            "claim_count": len(claims)
        }
        
    except Exception as e:
        logger.error(f"Claim extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Redis Stream Consumer
# =============================================================================

async def redis_stream_consumer():
    """
    Consume transcript updates from Redis stream for real-time analysis.
    
    Listens on: nlp:transcript_updates
    Publishes to: nlp:insights
    """
    stream_key = "nlp:transcript_updates"
    consumer_group = "nlp-engine-group"
    consumer_name = f"nlp-consumer-{settings.service_name}"
    
    # Wait for Redis connection
    while not redis_client:
        await asyncio.sleep(1)
    
    # Create consumer group if it doesn't exist
    try:
        await redis_client.xgroup_create(stream_key, consumer_group, id="0", mkstream=True)
        logger.info(f"Created consumer group: {consumer_group}")
    except redis.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            logger.error(f"Failed to create consumer group: {e}")
    
    logger.info(f"Starting Redis stream consumer on {stream_key}")
    
    while True:
        try:
            # Read from stream
            messages = await redis_client.xreadgroup(
                groupname=consumer_group,
                consumername=consumer_name,
                streams={stream_key: ">"},
                count=10,
                block=5000
            )
            
            for stream, entries in messages:
                for entry_id, data in entries:
                    try:
                        await process_transcript_update(data)
                        await redis_client.xack(stream_key, consumer_group, entry_id)
                    except Exception as e:
                        logger.error(f"Failed to process message {entry_id}: {e}")
                        
        except asyncio.CancelledError:
            logger.info("Stream consumer cancelled")
            break
        except Exception as e:
            logger.error(f"Stream consumer error: {e}")
            await asyncio.sleep(5)


async def process_transcript_update(data: Dict[str, str]):
    """
    Process a transcript update and run analysis.
    
    Args:
        data: Message data from Redis stream
    """
    try:
        round_id = data.get("round_id")
        transcript = data.get("transcript", "")
        resume_json = data.get("resume_data")
        job_title = data.get("job_title", "Software Engineer")
        
        if not round_id or not transcript:
            return
        
        # Parse resume data
        resume_data = {}
        if resume_json:
            try:
                resume_data = json.loads(resume_json)
            except json.JSONDecodeError:
                pass
        
        # Run contradiction analysis
        if resume_data and contradiction_analyzer:
            result = await contradiction_analyzer.analyze_contradiction(
                resume_data=resume_data,
                transcript=transcript,
                job_title=job_title
            )
            
            if result.has_contradiction:
                await publish_insight(
                    round_id=round_id,
                    insight_type="contradiction",
                    data={
                        "contradiction_type": result.contradiction_type,
                        "description": result.description,
                        "resume_claim": result.resume_claim,
                        "spoken_claim": result.spoken_claim,
                        "severity": result.severity,
                        "confidence": result.confidence
                    }
                )
        
        # Analyze response quality
        if transcript_analyzer:
            quality = transcript_analyzer.analyze_response_quality(transcript)
            
            # Only publish if clarity is notably low
            if quality["clarity_score"] < 0.3:
                await publish_insight(
                    round_id=round_id,
                    insight_type="response_quality",
                    data={
                        "clarity_score": quality["clarity_score"],
                        "word_count": quality["word_count"],
                        "has_examples": quality["has_specific_examples"]
                    }
                )
                
    except Exception as e:
        logger.error(f"Failed to process transcript update: {e}")


async def publish_insight(round_id: str, insight_type: str, data: Dict[str, Any]):
    """
    Publish insight to Redis for real-time delivery.
    
    Args:
        round_id: The interview round ID
        insight_type: Type of insight (contradiction, skill_mismatch, etc.)
        data: Insight data
    """
    if not redis_client:
        return
    
    try:
        insight = {
            "round_id": round_id,
            "type": insight_type,
            "source": "nlp-engine",
            "timestamp": datetime.utcnow().isoformat(),
            "data": data
        }
        
        # Publish to channel for real-time delivery
        await redis_client.publish(
            f"insights:{round_id}",
            json.dumps(insight)
        )
        
        # Also add to stream for persistence
        await redis_client.xadd(
            "nlp:insights",
            {"insight": json.dumps(insight)},
            maxlen=10000
        )
        
        logger.debug(f"Published {insight_type} insight for round {round_id}")
        
    except Exception as e:
        logger.error(f"Failed to publish insight: {e}")


# =============================================================================
# Entry Point
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)
