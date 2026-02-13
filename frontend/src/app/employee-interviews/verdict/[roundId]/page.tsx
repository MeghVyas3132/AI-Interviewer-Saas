'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import type { HumanVerdict, InterviewSummary } from '@/types'

interface RoundSummary {
  round_id: string
  candidate_name?: string
  summary?: InterviewSummary
  transcript_count: number
  insights_count: number
  fraud_alerts_count: number
}

export default function VerdictPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const roundId = params.roundId as string

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [summary, setSummary] = useState<RoundSummary | null>(null)

  // Form state
  const [verdict, setVerdict] = useState<HumanVerdict>({
    roundId,
    interviewerId: user?.id || '',
    decision: 'pending',
    communicationScore: 0,
    technicalScore: 0,
    problemSolvingScore: 0,
    cultureFitScore: 0,
    strengths: [],
    improvements: [],
    feedback: '',
    aiAlignment: 'agreed',
  })

  const [strengthInput, setStrengthInput] = useState('')
  const [improvementInput, setImprovementInput] = useState('')

  // Auth check - HR, EMPLOYEE, and SYSTEM_ADMIN can submit verdicts
  const allowedRoles = ['HR', 'EMPLOYEE', 'SYSTEM_ADMIN']
  useEffect(() => {
    if (!authLoading && !allowedRoles.includes(user?.role || '')) {
      router.push('/dashboard')
    }
  }, [authLoading, user, router])

  // Fetch summary data
  useEffect(() => {
    const fetchSummary = async () => {
      if (!roundId || authLoading) return

      try {
        setLoading(true)
        const data = await apiClient.get<RoundSummary>(`/realtime/rounds/${roundId}/summary`)
        setSummary(data)
        setVerdict(v => ({ ...v, interviewerId: user?.id || '' }))
      } catch (err: unknown) {
        // 404 is expected when no AI summary exists (e.g. human-only rounds)
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status !== 404) {
          console.error('[VerdictPage] Error fetching summary:', err)
        }
        // Continue without summary - verdict form works independently
      } finally {
        setLoading(false)
      }
    }

    fetchSummary()
  }, [roundId, authLoading, user])

  const addStrength = () => {
    if (strengthInput.trim()) {
      setVerdict(v => ({ ...v, strengths: [...v.strengths, strengthInput.trim()] }))
      setStrengthInput('')
    }
  }

  const removeStrength = (index: number) => {
    setVerdict(v => ({ ...v, strengths: v.strengths.filter((_, i) => i !== index) }))
  }

  const addImprovement = () => {
    if (improvementInput.trim()) {
      setVerdict(v => ({ ...v, improvements: [...(v.improvements || []), improvementInput.trim()] }))
      setImprovementInput('')
    }
  }

  const removeImprovement = (index: number) => {
    setVerdict(v => ({ ...v, improvements: v.improvements?.filter((_, i) => i !== index) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (verdict.decision === 'pending') {
      setError('Please select a decision')
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      // Map frontend decision values to backend-expected values
      const decisionMap: Record<string, string> = {
        'proceed': 'ADVANCE',
        'reject': 'REJECT',
        'on_hold': 'HOLD',
        'needs_discussion': 'REASSESS',
      }

      // Compute overall rating (1-5 scale) from individual scores (1-10 scale)
      const scores = [
        verdict.technicalScore,
        verdict.communicationScore,
        verdict.problemSolvingScore || 0,
        verdict.cultureFitScore || 0,
      ].filter(s => s > 0)
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
      // Only set overall_rating if we have scores; null is accepted, but 0 fails ge=1 validation
      const overallRating = scores.length > 0 ? Math.min(5, Math.max(1, Math.round(avgScore / 2))) : null

      // Build payload matching backend VerdictCreate schema
      const payload = {
        decision: decisionMap[verdict.decision] || 'HOLD',
        overall_rating: overallRating,
        // Primary format: criteria_scores + notes
        criteria_scores: scores.length > 0 ? {
          technical: verdict.technicalScore || 0,
          communication: verdict.communicationScore || 0,
          problem_solving: verdict.problemSolvingScore || 0,
          culture_fit: verdict.cultureFitScore || 0,
        } : null,
        notes: verdict.feedback || null,
        ai_insights_helpful: verdict.aiAlignment === 'agreed' ? true : verdict.aiAlignment === 'disagreed' ? false : null,
        ai_feedback_notes: verdict.aiAlignment !== 'agreed' ? `AI alignment: ${verdict.aiAlignment}` : null,
        // Alternative format: separate arrays for strengths/improvements
        strengths: verdict.strengths || [],
        improvements: verdict.improvements || [],
        feedback: verdict.feedback || null,
        ratings: scores.length > 0 ? {
          technical: Number(verdict.technicalScore) || 0,
          communication: Number(verdict.communicationScore) || 0,
          problem_solving: Number(verdict.problemSolvingScore) || 0,
          culture_fit: Number(verdict.cultureFitScore) || 0,
        } : null,
      }

      console.log('[VerdictPage] Submitting payload:', JSON.stringify(payload, null, 2))
      await apiClient.post(`/realtime/rounds/${roundId}/verdict`, payload)
      
      setSuccess(true)
      setTimeout(() => {
        router.push('/employee-interviews')
      }, 2000)
    } catch (err: unknown) {
      // Extract detailed error from Axios response
      let errorMessage = 'Failed to submit verdict'
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { detail?: string | Array<{msg: string, loc: string[]}> }, status?: number } }
        const detail = axiosErr.response?.data?.detail
        if (typeof detail === 'string') {
          errorMessage = detail
        } else if (Array.isArray(detail)) {
          errorMessage = detail.map(d => `${d.loc?.join('.')}: ${d.msg}`).join('; ')
        } else if (axiosErr.response?.status === 422) {
          errorMessage = `Validation error (422): ${JSON.stringify(axiosErr.response?.data)}`
        }
      } else if (err instanceof Error) {
        errorMessage = err.message
      }
      console.error('[VerdictPage] Submit error:', err)
      setError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-xl p-8 max-w-md text-center shadow-lg">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Verdict Submitted</h2>
          <p className="text-gray-600">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/employee-interviews')}
            className="text-gray-600 hover:text-gray-900 flex items-center gap-2 mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Interview Verdict</h1>
          <p className="text-gray-600 mt-1">
            {summary?.candidate_name || 'Candidate'} - Interview Round
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* AI Summary Card */}
          {summary?.summary && (
            <div className="lg:col-span-1 bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                AI Summary
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Speech Confidence</span>
                  <span className="font-medium">{summary.summary.speechConfidenceAvg}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Authenticity</span>
                  <span className="font-medium">{summary.summary.authenticityScore}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Hesitations</span>
                  <span className="font-medium">{summary.summary.hesitationsCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Fraud Flags</span>
                  <span className={`font-medium ${summary.summary.fraudFlagsCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {summary.summary.fraudFlagsCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Speaking Time</span>
                  <span className="font-medium">{summary.summary.candidateSpeakingPct}%</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="text-sm text-gray-500">
                  Total Insights: {summary.insights_count} | 
                  Transcript Segments: {summary.transcript_count}
                </div>
              </div>
            </div>
          )}

          {/* Verdict Form */}
          <form onSubmit={handleSubmit} className={`${summary?.summary ? 'lg:col-span-2' : 'lg:col-span-3'} space-y-6`}>
            {/* Decision */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Decision</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { value: 'proceed', label: 'Proceed', color: 'green' },
                  { value: 'on_hold', label: 'On Hold', color: 'amber' },
                  { value: 'needs_discussion', label: 'Needs Discussion', color: 'blue' },
                  { value: 'reject', label: 'Reject', color: 'red' },
                ].map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setVerdict(v => ({ ...v, decision: option.value as HumanVerdict['decision'] }))}
                    className={`py-3 px-4 rounded-lg border-2 transition-all ${
                      verdict.decision === option.value
                        ? option.color === 'green' ? 'border-green-500 bg-green-50 text-green-700' :
                          option.color === 'amber' ? 'border-amber-500 bg-amber-50 text-amber-700' :
                          option.color === 'blue' ? 'border-blue-500 bg-blue-50 text-blue-700' :
                          'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scores */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Scores (1-10)</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'technicalScore', label: 'Technical Skills' },
                  { key: 'communicationScore', label: 'Communication' },
                  { key: 'problemSolvingScore', label: 'Problem Solving' },
                  { key: 'cultureFitScore', label: 'Culture Fit' },
                ].map(score => (
                  <div key={score.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{score.label}</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={verdict[score.key as keyof HumanVerdict] as number || ''}
                      onChange={(e) => setVerdict(v => ({ ...v, [score.key]: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Strengths & Improvements */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Strengths */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Strengths</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={strengthInput}
                      onChange={(e) => setStrengthInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addStrength())}
                      placeholder="Add strength..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={addStrength}
                      className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {verdict.strengths.map((s, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                        {s}
                        <button type="button" onClick={() => removeStrength(i)} className="hover:text-green-900">×</button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Areas for Improvement */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Areas for Improvement</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={improvementInput}
                      onChange={(e) => setImprovementInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addImprovement())}
                      placeholder="Add improvement area..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={addImprovement}
                      className="px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {verdict.improvements?.map((s, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm">
                        {s}
                        <button type="button" onClick={() => removeImprovement(i)} className="hover:text-amber-900">×</button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Feedback */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <label className="block text-sm font-medium text-gray-700 mb-2">Additional Feedback</label>
              <textarea
                value={verdict.feedback || ''}
                onChange={(e) => setVerdict(v => ({ ...v, feedback: e.target.value }))}
                rows={4}
                placeholder="Any additional notes or observations..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* AI Alignment */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <label className="block text-sm font-medium text-gray-700 mb-2">AI Analysis Alignment</label>
              <p className="text-sm text-gray-500 mb-3">How well did the AI insights align with your assessment?</p>
              <div className="flex gap-3">
                {[
                  { value: 'agreed', label: 'Agreed' },
                  { value: 'partially_agreed', label: 'Partially Agreed' },
                  { value: 'disagreed', label: 'Disagreed' },
                ].map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setVerdict(v => ({ ...v, aiAlignment: option.value as HumanVerdict['aiAlignment'] }))}
                    className={`flex-1 py-2 px-4 rounded-lg border-2 transition-all ${
                      verdict.aiAlignment === option.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Submit */}
            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => router.push('/employee-interviews')}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Submit Verdict
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
