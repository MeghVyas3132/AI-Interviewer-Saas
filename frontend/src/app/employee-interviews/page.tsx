'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import { Card } from '@/components/Card'
import { CandidatePipeline } from '@/components/CandidatePipeline'
import CandidateProfileModal from '@/components/CandidateProfileModal'

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
  const [activeTab, setActiveTab] = useState<'candidates' | 'interviews' | 'pipeline' | 'jobs' | 'settings'>('candidates')

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

  // Availability settings
  const [availabilitySlots, setAvailabilitySlots] = useState<any[]>([])
  const [autoScheduleConfig, setAutoScheduleConfig] = useState<any>(null)
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false)
  const [loadingAvailability, setLoadingAvailability] = useState(false)
  const [newSlot, setNewSlot] = useState({
    day_of_week: 'monday',
    start_time: '09:00',
    end_time: '17:00',
    slot_duration_minutes: 30
  })

  // Candidate profile modal
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [selectedProfileCandidateId, setSelectedProfileCandidateId] = useState<string | null>(null)

  const handleOpenCandidateProfile = (candidateId: string) => {
    setSelectedProfileCandidateId(candidateId)
    setShowProfileModal(true)
  }

  // Check if user is EMPLOYEE
  useEffect(() => {
    if (!authLoading && user?.role !== 'EMPLOYEE') {
      router.push('/dashboard')
    }
  }, [authLoading, user, router])

  // Fetch data
  useEffect(() => {
    if (authLoading || user?.role !== 'EMPLOYEE') return

    const fetchData = async () => {
      try {
        setLoading(true)
        setError('')

        // Fetch assigned candidates
        const candidatesRes = await apiClient.get<AssignedCandidate[]>('/employee/my-candidates')
        const rawCandidatesList = Array.isArray(candidatesRes) ? candidatesRes : []

        // Fetch interviews
        const interviewsRes = await apiClient.get<Interview[]>('/employee/my-interviews')
        const interviewsList = Array.isArray(interviewsRes) ? interviewsRes : []
        setInterviews(interviewsList)

        // Fetch jobs for assigning to candidates
        try {
          const jobsRes = await apiClient.get<{ items?: Job[], jobs?: Job[] } | Job[]>('/jobs')
          const jobsList = Array.isArray(jobsRes) ? jobsRes : (jobsRes.items || jobsRes.jobs || [])
          setJobs(jobsList)
        } catch {
          setJobs([])
        }

        // Map schedules and normalize name
        const candidatesList = rawCandidatesList.map(c => {
          const upcoming = interviewsList.find(i => i.candidate_id === c.id && i.status === 'scheduled');
          return {
            ...c,
            name: `${c.first_name} ${c.last_name}`,
            scheduled_at: upcoming?.scheduled_time,
            interview_token: upcoming?.interview_token,
            interview_id: upcoming?.id
          }
        });
        setCandidates(candidatesList)

        // Fetch dashboard metrics
        try {
          const metricsRes = await apiClient.get<any>('/employee/dashboard')
          setMetrics({
            total_assigned: metricsRes.total_assigned_candidates || candidatesList.length,
            pending_interviews: metricsRes.scheduled_interviews || interviewsList.filter((i: Interview) => i.status === 'scheduled').length,
            completed_interviews: metricsRes.completed_interviews || interviewsList.filter((i: Interview) => i.status === 'completed').length,
            status_breakdown: {}
          })
        } catch {
          setMetrics({
            total_assigned: candidatesList.length,
            pending_interviews: interviewsList.filter((i: Interview) => i.status === 'scheduled').length,
            completed_interviews: interviewsList.filter((i: Interview) => i.status === 'completed').length,
            status_breakdown: {}
          })
        }
      } catch (err: any) {
        console.error('Error fetching data:', err)
        setError(err.response?.data?.detail || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [authLoading, user])

  // Assign job role to candidate
  const handleAssignJobRole = async (candidateId: string, jobId: string) => {
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
      await apiClient.put(`/employee/my-candidates/${candidateId}/status`, { status: newStatus })

      setCandidates(candidates.map(c =>
        c.id === candidateId ? { ...c, status: newStatus } : c
      ))
      setSuccess('Status updated successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update status')
    }
  }

  // Schedule interview
  const handleScheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCandidate) return

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

  // Fetch availability data
  const fetchAvailability = async () => {
    try {
      setLoadingAvailability(true)
      const [availRes, configRes] = await Promise.all([
        apiClient.get<{ slots?: any[], config?: any } | any[]>('/employee/availability'),
        apiClient.get<any>('/employee/availability/config')
      ])
      
      // Handle the response - could be { slots: [], config: {} } or just an array
      if (availRes && typeof availRes === 'object' && 'slots' in availRes) {
        setAvailabilitySlots(Array.isArray(availRes.slots) ? availRes.slots : [])
      } else if (Array.isArray(availRes)) {
        setAvailabilitySlots(availRes)
      } else {
        setAvailabilitySlots([])
      }
      
      setAutoScheduleConfig(configRes)
    } catch (err: any) {
      console.error('Error fetching availability:', err)
    } finally {
      setLoadingAvailability(false)
    }
  }

  // Save auto-schedule config
  const handleSaveAutoConfig = async () => {
    try {
      setLoadingAvailability(true)
      setError('')
      await apiClient.put('/employee/availability/config', autoScheduleConfig)
      setSuccess('Auto-schedule settings saved successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save settings')
    } finally {
      setLoadingAvailability(false)
    }
  }

  // Add availability slot
  const handleAddAvailability = async () => {
    try {
      setLoadingAvailability(true)
      setError('')
      await apiClient.post('/employee/availability', newSlot)
      await fetchAvailability()
      setShowAvailabilityModal(false)
      setNewSlot({
        day_of_week: 'monday',
        start_time: '09:00',
        end_time: '17:00',
        slot_duration_minutes: 30
      })
      setSuccess('Availability slot added')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add availability slot')
    } finally {
      setLoadingAvailability(false)
    }
  }

  // Delete availability slot
  const handleDeleteAvailability = async (slotId: string) => {
    if (!window.confirm('Remove this availability slot?')) return
    try {
      setError('')
      await apiClient.delete(`/employee/availability/${slotId}`)
      setAvailabilitySlots(prev => prev.filter(s => s.id !== slotId))
      setSuccess('Availability slot removed')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to remove slot')
    }
  }

  // Load availability when settings tab is active
  useEffect(() => {
    if (activeTab === 'settings' && availabilitySlots.length === 0 && !loadingAvailability) {
      fetchAvailability()
    }
  }, [activeTab])

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
                            <option value="applied">Applied</option>
                            <option value="screening">Screening</option>
                            <option value="interview">Interview</option>
                            <option value="offered">Offered</option>
                            <option value="hired">Hired</option>
                            <option value="rejected">Rejected</option>
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

        {/* Pipeline Tab */}
        {activeTab === 'pipeline' && (
          <div className="overflow-hidden">
            <CandidatePipeline candidates={candidates} />
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

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Auto-Schedule Configuration */}
            <Card>
              <div className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Auto-Schedule Settings</h2>
                    <p className="text-sm text-gray-500">Configure automatic interview scheduling after AI rounds</p>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Auto-Schedule Toggle */}
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div>
                      <h3 className="font-medium text-gray-900">Enable Auto-Scheduling</h3>
                      <p className="text-sm text-gray-500">Automatically schedule next round when candidate passes AI interview</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoScheduleConfig?.auto_schedule_enabled || false}
                        onChange={(e) => setAutoScheduleConfig(prev => ({
                          ...prev,
                          auto_schedule_enabled: e.target.checked,
                          pass_threshold: prev?.pass_threshold || 70,
                          buffer_minutes: prev?.buffer_minutes || 30
                        }))}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  </div>

                  {/* Pass Threshold */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Pass Threshold (%)
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="50"
                        max="100"
                        value={autoScheduleConfig?.pass_threshold || 70}
                        onChange={(e) => setAutoScheduleConfig(prev => ({
                          ...prev,
                          auto_schedule_enabled: prev?.auto_schedule_enabled || false,
                          pass_threshold: parseInt(e.target.value),
                          buffer_minutes: prev?.buffer_minutes || 30
                        }))}
                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                      />
                      <span className="w-12 text-center font-medium text-gray-900">
                        {autoScheduleConfig?.pass_threshold || 70}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Minimum score required to auto-schedule next round</p>
                  </div>

                  {/* Buffer Time */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Buffer Time Between Interviews
                    </label>
                    <select
                      value={autoScheduleConfig?.buffer_minutes || 30}
                      onChange={(e) => setAutoScheduleConfig(prev => ({
                        ...prev,
                        auto_schedule_enabled: prev?.auto_schedule_enabled || false,
                        pass_threshold: prev?.pass_threshold || 70,
                        buffer_minutes: parseInt(e.target.value)
                      }))}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={45}>45 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={120}>2 hours</option>
                    </select>
                  </div>

                  {/* Save Button */}
                  <button
                    onClick={handleSaveAutoConfig}
                    disabled={loadingAvailability}
                    className="w-full px-4 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
                  >
                    {loadingAvailability ? 'Saving...' : 'Save Auto-Schedule Settings'}
                  </button>
                </div>
              </div>
            </Card>

            {/* Availability Slots */}
            <Card>
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Availability Schedule</h2>
                      <p className="text-sm text-gray-500">Set your weekly availability for interviews</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAvailabilityModal(true)}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Time Slot
                  </button>
                </div>

                {availabilitySlots.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-xl">
                    <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-gray-500 mb-2">No availability slots configured</p>
                    <p className="text-sm text-gray-400">Add your available time slots for auto-scheduling</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => {
                      const daySlots = availabilitySlots.filter(slot => slot.day_of_week === day)
                      if (daySlots.length === 0) return null
                      return (
                        <div key={day} className="border border-gray-200 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-medium text-gray-900 capitalize">{day}</h3>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {daySlots.map(slot => (
                              <div
                                key={slot.id}
                                className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm"
                              >
                                <span className="text-green-700 font-medium">
                                  {slot.start_time} - {slot.end_time}
                                </span>
                                <button
                                  onClick={() => handleDeleteAvailability(slot.id)}
                                  className="text-red-400 hover:text-red-600 transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Card>
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
            </div>

            {/* Form */}
            <form onSubmit={handleScheduleInterview} className="p-6">
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
                  disabled={scheduling || !scheduleForm.scheduled_time}
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

      {/* Add Availability Modal */}
      {showAvailabilityModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-white">Add Availability Slot</h3>
                  <p className="text-green-100 text-sm mt-1">Set when you're available for interviews</p>
                </div>
                <button
                  onClick={() => setShowAvailabilityModal(false)}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Form */}
            <div className="p-6 space-y-5">
              {/* Day Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Day of Week</label>
                <select
                  value={newSlot.day_of_week}
                  onChange={(e) => setNewSlot({ ...newSlot, day_of_week: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="monday">Monday</option>
                  <option value="tuesday">Tuesday</option>
                  <option value="wednesday">Wednesday</option>
                  <option value="thursday">Thursday</option>
                  <option value="friday">Friday</option>
                  <option value="saturday">Saturday</option>
                  <option value="sunday">Sunday</option>
                </select>
              </div>

              {/* Time Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Time</label>
                  <input
                    type="time"
                    value={newSlot.start_time}
                    onChange={(e) => setNewSlot({ ...newSlot, start_time: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Time</label>
                  <input
                    type="time"
                    value={newSlot.end_time}
                    onChange={(e) => setNewSlot({ ...newSlot, end_time: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
              </div>

              {/* Slot Duration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Interview Slot Duration</label>
                <select
                  value={newSlot.slot_duration_minutes}
                  onChange={(e) => setNewSlot({ ...newSlot, slot_duration_minutes: parseInt(e.target.value) })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>1 hour</option>
                </select>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAvailabilityModal(false)}
                  className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddAvailability}
                  disabled={loadingAvailability}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl font-medium hover:from-green-700 hover:to-green-800 disabled:opacity-50 transition-all"
                >
                  {loadingAvailability ? 'Adding...' : 'Add Slot'}
                </button>
              </div>
            </div>
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
