// WebSocket Service - Socket.io client for real-time communication
import { io, Socket } from 'socket.io-client';
import type { InsightType } from '@/types';

// Socket instance
let socket: Socket | null = null;

// Socket URL - connects to API Gateway WebSocket
const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

// ============== Connection Management ==============
export interface SocketConfig {
  token: string;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: Error) => void;
}

export const connectSocket = (config: SocketConfig): Socket => {
  if (socket?.connected) {
    return socket;
  }
  
  socket = io(SOCKET_URL, {
    auth: { token: config.token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000,
  });
  
  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
    config.onConnect?.();
  });
  
  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
    config.onDisconnect?.(reason);
  });
  
  socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error);
    config.onError?.(error);
  });
  
  socket.on('error', (error) => {
    console.error('[Socket] Error:', error);
    config.onError?.(error);
  });
  
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = (): Socket | null => socket;

export const isSocketConnected = (): boolean => socket?.connected ?? false;

// ============== Interview Room Management ==============
export const joinInterviewRoom = (roundId: string) => {
  if (!socket?.connected) {
    console.warn('[Socket] Not connected, cannot join room');
    return;
  }
  socket.emit('interview:join', { roundId });
  console.log('[Socket] Joined interview room:', roundId);
};

export const leaveInterviewRoom = (roundId: string) => {
  if (!socket?.connected) {
    return;
  }
  socket.emit('interview:leave', { roundId });
  console.log('[Socket] Left interview room:', roundId);
};

// ============== Media Stream Publishing ==============
export interface VideoFramePayload {
  roundId: string;
  frame: string; // Base64 encoded JPEG
  timestamp: number;
}

export interface AudioChunkPayload {
  roundId: string;
  chunk: string; // Base64 encoded audio
  timestamp: number;
  sampleRate?: number;
}

export const sendVideoFrame = (payload: VideoFramePayload) => {
  if (!socket?.connected) return;
  socket.emit('video:frame', payload);
};

export const sendAudioChunk = (payload: AudioChunkPayload) => {
  if (!socket?.connected) return;
  socket.emit('audio:chunk', payload);
};

// ============== Event Types ==============
export interface Insight {
  id: string;
  roundId: string;
  category: 'fraud' | 'contradiction' | 'speech' | 'video';
  insightType: InsightType;
  severity: 'low' | 'medium' | 'high' | 'info' | 'warning' | 'alert';
  confidence: number;
  title: string;
  description: string;
  evidence?: string[];
  sourceServices?: string[];
  followupQuestions?: string[];
  isAlert: boolean;
  createdAt?: string;
  timestampMs?: number;
  metrics?: Record<string, any>;
}

export interface Recommendation {
  type: 'action' | 'clarification' | 'observation';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  suggestedQuestions?: string[];
  suggestedActions?: string[];
  relatedInsightId?: string;
}

export interface InsightBatch {
  insights: Insight[];
  recommendations: Recommendation[];
  summary?: {
    totalInsights: number;
    alertCount: number;
    topCategory: string;
  };
}

export interface TranscriptUpdate {
  roundId: string;
  speaker: 'interviewer' | 'candidate';
  text: string;
  timestamp: number;
  confidence: number;
  isFinal: boolean;
}

export interface MetricsSummary {
  speechConfidence: number;
  hesitationCount: number;
  avgResponseTime: number;
  headMovementScore: number;
  videoQualityScore: number;
  authenticityScore: number;
  engagementScore?: number;
}

// ============== Event Listeners ==============
export type InsightHandler = (data: InsightBatch) => void;
export type AlertHandler = (alert: Insight) => void;
export type TranscriptHandler = (data: TranscriptUpdate) => void;
export type MetricsHandler = (data: MetricsSummary) => void;

export const onInsightAggregated = (handler: InsightHandler) => {
  if (!socket) return () => {};
  socket.on('insight:aggregated', handler);
  return () => socket?.off('insight:aggregated', handler);
};

// Listen for individual insights (dev mode and real-time)
export const onInsight = (handler: AlertHandler) => {
  if (!socket) return () => {};
  socket.on('insight', handler);
  return () => socket?.off('insight', handler);
};

export const onInsightAlert = (handler: AlertHandler) => {
  if (!socket) return () => {};
  socket.on('insight:alert', handler);
  return () => socket?.off('insight:alert', handler);
};

