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
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.middleware.auth import get_current_user, require_employee
from app.models.user import User, UserRole
from app.models.interview_round import InterviewRound, RoundStatus
from app.models.candidate import Candidate, CandidateStatus
from app.models.realtime_insights import (
    LiveInsight,
    FraudAlert,
    InterviewTranscript,
    HumanVerdict,
    InterviewSummary,
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
    # Aliases for frontend compatibility
    videosdk_meeting_id: Optional[str] = None
    videosdk_token: Optional[str] = None
    interview_mode: Optional[str] = None
    id: Optional[str] = None


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
    decision: str = Field(..., pattern="^(ADVANCE|REJECT|HOLD|REASSESS|selected|rejected|on_hold)$")
    overall_rating: Optional[int] = Field(None, ge=1, le=5)
    criteria_scores: Optional[dict] = None
    notes: Optional[str] = None
    ai_insights_helpful: Optional[bool] = None
    ai_feedback_notes: Optional[str] = None
    # Additional fields for alternative payload format
    strengths: List[str] = []
    improvements: List[str] = []
    feedback: Optional[str] = None
    ratings: Optional[dict] = None


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
                "timestamp": datetime.now(timezone.utc).isoformat(),
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
    round_obj.started_at = datetime.now(timezone.utc)
    
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
    round_obj.ended_at = datetime.now(timezone.utc)
    
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
    Auto-creates the meeting if not started yet.
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
    
    # Auto-create meeting if not started yet
    if not meeting_id:
        import uuid
        meeting_id = f"ai-int-{str(uuid.uuid4())[:8]}"
        round_obj.videosdk_meeting_id = meeting_id
        round_obj.status = RoundStatus.IN_PROGRESS
        round_obj.started_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(round_obj)
    
    # Generate VideoSDK JWT token
    # Use VideoSDK API key/secret from settings
    videosdk_api_key = settings.videosdk_api_key
    videosdk_secret = settings.videosdk_secret
    
    if not videosdk_api_key or not videosdk_secret:
        # Return mock token for development
        token = f"dev-token-{str(current_user.id)[:8]}"
    else:
        # Generate proper VideoSDK token
        payload = {
            "apikey": videosdk_api_key,
            "permissions": ["allow_join", "allow_mod"],
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(hours=2),
        }
        token = jwt.encode(payload, videosdk_secret, algorithm="HS256")
    
    return VideoSDKTokenResponse(
        meeting_id=meeting_id,
        token=token,
        participant_id=str(current_user.id),
        # Include aliases for frontend compatibility
        videosdk_meeting_id=meeting_id,
        videosdk_token=token,
        interview_mode=getattr(round_obj, 'interview_mode', 'HUMAN_AI_ASSISTED'),
        id=str(round_id),
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
    
    query = query.order_by(FraudAlert.detected_at_ms.desc()).limit(200)
    
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
    alert.acknowledged_at = datetime.now(timezone.utc)
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
    
    query = query.order_by(InterviewTranscript.start_time_ms).limit(500)
    
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
    
    # Normalize payload - support both formats
    # Use ratings if criteria_scores not provided
    final_scores = verdict.criteria_scores or verdict.ratings
    
    # Build notes from multiple sources
    notes_parts = []
    if verdict.notes:
        notes_parts.append(verdict.notes)
    if verdict.feedback and verdict.feedback != verdict.notes:
        notes_parts.append(verdict.feedback)
    if verdict.strengths:
        notes_parts.append(f"Strengths: {', '.join(verdict.strengths)}")
    if verdict.improvements:
        notes_parts.append(f"Areas for improvement: {', '.join(verdict.improvements)}")
    final_notes = '\n\n'.join(notes_parts) if notes_parts else None
    
    # Normalize decision value
    decision_map = {
        'selected': 'ADVANCE',
        'rejected': 'REJECT',
        'on_hold': 'HOLD',
    }
    normalized_decision = decision_map.get(verdict.decision.lower(), verdict.decision.upper())
    
    # Create verdict
    new_verdict = HumanVerdict(
        round_id=round_id,
        interviewer_id=current_user.id,
        decision=normalized_decision,
        overall_rating=verdict.overall_rating,
        criteria_scores=final_scores,
        notes=final_notes,
        ai_insights_helpful=verdict.ai_insights_helpful,
        ai_feedback_notes=verdict.ai_feedback_notes,
    )
    
    session.add(new_verdict)
    
    # Update candidate status based on verdict decision
    candidate_result = await session.execute(
        select(Candidate).filter(Candidate.id == round_obj.candidate_id)
    )
    candidate = candidate_result.scalars().first()
    
    if candidate:
        # Use the already-normalized decision
        if normalized_decision == "ADVANCE":
            # Promote to next round or final review
            if candidate.status in (
                CandidateStatus.AI_PASSED,
                CandidateStatus.AI_REVIEW,
                CandidateStatus.ROUND_2_IN_PROGRESS,
                CandidateStatus.ROUND_2_COMPLETED,
                CandidateStatus.INTERVIEW_SCHEDULED,
                CandidateStatus.INTERVIEW_COMPLETED,
            ):
                candidate.status = CandidateStatus.ELIGIBLE_ROUND_2
            else:
                candidate.status = CandidateStatus.FINAL_REVIEW
            logging.info(f"[Verdict] ADVANCE - Candidate {candidate.id} → {candidate.status.value}")
        elif normalized_decision == "REJECT":
            candidate.status = CandidateStatus.FAILED
            logging.info(f"[Verdict] REJECT - Candidate {candidate.id} → failed")
        elif normalized_decision == "HOLD":
            candidate.status = CandidateStatus.FINAL_REVIEW
            logging.info(f"[Verdict] HOLD - Candidate {candidate.id} → final_review")
        elif normalized_decision == "REASSESS":
            candidate.status = CandidateStatus.REVIEW
            logging.info(f"[Verdict] REASSESS - Candidate {candidate.id} → review")
    
    # Also mark round as having a verdict
    round_obj.status = RoundStatus.COMPLETED
    
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


# =============================================================================
# WebRTC Signaling Endpoints (P2P video without VideoSDK)
# =============================================================================

class SignalMessage(BaseModel):
    """WebRTC signaling message."""
    type: str  # "offer", "answer", "ice-candidate"
    data: dict  # SDP or ICE candidate data
    from_user: Optional[str] = None


@router.post("/rounds/{round_id}/signal")
async def post_signal(
    round_id: UUID,
    signal: SignalMessage,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """
    Post a WebRTC signaling message (offer, answer, or ICE candidate).
    Messages are stored in Redis with a 60s TTL for the peer to pick up.
    """
    from app.utils.redis_client import redis_client
    import json

    # Verify round exists and user has access
    result = await session.execute(
        select(InterviewRound).filter(InterviewRound.id == round_id)
    )
    round_obj = result.scalars().first()
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")

    user_id = str(current_user.id)
    # HR, EMPLOYEE, and SYSTEM_ADMIN are all interviewers; only CANDIDATE is candidate
    role = "interviewer" if current_user.role in (UserRole.EMPLOYEE, UserRole.HR, UserRole.SYSTEM_ADMIN) else "candidate"
    logger.info(f"[WebRTC Signal] User {user_id} role={current_user.role.value} -> {role}, signal type={signal.type}")
    
    # Store signal in Redis list for the OTHER party to pick up
    key = f"webrtc_signal:{round_id}:{role}"
    msg = json.dumps({
        "type": signal.type,
        "data": signal.data,
        "from_user": user_id,
        "from_role": role,
        "ts": datetime.now(timezone.utc).isoformat(),
    })
    
    if redis_client.client:
        await redis_client.client.rpush(key, msg)
        await redis_client.client.expire(key, 120)  # 2 min TTL
    
    return {"status": "ok"}


@router.get("/rounds/{round_id}/signal")
async def get_signals(
    round_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """
    Poll for WebRTC signaling messages from the peer.
    Returns all pending messages and clears them.
    """
    from app.utils.redis_client import redis_client
    import json

    # Verify round exists
    result = await session.execute(
        select(InterviewRound).filter(InterviewRound.id == round_id)
    )
    round_obj = result.scalars().first()
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")

    # HR, EMPLOYEE, and SYSTEM_ADMIN are all interviewers; only CANDIDATE is candidate
    role = "interviewer" if current_user.role in (UserRole.EMPLOYEE, UserRole.HR, UserRole.SYSTEM_ADMIN) else "candidate"
    # Read signals FROM the OTHER role
    peer_role = "candidate" if role == "interviewer" else "interviewer"
    key = f"webrtc_signal:{round_id}:{peer_role}"
    
    messages = []
    if redis_client.client:
        # Pop all messages atomically
        while True:
            raw = await redis_client.client.lpop(key)
            if raw is None:
                break
            try:
                messages.append(json.loads(raw))
            except json.JSONDecodeError:
                continue
    
    return {"messages": messages}


@router.post("/rounds/{round_id}/presence")
async def post_presence(
    round_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """Register presence in a round - lets other party know you're online."""
    from app.utils.redis_client import redis_client
    
    # HR, EMPLOYEE, and SYSTEM_ADMIN are all interviewers; only CANDIDATE is candidate
    role = "interviewer" if current_user.role in (UserRole.EMPLOYEE, UserRole.HR, UserRole.SYSTEM_ADMIN) else "candidate"
    key = f"webrtc_presence:{round_id}:{role}"
    logger.info(f"[WebRTC Presence] POST user={current_user.id} role={current_user.role.value} -> {role}")
    
    if redis_client.client:
        await redis_client.client.setex(key, 30, str(current_user.id))  # 30s TTL
    
    return {"status": "ok", "role": role}


@router.get("/rounds/{round_id}/presence")
async def get_presence(
    round_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """Check if the peer is online in this round."""
    from app.utils.redis_client import redis_client
    
    # HR, EMPLOYEE, and SYSTEM_ADMIN are all interviewers; only CANDIDATE is candidate
    role = "interviewer" if current_user.role in (UserRole.EMPLOYEE, UserRole.HR, UserRole.SYSTEM_ADMIN) else "candidate"
    peer_role = "candidate" if role == "interviewer" else "interviewer"
    logger.info(f"[WebRTC Presence] GET user={current_user.id} role={current_user.role.value} -> {role}, checking peer_role={peer_role}")
    
    peer_present = False
    if redis_client.client:
        val = await redis_client.client.get(f"webrtc_presence:{round_id}:{peer_role}")
        peer_present = val is not None
    
    return {"peer_online": peer_present, "my_role": role, "peer_role": peer_role}
