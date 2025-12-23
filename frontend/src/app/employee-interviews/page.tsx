'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import { Card } from '@/components/Card'
import { CandidatePipeline } from '@/components/CandidatePipeline'

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
  const { user, isLoading: authLoading } = useAuth()
  const [candidates, setCandidates] = useState<AssignedCandidate[]>([])
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState<'candidates' | 'interviews' | 'pipeline' | 'jobs'>('candidates')

  // Schedule interview modal
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [selectedCandidate, setSelectedCandidate] = useState<AssignedCandidate | null>(null)
  const [scheduleForm, setScheduleForm] = useState({
    round: 'screening',
    scheduled_time: '',
    notes: ''
  })
  const [scheduling, setScheduling] = useState(false)

  // View questions modal
  const [showQuestionsModal, setShowQuestionsModal] = useState(false)
  const [selectedJobForQuestions, setSelectedJobForQuestions] = useState<Job | null>(null)
  const [jobQuestions, setJobQuestions] = useState<{ id: string; text: string }[]>([])
  const [loadingQuestions, setLoadingQuestions] = useState(false)

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

    try {
      setScheduling(true)
      setError('')

      await apiClient.post(`/employee/my-candidates/${selectedCandidate.id}/schedule-interview`, scheduleForm)

      // Refresh interviews
      const interviewsRes = await apiClient.get<{ interviews: Interview[], total: number }>('/employee/my-interviews')
      setInterviews(interviewsRes.interviews || [])

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
                onClick={() => router.push('/auth/login')}
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
          </nav>
        </div>

        {/* Candidates Tab */}
        {activeTab === 'candidates' && (
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">My Assigned Candidates</h2>
              {candidates.length === 0 ? (
                <p className="text-gray-600 py-8 text-center">
                  No candidates assigned to you yet. Contact HR to get candidates assigned.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Name</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Email</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Position</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Job Role</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Interview Scheduled</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {candidates.map((candidate) => (
                        <tr key={candidate.id} className={`hover:bg-gray-50 ${candidate.scheduled_at ? 'bg-green-50/30' : ''}`}>
                          <td className="px-4 py-4 text-sm text-gray-900">
                            {candidate.first_name} {candidate.last_name}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600">{candidate.email}</td>
                          <td className="px-4 py-4 text-sm text-gray-600">{candidate.position || '-'}</td>
                          <td className="px-4 py-4">
                            <select
                              value={candidate.job_role_id || ''}
                              onChange={(e) => handleAssignJobRole(candidate.id, e.target.value)}
                              className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-primary-500 focus:border-primary-500"
                            >
                              <option value="">Select Job Role</option>
                              {jobs.map(job => (
                                <option key={job.id} value={job.id}>{job.title}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-4">
                            <select
                              value={candidate.status}
                              onChange={(e) => handleUpdateStatus(candidate.id, e.target.value)}
                              className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-primary-500 focus:border-primary-500"
                            >
                              <option value="applied">Applied</option>
                              <option value="screening">Screening</option>
                              <option value="interview">Interview</option>
                              <option value="offered">Offered</option>
                              <option value="hired">Hired</option>
                              <option value="rejected">Rejected</option>
                            </select>
                          </td>
                          <td className="px-4 py-4">
                            {candidate.scheduled_at ? (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  Scheduled
                                </span>
                                <span className="text-xs text-gray-500">
                                  {new Date(candidate.scheduled_at).toLocaleDateString()} at {new Date(candidate.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                Not Scheduled
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-sm space-x-2">
                            {candidate.scheduled_at ? (
                              <button
                                onClick={() => {
                                  // Show interview details or reschedule
                                  setSelectedCandidate(candidate)
                                  setShowScheduleModal(true)
                                }}
                                className="px-3 py-1 bg-orange-600 text-white rounded text-sm hover:bg-orange-700"
                              >
                                Reschedule
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setSelectedCandidate(candidate)
                                  setShowScheduleModal(true)
                                }}
                                className="px-3 py-1 bg-primary-600 text-white rounded text-sm hover:bg-primary-700"
                              >
                                Schedule Interview
                              </button>
                            )}
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
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {interviews.map((interview) => (
                        <tr key={interview.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4 text-sm">
                            <div>
                              <p className="text-gray-900 font-medium">{interview.candidate_name}</p>
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
                          <td className="px-4 py-4 text-sm text-gray-600 max-w-xs truncate">
                            {interview.notes || '-'}
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
      </div>

      {/* Schedule Interview Modal */}
      {showScheduleModal && selectedCandidate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Schedule Interview
            </h3>
            <p className="text-gray-600 mb-4">
              Scheduling for: <strong>{selectedCandidate.first_name} {selectedCandidate.last_name}</strong>
            </p>

            <form onSubmit={handleScheduleInterview}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Round</label>
                  <select
                    value={scheduleForm.round}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, round: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                    required
                  >
                    <option value="screening">Screening</option>
                    <option value="technical">Technical</option>
                    <option value="hr">HR</option>
                    <option value="final">Final</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
                  <input
                    type="datetime-local"
                    value={scheduleForm.scheduled_time}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, scheduled_time: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                  <textarea
                    value={scheduleForm.notes}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Add any notes about this interview..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowScheduleModal(false)
                    setSelectedCandidate(null)
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={scheduling}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {scheduling ? 'Scheduling...' : 'Schedule'}
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
    </div>
  )
}
