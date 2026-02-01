// WebSocket Service - Socket.io client for real-time communication with FastAPI backend
import { io, Socket } from 'socket.io-client'
import type { InsightType, LiveInsight, Recommendation, MetricsSummary } from '@/types'

// Socket instance
let socket: Socket | null = null

// Socket URL - connects to FastAPI WebSocket endpoint
const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ============== Connection Management ==============
export interface SocketConfig {
  token: string
  onConnect?: () => void
  onDisconnect?: (reason: string) => void
  onError?: (error: Error) => void
}

export const connectSocket = (config: SocketConfig): Socket => {
  if (socket?.connected) {
    return socket
  }
  
  socket = io(SOCKET_URL, {
    auth: { token: config.token },
    path: '/ws/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000,
  })
  
  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id)
    config.onConnect?.()
  })
  
  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason)
    config.onDisconnect?.(reason)
  })
  
  socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error)
    config.onError?.(error)
  })
  
  socket.on('error', (error) => {
    console.error('[Socket] Error:', error)
    config.onError?.(error)
  })
  
  return socket
}

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export const getSocket = (): Socket | null => socket

export const isSocketConnected = (): boolean => socket?.connected ?? false

// ============== Interview Room Management ==============
export const joinInterviewRoom = (roundId: string) => {
  if (!socket?.connected) {
    console.warn('[Socket] Not connected, cannot join room')
    return
  }
  socket.emit('interview:join', { roundId })
  console.log('[Socket] Joined interview room:', roundId)
}

export const leaveInterviewRoom = (roundId: string) => {
  if (!socket?.connected) {
    return
  }
  socket.emit('interview:leave', { roundId })
  console.log('[Socket] Left interview room:', roundId)
}

// ============== Media Stream Publishing ==============
export interface VideoFramePayload {
  roundId: string
  frame: string // Base64 encoded JPEG
  timestamp: number
}

export interface AudioChunkPayload {
  roundId: string
  chunk: string // Base64 encoded audio
  timestamp: number
  sampleRate?: number
}

export const sendVideoFrame = (payload: VideoFramePayload) => {
  if (!socket?.connected) return
  socket.emit('video:frame', payload)
}

export const sendAudioChunk = (payload: AudioChunkPayload) => {
  if (!socket?.connected) return
  socket.emit('audio:chunk', payload)
}

// ============== Event Types ==============
export interface Insight {
  id: string
  roundId: string
  category: 'fraud' | 'contradiction' | 'speech' | 'video'
  insightType: InsightType
  severity: 'low' | 'medium' | 'high' | 'info' | 'warning' | 'alert'
  confidence: number
  title: string
  description: string
  evidence?: string[]
  sourceServices?: string[]
  followupQuestions?: string[]
  isAlert: boolean
  createdAt?: string
  timestampMs?: number
  metrics?: Record<string, unknown>
}

export interface InsightBatch {
  insights: Insight[]
  recommendations: Recommendation[]
  summary?: {
    totalInsights: number
    alertCount: number
    topCategory: string
  }
}

export interface TranscriptUpdate {
  roundId: string
  speaker: 'interviewer' | 'candidate'
  text: string
  timestamp: number
  confidence: number
  isFinal: boolean
}

// ============== Event Listeners ==============
export type InsightHandler = (data: InsightBatch) => void
export type AlertHandler = (alert: Insight) => void
export type TranscriptHandler = (data: TranscriptUpdate) => void
export type MetricsHandler = (data: MetricsSummary) => void

export const onInsightAggregated = (handler: InsightHandler) => {
  if (!socket) return () => {}
  socket.on('insight:aggregated', handler)
  return () => socket?.off('insight:aggregated', handler)
}

// Listen for individual insights (dev mode and real-time)
export const onInsight = (handler: AlertHandler) => {
  if (!socket) return () => {}
  socket.on('insight', handler)
  return () => socket?.off('insight', handler)
}

export const onInsightAlert = (handler: AlertHandler) => {
  if (!socket) return () => {}
  socket.on('insight:alert', handler)
  return () => socket?.off('insight:alert', handler)
}

export const onTranscriptUpdate = (handler: TranscriptHandler) => {
  if (!socket) return () => {}
  socket.on('transcript:update', handler)
  return () => socket?.off('transcript:update', handler)
}

export const onMetricsSummary = (handler: MetricsHandler) => {
  if (!socket) return () => {}
  socket.on('metrics:summary', handler)
  return () => socket?.off('metrics:summary', handler)
}

// ============== Utility ==============
export const emitEvent = (event: string, data: unknown) => {
  if (!socket?.connected) {
    console.warn('[Socket] Not connected, cannot emit event:', event)
    return false
  }
  socket.emit(event, data)
  return true
}
