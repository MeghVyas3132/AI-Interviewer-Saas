"""
WebSocket handler for real-time AI insights during human-assisted interviews.

Handles:
- Interview room connections (interviewer + candidate)
- Audio/video chunk streaming to ML services via Redis Streams
- Real-time insight delivery from ML services
- Fraud alert broadcasting
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, Set, Optional
from uuid import UUID

from fastapi import WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.interview_round import InterviewRound, RoundStatus
from app.models.user import User
from app.utils.redis_client import redis_client

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages WebSocket connections for interview rooms.
    
    Supports:
    - Multiple participants per room (interviewer + candidate)
    - Role-based message routing (insights only to interviewers)
    - Room-based broadcasting
    """

    def __init__(self):
        # {round_id: {user_id: websocket}}
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
        # {round_id: {user_id: role}}  where role is 'interviewer' or 'candidate'
        self.user_roles: Dict[str, Dict[str, str]] = {}
        # Background task for Redis subscription
        self._subscriber_task: Optional[asyncio.Task] = None

    async def connect(
        self,
        websocket: WebSocket,
        round_id: str,
        user_id: str,
        role: str,  # 'interviewer' or 'candidate'
    ):
        """Accept WebSocket connection and add to room."""
        await websocket.accept()

        if round_id not in self.active_connections:
            self.active_connections[round_id] = {}
            self.user_roles[round_id] = {}

        self.active_connections[round_id][user_id] = websocket
        self.user_roles[round_id][user_id] = role

        logger.info(f"User {user_id} ({role}) connected to room {round_id}")

        # Notify room about new participant
        await self.broadcast_to_room(
            round_id,
            {
                "type": "participant_joined",
                "user_id": user_id,
                "role": role,
                "timestamp": datetime.utcnow().isoformat(),
            },
            exclude_user=user_id,
        )

    def disconnect(self, round_id: str, user_id: str):
        """Remove WebSocket connection from room."""
        if round_id in self.active_connections:
            if user_id in self.active_connections[round_id]:
                del self.active_connections[round_id][user_id]
                logger.info(f"User {user_id} disconnected from room {round_id}")

            if user_id in self.user_roles.get(round_id, {}):
                del self.user_roles[round_id][user_id]

            # Clean up empty rooms
            if not self.active_connections[round_id]:
                del self.active_connections[round_id]
                if round_id in self.user_roles:
                    del self.user_roles[round_id]

    async def broadcast_to_room(
        self,
        round_id: str,
        message: dict,
        exclude_user: Optional[str] = None,
    ):
        """Broadcast message to all participants in a room."""
        if round_id not in self.active_connections:
            return

        for user_id, websocket in self.active_connections[round_id].items():
            if exclude_user and user_id == exclude_user:
                continue
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.error(f"Failed to send to {user_id}: {e}")

    async def send_to_interviewers(self, round_id: str, message: dict):
        """Send message only to interviewers in a room (for AI insights)."""
        if round_id not in self.active_connections:
            return

        for user_id, websocket in self.active_connections[round_id].items():
            role = self.user_roles.get(round_id, {}).get(user_id)
            if role == "interviewer":
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.error(f"Failed to send insight to interviewer {user_id}: {e}")

    async def send_to_user(self, round_id: str, user_id: str, message: dict):
        """Send message to a specific user."""
        if round_id in self.active_connections:
            websocket = self.active_connections[round_id].get(user_id)
            if websocket:
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.error(f"Failed to send to {user_id}: {e}")

    def get_room_participants(self, round_id: str) -> list:
        """Get list of participants in a room."""
        if round_id not in self.active_connections:
            return []

        return [
            {"user_id": uid, "role": self.user_roles.get(round_id, {}).get(uid)}
            for uid in self.active_connections[round_id].keys()
        ]


# Global connection manager instance
manager = ConnectionManager()


async def publish_audio_chunk(round_id: str, audio_data: str, timestamp_ms: int, sample_rate: int = 16000):
    """
    Publish audio chunk to Redis Stream for ML services to consume.
    
    Args:
        round_id: Interview round ID
        audio_data: Base64 encoded audio data
        timestamp_ms: Timestamp in milliseconds from interview start
        sample_rate: Audio sample rate (default 16000)
    """
    stream_key = f"stream:audio:{round_id}"
    try:
        await redis_client.client.xadd(
            stream_key,
            {
                "chunk": audio_data,
                "timestamp": str(timestamp_ms),
                "sample_rate": str(sample_rate),
            },
            maxlen=1000,  # Keep last 1000 chunks (~2-3 minutes)
        )
        logger.debug(f"Published audio chunk to {stream_key}")
    except Exception as e:
        logger.error(f"Failed to publish audio chunk: {e}")