export const onTranscriptUpdate = (handler: TranscriptHandler) => {
  if (!socket) return () => {};
  socket.on('transcript:update', handler);
  return () => socket?.off('transcript:update', handler);
};

export const onMetricsSummary = (handler: MetricsHandler) => {
  if (!socket) return () => {};
  socket.on('metrics:summary', handler);
  return () => socket?.off('metrics:summary', handler);
};

// ============== Participant Events ==============
export interface ParticipantEvent {
  participantId: string;
  participantName: string;
  role: 'interviewer' | 'candidate';
}

export const onParticipantJoined = (handler: (data: ParticipantEvent) => void) => {
  if (!socket) return () => {};
  socket.on('participant:joined', handler);
  return () => socket?.off('participant:joined', handler);
};

export const onParticipantLeft = (handler: (data: ParticipantEvent) => void) => {
  if (!socket) return () => {};
  socket.on('participant:left', handler);
  return () => socket?.off('participant:left', handler);
};

// ============== Interview Control Events ==============
export const onInterviewStarted = (handler: (data: { roundId: string; startedAt: string }) => void) => {
  if (!socket) return () => {};
  socket.on('interview:started', handler);
  return () => socket?.off('interview:started', handler);
};

export const onInterviewEnded = (handler: (data: { roundId: string; endedAt: string }) => void) => {
  if (!socket) return () => {};
  socket.on('interview:ended', handler);
  return () => socket?.off('interview:ended', handler);
};

// ============== Emit Events ==============
export const emitInterviewStart = (roundId: string) => {
  socket?.emit('interview:start', { roundId });
};

export const emitInterviewEnd = (roundId: string) => {
  socket?.emit('interview:end', { roundId });
};

// ============== WebRTC Signaling ==============
// These functions enable peer-to-peer video between candidate and interviewer

export const sendWebRTCOffer = (roundId: string, offer: RTCSessionDescriptionInit) => {
  if (!socket?.connected) return;
  socket.emit('webrtc:offer', { roundId, offer });
  console.log('[WebRTC] Sent offer');
};

export const sendWebRTCAnswer = (roundId: string, answer: RTCSessionDescriptionInit) => {
  if (!socket?.connected) return;
  socket.emit('webrtc:answer', { roundId, answer });
  console.log('[WebRTC] Sent answer');
};

export const sendWebRTCIceCandidate = (roundId: string, candidate: RTCIceCandidate) => {
  if (!socket?.connected) return;
  socket.emit('webrtc:ice-candidate', { roundId, candidate: candidate.toJSON() });
};

export const sendWebRTCReady = (roundId: string) => {
  if (!socket?.connected) return;
  socket.emit('webrtc:ready', { roundId });
  console.log('[WebRTC] Signaled ready');
};

export interface WebRTCOfferEvent {
  offer: RTCSessionDescriptionInit;
  fromUserId: string;
  fromRole: string;
}

export interface WebRTCAnswerEvent {
  answer: RTCSessionDescriptionInit;
  fromUserId: string;
  fromRole: string;
}

export interface WebRTCIceCandidateEvent {
  candidate: RTCIceCandidateInit;
  fromUserId: string;
}

export interface WebRTCPeerReadyEvent {
  userId: string;
  role: string;
}

export const onWebRTCOffer = (handler: (data: WebRTCOfferEvent) => void) => {
  if (!socket) return () => {};
  socket.on('webrtc:offer', handler);
  return () => socket?.off('webrtc:offer', handler);
};

export const onWebRTCAnswer = (handler: (data: WebRTCAnswerEvent) => void) => {
  if (!socket) return () => {};
  socket.on('webrtc:answer', handler);
  return () => socket?.off('webrtc:answer', handler);
};

export const onWebRTCIceCandidate = (handler: (data: WebRTCIceCandidateEvent) => void) => {
  if (!socket) return () => {};
  socket.on('webrtc:ice-candidate', handler);
  return () => socket?.off('webrtc:ice-candidate', handler);
};

export const onWebRTCPeerReady = (handler: (data: WebRTCPeerReadyEvent) => void) => {
  if (!socket) return () => {};
  socket.on('webrtc:peer-ready', handler);
  return () => socket?.off('webrtc:peer-ready', handler);
};
