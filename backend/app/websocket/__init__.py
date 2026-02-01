"""WebSocket module for real-time interview communication."""

from app.websocket.realtime_handler import (
    manager,
    ConnectionManager,
    publish_audio_chunk,
    publish_video_frame,
    subscribe_to_insights,
    handle_client_message,
)

__all__ = [
    "manager",
    "ConnectionManager",
    "publish_audio_chunk",
    "publish_video_frame",
    "subscribe_to_insights",
    "handle_client_message",
]
