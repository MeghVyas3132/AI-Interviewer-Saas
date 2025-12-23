'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Navigation } from '@/components/Navigation'
import { getDefaultDashboardRoute } from '@/middleware/rbac'

export default function DashboardPage() {
  const router = useRouter()
  const { user, isLoading, isAuthenticated } = useAuth()

  useEffect(() => {
    // If no authenticated user, redirect to login
    if (!isLoading && !isAuthenticated) {
      router.push('/auth/login')
      return
    }

    // Use RBAC utility for role-based routing
    if (!isLoading && user) {
      const dashboardRoute = getDefaultDashboardRoute(user.role)
      router.replace(dashboardRoute)
    }
  }, [isLoading, isAuthenticated, user, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Welcome, {user?.full_name}!
          </h2>
          <p className="text-gray-600 mb-8">
            You are logged in as <strong>{user?.role}</strong>
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Candidates</h3>
              <p className="text-gray-600 mb-4">Manage candidate applications</p>
              <button
                onClick={() => router.push('/candidates')}
                className="w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 transition"
              >
                View Candidates
              </button>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Interviews</h3>
              <p className="text-gray-600 mb-4">Schedule and manage interviews</p>
              <button
                onClick={() => router.push('/interviews')}
                className="w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 transition"
              >
                View Interviews
              </button>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Reports</h3>
              <p className="text-gray-600 mb-4">View analytics and insights</p>
              <button className="w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 transition">
                View Reports
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
