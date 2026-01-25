'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'

interface InterviewResult {
  interview_id: string
  round: string
  completed_at: string | null
  verdict: 'HIRE' | 'NEUTRAL' | 'REJECT' | 'PASS' | 'REVIEW' | 'FAIL' | null
  score: number | null
  summary: string | null
  behavior_score: number | null
  confidence_score: number | null
  answer_score: number | null
  feedback: string | null
  employee_verdict: string | null
  strengths?: string[]
  weaknesses?: string[]
  hiring_risk?: string | null
}

interface ResultsData {
  results: InterviewResult[]
  company_name: string
  position: string
  total_completed: number
  message?: string
}

export default function CandidateResultsPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const [data, setData] = useState<ResultsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchResults = async () => {
      if (authLoading) return

      if (!user) {
        router.push('/auth/login')
        return
      }

      if (user.role !== 'CANDIDATE') {
        router.push('/dashboard')
        return
      }

      try {
        const response = await apiClient.get<ResultsData>('/candidate-portal/my-results')
        setData(response)
      } catch (err: any) {
        console.error('Error fetching results:', err)
        setError(err.message || 'Failed to load interview results')
      } finally {
        setLoading(false)
      }
    }

    fetchResults()
  }, [user, authLoading, router])

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  const getVerdictColor = (verdict: string | null) => {
    switch (verdict?.toUpperCase()) {
      case 'PASS':
      case 'HIRE':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'REVIEW':
      case 'NEUTRAL':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'FAIL':
      case 'REJECT':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getVerdictIcon = (verdict: string | null) => {
    switch (verdict?.toUpperCase()) {
      case 'PASS':
      case 'HIRE':
        return (
          <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'REVIEW':
      case 'NEUTRAL':
        return (
          <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'FAIL':
      case 'REJECT':
        return (
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      default:
        return (
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }

  // Get progress bar color based on verdict
  const getScoreBarColor = (verdict: string | null) => {
    switch (verdict?.toUpperCase()) {
      case 'PASS':
      case 'HIRE':
        return 'bg-green-500'
      case 'REVIEW':
      case 'NEUTRAL':
        return 'bg-yellow-500'
      case 'FAIL':
      case 'REJECT':
        return 'bg-red-500'
      default:
        return 'bg-gray-400' // Pending/unknown - grey
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your results...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-100 text-red-700 px-6 py-4 rounded-lg">
            <p>{error}</p>
          </div>
          <button
            onClick={() => router.push('/candidate-portal')}
            className="mt-4 text-brand-600 hover:text-brand-800"
          >
            Back to Portal
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Interview Results</h1>
              <p className="text-sm text-gray-500 mt-1">
                {data?.company_name} - {data?.position}
              </p>
            </div>
            <button
              onClick={() => router.push('/candidate-portal')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Portal
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {!data?.results || data.results.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Results Yet</h2>
            <p className="text-gray-500">
              {data?.message || "You haven't completed any interviews yet. Check your upcoming interviews and complete them to see your results here."}
            </p>
            <button
              onClick={() => router.push('/candidate-portal')}
              className="mt-6 px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition"
            >
              View Upcoming Interviews
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Performance Summary</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {data.total_completed} interview{data.total_completed !== 1 ? 's' : ''} completed
                  </p>
                </div>
                <div className="flex gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {data.results.filter(r => r.verdict?.toUpperCase() === 'PASS' || r.verdict?.toUpperCase() === 'HIRE').length}
                    </div>
                    <div className="text-xs text-gray-500">Passed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {data.results.filter(r => r.verdict?.toUpperCase() === 'REVIEW' || r.verdict?.toUpperCase() === 'NEUTRAL' || !r.verdict).length}
                    </div>
                    <div className="text-xs text-gray-500">In Review</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {data.results.filter(r => r.verdict?.toUpperCase() === 'FAIL' || r.verdict?.toUpperCase() === 'REJECT').length}
                    </div>
                    <div className="text-xs text-gray-500">Not Passed</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Results List */}
            {data.results.map((result, index) => (
              <div key={result.interview_id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Result Header */}
                <div className={`px-6 py-4 border-b ${getVerdictColor(result.verdict)} border-l-4`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {getVerdictIcon(result.verdict)}
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 capitalize">
                          {result.round} Interview
                        </h3>
                        {result.completed_at && (
                          <p className="text-sm text-gray-500">
                            Completed on {new Date(result.completed_at).toLocaleDateString('en-US', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block px-4 py-2 rounded-full text-sm font-bold ${getVerdictColor(result.verdict)}`}>
                        {result.verdict || 'Pending'}
                      </span>
                      {result.score !== null && (
                        <div className="text-2xl font-bold text-gray-900 mt-1">
                          {result.score}%
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Result Details */}
                <div className="p-6">
                  {/* Score Breakdown - show if any scores exist or show pending state */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className="text-sm text-gray-500 mb-1">Behavior</div>
                      <div className="text-xl font-bold text-gray-900">
                        {result.behavior_score !== null ? `${result.behavior_score}%` : '-'}
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className={`h-2 rounded-full transition-all ${getScoreBarColor(result.verdict)}`}
                          style={{ width: `${result.behavior_score || 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className="text-sm text-gray-500 mb-1">Confidence</div>
                      <div className="text-xl font-bold text-gray-900">
                        {result.confidence_score !== null ? `${result.confidence_score}%` : '-'}
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className={`h-2 rounded-full transition-all ${getScoreBarColor(result.verdict)}`}
                          style={{ width: `${result.confidence_score || 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className="text-sm text-gray-500 mb-1">Answer Quality</div>
                      <div className="text-xl font-bold text-gray-900">
                        {result.answer_score !== null ? `${result.answer_score}%` : '-'}
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className={`h-2 rounded-full transition-all ${getScoreBarColor(result.verdict)}`}
                          style={{ width: `${result.answer_score || 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className="text-sm text-gray-500 mb-1">Overall</div>
                      <div className="text-xl font-bold text-gray-900">
                        {result.score !== null ? `${result.score}%` : '-'}
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className={`h-2 rounded-full transition-all ${getScoreBarColor(result.verdict)}`}
                          style={{ width: `${result.score || 0}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Pending Analysis Notice */}
                  {!result.verdict && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 flex items-center gap-3">
                      <svg className="w-5 h-5 text-gray-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-gray-600 text-sm">
                        AI analysis is being processed. Scores and feedback will appear shortly.
                      </p>
                    </div>
                  )}

                  {/* Summary */}
                  {result.summary && (
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Summary</h4>
                      <p className="text-gray-600 bg-gray-50 rounded-lg p-4">{result.summary}</p>
                    </div>
                  )}

                  {/* Strengths & Weaknesses */}
                  {(result.strengths?.length || result.weaknesses?.length) ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      {result.strengths && result.strengths.length > 0 && (
                        <div className="bg-green-50 border border-green-100 rounded-lg p-4">
                          <h4 className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Strengths
                          </h4>
                          <ul className="space-y-1">
                            {result.strengths.map((s, i) => (
                              <li key={i} className="text-sm text-green-700">• {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {result.weaknesses && result.weaknesses.length > 0 && (
                        <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
                          <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Areas for Improvement
                          </h4>
                          <ul className="space-y-1">
                            {result.weaknesses.map((w, i) => (
                              <li key={i} className="text-sm text-amber-700">• {w}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Feedback */}
                  {result.feedback && (
                    <div className="border-t border-gray-100 pt-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Detailed Feedback
                      </h4>
                      <p className="text-gray-600 leading-relaxed bg-gray-50 rounded-lg p-4">{result.feedback}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
