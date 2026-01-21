'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'

interface Company {
  id: string
  name: string
  position: string
  status: string
}

interface Interview {
  id: string
  company_name: string
  position: string
  round: string
  scheduled_time: string
  status: string
  meeting_link: string | null
  ai_interview_token?: string | null
}

interface User {
  id: string
  email: string
  name: string
  role: string
  company_id: string | null
}

export default function CandidatePortalPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loading, setLoading] = useState(true)
  const { user, isLoading: authLoading, logout: authLogout } = useAuth()

  const handleLaunchInterview = (interview: Interview) => {
    if (interview.ai_interview_token) {
      // Navigate to our internal AI Interview page (same UI)
      router.push(`/interview/${interview.ai_interview_token}`)
    } else if (interview.meeting_link) {
      window.open(interview.meeting_link, '_blank')
    }
  }

  // Check if interview time has arrived (allow 15 minutes early)
  const isInterviewTimeReady = (scheduledTime: string): boolean => {
    const now = new Date()
    const scheduled = new Date(scheduledTime)
    const fifteenMinutesBefore = new Date(scheduled.getTime() - 15 * 60 * 1000)
    return now >= fifteenMinutesBefore
  }

  // Get time until interview is available
  const getTimeUntilInterview = (scheduledTime: string): string => {
    const now = new Date()
    const scheduled = new Date(scheduledTime)
    const fifteenMinutesBefore = new Date(scheduled.getTime() - 15 * 60 * 1000)
    const diff = fifteenMinutesBefore.getTime() - now.getTime()
    
    if (diff <= 0) return ''
    
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    if (hours > 24) {
      const days = Math.floor(hours / 24)
      return `Available in ${days} day${days > 1 ? 's' : ''}`
    } else if (hours > 0) {
      return `Available in ${hours}h ${minutes}m`
    } else {
      return `Available in ${minutes}m`
    }
  }

  useEffect(() => {
    const fetchData = async () => {
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
        // Fetch dashboard data which includes interviews with company info
        const dashboardData = await apiClient.get<{
          interviews: Interview[]
          companies: Company[]
          position_applied: string
        }>('/candidate-portal/my-interviews')
        
        // Set interviews from the response
        setInterviews(dashboardData?.interviews || [])
        setCompanies(dashboardData?.companies || [])
      } catch (err) {
        setCompanies([])
        setInterviews([])
      }
      setLoading(false)
    }
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading])

  const handleLogout = async () => {
    await authLogout()
    router.push('/auth/login')
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800'
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      case 'screening':
        return 'bg-purple-100 text-purple-800'
      case 'applied':
        return 'bg-gray-100 text-gray-800'
      case 'hired':
        return 'bg-green-100 text-green-800'
      case 'rejected':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-brand-500 rounded-lg flex items-center justify-center shadow-sm">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
              </div>
              <span className="text-xl font-bold text-gray-900">Candidate Portal</span>
            </div>
            <div className="flex items-center space-x-6">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Banner */}
        <div className="bg-white rounded-2xl p-8 mb-8 shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome back, {user?.name?.split(' ')[0]}!</h1>
            <p className="text-gray-500">You have {interviews.filter(i => i.status?.toLowerCase() === 'scheduled').length} upcoming interviews.</p>
            <div className="flex gap-3 mt-4">
              <a
                href="/candidate-portal/ats"
                className="inline-block px-4 py-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition"
              >
                ATS Checker
              </a>
              <a
                href="/candidate-portal/results"
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                View Results
              </a>
            </div>
          </div>
          <div className="mt-4 md:mt-0">
            {(() => {
              const scheduledInterviews = interviews.filter(i => i.status?.toLowerCase() === 'scheduled');
              const hasScheduledInterview = scheduledInterviews.length > 0;
              const nextInterview = scheduledInterviews[0];
              const isInterviewReady = hasScheduledInterview && nextInterview && 
                (nextInterview.ai_interview_token || nextInterview.meeting_link) &&
                isInterviewTimeReady(nextInterview.scheduled_time);
              
              return (
                <button
                  onClick={() => hasScheduledInterview && isInterviewReady && handleLaunchInterview(nextInterview)}
                  disabled={!isInterviewReady}
                  className={`inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-xl shadow-sm text-white transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 ${
                    isInterviewReady 
                      ? 'bg-brand-600 hover:bg-brand-700 cursor-pointer' 
                      : 'bg-gray-400 cursor-not-allowed'
                  }`}
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a1 1 0 01-3 3z" />
                  </svg>
                  {!hasScheduledInterview 
                    ? 'No Interview Scheduled' 
                    : !isInterviewReady 
                      ? `Interview Not Ready Yet${nextInterview ? ` (${getTimeUntilInterview(nextInterview.scheduled_time)})` : ''}`
                      : 'Launch Next Interview'}
                </button>
              );
            })()}
          </div>
        </div>

        {/* Upcoming Interviews List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-8 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-lg font-semibold text-gray-900">Your Schedule</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {interviews.filter(i => i.status?.toLowerCase() === 'scheduled').length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-gray-500">No interviews scheduled at the moment.</p>
              </div>
            ) : (
              interviews
                .filter(i => i.status?.toLowerCase() === 'scheduled')
                .map((interview) => {
                  const isReady = isInterviewTimeReady(interview.scheduled_time)
                  const timeUntil = getTimeUntilInterview(interview.scheduled_time)
                  
                  return (
                  <div key={interview.id} className="p-6 flex items-center justify-between hover:bg-gray-50 transition">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold text-lg">
                        {interview.company_name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{interview.company_name || 'Unknown Company'}</h3>
                        <p className="text-sm text-gray-500">{interview.position} • {interview.round}</p>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <p className="text-sm font-medium text-gray-900">{formatDate(interview.scheduled_time)}</p>
                      <span className={`inline-flex mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(interview.status)}`}>
                        {interview.status}
                      </span>
                      {interview.status === 'scheduled' && (
                        isReady ? (
                          <button
                            onClick={() => handleLaunchInterview(interview)}
                            className="mt-2 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition flex items-center gap-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Start Interview
                          </button>
                        ) : (
                          <div className="mt-2 text-center">
                            <button
                              disabled
                              className="px-3 py-1.5 bg-gray-200 text-gray-500 text-xs font-medium rounded-lg cursor-not-allowed flex items-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Not Yet Available
                            </button>
                            <p className="text-xs text-orange-600 mt-1 font-medium">{timeUntil}</p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                  )
                })
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500 font-medium">Total Applications</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{companies.length}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500 font-medium">Interviews Completed</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{interviews.filter(i => i.status === 'completed').length}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500 font-medium">Pending Feedback</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{interviews.filter(i => i.status === 'pending_feedback').length}</p>
          </div>
        </div>

      </main>
    </div>
  )
}
