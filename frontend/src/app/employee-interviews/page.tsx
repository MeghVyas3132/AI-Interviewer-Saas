'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import { Card } from '@/components/Card'
import { KanbanCandidatePipeline } from '@/components/KanbanCandidatePipeline'
import CandidateProfileModal from '@/components/CandidateProfileModal'
import { AIConfigManager } from '@/components/ai-admin'

interface AssignedCandidate {
  id: string
  email: string
  first_name: string
  last_name: string
  phone: string
  position: string
  domain: string
  status: string
  created_at: string
  scheduled_at?: string
  interview_token?: string
  interview_id?: string
  name: string
  job_role_id?: string
}

interface Interview {
  id: string
  candidate_id: string
  candidate_name: string
  candidate_email: string
  round: string
  scheduled_time: string
  status: string
  notes: string
  interview_token?: string
  questions?: string[]
  // Verdict data for completed interviews
  verdict?: 'PASS' | 'REVIEW' | 'FAIL' | null
  score?: number | null
  verdict_summary?: string | null
}

interface DashboardMetrics {
  total_assigned: number
  pending_interviews: number
  completed_interviews: number
  status_breakdown: Record<string, number>
}

interface Job {
  id: string
  title: string
  description: string
  department: string
  location: string
  status: string
}

// Round 2 candidate - passed AI interview
interface Round2Candidate {
  id: string
  email: string
  first_name: string
  last_name: string
  full_name: string
  phone: string
  position: string
  domain: string
  status: string
  ai_interviews: {
    interview_id: string
    scheduled_time: string | null
    score: number | null
    verdict: string
    summary: string | null
  }[]
  best_score: number | null
  human_round_scheduled: boolean
  human_round_id: string | null
  human_round_time: string | null
}

// Human-conducted interview round
interface HumanRound {
  id: string
  candidate_id: string
  candidate_name: string
  candidate_email: string | null
  position: string | null
  round_type: string
  interview_mode: string
  scheduled_at: string | null
  timezone: string
  duration_minutes: number
  status: string
  started_at: string | null
  ended_at: string | null
  videosdk_meeting_id: string | null
  notes: string | null
}

// Candidate needing manual review
interface ReviewCandidate {
  id: string
  email: string
  first_name: string
  last_name: string
  full_name: string
  phone: string
  position: string
  domain: string
  status: string
  interview_id: string
  interview_date: string | null
  ai_verdict: string | null
  ai_score: number | null
  ai_recommendation: string | null
  ai_summary: string | null
  can_override: boolean
}