async def publish_video_frame(round_id: str, frame_data: str, timestamp_ms: int):
    """
    Publish video frame to Redis Stream for ML services.
    
    Args:
        round_id: Interview round ID
        frame_data: Base64 encoded JPEG frame
        timestamp_ms: Timestamp in milliseconds
    """
    stream_key = f"stream:video:{round_id}"
    try:
        await redis_client.client.xadd(
            stream_key,
            {
                "frame": frame_data,
                "timestamp": str(timestamp_ms),
            },
            maxlen=300,  # Keep last 300 frames (~60 seconds at 5fps)
        )
        logger.debug(f"Published video frame to {stream_key}")
    except Exception as e:
        logger.error(f"Failed to publish video frame: {e}")


async def subscribe_to_insights(round_id: str):
    """
    Subscribe to Redis Pub/Sub for insights from ML services.
    
    This runs in background and forwards insights to interviewers.
    """
    channel = f"insights:{round_id}"
    pubsub = redis_client.client.pubsub()
    
    try:
        await pubsub.subscribe(channel)
        logger.info(f"Subscribed to insights channel: {channel}")
        
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    insight_data = json.loads(message["data"])
                    # Forward to interviewers only
                    await manager.send_to_interviewers(
                        round_id,
                        {
                            "type": "insight",
                            "data": insight_data,
                            "timestamp": datetime.utcnow().isoformat(),
                        }
                    )
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON in insight: {message['data']}")
                except Exception as e:
                    logger.error(f"Error forwarding insight: {e}")
    except asyncio.CancelledError:
        logger.info(f"Insight subscription cancelled for {round_id}")
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.close()


async def handle_client_message(
    websocket: WebSocket,
    round_id: str,
    user_id: str,
    role: str,
    message: dict,
):
    """
    Handle incoming WebSocket messages from clients.
    
    Message types:
    - audio_chunk: Audio data from candidate's microphone
    - video_frame: Video frame from candidate's webcam
    - tab_visibility: Tab switch events (fraud detection)
    - chat: Chat messages between participants
    """
    msg_type = message.get("type")
    
    if msg_type == "audio_chunk" and role == "candidate":
        # Forward audio to ML services via Redis Stream
        await publish_audio_chunk(
            round_id,
            message.get("data", ""),
            message.get("timestamp_ms", 0),
            message.get("sample_rate", 16000),
        )
    
    elif msg_type == "video_frame" and role == "candidate":
        # Forward video frame to ML services
        await publish_video_frame(
            round_id,
            message.get("data", ""),
            message.get("timestamp_ms", 0),
        )
    
    elif msg_type == "tab_visibility":
        # Tab switch/focus events - forward to fraud detection
        if not message.get("visible", True):
            # Tab is hidden - potential fraud signal
            await redis_client.client.publish(
                f"fraud:{round_id}",
                json.dumps({
                    "type": "TAB_SWITCH",
                    "user_id": user_id,
                    "timestamp_ms": message.get("timestamp_ms", 0),
                    "visible": message.get("visible", True),
                }),
            )
            # Also notify interviewers immediately
            await manager.send_to_interviewers(
                round_id,
                {
                    "type": "fraud_alert",
                    "alert_type": "TAB_SWITCH",
                    "severity": "MEDIUM",
                    "message": "Candidate switched tabs or lost focus",
                    "timestamp": datetime.utcnow().isoformat(),
                }
            )
    
    elif msg_type == "chat":
        # Relay chat messages to all participants
        await manager.broadcast_to_room(
            round_id,
            {
                "type": "chat",
                "from_user": user_id,
                "from_role": role,
                "message": message.get("message", ""),
                "timestamp": datetime.utcnow().isoformat(),
            },
            exclude_user=None,  # Include sender so they see their own message
        )
    
    elif msg_type == "interview_control":
        # Interview control messages (start, pause, end)
        if role == "interviewer":
            action = message.get("action")
            await manager.broadcast_to_room(
                round_id,
                {
                    "type": "interview_control",
                    "action": action,
                    "timestamp": datetime.utcnow().isoformat(),
                }
            )
    
    elif msg_type == "ping":
        # Heartbeat
        await manager.send_to_user(
            round_id,
            user_id,
            {"type": "pong", "timestamp": datetime.utcnow().isoformat()},
        )
