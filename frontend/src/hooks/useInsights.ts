// Custom hook for real-time AI insights via WebSocket
import { useState, useEffect, useCallback } from 'react'
import {
  getSocket,
  onInsightAggregated,
  onInsightAlert,
  onTranscriptUpdate,
  onMetricsSummary,
  joinInterviewRoom,
  leaveInterviewRoom,
  Insight,
  TranscriptUpdate,
} from '@/services/socket'
import type { Recommendation, MetricsSummary, FraudAlert } from '@/types'

interface UseInsightsOptions {
  roundId: string
  isInterviewer: boolean
  enabled?: boolean
}

interface UseInsightsReturn {
  insights: Insight[]
  alerts: Insight[]
  recommendations: Recommendation[]
  transcript: TranscriptUpdate[]
  metrics: MetricsSummary | null
  isConnected: boolean
  dismissAlert: (alertId: string) => void
  clearAlerts: () => void
}

export const useInsights = ({
  roundId,
  isInterviewer,
  enabled = true,
}: UseInsightsOptions): UseInsightsReturn => {
  const [insights, setInsights] = useState<Insight[]>([])
  const [alerts, setAlerts] = useState<Insight[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [transcript, setTranscript] = useState<TranscriptUpdate[]>([])
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // Join room on mount
  useEffect(() => {
    if (!enabled || !isInterviewer) return

    const socket = getSocket()
    if (socket?.connected) {
      joinInterviewRoom(roundId)
      setIsConnected(true)
    }

    return () => {
      leaveInterviewRoom(roundId)
    }
  }, [roundId, isInterviewer, enabled])

  // Listen for aggregated insights
  useEffect(() => {
    if (!enabled || !isInterviewer) return

    const unsubscribe = onInsightAggregated((data) => {
      // Update insights (keep last 50)
      setInsights((prev) => [...data.insights, ...prev].slice(0, 50))

      // Extract alerts
      const newAlerts = data.insights.filter((i) => i.isAlert)
      setAlerts((prev) => [...newAlerts, ...prev].slice(0, 10))

      // Update recommendations
      if (data.recommendations) {
        setRecommendations(data.recommendations)
      }
    })

    return unsubscribe
  }, [roundId, isInterviewer, enabled])

  // Listen for real-time alerts
  useEffect(() => {
    if (!enabled || !isInterviewer) return

    const unsubscribe = onInsightAlert((alert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 10))
    })

    return unsubscribe
  }, [roundId, isInterviewer, enabled])

  // Listen for transcript updates
  useEffect(() => {
    if (!enabled || !isInterviewer) return

    const unsubscribe = onTranscriptUpdate((update) => {
      setTranscript((prev) => [...prev, update].slice(-100))
    })

    return unsubscribe
  }, [roundId, isInterviewer, enabled])

  // Listen for metrics summaries
  useEffect(() => {
    if (!enabled || !isInterviewer) return

    const unsubscribe = onMetricsSummary((summary) => {
      setMetrics(summary)
    })

    return unsubscribe
  }, [roundId, isInterviewer, enabled])

  const dismissAlert = useCallback((alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId))
  }, [])

  const clearAlerts = useCallback(() => {
    setAlerts([])
  }, [])

  return {
    insights,
    alerts,
    recommendations,
    transcript,
    metrics,
    isConnected,
    dismissAlert,
    clearAlerts,
  }
}
