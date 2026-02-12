'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import { useSocket } from '@/hooks/useSocket'
import { useInsights } from '@/hooks/useInsights'
import { useAIMetricsStore } from '@/store/realtime'
import type { AIMetrics, LiveInsight, Recommendation } from '@/types'
import Cookies from 'js-cookie'

// Dynamically import VideoSDK component to avoid SSR issues
const InterviewerMeeting = dynamic(
  () => import('@/components/video/InterviewerMeeting'),
  { ssr: false, loading: () => <LoadingSpinner /> }
)

function LoadingSpinner() {
  return (
    <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-white">Loading video meeting...</p>
      </div>
    </div>
  )
}

interface RoundData {
  id: string
  interview_id: string
  round_number: number
  status: string
  interview_mode: string
  videosdk_meeting_id: string
  videosdk_token: string
  candidate_name?: string
  scheduled_at?: string
}

export default function HumanAssistedInterviewPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const roundId = params.roundId as string
  
  const [roundData, setRoundData] = useState<RoundData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resumeUrl, setResumeUrl] = useState<string | undefined>(undefined)

  // Get auth token for socket connection
  const authToken = typeof window !== 'undefined' ? Cookies.get('access_token') || null : null

  // Socket connection for real-time insights
  const { isConnected: socketConnected, error: socketError } = useSocket({
    token: authToken || '',
    autoConnect: !!authToken && !!roundData,
  })

  // Real-time AI insights
  const { 
    insights: liveInsights, 
    alerts, 
    recommendations, 
    metrics: liveMetrics,
    transcript 
  } = useInsights({
    roundId,
    isInterviewer: true,
    enabled: socketConnected,
  })

  // Zustand store for metrics
  const { metrics: storeMetrics, setInsights, setRecommendations } = useAIMetricsStore()

  // Auth check
  useEffect(() => {
    if (!authLoading && user?.role !== 'EMPLOYEE') {
      router.push('/dashboard')
    }
  }, [authLoading, user, router])

  // Sync insights to store
  useEffect(() => {
    if (liveInsights.length > 0) {
      setInsights(liveInsights as unknown as LiveInsight[])
    }
  }, [liveInsights, setInsights])

  useEffect(() => {
    if (recommendations.length > 0) {
      setRecommendations(recommendations)
    }
  }, [recommendations, setRecommendations])

  // Fetch round data
  useEffect(() => {
    const fetchRound = async () => {
      if (!roundId || authLoading || user?.role !== 'EMPLOYEE') return

      try {
        setLoading(true)
        setError(null)

        // Fetch round details with video credentials
        const round = await apiClient.get<RoundData>(`/realtime/rounds/${roundId}/token`)
        
        if (!round.videosdk_meeting_id) {
          throw new Error('Meeting not available. Please ensure the interview is set up correctly.')
        }

        // Verify this is a human-AI-assisted interview
        if (round.interview_mode !== 'HUMAN_AI_ASSISTED') {
          throw new Error('This interview is not configured for human-AI-assisted mode.')
        }

        setRoundData(round)
        
        // Fetch resume URL if available
        try {
          const resumeResponse = await apiClient.get<{ url: string }>(`/candidates/resume/${round.id}`)
          if (resumeResponse.url) {
            setResumeUrl(resumeResponse.url)
          }
        } catch {
          // Resume not available, continue without it
          console.log('[HumanAssistedInterview] No resume found for this candidate')
        }

        // Start the interview round
        try {
          await apiClient.post(`/realtime/rounds/${roundId}/start`, {})
        } catch {
          // Already started or error - continue anyway
        }

      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load interview'
        setError(errorMessage)
        console.error('[HumanAssistedInterview] Error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRound()
  }, [roundId, authLoading, user])

  // Handle leave meeting
  const handleLeave = useCallback(async () => {
    try {
      // End the interview round
      await apiClient.post(`/realtime/rounds/${roundId}/end`, {})
    } catch (err) {
      console.error('[HumanAssistedInterview] Error ending round:', err)
    }
    
    // Navigate to verdict page or dashboard
    router.push(`/employee-interviews/verdict/${roundId}`)
  }, [roundId, router])

  // Convert live metrics to AIMetrics format
  const displayMetrics: AIMetrics = liveMetrics ? {
    speechConfidence: liveMetrics.speechConfidence || 0,
    engagementScore: liveMetrics.engagementScore || 0,
    hesitationsCount: liveMetrics.hesitationCount || 0,
    avgResponseTime: liveMetrics.avgResponseTime || 0,
    headMovement: liveMetrics.headMovementScore > 70 ? 'stable' : 
                  liveMetrics.headMovementScore > 40 ? 'moderate' : 'unstable',
    videoQuality: liveMetrics.videoQualityScore > 70 ? 'good' : 
                  liveMetrics.videoQualityScore > 40 ? 'fair' : 'poor',
    authenticity: liveMetrics.authenticityScore > 80 ? 'verified' : 
                  liveMetrics.authenticityScore > 50 ? 'suspicious' : 'alert',
  } : storeMetrics

  // Loading state
  if (loading || authLoading) {
    return <LoadingSpinner />
  }

  // Error state
  if (error) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Unable to Join Interview</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => router.push('/employee-interviews')}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  // No round data
  if (!roundData) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <p>Interview not found</p>
          <button
            onClick={() => router.push('/employee-interviews')}
            className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Connection Status Indicator */}
      {!socketConnected && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-500/90 text-black px-4 py-2 rounded-full text-sm flex items-center gap-2">
          <div className="w-2 h-2 bg-amber-800 rounded-full animate-pulse" />
          AI insights connecting...
        </div>
      )}

      {/* Alert Banner for High Priority Alerts */}
      {alerts.length > 0 && alerts[0].isAlert && (
        <div className="fixed top-4 right-4 z-50 max-w-sm">
          <div className="bg-red-500/90 text-white px-4 py-3 rounded-lg shadow-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <div className="font-medium">{alerts[0].title}</div>
                <div className="text-sm opacity-90">{alerts[0].description}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Meeting Component */}
      <InterviewerMeeting
        meetingId={roundData.videosdk_meeting_id}
        token={roundData.videosdk_token}
        participantName={user?.full_name || 'Interviewer'}
        roundId={roundId}
        insights={liveInsights as unknown as LiveInsight[]}
        recommendations={recommendations}
        metrics={displayMetrics}
        resumeUrl={resumeUrl}
        onLeave={handleLeave}
      />
    </>
  )
}
