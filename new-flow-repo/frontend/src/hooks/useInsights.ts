// Custom hook for real-time AI insights via WebSocket
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSocket,
  onInsightAggregated,
  onInsightAlert,
  onTranscriptUpdate,
  onMetricsSummary,
  joinInterviewRoom,
  leaveInterviewRoom,
  Insight,
  Recommendation,
  TranscriptUpdate,
  MetricsSummary,
} from '@/services/socket';
import { useAIMetricsStore } from '@/store';

interface UseInsightsOptions {
  roundId: string;
  isInterviewer: boolean;
  enabled?: boolean;
}

interface UseInsightsReturn {
  insights: Insight[];
  alerts: Insight[];
  recommendations: Recommendation[];
  transcript: TranscriptUpdate[];
  metrics: MetricsSummary | null;
  isConnected: boolean;
  dismissAlert: (alertId: string) => void;
  clearAlerts: () => void;
}

export const useInsights = ({
  roundId,
  isInterviewer,
  enabled = true,
}: UseInsightsOptions): UseInsightsReturn => {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [alerts, setAlerts] = useState<Insight[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [transcript, setTranscript] = useState<TranscriptUpdate[]>([]);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  const { updateMetrics, addFraudAlert, addTranscriptSegment } = useAIMetricsStore();

  // Join room on mount
  useEffect(() => {
    if (!enabled || !isInterviewer) return;

    const socket = getSocket();
    if (socket?.connected) {
      joinInterviewRoom(roundId);
      setIsConnected(true);
    }

    return () => {
      leaveInterviewRoom(roundId);
    };
  }, [roundId, isInterviewer, enabled]);

  // Listen for aggregated insights
  useEffect(() => {
    if (!enabled || !isInterviewer) return;

    const unsubscribe = onInsightAggregated((data) => {
      // Update insights (keep last 50)
      setInsights((prev) => [...data.insights, ...prev].slice(0, 50));

      // Extract alerts
      const newAlerts = data.insights.filter((i) => i.isAlert);
      setAlerts((prev) => [...newAlerts, ...prev].slice(0, 10));

      // Update recommendations
      if (data.recommendations) {
        setRecommendations(data.recommendations);
      }

      // Update store for backward compatibility
      data.insights.forEach((insight) => {
        if (insight.category === 'fraud') {
          addFraudAlert({
            id: insight.id,
            type: insight.insightType as any,
            message: insight.description,
            timestampMs: Date.now(),
            severity: insight.severity === 'high' ? 'alert' : 'warning',
          });
        }
      });
    });

    return unsubscribe;
  }, [roundId, isInterviewer, enabled, addFraudAlert]);

  // Listen for real-time alerts
  useEffect(() => {
    if (!enabled || !isInterviewer) return;

    const unsubscribe = onInsightAlert((alert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 10));
      
      // Also add to fraud alerts if applicable
      if (alert.category === 'fraud') {
        addFraudAlert({
          id: alert.id,
          type: alert.insightType as any,
          message: alert.description,
          timestampMs: Date.now(),
          severity: alert.severity === 'high' ? 'alert' : 'warning',
        });
      }
    });

    return unsubscribe;
  }, [roundId, isInterviewer, enabled, addFraudAlert]);

  // Listen for transcript updates
  useEffect(() => {
    if (!enabled || !isInterviewer) return;

    const unsubscribe = onTranscriptUpdate((data) => {
      if (data.isFinal) {
        setTranscript((prev) => [...prev, data].slice(-100));
        
        // Update store
        addTranscriptSegment({
          id: `${data.timestamp}`,
          speaker: data.speaker,
          text: data.text,
          startMs: data.timestamp,
          endMs: data.timestamp,
          confidence: data.confidence,
        });
      }
    });

    return unsubscribe;
  }, [roundId, isInterviewer, enabled, addTranscriptSegment]);

  // Listen for metrics summary
  useEffect(() => {
    if (!enabled || !isInterviewer) return;

    const unsubscribe = onMetricsSummary((data) => {
      setMetrics(data);
      
      // Update store
      updateMetrics({
        speechConfidence: data.speechConfidence,
        hesitationsCount: data.hesitationCount,
        avgResponseTime: data.avgResponseTime,
        headMovement: data.headMovementScore > 0.7 ? 'stable' : data.headMovementScore > 0.4 ? 'moderate' : 'unstable',
        videoQuality: data.videoQualityScore > 0.7 ? 'good' : data.videoQualityScore > 0.4 ? 'fair' : 'poor',
        authenticity: data.authenticityScore > 0.8 ? 'verified' : data.authenticityScore > 0.5 ? 'suspicious' : 'alert',
      });
    });

    return unsubscribe;
  }, [roundId, isInterviewer, enabled, updateMetrics]);

  // Dismiss alert
  const dismissAlert = useCallback((alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  // Clear all alerts
  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  return {
    insights,
    alerts,
    recommendations,
    transcript,
    metrics,
    isConnected,
    dismissAlert,
    clearAlerts,
  };
};
