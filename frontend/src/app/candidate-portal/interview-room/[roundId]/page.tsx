'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'

// Dynamically import VideoSDK component to avoid SSR issues
const CandidateMeeting = dynamic(
  () => import('@/components/video/CandidateMeeting'),
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
  round_type: string
  status: string
  interview_mode: string
  videosdk_meeting_id?: string | null
  videosdk_token?: string | null
  scheduled_at?: string
  interviewer_name?: string
  company_name?: string
}

export default function CandidateInterviewRoomPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const roundId = params.roundId as string
  
  const [roundData, setRoundData] = useState<RoundData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Auth check
  useEffect(() => {
    if (!authLoading && user?.role !== 'CANDIDATE') {
      router.push('/login')
    }
  }, [authLoading, user, router])

  // Fetch round data
  useEffect(() => {
    const fetchRound = async () => {
      if (!roundId || authLoading || user?.role !== 'CANDIDATE') return

      try {
        setLoading(true)
        setError(null)

        // Fetch round details with video credentials for candidate
        const round = await apiClient.get<RoundData>(`/candidate-portal/interview-round/${roundId}`)
        
        // P2P WebRTC doesn't require VideoSDK credentials - roundId is sufficient
        // The InterviewerMeeting component handles signaling via REST polling

        setRoundData(round)

      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load interview'
        setError(errorMessage)
        console.error('[CandidateInterviewRoom] Error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRound()
  }, [roundId, authLoading, user])

  // Handle leave meeting
  const handleLeave = useCallback(async () => {
    // Navigate back to candidate portal
    router.push('/candidate-portal')
  }, [router])

  // Loading state
  if (loading || authLoading) {
    return <LoadingSpinner />
  }

  // Error state
  if (error) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Interview Not Ready</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => router.push('/candidate-portal')}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Back to Portal
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
            onClick={() => router.push('/candidate-portal')}
            className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            Back to Portal
          </button>
        </div>
      </div>
    )
  }

  return (
    <CandidateMeeting
      meetingId={roundId}
      token="p2p-no-token-needed"
      participantName={user?.full_name || 'Candidate'}
      roundId={roundId}
      companyName={roundData.company_name}
      onLeave={handleLeave}
    />
  )
}
