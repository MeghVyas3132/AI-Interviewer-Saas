'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useProtectedRoute } from '@/hooks/useProtectedRoute'
import { apiClient } from '@/lib/api'
import { Candidate, PaginatedResponse } from '@/types'
import BulkImportModal from '@/components/BulkImportModal'

export default function CandidatesPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const { isAuthorized } = useProtectedRoute({
    allowedRoles: ['ADMIN', 'HR'],
  })

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    phone: '',
    position: '',
  })

  // Fetch candidates
  useEffect(() => {
    if (!isAuthorized || authLoading) return

    const fetchCandidates = async () => {
      try {
        setLoading(true)
        const data = await apiClient.get<PaginatedResponse<Candidate>>('/candidates?page=1&page_size=50')
        // Handle both response structures: items or candidates
        const items = (data as any)?.items || (data as any)?.candidates || []
        setCandidates(items)
        setError('')
      } catch (err: any) {
        console.error('Candidates fetch error:', err)
        setError('Failed to fetch candidates')
        setCandidates([])
      } finally {
        setLoading(false)
      }
    }

    fetchCandidates()
  }, [isAuthorized, authLoading])

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    try {
      const newCandidate = await apiClient.post<Candidate>('/candidates', formData)
      setCandidates([newCandidate, ...candidates])
      setFormData({ email: '', full_name: '', phone: '', position: '' })
      setShowForm(false)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create candidate')
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
              <button
                onClick={() => router.push('/dashboard')}
                className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Dashboard
              </button>
              <span className="text-gray-700">{user?.full_name}</span>
              <button
                onClick={() => {
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

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900">Candidates</h2>
          <div className="flex gap-3">
            <button
              onClick={() => setShowBulkImport(true)}
              className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition"
            >
              Bulk Import CSV
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition"
            >
              {showForm ? 'Cancel' : 'Add Candidate'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-error-50 border border-error-200 rounded text-error-700">
            {error}
          </div>
        )}

        {/* Add candidate form */}
        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4">Add New Candidate</h3>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                name="full_name"
                placeholder="Full Name"
                value={formData.full_name}
                onChange={handleFormChange}
                required
                className="input-field"
              />
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={formData.email}
                onChange={handleFormChange}
                required
                className="input-field"
              />
              <input
                type="tel"
                name="phone"
                placeholder="Phone (optional)"
                value={formData.phone}
                onChange={handleFormChange}
                className="input-field"
              />
              <input
                type="text"
                name="position"
                placeholder="Position (optional)"
                value={formData.position}
                onChange={handleFormChange}
                className="input-field"
              />
              <button
                type="submit"
                className="md:col-span-2 bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 transition font-medium"
              >
                Create Candidate
              </button>
            </form>
          </div>
        )}

        {/* Candidates list */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading candidates...</p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="p-8 text-center text-gray-600">
              No candidates found. Create one to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Email</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Position</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {candidates.map((candidate) => (
                    <tr key={candidate.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{candidate.full_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{candidate.email}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{candidate.position || '-'}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-primary-100 text-primary-800">
                          {candidate.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm space-x-2">
                        <button
                          onClick={() => router.push(`/candidates/${candidate.id}`)}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <BulkImportModal
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        onSuccess={() => {
          // Refresh candidates list
          window.location.reload()
        }}
      />
    </div>
  )
}
