'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useProtectedRoute } from '@/hooks/useProtectedRoute'
import { apiClient } from '@/lib/api'
import { Interview, PaginatedResponse } from '@/types'

export default function InterviewsPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const { isAuthorized } = useProtectedRoute({ allowedRoles: ['ADMIN', 'HR', 'EMPLOYEE'] })
  
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('ALL')

  useEffect(() => {
    if (!isAuthorized || authLoading) return

    const fetchInterviews = async () => {
      try {
        setIsLoading(true)
        const data = await apiClient.get<PaginatedResponse<Interview>>('/interview-rounds?page=1&page_size=50')
        setInterviews(data?.items || [])
      } catch (err: any) {
        console.error('Interviews fetch error:', err)
        setError(err.response?.data?.detail || 'Failed to fetch interviews')
        setInterviews([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchInterviews()
  }, [isAuthorized, authLoading])

  const filteredInterviews = interviews.filter(i => 
    filter === 'ALL' ? true : i.status === filter
  )

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'SCHEDULED': return 'bg-blue-100 text-blue-800'
      case 'IN_PROGRESS': return 'bg-yellow-100 text-yellow-800'
      case 'COMPLETED': return 'bg-green-100 text-green-800'
      case 'CANCELLED': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!isAuthorized) {
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
              <button
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Interviews</h2>
          
          <div className="flex gap-2 mb-4">
            {['ALL', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(status => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg transition ${
                  filter === status 
                    ? 'bg-primary-600 text-white' 
                    : 'bg-white text-gray-700 border border-gray-300 hover:border-primary-600'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-error-50 border border-error-200 rounded text-error-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredInterviews.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <p className="text-gray-500">No interviews found</p>
              </div>
            ) : (
              filteredInterviews.map((interview) => (
                <div key={interview.id} className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Round {interview.round_number}</h3>
                      <p className="text-gray-600">Interview ID: {interview.id}</p>
                      <p className="text-sm text-gray-500">
                        Scheduled: {new Date(interview.scheduled_at).toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-500">Duration: {interview.duration_minutes} minutes</p>
                    </div>
                    <div className="flex gap-2 items-start">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(interview.status)}`}>
                        {interview.status}
                      </span>
                      <button className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 transition text-sm">
                        Details
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
