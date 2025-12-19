'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'

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
  const [user, setUser] = useState<User | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loading, setLoading] = useState(true)

  const handleLaunchInterview = (interview: Interview) => {
    if (interview.ai_interview_token) {
      router.push(`/interview-room/${interview.ai_interview_token}`)
    } else if (interview.meeting_link) {
      window.open(interview.meeting_link, '_blank')
    }
  }

  useEffect(() => {
    // Check authentication
    const token = Cookies.get('access_token')

    if (!token) {
      window.location.href = '/auth/login'
      return
    }

    // Load data from localStorage
    const userData = localStorage.getItem('user')
    const companiesData = localStorage.getItem('candidate_companies')
    const interviewsData = localStorage.getItem('candidate_interviews')


    if (userData) {
      const parsedUser = JSON.parse(userData)
      if (parsedUser.role !== 'CANDIDATE') {
        window.location.href = '/dashboard'
        return
      }
      setUser(parsedUser)
    } else {
      window.location.href = '/auth/login'
      return
    }

    if (companiesData) {
      setCompanies(JSON.parse(companiesData))
    }

    if (interviewsData) {
      setInterviews(JSON.parse(interviewsData))
    }

    setLoading(false)
  }, [router])

  const handleLogout = () => {
    Cookies.remove('access_token')
    localStorage.removeItem('user')
    localStorage.removeItem('candidate_companies')
    localStorage.removeItem('candidate_interviews')
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
            <p className="text-gray-500">You have {interviews.filter(i => i.status === 'scheduled').length} upcoming interviews.</p>
          </div>
          <div className="mt-4 md:mt-0">
            {interviews.filter(i => i.status === 'scheduled').length > 0 && (
                <button
                onClick={() => handleLaunchInterview(interviews.filter(i => i.status === 'scheduled')[0])}
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-xl shadow-sm text-white bg-brand-600 hover:bg-brand-700 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500"
                >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a1 1 0 01-3 3z" />
                </svg>
                Launch Next Interview
                </button>
            )}
          </div>
        </div>

        {/* Upcoming Interviews List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-8 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-lg font-semibold text-gray-900">Your Schedule</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {interviews.filter(i => i.status === 'scheduled').length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-gray-500">No interviews scheduled at the moment.</p>
              </div>
            ) : (
              interviews
                .filter(i => i.status === 'scheduled')
                .map((interview) => (
                  <div key={interview.id} className="p-6 flex items-center justify-between hover:bg-gray-50 transition">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold text-lg">
                        {interview.company_name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{interview.company_name}</h3>
                        <p className="text-sm text-gray-500">{interview.position} • {interview.round}</p>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <p className="text-sm font-medium text-gray-900">{formatDate(interview.scheduled_time)}</p>
                      <span className={`inline-flex mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(interview.status)}`}>
                        {interview.status}
                      </span>
                      {interview.status === 'scheduled' && (
                        <button 
                            onClick={() => handleLaunchInterview(interview)}
                            className="mt-2 text-xs text-brand-600 hover:text-brand-700 font-medium hover:underline"
                        >
                            Start Interview
                        </button>
                      )}
                    </div>
                  </div>
                ))
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
