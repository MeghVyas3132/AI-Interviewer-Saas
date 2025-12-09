'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'

interface Candidate {
  id: string
  email: string
  name: string
  status: string
  created_at: string
}

interface Employee {
  id: string
  email: string
  name: string
  department: string
  role: string
}

interface HRMetrics {
  total_candidates: number
  active_candidates: number
  total_employees: number
  pending_interviews: number
}

export default function HRDashboard() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [metrics, setMetrics] = useState<HRMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'candidates' | 'employees'>('overview')

  // Check if user is HR
  useEffect(() => {
    if (!authLoading && user?.role !== 'HR') {
      router.push('/dashboard')
    }
  }, [authLoading, user, router])

  // Fetch HR data
  useEffect(() => {
    if (authLoading || user?.role !== 'HR') return

    const fetchData = async () => {
      try {
        setLoading(true)
        setError('')

        // Fetch candidates for this company
        const candidatesData = await apiClient.get<Candidate[]>('/candidates')
        setCandidates(candidatesData || [])

        // Calculate metrics from candidates data
        if (candidatesData) {
          const activeCount = candidatesData.filter((c) => c.status !== 'rejected').length
          setMetrics({
            total_candidates: candidatesData.length,
            active_candidates: activeCount,
            total_employees: 0,
            pending_interviews: 0,
          })
        }
      } catch (err) {
        console.error('Error fetching HR data:', err)
        setError('Failed to load HR dashboard data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [authLoading, user])

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">HR Dashboard</h1>
          <p className="mt-2 text-gray-600">Manage candidates and team members for {user?.company_id?.slice(0, 8)}</p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Metrics Cards */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Candidates</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.total_candidates}</p>
                  </div>
                  <div className="text-3xl text-blue-500">👥</div>
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Active Candidates</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.active_candidates}</p>
                  </div>
                  <div className="text-3xl text-green-500">✅</div>
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Employees</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.total_employees}</p>
                  </div>
                  <div className="text-3xl text-purple-500">👔</div>
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Pending Interviews</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.pending_interviews}</p>
                  </div>
                  <div className="text-3xl text-orange-500">📅</div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('candidates')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'candidates'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Candidates ({candidates.length})
            </button>
            <button
              onClick={() => setActiveTab('employees')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'employees'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Employees ({employees.length})
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button onClick={() => setActiveTab('candidates')} className="w-full">
                  Manage Candidates
                </Button>
                <Button onClick={() => setActiveTab('employees')} className="w-full">
                  Manage Employees
                </Button>
                <Button onClick={() => router.push('/interviews')} className="w-full">
                  View Interviews
                </Button>
              </div>
            </div>
          </Card>
        )}

        {activeTab === 'candidates' && (
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Candidates</h2>
                <Button onClick={() => router.push('/candidates')}>Manage</Button>
              </div>
              {candidates.length === 0 ? (
                <p className="text-gray-600">No candidates yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Name</th>
                        <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Email</th>
                        <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Status</th>
                        <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Date Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((candidate) => (
                        <tr key={candidate.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{candidate.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{candidate.email}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                              {candidate.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {new Date(candidate.created_at).toLocaleDateString()}
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

        {activeTab === 'employees' && (
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Employees</h2>
                <Button onClick={() => router.push('/dashboard')}>Manage</Button>
              </div>
              {employees.length === 0 ? (
                <p className="text-gray-600">No employees found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Name</th>
                        <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Email</th>
                        <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Department</th>
                        <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((employee) => (
                        <tr key={employee.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{employee.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{employee.email}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{employee.department}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs font-medium">
                              {employee.role}
                            </span>
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
      </div>
    </div>
  )
}
