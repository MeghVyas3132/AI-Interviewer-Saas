'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'

interface CandidateInfo {
  id: string
  email: string
  first_name: string
  last_name: string
  phone: string
  position: string
  domain: string
  status: string
  company_name: string
  mentor_name: string
  mentor_email: string
}

interface Interview {
  id: string
  round: string
  scheduled_time: string
  status: string
  interviewer_name: string
  meeting_link: string
  notes: string
}

interface DashboardData {
  candidate_info: CandidateInfo
  application_status: string
  total_interviews: number
  completed_interviews: number
  upcoming_interview: Interview | null
}

export default function CandidatePortalPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const [candidateInfo, setCandidateInfo] = useState<CandidateInfo | null>(null)
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Check if user is CANDIDATE
  useEffect(() => {
    if (!authLoading && user?.role !== 'CANDIDATE') {
      router.push('/dashboard')
    }
  }, [authLoading, user, router])

  // Fetch candidate data
  useEffect(() => {
    if (authLoading || user?.role !== 'CANDIDATE') return

    const fetchData = async () => {
      try {
        setLoading(true)
        setError('')

        // Fetch candidate info
        const infoRes = await apiClient.get<CandidateInfo>('/candidate-portal/my-info')
        setCandidateInfo(infoRes)

        // Fetch interviews
        const interviewsRes = await apiClient.get<{ interviews: Interview[], total: number }>('/candidate-portal/my-interviews')
        setInterviews(interviewsRes.interviews || [])

        // Fetch dashboard
        try {
          const dashRes = await apiClient.get<DashboardData>('/candidate-portal/dashboard')
          setDashboard(dashRes)
        } catch {
          // Dashboard might not be implemented yet
        }
      } catch (err: any) {
        console.error('Error fetching data:', err)
        setError(err.response?.data?.detail || 'Failed to load your information')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [authLoading, user])

  const getStatusBadgeClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'applied':
        return 'bg-blue-100 text-blue-800'
      case 'screening':
        return 'bg-yellow-100 text-yellow-800'
      case 'interview':
        return 'bg-purple-100 text-purple-800'
      case 'offered':
        return 'bg-green-100 text-green-800'
      case 'hired':
        return 'bg-green-200 text-green-900'
      case 'rejected':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-blue-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-50">
      {/* Navigation */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-primary-600">AI Interviewer</h1>
              <span className="ml-4 px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm">
                Candidate Portal
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">{user?.full_name}</span>
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

      <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Welcome Section */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Welcome, {candidateInfo?.first_name || user?.full_name?.split(' ')[0] || 'Candidate'}!
              </h1>
              <p className="mt-2 text-gray-600">
                Track your application progress and upcoming interviews
              </p>
            </div>
            <div className="text-right">
              <span className={`px-4 py-2 rounded-full text-sm font-semibold ${getStatusBadgeClass(candidateInfo?.status || '')}`}>
                {candidateInfo?.status?.toUpperCase() || 'PENDING'}
              </span>
            </div>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Company Info */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Company Details
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Company</p>
                <p className="text-gray-900 font-medium">{candidateInfo?.company_name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Position Applied</p>
                <p className="text-gray-900 font-medium">{candidateInfo?.position || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Department</p>
                <p className="text-gray-900 font-medium">{candidateInfo?.domain || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Mentor Info */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Your Mentor
            </h2>
            {candidateInfo?.mentor_name ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="text-gray-900 font-medium">{candidateInfo.mentor_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="text-gray-900 font-medium">{candidateInfo.mentor_email}</p>
                </div>
                <p className="text-sm text-gray-500 mt-4">
                  Your mentor will guide you through the interview process
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <p className="text-gray-500">A mentor will be assigned to you soon</p>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Interview Highlight */}
        {dashboard?.upcoming_interview && (
          <div className="bg-gradient-to-r from-primary-500 to-blue-600 rounded-xl shadow-lg p-6 mb-8 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold mb-2 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Upcoming Interview
                </h2>
                <p className="text-2xl font-bold">
                  {new Date(dashboard.upcoming_interview.scheduled_time).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
                <p className="text-lg opacity-90">
                  {new Date(dashboard.upcoming_interview.scheduled_time).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
                <p className="mt-2 opacity-90">
                  Round: {dashboard.upcoming_interview.round} | Interviewer: {dashboard.upcoming_interview.interviewer_name || 'TBA'}
                </p>
              </div>
              {dashboard.upcoming_interview.meeting_link && (
                <a
                  href={dashboard.upcoming_interview.meeting_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 bg-white text-primary-600 rounded-lg font-semibold hover:bg-gray-100 transition"
                >
                  Join Meeting
                </a>
              )}
            </div>
          </div>
        )}

        {/* Interview Schedule */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            Interview Schedule
          </h2>

          {interviews.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-500 text-lg">No interviews scheduled yet</p>
              <p className="text-gray-400 text-sm mt-1">Your mentor will schedule interviews soon</p>
            </div>
          ) : (
            <div className="space-y-4">
              {interviews.map((interview) => (
                <div
                  key={interview.id}
                  className={`p-4 rounded-lg border ${
                    interview.status === 'scheduled' ? 'border-blue-200 bg-blue-50' :
                    interview.status === 'completed' ? 'border-green-200 bg-green-50' :
                    interview.status === 'cancelled' ? 'border-red-200 bg-red-50' :
                    'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 capitalize">
                        {interview.round} Interview
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {new Date(interview.scheduled_time).toLocaleString()}
                      </p>
                      {interview.interviewer_name && (
                        <p className="text-sm text-gray-500 mt-1">
                          Interviewer: {interview.interviewer_name}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        interview.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                        interview.status === 'completed' ? 'bg-green-100 text-green-800' :
                        interview.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {interview.status}
                      </span>
                      {interview.meeting_link && interview.status === 'scheduled' && (
                        <a
                          href={interview.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block mt-2 text-sm text-primary-600 hover:text-primary-800 font-medium"
                        >
                          Join Meeting
                        </a>
                      )}
                    </div>
                  </div>
                  {interview.notes && (
                    <p className="mt-2 text-sm text-gray-600 border-t pt-2">
                      Notes: {interview.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Application Tips */}
        <div className="mt-8 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Interview Tips</h2>
          <ul className="space-y-2 text-gray-600">
            <li className="flex items-start">
              <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Test your camera and microphone before the interview
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Join the meeting 5 minutes early
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Have a quiet, well-lit environment
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Research the company and position beforehand
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
