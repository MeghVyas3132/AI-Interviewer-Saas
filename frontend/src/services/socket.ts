// WebSocket Service - Disabled in P2P mode
// Socket.io is NOT used - video signaling uses REST polling instead
// This file provides stub functions to prevent import errors

import type { Recommendation, MetricsSummary } from '@/types'

// ============== Connection Management ==============
export interface SocketConfig {
  token: string
  onConnect?: () => void
  onDisconnect?: (reason: string) => void
  onError?: (error: Error) => void
}

// Socket.io disabled - returns null
export const connectSocket = (_config: SocketConfig): null => {
  // Silently disabled - no console log to avoid noise
  return null
}

export const disconnectSocket = () => {
  // No-op - socket is disabled
}

export const getSocket = (): null => null

export const isSocketConnected = (): boolean => false

// ============== Interview Room Management ==============
export const joinInterviewRoom = (_roundId: string) => {
  // No-op - using REST polling instead
}

export const leaveInterviewRoom = (_roundId: string) => {
  // No-op - using REST polling instead
}

// ============== Media Stream Publishing ==============
export interface VideoFramePayload {
  roundId: string
  frame: string
  timestamp: number
}

export interface AudioChunkPayload {
  roundId: string
  chunk: string
  timestamp: number
  sampleRate?: number
}

export const sendVideoFrame = (_payload: VideoFramePayload) => {
  // No-op - socket disabled
}

export const sendAudioChunk = (_payload: AudioChunkPayload) => {
  // No-op - socket disabled
}

// ============== Event Types ==============
export interface Insight {
  id: string
  roundId: string
  category: 'fraud' | 'contradiction' | 'speech' | 'video'
  insightType: string
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

// ============== Event Listeners (no-op stubs) ==============
export type InsightHandler = (data: InsightBatch) => void
export type AlertHandler = (alert: Insight) => void
export type TranscriptHandler = (data: TranscriptUpdate) => void
export type MetricsHandler = (data: MetricsSummary) => void

export const onInsightAggregated = (_handler: InsightHandler) => () => {}
export const onInsight = (_handler: AlertHandler) => () => {}
export const onInsightAlert = (_handler: AlertHandler) => () => {}
export const onTranscriptUpdate = (_handler: TranscriptHandler) => () => {}
export const onMetricsSummary = (_handler: MetricsHandler) => () => {}

// ============== Utility ==============
export const emitEvent = (_event: string, _data: unknown) => false
