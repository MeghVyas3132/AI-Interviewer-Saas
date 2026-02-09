"""
Real-time interview routes for human-AI-assisted interviews.

Provides:
- WebSocket endpoint for real-time communication
- REST endpoints for insights, verdicts, and transcripts
- VideoSDK token generation
"""

import asyncio
import jwt
import logging
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.middleware.auth import get_current_user, require_employee
from app.models.user import User, UserRole
from app.models.interview_round import InterviewRound, RoundStatus
from app.models.realtime_insights import (
    LiveInsight,
    FraudAlert,
    InterviewTranscript,
    HumanVerdict,
    InterviewSummary,
    CandidateResume,
    VerdictDecision,
)
from app.websocket.realtime_handler import (
    manager,
    subscribe_to_insights,
    handle_client_message,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/realtime", tags=["realtime-interviews"])


# =============================================================================
# Pydantic Schemas
# =============================================================================

class VideoSDKTokenResponse(BaseModel):
    """VideoSDK token for joining a meeting."""
    meeting_id: str
    token: str
    participant_id: str


class InsightResponse(BaseModel):
    """Live insight response."""
    id: UUID
    round_id: UUID
    timestamp_ms: int
    insight_type: str
    severity: str
    value: dict
    explanation: Optional[str] = None
    created_at: datetime


class FraudAlertResponse(BaseModel):
    """Fraud alert response."""
    id: UUID
    round_id: UUID
    alert_type: str
    severity: str
    detected_at_ms: int
    confidence: float
    evidence: Optional[dict] = None
    acknowledged: bool
    created_at: datetime


class TranscriptSegment(BaseModel):
    """Transcript segment response."""
    id: UUID
    speaker: str
    content: str
    start_time_ms: int
    end_time_ms: int
    stt_confidence: Optional[float] = None


class VerdictCreate(BaseModel):
    """Create verdict request."""
    decision: str = Field(..., pattern="^(ADVANCE|REJECT|HOLD|REASSESS)$")
    overall_rating: Optional[int] = Field(None, ge=1, le=5)
    criteria_scores: Optional[dict] = None
    notes: Optional[str] = None
    ai_insights_helpful: Optional[bool] = None
    ai_feedback_notes: Optional[str] = None


class VerdictResponse(BaseModel):
    """Verdict response."""
    id: UUID
    round_id: UUID
    interviewer_id: UUID
    decision: str
    overall_rating: Optional[int] = None
    criteria_scores: Optional[dict] = None
    notes: Optional[str] = None
    submitted_at: datetime


class InterviewSummaryResponse(BaseModel):
    """Interview summary response."""
    id: UUID
    round_id: UUID
    avg_speech_confidence: Optional[float] = None
    total_hesitations: Optional[int] = None
    fraud_alerts_count: Optional[int] = None
    critical_alerts_count: Optional[int] = None
    resume_contradictions_found: Optional[int] = None
    ai_summary: Optional[str] = None
    key_observations: Optional[list] = None
    generated_at: datetime


class RoundStartRequest(BaseModel):
    """Request to start a human-AI-assisted interview round."""
    interview_mode: str = Field(default="HUMAN_AI_ASSISTED", pattern="^(HUMAN_AI_ASSISTED|HUMAN_ONLY)$")


class RoundUpdateResponse(BaseModel):
    """Response after updating round."""
    id: UUID
    status: str
    interview_mode: Optional[str] = None
    videosdk_meeting_id: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None


# =============================================================================
# WebSocket Endpoint
# =============================================================================

@router.websocket("/ws/interview/{round_id}")
async def websocket_interview(
    websocket: WebSocket,
    round_id: str,
    token: str = Query(...),
):
    """
    WebSocket endpoint for real-time interview communication.
    
    Query params:
        token: JWT access token for authentication
        
    Message types (client → server):
        - audio_chunk: {type, data (base64), timestamp_ms, sample_rate}
        - video_frame: {type, data (base64), timestamp_ms}
        - tab_visibility: {type, visible, timestamp_ms}
        - chat: {type, message}
        - interview_control: {type, action: start|pause|end}
        - ping: {type}
        
    Message types (server → client):
        - participant_joined: {type, user_id, role}
        - participant_left: {type, user_id}
        - insight: {type, data: {...}} (interviewers only)
        - fraud_alert: {type, alert_type, severity, message}
        - chat: {type, from_user, from_role, message}
        - interview_control: {type, action}
        - pong: {type}
    """
    # Authenticate via JWT
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id = payload.get("sub")
        user_role = payload.get("role", "")
        
        if not user_id:
            await websocket.close(code=4001, reason="Invalid token")
            return
            
    except jwt.ExpiredSignatureError:
        await websocket.close(code=4001, reason="Token expired")
        return
    except jwt.InvalidTokenError:
        await websocket.close(code=4001, reason="Invalid token")
        return
    
    # Determine role for this interview (interviewer or candidate)
    # Employees are interviewers, Candidates are candidates
    if user_role in ["EMPLOYEE", "HR", "SYSTEM_ADMIN"]:
        interview_role = "interviewer"
    else:
        interview_role = "candidate"
    
    # Connect to room
    await manager.connect(websocket, round_id, user_id, interview_role)
    
    # Start background task to subscribe to insights (for this room)
    insight_task = asyncio.create_task(subscribe_to_insights(round_id))
    
    try:
        while True:
            # Receive and handle messages
            data = await websocket.receive_json()
            await handle_client_message(
                websocket,
                round_id,
                user_id,
                interview_role,
                data,
            )
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: user={user_id} round={round_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        # Clean up
        manager.disconnect(round_id, user_id)
        insight_task.cancel()
        
        # Notify room about participant leaving
        await manager.broadcast_to_room(
            round_id,
            {
                "type": "participant_left",
                "user_id": user_id,
                "timestamp": datetime.utcnow().isoformat(),
            }
        )


# =============================================================================
# REST Endpoints
# =============================================================================

@router.post("/rounds/{round_id}/start", response_model=RoundUpdateResponse)
async def start_interview_round(
    round_id: UUID,
    request: RoundStartRequest,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
):
    """
    Start a human-AI-assisted interview round.
    
    - Generates VideoSDK meeting ID
    - Updates round status to IN_PROGRESS
    - Sets interview mode
    """
    # Get round
    result = await session.execute(
        select(InterviewRound).filter(
            InterviewRound.id == round_id,
            InterviewRound.company_id == current_user.company_id,
        )
    )
    round_obj = result.scalars().first()
    
    if not round_obj:
        raise HTTPException(status_code=404, detail="Interview round not found")
    
    if round_obj.status not in [RoundStatus.SCHEDULED, RoundStatus.RESCHEDULED]:
        raise HTTPException(status_code=400, detail=f"Cannot start round with status {round_obj.status}")
    
    # Generate VideoSDK meeting ID (simple UUID-based for now)
    import uuid
    meeting_id = f"ai-int-{str(uuid.uuid4())[:8]}"
    
    # Update round
    round_obj.status = RoundStatus.IN_PROGRESS
    round_obj.interview_mode = request.interview_mode
    round_obj.videosdk_meeting_id = meeting_id
    round_obj.started_at = datetime.utcnow()
    
    await session.commit()
    await session.refresh(round_obj)
    
    return RoundUpdateResponse(
        id=round_obj.id,
        status=round_obj.status.value,
        interview_mode=round_obj.interview_mode,
        videosdk_meeting_id=round_obj.videosdk_meeting_id,
        started_at=round_obj.started_at,
        ended_at=round_obj.ended_at,
    )


@router.post("/rounds/{round_id}/end", response_model=RoundUpdateResponse)
async def end_interview_round(
    round_id: UUID,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
):
    """End an interview round and mark as completed."""
    result = await session.execute(
        select(InterviewRound).filter(
            InterviewRound.id == round_id,
            InterviewRound.company_id == current_user.company_id,
        )
    )
    round_obj = result.scalars().first()
    
    if not round_obj:
        raise HTTPException(status_code=404, detail="Interview round not found")
    
    if round_obj.status != RoundStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Round is not in progress")
    
    round_obj.status = RoundStatus.COMPLETED
    round_obj.ended_at = datetime.utcnow()
    
    await session.commit()
    await session.refresh(round_obj)
    
    return RoundUpdateResponse(
        id=round_obj.id,
        status=round_obj.status.value,
        interview_mode=getattr(round_obj, 'interview_mode', None),
        videosdk_meeting_id=getattr(round_obj, 'videosdk_meeting_id', None),
        started_at=round_obj.started_at,
        ended_at=round_obj.ended_at,
    )


@router.get("/rounds/{round_id}/token", response_model=VideoSDKTokenResponse)
async def get_videosdk_token(
    round_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """
    Get VideoSDK token for joining the interview meeting.
    
    Returns participant token based on user role.
    """
    result = await session.execute(
        select(InterviewRound).filter(InterviewRound.id == round_id)
    )
    round_obj = result.scalars().first()
    
    if not round_obj:
        raise HTTPException(status_code=404, detail="Interview round not found")
    
    # Verify access (same company or candidate of this round)
    if round_obj.company_id != current_user.company_id:
        # Check if user is the candidate for this round
        if round_obj.candidate_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
    
    meeting_id = getattr(round_obj, 'videosdk_meeting_id', None)
    if not meeting_id:
        raise HTTPException(status_code=400, detail="Meeting not started yet")
    
    # Generate VideoSDK JWT token
    # In production, use proper VideoSDK API key/secret
    videosdk_api_key = settings.get("VIDEOSDK_API_KEY", "")
    videosdk_secret = settings.get("VIDEOSDK_SECRET", "")
    
    if not videosdk_api_key or not videosdk_secret:
        # Return mock token for development
        token = f"dev-token-{str(current_user.id)[:8]}"
    else:
        # Generate proper VideoSDK token
        payload = {
            "apikey": videosdk_api_key,
            "permissions": ["allow_join", "allow_mod"],
            "iat": datetime.utcnow(),
            "exp": datetime.utcnow() + timedelta(hours=2),
        }
        token = jwt.encode(payload, videosdk_secret, algorithm="HS256")
    
    return VideoSDKTokenResponse(
        meeting_id=meeting_id,
        token=token,
        participant_id=str(current_user.id),
    )


@router.get("/rounds/{round_id}/insights", response_model=List[InsightResponse])
async def get_round_insights(
    round_id: UUID,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    insight_type: Optional[str] = None,
    min_severity: Optional[str] = None,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
):
    """Get AI insights for an interview round."""
    # Build query
    query = select(LiveInsight).filter(LiveInsight.round_id == round_id)
    
    if insight_type:
        query = query.filter(LiveInsight.insight_type == insight_type)
    
    if min_severity:
        # Order: INFO < LOW < MEDIUM < HIGH < CRITICAL
        severity_order = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]
        if min_severity in severity_order:
            min_idx = severity_order.index(min_severity)
            valid_severities = severity_order[min_idx:]
            query = query.filter(LiveInsight.severity.in_(valid_severities))
    
    query = query.order_by(LiveInsight.timestamp_ms.desc()).offset(offset).limit(limit)
    
    result = await session.execute(query)
    insights = result.scalars().all()
    
    return [
        InsightResponse(
            id=i.id,
            round_id=i.round_id,
            timestamp_ms=i.timestamp_ms,
            insight_type=i.insight_type,
            severity=i.severity,
            value=i.value,
            explanation=i.explanation,
            created_at=i.created_at,
        )
        for i in insights
    ]


@router.get("/rounds/{round_id}/fraud-alerts", response_model=List[FraudAlertResponse])
async def get_fraud_alerts(
    round_id: UUID,
    acknowledged: Optional[bool] = None,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
):
    """Get fraud alerts for an interview round."""
    query = select(FraudAlert).filter(FraudAlert.round_id == round_id)
    
    if acknowledged is not None:
        query = query.filter(FraudAlert.acknowledged == acknowledged)
    
    query = query.order_by(FraudAlert.detected_at_ms.desc())
    
    result = await session.execute(query)
    alerts = result.scalars().all()
    
    return [
        FraudAlertResponse(
            id=a.id,
            round_id=a.round_id,
            alert_type=a.alert_type,
            severity=a.severity,
            detected_at_ms=a.detected_at_ms,
            confidence=float(a.confidence),
            evidence=a.evidence,
            acknowledged=a.acknowledged,
            created_at=a.created_at,
        )
        for a in alerts
    ]


@router.post("/fraud-alerts/{alert_id}/acknowledge")
async def acknowledge_fraud_alert(
    alert_id: UUID,
    false_positive: bool = False,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
):
    """Acknowledge a fraud alert."""
    result = await session.execute(
        select(FraudAlert).filter(FraudAlert.id == alert_id)
    )
    alert = result.scalars().first()
    
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    alert.acknowledged = True
    alert.acknowledged_by = current_user.id
    alert.acknowledged_at = datetime.utcnow()
    alert.false_positive_marked = false_positive
    
    await session.commit()
    
    return {"status": "acknowledged", "alert_id": str(alert_id)}


@router.get("/rounds/{round_id}/transcript", response_model=List[TranscriptSegment])
async def get_transcript(
    round_id: UUID,
    speaker: Optional[str] = None,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
):
    """Get interview transcript."""
    query = select(InterviewTranscript).filter(InterviewTranscript.round_id == round_id)
    
    if speaker:
        query = query.filter(InterviewTranscript.speaker == speaker.upper())
    
    query = query.order_by(InterviewTranscript.start_time_ms)
    
    result = await session.execute(query)
    segments = result.scalars().all()
    
    return [
        TranscriptSegment(
            id=s.id,
            speaker=s.speaker,
            content=s.content,
            start_time_ms=s.start_time_ms,
            end_time_ms=s.end_time_ms,
            stt_confidence=float(s.stt_confidence) if s.stt_confidence else None,
        )
        for s in segments
    ]


@router.post("/rounds/{round_id}/verdict", response_model=VerdictResponse)
async def submit_verdict(
    round_id: UUID,
    verdict: VerdictCreate,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
):
    """Submit interviewer verdict for a round."""
    # Check if round exists and is completed or in progress
    result = await session.execute(
        select(InterviewRound).filter(
            InterviewRound.id == round_id,
            InterviewRound.company_id == current_user.company_id,
        )
    )
    round_obj = result.scalars().first()
    
    if not round_obj:
        raise HTTPException(status_code=404, detail="Interview round not found")
    
    # Check if verdict already exists
    existing = await session.execute(
        select(HumanVerdict).filter(HumanVerdict.round_id == round_id)
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Verdict already submitted for this round")
    
    # Create verdict
    new_verdict = HumanVerdict(
        round_id=round_id,
        interviewer_id=current_user.id,
        decision=verdict.decision,
        overall_rating=verdict.overall_rating,
        criteria_scores=verdict.criteria_scores,
        notes=verdict.notes,
        ai_insights_helpful=verdict.ai_insights_helpful,
        ai_feedback_notes=verdict.ai_feedback_notes,
    )
    
    session.add(new_verdict)
    await session.commit()
    await session.refresh(new_verdict)
    
    return VerdictResponse(
        id=new_verdict.id,
        round_id=new_verdict.round_id,
        interviewer_id=new_verdict.interviewer_id,
        decision=new_verdict.decision,
        overall_rating=new_verdict.overall_rating,
        criteria_scores=new_verdict.criteria_scores,
        notes=new_verdict.notes,
        submitted_at=new_verdict.submitted_at,
    )


@router.get("/rounds/{round_id}/verdict", response_model=VerdictResponse)
async def get_verdict(
    round_id: UUID,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
):
    """Get verdict for an interview round."""
    result = await session.execute(
        select(HumanVerdict).filter(HumanVerdict.round_id == round_id)
    )
    verdict = result.scalars().first()
    
    if not verdict:
        raise HTTPException(status_code=404, detail="Verdict not found")
    
    return VerdictResponse(
        id=verdict.id,
        round_id=verdict.round_id,
        interviewer_id=verdict.interviewer_id,
        decision=verdict.decision,
        overall_rating=verdict.overall_rating,
        criteria_scores=verdict.criteria_scores,
        notes=verdict.notes,
        submitted_at=verdict.submitted_at,
    )


@router.get("/rounds/{round_id}/summary", response_model=InterviewSummaryResponse)
async def get_summary(
    round_id: UUID,
    current_user: User = Depends(require_employee),
    session: AsyncSession = Depends(get_db),
):
    """Get AI-generated summary for an interview round."""
    result = await session.execute(
        select(InterviewSummary).filter(InterviewSummary.round_id == round_id)
    )
    summary = result.scalars().first()
    
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")
    
    return InterviewSummaryResponse(
        id=summary.id,
        round_id=summary.round_id,
        avg_speech_confidence=float(summary.avg_speech_confidence) if summary.avg_speech_confidence else None,
        total_hesitations=summary.total_hesitations,
        fraud_alerts_count=summary.fraud_alerts_count,
        critical_alerts_count=summary.critical_alerts_count,
        resume_contradictions_found=summary.resume_contradictions_found,
        ai_summary=summary.ai_summary,
        key_observations=summary.key_observations,
        generated_at=summary.generated_at,
    )