export default function EmployeeDashboardPage() {
  const router = useRouter()
  const { user, isLoading: authLoading, logout } = useAuth()
  const [candidates, setCandidates] = useState<AssignedCandidate[]>([])
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState<'candidates' | 'interviews' | 'review' | 'round2' | 'pipeline' | 'jobs' | 'settings'>('candidates')

  // Schedule interview modal
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [selectedCandidate, setSelectedCandidate] = useState<AssignedCandidate | null>(null)
  const [scheduleForm, setScheduleForm] = useState({
    round: 'technical',  // Default to technical (AI round)
    scheduled_time: '',
    notes: ''
  })
  const [scheduling, setScheduling] = useState(false)

  // View questions modal
  const [showQuestionsModal, setShowQuestionsModal] = useState(false)
  const [selectedJobForQuestions, setSelectedJobForQuestions] = useState<Job | null>(null)
  const [jobQuestions, setJobQuestions] = useState<{ id: string; text: string }[]>([])
  const [loadingQuestions, setLoadingQuestions] = useState(false)

  // Candidate profile modal
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [selectedProfileCandidateId, setSelectedProfileCandidateId] = useState<string | null>(null)

  // Review candidates (AI unsure/failed)
  const [reviewCandidates, setReviewCandidates] = useState<ReviewCandidate[]>([])
  const [loadingReview, setLoadingReview] = useState(true)
  const [reviewingCandidate, setReviewingCandidate] = useState<string | null>(null)

  // Round 2 scheduling
  const [round2Candidates, setRound2Candidates] = useState<Round2Candidate[]>([])
  const [humanRounds, setHumanRounds] = useState<HumanRound[]>([])
  const [loadingRound2, setLoadingRound2] = useState(true)

  // Track if initial load completed (to avoid flash of empty state)
  const initialLoadDone = useRef(false)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [showHumanRoundModal, setShowHumanRoundModal] = useState(false)
  const [selectedRound2Candidate, setSelectedRound2Candidate] = useState<Round2Candidate | null>(null)
  const [humanRoundForm, setHumanRoundForm] = useState({
    round_type: 'TECHNICAL',
    scheduled_at: '',
    duration_minutes: 60,
    notes: ''
  })
  const [schedulingHumanRound, setSchedulingHumanRound] = useState(false)

  const handleOpenCandidateProfile = (candidateId: string) => {
    setSelectedProfileCandidateId(candidateId)
    setShowProfileModal(true)
  }

  // Check if user can access interviews (HR, EMPLOYEE, or SYSTEM_ADMIN)
  const allowedInterviewRoles = ['HR', 'EMPLOYEE', 'SYSTEM_ADMIN']
  useEffect(() => {
    if (!authLoading && !allowedInterviewRoles.includes(user?.role || '')) {
      router.push('/dashboard')
    }
  }, [authLoading, user, router])

  // Helper: case-insensitive status check
  const statusIs = (val: string, target: string) => val?.toLowerCase() === target.toLowerCase()

  // Core data fetcher - fetches everything for the dashboard
  const fetchAllData = useCallback(async (isBackground = false) => {
    if (authLoading || !allowedInterviewRoles.includes(user?.role || '')) return

    try {
      if (!isBackground) {
        setLoading(true)
        setLoadingReview(true)
        setLoadingRound2(true)
      }
      setError('')

      // Fetch all data sources in parallel for speed
      const [candidatesRes, interviewsRes, reviewRes, round2Res, humanRoundsRes] = await Promise.all([
        apiClient.get<AssignedCandidate[]>('/employee/my-candidates').catch(() => []),
        apiClient.get<Interview[]>('/employee/my-interviews').catch(() => []),
        apiClient.get<{ candidates: ReviewCandidate[], total: number }>('/employee/pending-review').catch(() => ({ candidates: [], total: 0 })),
        apiClient.get<{ candidates: Round2Candidate[], total: number }>('/employee/ready-for-round-2').catch(() => ({ candidates: [], total: 0 })),
        apiClient.get<{ rounds: HumanRound[], total: number }>('/employee/my-human-rounds').catch(() => ({ rounds: [], total: 0 })),
      ])

      const rawCandidatesList = Array.isArray(candidatesRes) ? candidatesRes : []
      const interviewsList = Array.isArray(interviewsRes) ? interviewsRes : []
      setInterviews(interviewsList)

      // Fetch jobs (non-critical)
      try {
        const jobsRes = await apiClient.get<{ items?: Job[], jobs?: Job[] } | Job[]>('/jobs')
        const jobsList = Array.isArray(jobsRes) ? jobsRes : (jobsRes.items || jobsRes.jobs || [])
        setJobs(jobsList)
      } catch {
        if (!isBackground) setJobs([])
      }

      // Map schedules with case-insensitive status comparison
      const candidatesList = rawCandidatesList.map(c => {
        const upcoming = interviewsList.find(i => i.candidate_id === c.id && statusIs(i.status, 'scheduled'));
        return {
          ...c,
          name: `${c.first_name} ${c.last_name}`,
          scheduled_at: upcoming?.scheduled_time,
          interview_token: upcoming?.interview_token,
          interview_id: upcoming?.id
        }
      });
      setCandidates(candidatesList)

      // Dashboard metrics with case-insensitive comparison
      try {
        const metricsRes = await apiClient.get<any>('/employee/dashboard')
        setMetrics({
          total_assigned: metricsRes.total_assigned_candidates || candidatesList.length,
          pending_interviews: metricsRes.scheduled_interviews || interviewsList.filter((i: Interview) => statusIs(i.status, 'scheduled')).length,
          completed_interviews: metricsRes.completed_interviews || interviewsList.filter((i: Interview) => statusIs(i.status, 'completed')).length,
          status_breakdown: {}
        })
      } catch {
        setMetrics({
          total_assigned: candidatesList.length,
          pending_interviews: interviewsList.filter((i: Interview) => statusIs(i.status, 'scheduled')).length,
          completed_interviews: interviewsList.filter((i: Interview) => statusIs(i.status, 'completed')).length,
          status_breakdown: {}
        })
      }

      // Set review & round2 data (already fetched in parallel above)
      setReviewCandidates(reviewRes.candidates || [])
      setRound2Candidates(round2Res.candidates || [])
      setHumanRounds(humanRoundsRes.rounds || [])

      initialLoadDone.current = true
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err)
      if (!isBackground) {
        setError(err.response?.data?.detail || 'Failed to load data')
      }
    } finally {
      setLoading(false)
      setLoadingReview(false)
      setLoadingRound2(false)
    }
  }, [authLoading, user])

  // Initial data fetch
  useEffect(() => {
    fetchAllData(false)
  }, [fetchAllData])

  // Auto-polling every 15 seconds for real-time updates
  useEffect(() => {
    if (authLoading || !allowedInterviewRoles.includes(user?.role || '')) return

    pollIntervalRef.current = setInterval(() => {
      fetchAllData(true) // background fetch — no loading spinners
    }, 15000)

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [authLoading, user, fetchAllData])

  // Refresh when window regains focus (user comes back from interview tab)
  useEffect(() => {
    const onFocus = () => {
      if (allowedInterviewRoles.includes(user?.role || '') && initialLoadDone.current) {
        fetchAllData(true)
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [user, fetchAllData])

  // Fetch Round 2 candidates and human rounds (used by tab refresh button)
  const fetchRound2Data = useCallback(async () => {
    try {
      setLoadingRound2(true)
      const [round2Res, humanRoundsRes] = await Promise.all([
        apiClient.get<{ candidates: Round2Candidate[], total: number }>('/employee/ready-for-round-2'),
        apiClient.get<{ rounds: HumanRound[], total: number }>('/employee/my-human-rounds'),
      ])
      setRound2Candidates(round2Res.candidates || [])
      setHumanRounds(humanRoundsRes.rounds || [])
    } catch (err: any) {
      console.error('Error fetching Round 2 data:', err)
    } finally {
      setLoadingRound2(false)
    }
  }, [])

  // Fetch candidates pending review (used by tab refresh button)
  const fetchReviewCandidates = useCallback(async () => {
    try {
      setLoadingReview(true)
      const res = await apiClient.get<{ candidates: ReviewCandidate[], total: number }>('/employee/pending-review')
      setReviewCandidates(res.candidates || [])
    } catch (err: any) {
      console.error('Error fetching review candidates:', err)
    } finally {
      setLoadingReview(false)
    }
  }, [])

  // Handle review decision (approve/reject)
  const handleReviewDecision = async (candidateId: string, decision: 'APPROVE' | 'REJECT') => {
    try {
      setReviewingCandidate(candidateId)
      await apiClient.post(`/employee/review-candidate/${candidateId}?decision=${decision}`, {})
      setSuccess(`Candidate ${decision === 'APPROVE' ? 'approved for Round 2' : 'rejected'}`)
      setTimeout(() => setSuccess(''), 3000)
      
      // Refresh review candidates list
      await fetchReviewCandidates()
      
      // Also refresh Round 2 list if approving
      if (decision === 'APPROVE') {
        await fetchRound2Data()
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to process review')
    } finally {
      setReviewingCandidate(null)
    }
  }

  // Refresh tab-specific data when tab is selected (only if initial load is done)
  useEffect(() => {
    if (!initialLoadDone.current || !allowedInterviewRoles.includes(user?.role || '')) return
    if (activeTab === 'review') {
      fetchReviewCandidates()
    } else if (activeTab === 'round2') {
      fetchRound2Data()
    }
  }, [activeTab, user, fetchReviewCandidates, fetchRound2Data])

  // Schedule human-conducted round
  const handleScheduleHumanRound = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRound2Candidate) return

    try {
      setSchedulingHumanRound(true)
      setError('')

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

      await apiClient.post('/employee/schedule-human-round', {
        candidate_id: selectedRound2Candidate.id,
        round_type: humanRoundForm.round_type,
        scheduled_at: humanRoundForm.scheduled_at,
        timezone: timezone,
        duration_minutes: humanRoundForm.duration_minutes,
        notes: humanRoundForm.notes || null
      })

      setShowHumanRoundModal(false)
      setSelectedRound2Candidate(null)
      setHumanRoundForm({
        round_type: 'TECHNICAL',
        scheduled_at: '',
        duration_minutes: 60,
        notes: ''
      })
      setSuccess('Human-conducted interview scheduled successfully!')
      setTimeout(() => setSuccess(''), 3000)

      // Refresh Round 2 data
      await fetchRound2Data()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to schedule human-conducted interview')
    } finally {
      setSchedulingHumanRound(false)
    }
  }

  // Start human-conducted interview
  const handleStartHumanInterview = (roundId: string) => {
    router.push(`/employee-interviews/room/${roundId}`)
  }

  // Assign job role to candidate
  const handleAssignJobRole = async (candidateId: string, jobId: string) => {
    // Don't make API call if empty value selected
    if (!jobId || jobId.trim() === '') {
      return
    }
    
    try {
      setError('')
      await apiClient.put(`/employee/my-candidates/${candidateId}/assign-job`, { job_id: jobId })

      setCandidates(candidates.map(c =>
        c.id === candidateId ? { ...c, job_role_id: jobId } : c
      ))
      setSuccess('Job role assigned successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to assign job role')
    }
  }

  // Update candidate status
  const handleUpdateStatus = async (candidateId: string, newStatus: string) => {
    try {
      setError('')
      const response = await apiClient.put<{
        message: string
        candidate_id: string
        status: string
        scheduled_deletion?: boolean
        deletion_in_minutes?: number
      }>(`/employee/my-candidates/${candidateId}/status`, { status: newStatus })

      setCandidates(candidates.map(c =>
        c.id === candidateId ? { ...c, status: newStatus } : c
      ))
      
      // Show special warning for rejected/failed candidates
      if (newStatus === 'failed') {
        const deletionScheduled = response.scheduled_deletion
        if (deletionScheduled) {
          setSuccess('Candidate marked as FAILED. They will be automatically deleted in 10 minutes.')
          // Show longer for rejection warning
          setTimeout(() => setSuccess(''), 8000)
        } else {
          setSuccess('Candidate marked as FAILED.')
          setTimeout(() => setSuccess(''), 3000)
        }
      } else {
        setSuccess('Status updated successfully')
        setTimeout(() => setSuccess(''), 3000)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update status')
    }
  }

  // Schedule interview
  const handleScheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCandidate) return

    // Check if candidate has a job role assigned - required for AI interview
    if (!selectedCandidate.job_role_id) {
      setError('Please assign a job role to this candidate before scheduling an interview. The AI interviewer needs a job role to ask relevant questions.')
      return
    }

    // Check if candidate already has a scheduled interview
    if (selectedCandidate.scheduled_at) {
      const confirmed = window.confirm(
        `This candidate already has an interview scheduled for ${new Date(selectedCandidate.scheduled_at).toLocaleString()}. Do you want to schedule another?`
      )
      if (!confirmed) return
    }

    try {
      setScheduling(true)
      setError('')

      // Convert local datetime to ISO string with timezone
      // The datetime-local input gives us YYYY-MM-DDTHH:MM in local time
      // We need to send it as-is (local time) but let backend know the timezone
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      
      const response = await apiClient.post<{
        message: string
        interview: {
          id: string
          scheduled_time: string
          ai_interview_token: string
        }
      }>(`/employee/my-candidates/${selectedCandidate.id}/schedule-interview`, {
        ...scheduleForm,
        timezone: timezone
      })

      // Refresh both interviews AND candidates list
      const interviewsRes = await apiClient.get<Interview[]>('/employee/my-interviews')
      const interviewsList = Array.isArray(interviewsRes) ? interviewsRes : []
      setInterviews(interviewsList)

      // Update candidates list with new scheduled_at
      setCandidates(prevCandidates => prevCandidates.map(c => {
        if (c.id === selectedCandidate.id) {
          return {
            ...c,
            scheduled_at: response.interview.scheduled_time,
            interview_token: response.interview.ai_interview_token,
            interview_id: response.interview.id
          }
        }
        return c
      }))

      setShowScheduleModal(false)
      setSelectedCandidate(null)
      setScheduleForm({ round: 'screening', scheduled_time: '', notes: '' })
      setSuccess('Interview scheduled successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to schedule interview')
    } finally {
      setScheduling(false)
    }
  }

  // Cancel interview
  const handleCancelInterview = async (candidateId: string, interviewId: string) => {
    if (!window.confirm('Are you sure you want to cancel this interview?')) {
      return
    }

    try {
      setError('')
      await apiClient.delete(`/employee/my-candidates/${candidateId}/interviews/${interviewId}`)

      // Update candidates list - remove scheduled_at
      setCandidates(prevCandidates => prevCandidates.map(c => {
        if (c.id === candidateId) {
          return {
            ...c,
            scheduled_at: undefined,
            interview_token: undefined,
            interview_id: undefined
          }
        }
        return c
      }))

      // Refresh interviews list
      const interviewsRes = await apiClient.get<Interview[]>('/employee/my-interviews')
      const interviewsList = Array.isArray(interviewsRes) ? interviewsRes : []
      setInterviews(interviewsList)

      setSuccess('Interview cancelled successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to cancel interview')
    }
  }

  // View interview questions
  const handleViewQuestions = async (job: Job) => {
    try {
      setLoadingQuestions(true)
      setSelectedJobForQuestions(job)
      setShowQuestionsModal(true)
      const questions = await apiClient.get<{ id: string; text: string }[]>(`/jobs/${job.id}/questions`)
      setJobQuestions(Array.isArray(questions) ? questions : [])
    } catch (err: any) {
      setJobQuestions([])
      setError('Failed to load questions for this job')
    } finally {
      setLoadingQuestions(false)
    }
  }

  // Create AI Interview (on-spot)
  const handleCreateAIInterview = async (candidateId: string) => {
    try {
      setError('')
      const response = await apiClient.post<{
        success: boolean
        token: string
        ai_service_url: string
        message: string
      }>(`/employee/my-candidates/${candidateId}/create-ai-interview`, {})
      
      if (response.success && response.ai_service_url) {
        setSuccess('AI Interview created! Opening interview room...')
        // Open AI Interview in new tab
        window.open(response.ai_service_url, '_blank')
        
        // Refresh data
        const interviewsRes = await apiClient.get<Interview[]>('/employee/my-interviews')
        setInterviews(Array.isArray(interviewsRes) ? interviewsRes : [])
      }
      setTimeout(() => setSuccess(''), 5000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create AI interview')
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-primary-600">AI Interviewer</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">{user?.full_name}</span>
              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                Employee
              </span>
              <button
                onClick={async () => {
                  await logout()
                  router.push('/auth/login')
                }}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Assigned Candidates</h1>
          <p className="mt-2 text-gray-600">Manage candidates assigned to you for interviews</p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            {success}
          </div>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Assigned Candidates</p>
                  <p className="text-2xl font-bold text-gray-900">{candidates.length}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Pending Interviews</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {interviews.filter(i => i.status === 'scheduled').length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Completed</p>
                  <p className="text-2xl font-bold text-green-600">
                    {interviews.filter(i => i.status === 'completed').length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('candidates')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'candidates'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Candidates ({candidates.length})
            </button>
            <button
              onClick={() => setActiveTab('interviews')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'interviews'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Interviews ({interviews.length})
            </button>
            <button
              onClick={() => setActiveTab('review')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'review'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Needs Review ({reviewCandidates.length})
              </span>
            </button>
            <button
              onClick={() => setActiveTab('round2')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'round2'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Round 2+ ({round2Candidates.length + humanRounds.filter(r => r.status === 'SCHEDULED').length})
              </span>
            </button>
            <button
              onClick={() => setActiveTab('pipeline')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'pipeline'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Pipeline
            </button>
            <button
              onClick={() => setActiveTab('jobs')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'jobs'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Job Listing ({jobs.length})
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'settings'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </span>
            </button>
          </nav>
        </div>

        {/* Candidates Tab */}
        {activeTab === 'candidates' && (
          <div>
            {candidates.length === 0 ? (
              <Card>
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Candidates Assigned</h3>
                  <p className="text-gray-500">Contact HR to get candidates assigned to you.</p>
                </div>
              </Card>
            ) : (
              <div className="grid gap-4">
                {candidates.map((candidate) => (
                  <div key={candidate.id}>
                    <Card>
                    <div className={`p-6 ${candidate.scheduled_at ? 'border-l-4 border-green-500' : 'border-l-4 border-gray-200'}`}>
                      {/* Header Row */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center text-white font-semibold text-lg">
                            {candidate.first_name?.[0]}{candidate.last_name?.[0]}
                          </div>
                          <div>
                            <button
                              onClick={() => handleOpenCandidateProfile(candidate.id)}
                              className="text-lg font-semibold text-primary-600 hover:text-primary-800 hover:underline text-left"
                            >
                              {candidate.first_name} {candidate.last_name}
                            </button>
                            <p className="text-sm text-gray-500">{candidate.email}</p>
                          </div>
                        </div>
                        
                        {/* Status Badge */}
                        <div className="flex items-center gap-2">
                          {candidate.scheduled_at ? (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                              <span className="text-sm font-medium text-green-700">Interview Scheduled</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
                              <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                              <span className="text-sm font-medium text-amber-700">Pending Schedule</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Info Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5 py-4 border-y border-gray-100">
                        <div>
                          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Position</p>
                          <p className="text-sm font-medium text-gray-900">{candidate.position || 'Not assigned'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Job Role</p>
                          <select
                            value={candidate.job_role_id || ''}
                            onChange={(e) => handleAssignJobRole(candidate.id, e.target.value)}
                            className="text-sm font-medium text-gray-900 bg-transparent border-0 p-0 pr-6 focus:ring-0 cursor-pointer hover:text-primary-600"
                          >
                            <option value="">Select role...</option>
                            {jobs.map(job => (
                              <option key={job.id} value={job.id}>{job.title}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Status</p>
                          <select
                            value={candidate.status}
                            onChange={(e) => handleUpdateStatus(candidate.id, e.target.value)}
                            className="text-sm font-medium text-gray-900 bg-transparent border-0 p-0 pr-6 focus:ring-0 cursor-pointer hover:text-primary-600"
                          >
                            <option value="uploaded">Uploaded</option>
                            <option value="assigned">Assigned</option>
                            <option value="interview_scheduled">Interview Scheduled</option>
                            <option value="interview_completed">Interview Completed</option>
                            <option value="passed">Passed</option>
                            <option value="failed">Failed</option>
                            <option value="review">Under Review</option>
                          </select>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                            {candidate.scheduled_at ? 'Scheduled For' : 'Interview'}
                          </p>
                          {candidate.scheduled_at ? (
                            <p className="text-sm font-medium text-gray-900">
                              {new Date(candidate.scheduled_at).toLocaleDateString('en-US', { 
                                weekday: 'short', 
                                month: 'short', 
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          ) : (
                            <p className="text-sm text-gray-500">Not scheduled</p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {candidate.scheduled_at ? (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedCandidate(candidate)
                                  setShowScheduleModal(true)
                                }}
                                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                Reschedule
                              </button>
                              {candidate.interview_id && (
                                <button
                                  onClick={() => handleCancelInterview(candidate.id, candidate.interview_id!)}
                                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                  Cancel
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedCandidate(candidate)
                                setShowScheduleModal(true)
                              }}
                              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              Schedule Interview
                            </button>
                          )}
                        </div>
                        
                        <button
                          onClick={() => handleCreateAIInterview(candidate.id)}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-sm hover:shadow-md"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Start AI Interview Now
                        </button>
                      </div>
                    </div>
                  </Card>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Interviews Tab */}
        {activeTab === 'interviews' && (
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">My Interviews</h2>
              {interviews.length === 0 ? (
                <p className="text-gray-600 py-8 text-center">
                  No interviews scheduled yet. Schedule interviews with your assigned candidates.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Candidate</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Round</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Scheduled</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Verdict</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {interviews.map((interview) => (
                        <tr key={interview.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4 text-sm">
                            <div>
                              <button
                                onClick={() => handleOpenCandidateProfile(interview.candidate_id)}
                                className="text-primary-600 hover:text-primary-800 font-medium hover:underline text-left"
                              >
                                {interview.candidate_name}
                              </button>
                              <p className="text-gray-500 text-xs">{interview.candidate_email}</p>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600 capitalize">{interview.round}</td>
                          <td className="px-4 py-4 text-sm text-gray-600">
                            {new Date(interview.scheduled_time).toLocaleString()}
                          </td>
                          <td className="px-4 py-4">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${interview.status === 'scheduled' ? 'bg-blue-50 text-blue-700' :
                              interview.status === 'completed' ? 'bg-green-50 text-green-700' :
                                interview.status === 'cancelled' ? 'bg-red-50 text-red-700' :
                                  'bg-gray-50 text-gray-700'
                              }`}>
                              {interview.status}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            {interview.status === 'completed' && interview.verdict ? (
                              <div className="flex flex-col gap-1">
                                <span className={`px-2 py-1 rounded text-xs font-bold inline-block w-fit ${
                                  interview.verdict === 'PASS' ? 'bg-green-100 text-green-800' :
                                  interview.verdict === 'REVIEW' ? 'bg-yellow-100 text-yellow-800' :
                                  interview.verdict === 'FAIL' ? 'bg-red-100 text-red-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {interview.verdict}
                                </span>
                                {interview.score !== null && interview.score !== undefined && (
                                  <span className="text-xs text-gray-500">
                                    Score: {interview.score}%
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600 max-w-xs">
                            {interview.verdict_summary ? (
                              <p className="truncate" title={interview.verdict_summary}>
                                {interview.verdict_summary}
                              </p>
                            ) : interview.notes ? (
                              <p className="truncate" title={interview.notes}>
                                {interview.notes}
                              </p>
                            ) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Needs Review Tab - AI unsure/failed candidates */}
        {activeTab === 'review' && (
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-amber-900">Candidates Needing Review</h3>
                  <p className="text-sm text-amber-700 mt-1">
                    These candidates require your manual review. The AI was either unsure about the verdict or rejected them, but you can override the decision.
                  </p>
                </div>
              </div>
            </div>

            {/* Review Candidates List */}
            <Card>
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Candidates Pending Review</h2>
                  <button
                    onClick={fetchReviewCandidates}
                    disabled={loadingReview}
                    className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-2"
                  >
                    <svg className={`w-4 h-4 ${loadingReview ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </button>
                </div>

                {loadingReview ? (
                  <div className="py-12 text-center">
                    <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto"></div>
                    <p className="text-gray-500 mt-4">Loading candidates...</p>
                  </div>
                ) : reviewCandidates.length === 0 ? (
                  <div className="py-12 text-center text-gray-500">
                    <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-lg font-medium">No candidates pending review</p>
                    <p className="text-sm mt-2">All AI interviews have clear verdicts</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reviewCandidates.map((candidate) => (
                      <div key={candidate.id} className="border rounded-xl p-4 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start gap-4">
                          {/* Candidate Info */}
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleOpenCandidateProfile(candidate.id)}
                                className="text-lg font-semibold text-primary-600 hover:text-primary-800 hover:underline"
                              >
                                {candidate.full_name}
                              </button>
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                candidate.status === 'ai_interview_review' ? 'bg-amber-100 text-amber-800' :
                                candidate.status === 'ai_interview_failed' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {candidate.status === 'ai_interview_review' ? 'Needs Review' : 
                                 candidate.status === 'ai_interview_failed' ? 'AI Rejected' : candidate.status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500">{candidate.email}</p>
                            <p className="text-sm text-gray-600 mt-1">
                              <span className="font-medium">{candidate.position}</span>
                              {candidate.domain && ` • ${candidate.domain}`}
                            </p>
                          </div>

                          {/* AI Verdict Info */}
                          <div className="text-right min-w-[200px]">
                            <div className="flex items-center justify-end gap-2 mb-1">
                              <span className="text-sm text-gray-500">AI Verdict:</span>
                              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                candidate.ai_verdict === 'PASS' ? 'bg-green-100 text-green-800' :
                                candidate.ai_verdict === 'REVIEW' ? 'bg-amber-100 text-amber-800' :
                                candidate.ai_verdict === 'FAIL' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {candidate.ai_verdict || 'N/A'}
                              </span>
                            </div>
                            {candidate.ai_score !== null && (
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-sm text-gray-500">Score:</span>
                                <span className={`text-sm font-semibold ${
                                  (candidate.ai_score || 0) >= 70 ? 'text-green-600' :
                                  (candidate.ai_score || 0) >= 50 ? 'text-amber-600' : 'text-red-600'
                                }`}>
                                  {candidate.ai_score}%
                                </span>
                              </div>
                            )}
                            {candidate.interview_date && (
                              <p className="text-xs text-gray-400 mt-1">
                                Interviewed: {new Date(candidate.interview_date).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* AI Recommendation/Summary */}
                        {(candidate.ai_recommendation || candidate.ai_summary) && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">AI Analysis: </span>
                              {candidate.ai_recommendation || candidate.ai_summary}
                            </p>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="mt-4 flex items-center gap-3">
                          <button
                            onClick={() => handleReviewDecision(candidate.id, 'APPROVE')}
                            disabled={reviewingCandidate === candidate.id}
                            className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                          >
                            {reviewingCandidate === candidate.id ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                            Approve for Round 2
                          </button>
                          <button
                            onClick={() => handleReviewDecision(candidate.id, 'REJECT')}
                            disabled={reviewingCandidate === candidate.id}
                            className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                          >
                            {reviewingCandidate === candidate.id ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                            Reject Candidate
                          </button>
                          <button
                            onClick={() => handleOpenCandidateProfile(candidate.id)}
                            className="py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                          >
                            View Profile
                          </button>
                        </div>

                        {candidate.can_override && (
                          <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            AI rejected this candidate, but you can override and approve for Round 2
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Round 2+ Tab - Human-Conducted Interviews */}
        {activeTab === 'round2' && (
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-purple-900">Human-Conducted Interviews with AI Assistance</h3>
                  <p className="text-sm text-purple-700 mt-1">
                    Schedule and conduct Round 2+ interviews with real-time AI insights. Candidates who passed the AI interview will appear here.
                  </p>
                </div>
              </div>
            </div>

            {loadingRound2 ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Candidates Ready for Round 2 */}
                <Card>
                  <div className="p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      Ready for Round 2 ({round2Candidates.filter(c => !c.human_round_scheduled).length})
                    </h2>
                    {round2Candidates.filter(c => !c.human_round_scheduled).length === 0 ? (
                      <div className="text-center py-8">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <p className="text-gray-500">No candidates ready for Round 2 yet.</p>
                        <p className="text-sm text-gray-400 mt-1">Candidates who pass AI interviews will appear here.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {round2Candidates.filter(c => !c.human_round_scheduled).map(candidate => (
                          <div key={candidate.id} className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 transition-colors">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white font-medium">
                                  {candidate.first_name?.[0]}{candidate.last_name?.[0]}
                                </div>
                                <div>
                                  <button
                                    onClick={() => handleOpenCandidateProfile(candidate.id)}
                                    className="font-medium text-gray-900 hover:text-primary-600 hover:underline"
                                  >
                                    {candidate.full_name}
                                  </button>
                                  <p className="text-sm text-gray-500">{candidate.position || 'No position'}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                                  Score: {candidate.best_score || 'N/A'}%
                                </span>
                              </div>
                            </div>
                            <div className="mt-3 flex items-center justify-between">
                              <p className="text-xs text-gray-400">
                                AI Interview: {candidate.ai_interviews[0]?.verdict || 'PASS'}
                              </p>
                              <button
                                onClick={() => {
                                  setSelectedRound2Candidate(candidate)
                                  setShowHumanRoundModal(true)
                                }}
                                className="px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                              >
                                Schedule Round 2
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>

                {/* Scheduled Human Rounds */}
                <Card>
                  <div className="p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                      Scheduled Human Interviews ({humanRounds.filter(r => r.status === 'SCHEDULED').length})
                    </h2>
                    {humanRounds.filter(r => r.status === 'SCHEDULED').length === 0 ? (
                      <div className="text-center py-8">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <p className="text-gray-500">No human interviews scheduled.</p>
                        <p className="text-sm text-gray-400 mt-1">Schedule Round 2+ interviews for candidates who passed AI.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {humanRounds.filter(r => r.status === 'SCHEDULED').map(round => (
                          <div key={round.id} className="border border-blue-200 bg-blue-50/50 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-medium text-gray-900">{round.candidate_name}</p>
                                <p className="text-sm text-gray-500">{round.position || 'No position'}</p>
                              </div>
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                {round.round_type}
                              </span>
                            </div>
                            <div className="mt-3 flex items-center justify-between">
                              <div className="text-sm text-gray-600">
                                <p>{round.scheduled_at ? new Date(round.scheduled_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'TBD'}</p>
                                <p className="text-xs text-gray-400">{round.scheduled_at ? new Date(round.scheduled_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}</p>
                              </div>
                              <button
                                onClick={() => handleStartHumanInterview(round.id)}
                                className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                Start Interview
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}

            {/* Completed Human Rounds */}
            {humanRounds.filter(r => r.status === 'COMPLETED').length > 0 && (
              <Card>
                <div className="p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    Completed Human Interviews ({humanRounds.filter(r => r.status === 'COMPLETED').length})
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Candidate</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Round Type</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Date</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Duration</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {humanRounds.filter(r => r.status === 'COMPLETED').map(round => (
                          <tr key={round.id} className="hover:bg-gray-50">
                            <td className="px-4 py-4 text-sm">
                              <button
                                onClick={() => handleOpenCandidateProfile(round.candidate_id)}
                                className="font-medium text-primary-600 hover:underline"
                              >
                                {round.candidate_name}
                              </button>
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-600">{round.round_type}</td>
                            <td className="px-4 py-4 text-sm text-gray-600">
                              {round.ended_at ? new Date(round.ended_at).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-600">{round.duration_minutes} min</td>
                            <td className="px-4 py-4">
                              <button
                                onClick={() => router.push(`/employee-interviews/verdict/${round.id}`)}
                                className="text-sm text-primary-600 hover:underline"
                              >
                                View Verdict
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Pipeline Tab */}
        {activeTab === 'pipeline' && (
          <div className="overflow-hidden">
            <KanbanCandidatePipeline 
              candidates={candidates.map(c => ({
                id: c.id,
                first_name: c.first_name,
                last_name: c.last_name,
                email: c.email,
                status: c.status,
                position: c.position,
                assigned_to: undefined,
                ats_score: undefined,
                interview_score: undefined
              }))} 
              editable={false}
              isLoading={loading}
            />
          </div>
        )}

        {/* Jobs Tab */}
        {activeTab === 'jobs' && (
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Job Roles</h2>
              <p className="text-sm text-gray-500 mb-6">
                Assign a job role to each candidate so the AI interviewer asks relevant questions for that position. Click on a job to view interview questions set by HR.
              </p>
              {jobs.length === 0 ? (
                <p className="text-gray-600 py-8 text-center">
                  No job listings available. Contact HR to create job postings.
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {jobs.map((job) => (
                    <div key={job.id} className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 transition">
                      <h3 className="font-semibold text-gray-900 mb-2">{job.title}</h3>
                      <p className="text-sm text-gray-600 mb-2 line-clamp-2">{job.description || 'No description'}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="bg-gray-100 px-2 py-1 rounded">{job.department || 'General'}</span>
                        <span className="bg-gray-100 px-2 py-1 rounded">{job.location || 'Remote'}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-gray-400">
                          {candidates.filter(c => c.job_role_id === job.id).length} candidate(s) assigned
                        </span>
                        <button
                          onClick={() => handleViewQuestions(job)}
                          className="text-xs px-3 py-1 bg-primary-50 text-primary-600 rounded hover:bg-primary-100 font-medium transition"
                        >
                          View Questions
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Settings Tab - View Only AI Config */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-blue-700">
                  <strong>View Only:</strong> Contact HR to modify AI settings and job configurations.
                </p>
              </div>
            </div>
            <AIConfigManager readOnly={true} />
          </div>
        )}
      </div>

      {/* Schedule Interview Modal */}
      {showScheduleModal && selectedCandidate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-white">
                    {selectedCandidate.scheduled_at ? 'Reschedule Interview' : 'Schedule Interview'}
                  </h3>
                  <p className="text-primary-100 text-sm mt-1">
                    Set up an AI interview session
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowScheduleModal(false)
                    setSelectedCandidate(null)
                  }}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Candidate Info */}
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center text-white font-medium">
                  {selectedCandidate.first_name?.[0]}{selectedCandidate.last_name?.[0]}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{selectedCandidate.first_name} {selectedCandidate.last_name}</p>
                  <p className="text-sm text-gray-500">{selectedCandidate.email}</p>
                </div>
              </div>
              {/* Job Role Status */}
              <div className="mt-3">
                {selectedCandidate.job_role_id ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">Job Role:</span>
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                      {jobs.find(j => j.id === selectedCandidate.job_role_id)?.title || 'Assigned'}
                    </span>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mt-2">
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <p className="text-amber-800 font-medium text-sm">No Job Role Assigned</p>
                        <p className="text-amber-700 text-xs mt-0.5">Please assign a job role from the Candidates tab before scheduling.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleScheduleInterview} className="p-6">
              {/* Error Display inside modal */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{error}</span>
                  </div>
                </div>
              )}

              <div className="space-y-5">
                {/* Interview Type Info */}
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-blue-900">Technical AI Interview</p>
                      <p className="text-sm text-blue-600">First round - conducted by our AI interviewer</p>
                    </div>
                  </div>
                </div>

                {/* Date & Time */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Date & Time
                    </span>
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduleForm.scheduled_time}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, scheduled_time: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-shadow"
                    required
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Notes <span className="text-gray-400 font-normal">(optional)</span>
                    </span>
                  </label>
                  <textarea
                    value={scheduleForm.notes}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-shadow resize-none"
                    placeholder="Add any notes about this interview..."
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowScheduleModal(false)
                    setSelectedCandidate(null)
                  }}
                  className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={scheduling || !scheduleForm.scheduled_time || !selectedCandidate.job_role_id}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-xl font-medium hover:from-primary-700 hover:to-primary-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary-500/25"
                >
                  {scheduling ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Scheduling...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {selectedCandidate.scheduled_at ? 'Reschedule' : 'Schedule Interview'}
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Interview Questions Modal */}
      {showQuestionsModal && selectedJobForQuestions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Interview Questions for {selectedJobForQuestions.title}
              </h3>
              <button
                onClick={() => {
                  setShowQuestionsModal(false)
                  setSelectedJobForQuestions(null)
                  setJobQuestions([])
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              These questions were set by HR for candidates applying to this position.
            </p>

            {loadingQuestions ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : jobQuestions.length === 0 ? (
              <div className="py-8 text-center">
                <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-gray-500">No interview questions have been set for this job yet.</p>
                <p className="text-sm text-gray-400 mt-1">Contact HR to generate questions.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobQuestions.map((q, index) => (
                  <div key={q.id} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </span>
                    <p className="text-gray-700">{q.text}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => {
                  setShowQuestionsModal(false)
                  setSelectedJobForQuestions(null)
                  setJobQuestions([])
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Human Round Modal */}
      {showHumanRoundModal && selectedRound2Candidate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-700 px-6 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-white">Schedule Human Interview</h3>
                  <p className="text-purple-100 text-sm mt-1">Round 2+ with AI Assistance</p>
                </div>
                <button
                  onClick={() => {
                    setShowHumanRoundModal(false)
                    setSelectedRound2Candidate(null)
                  }}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Candidate Info */}
            <div className="px-6 py-4 bg-purple-50 border-b border-purple-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white font-medium text-lg">
                  {selectedRound2Candidate.first_name?.[0]}{selectedRound2Candidate.last_name?.[0]}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{selectedRound2Candidate.full_name}</p>
                  <p className="text-sm text-gray-500">{selectedRound2Candidate.email}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                  AI Score: {selectedRound2Candidate.best_score || 'N/A'}%
                </span>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                  {selectedRound2Candidate.position || 'No position'}
                </span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleScheduleHumanRound} className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-5">
                {/* Round Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Interview Round Type</label>
                  <select
                    value={humanRoundForm.round_type}
                    onChange={(e) => setHumanRoundForm({ ...humanRoundForm, round_type: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="TECHNICAL">Technical Interview</option>
                    <option value="BEHAVIORAL">Behavioral Interview</option>
                    <option value="HR">HR Interview</option>
                    <option value="FINAL">Final Round</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                </div>

                {/* Date & Time */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date & Time</label>
                  <input
                    type="datetime-local"
                    value={humanRoundForm.scheduled_at}
                    onChange={(e) => setHumanRoundForm({ ...humanRoundForm, scheduled_at: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    required
                  />
                </div>

                {/* Duration */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Duration (minutes)</label>
                  <select
                    value={humanRoundForm.duration_minutes}
                    onChange={(e) => setHumanRoundForm({ ...humanRoundForm, duration_minutes: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>60 minutes</option>
                    <option value={90}>90 minutes</option>
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notes (optional)</label>
                  <textarea
                    value={humanRoundForm.notes}
                    onChange={(e) => setHumanRoundForm({ ...humanRoundForm, notes: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                    placeholder="Interview focus areas, topics to cover..."
                  />
                </div>

                {/* AI Assistance Info */}
                <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl">
                  <div className="flex items-center gap-2 text-purple-900 font-medium mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    AI Assistance Enabled
                  </div>
                  <p className="text-sm text-purple-700">
                    During this interview, you'll have access to real-time AI insights including speech analysis, 
                    engagement metrics, fraud detection, and suggested follow-up questions.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowHumanRoundModal(false)
                    setSelectedRound2Candidate(null)
                  }}
                  className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={schedulingHumanRound || !humanRoundForm.scheduled_at}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-700 text-white rounded-xl font-medium hover:from-purple-700 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-500/25"
                >
                  {schedulingHumanRound ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Scheduling...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Schedule Interview
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Candidate Profile Modal */}
      <CandidateProfileModal
        isOpen={showProfileModal}
        onClose={() => {
          setShowProfileModal(false)
          setSelectedProfileCandidateId(null)
        }}
        candidateId={selectedProfileCandidateId}
        useDetailedEndpoint={true}
      />
    </div>
  )
}
