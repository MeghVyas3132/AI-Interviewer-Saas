'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import { Company } from '@/types'

interface SystemMetrics {
  total_companies: number
  active_companies: number
  inactive_companies: number
  total_users: number
}

interface CompanyRequest {
  id: string
  company_name: string
  email_domain: string | null
  description: string | null
  requester_email: string
  requester_name: string
  status: string
  created_at: string
}

export default function AdminDashboard() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [pendingRequests, setPendingRequests] = useState<CompanyRequest[]>([])
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [processingRequest, setProcessingRequest] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState<{ id: string; name: string } | null>(null)
  const [adminCode, setAdminCode] = useState('')
  const [deletingCompany, setDeletingCompany] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email_domain: '',
  })

  // Check if user is system admin
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/auth/login')
      } else if (user.role !== 'SYSTEM_ADMIN') {
        // Redirect non-admins to their appropriate dashboard
        if (user.role === 'HR') {
          router.push('/hr')
        } else {
          router.push('/dashboard')
        }
      }
    }
  }, [authLoading, user, router])

  // Fetch companies and metrics
  useEffect(() => {
    if (authLoading || user?.role !== 'SYSTEM_ADMIN') return

    const fetchData = async () => {
      try {
        setLoading(true)
        setError('')

        // Fetch all companies
        try {
          const companiesData = await apiClient.get<any>('/admin/companies')
          setCompanies(Array.isArray(companiesData) ? companiesData : [])
        } catch (companiesErr) {
          console.warn('Failed to fetch companies:', companiesErr)
          setCompanies([])
        }

        // Fetch pending requests
        try {
          const requestsData = await apiClient.get<CompanyRequest[]>('/admin/requests/pending')
          setPendingRequests(Array.isArray(requestsData) ? requestsData : [])
        } catch (requestsErr) {
          console.warn('Failed to fetch pending requests:', requestsErr)
          setPendingRequests([])
        }

        // Fetch metrics
        try {
          const metricsData = await apiClient.get<SystemMetrics>('/admin/system/metrics')
          setMetrics(metricsData || null)
        } catch (metricsErr) {
          console.warn('Failed to fetch metrics:', metricsErr)
          setMetrics(null)
        }
      } catch (err: any) {
        console.error('Error fetching data:', err)
        setError('Failed to fetch some data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [authLoading, user])

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validate company name
    if (!formData.name.trim()) {
      setError('Company name is required')
      return
    }

    // Validate email domain format if provided
    if (formData.email_domain.trim()) {
      const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}$/
      if (!domainRegex.test(formData.email_domain.trim())) {
        setError('Invalid email domain format (e.g., company.com)')
        return
      }
    }

    try {
      // Only include email_domain if it has a value
      const payload: any = { name: formData.name.trim() }
      if (formData.email_domain.trim()) {
        payload.email_domain = formData.email_domain.trim()
      }

      const newCompany = await apiClient.post<Company>('/admin/companies', payload)
      setCompanies([newCompany, ...companies])
      setFormData({ name: '', email_domain: '' })
      setShowCreateForm(false)
      setSuccessMessage(`Company "${newCompany.name}" created successfully!`)
    } catch (err: any) {
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') {
        setError(detail)
      } else if (Array.isArray(detail)) {
        // Handle validation errors array
        setError(detail.map((e: any) => e.msg || JSON.stringify(e)).join(', '))
      } else if (detail && typeof detail === 'object') {
        setError(detail.msg || JSON.stringify(detail))
      } else {
        setError('Failed to create company')
      }
    }
  }

  const handleApproveRequest = async (requestId: string) => {
    setProcessingRequest(requestId)
    setError('')
    setSuccessMessage('')

    try {
      const result = await apiClient.post<any>(`/admin/requests/${requestId}/approve`, {})

      // Remove from pending list
      setPendingRequests(pendingRequests.filter(r => r.id !== requestId))

      // Refresh companies list
      const companiesData = await apiClient.get<any>('/admin/companies')
      setCompanies(Array.isArray(companiesData) ? companiesData : [])

      setSuccessMessage(`Company "${result.company_name}" approved! User ${result.user_email} can now login.`)

      // Refresh metrics
      const metricsData = await apiClient.get<SystemMetrics>('/admin/system/metrics')
      setMetrics(metricsData || null)
    } catch (err: any) {
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') {
        setError(detail)
      } else if (Array.isArray(detail)) {
        setError(detail.map((e: any) => e.msg || JSON.stringify(e)).join(', '))
      } else if (detail && typeof detail === 'object') {
        setError(detail.msg || JSON.stringify(detail))
      } else {
        setError('Failed to approve request')
      }
    } finally {
      setProcessingRequest(null)
    }
  }

  const handleRejectRequest = async (requestId: string) => {
    if (!rejectReason.trim()) {
      setError('Please provide a rejection reason')
      return
    }

    setProcessingRequest(requestId)
    setError('')
    setSuccessMessage('')

    try {
      await apiClient.post<any>(`/admin/requests/${requestId}/reject`, {
        reason: rejectReason
      })

      // Remove from pending list
      setPendingRequests(pendingRequests.filter(r => r.id !== requestId))
      setSuccessMessage('Request rejected successfully')
      setShowRejectModal(null)
      setRejectReason('')
    } catch (err: any) {
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') {
        setError(detail)
      } else if (Array.isArray(detail)) {
        setError(detail.map((e: any) => e.msg || JSON.stringify(e)).join(', '))
      } else if (detail && typeof detail === 'object') {
        setError(detail.msg || JSON.stringify(detail))
      } else {
        setError('Failed to reject request')
      }
    } finally {
      setProcessingRequest(null)
    }
  }

  const handleDeleteCompany = async () => {
    if (!showDeleteModal) return

    if (!adminCode.trim()) {
      setError('Please enter the admin code')
      return
    }

    setDeletingCompany(true)
    setError('')
    setSuccessMessage('')

    try {
      const result = await apiClient.delete<any>(`/admin/companies/${showDeleteModal.id}`, {
        admin_code: adminCode
      })

      // Remove from companies list
      setCompanies(companies.filter(c => c.id !== showDeleteModal.id))
      setSuccessMessage(result.message || `Company "${showDeleteModal.name}" deleted successfully`)
      setShowDeleteModal(null)
      setAdminCode('')

      // Refresh metrics
      try {
        const metricsData = await apiClient.get<SystemMetrics>('/admin/system/metrics')
        setMetrics(metricsData || null)
      } catch (e) {
        console.warn('Failed to refresh metrics')
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') {
        setError(detail)
      } else if (Array.isArray(detail)) {
        setError(detail.map((e: any) => e.msg || JSON.stringify(e)).join(', '))
      } else if (detail && typeof detail === 'object') {
        setError(detail.msg || JSON.stringify(detail))
      } else {
        setError('Failed to delete company')
      }
    } finally {
      setDeletingCompany(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  // Block non-admins immediately - don't show anything while redirecting
  if (!user || user.role !== 'SYSTEM_ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Redirecting...</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-primary-600">Admin Panel</h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">{user?.full_name}</span>
              <button
                onClick={() => router.push('/auth/login')}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 transition text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Metrics */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600 text-sm font-medium">Total Companies</p>
              <p className="text-3xl font-bold text-primary-600 mt-2">{metrics.total_companies}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600 text-sm font-medium">Active Companies</p>
              <p className="text-3xl font-bold text-green-600 mt-2">{metrics.active_companies}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600 text-sm font-medium">Inactive Companies</p>
              <p className="text-3xl font-bold text-yellow-600 mt-2">{metrics.inactive_companies}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600 text-sm font-medium">Total Users</p>
              <p className="text-3xl font-bold text-blue-600 mt-2">{metrics.total_users}</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center justify-between">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
            <button onClick={() => setError('')} className="text-red-500 hover:text-red-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 flex items-center justify-between">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {successMessage}
            </div>
            <button onClick={() => setSuccessMessage('')} className="text-green-500 hover:text-green-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Pending Requests Section */}
        {pendingRequests.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Pending Requests</h2>
              <span className="ml-3 px-3 py-1 bg-orange-100 text-orange-800 text-sm font-semibold rounded-full">
                {pendingRequests.length} pending
              </span>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden border-2 border-orange-200">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-orange-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Company Name</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Requester</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Email</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Requested</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pendingRequests.map((request) => (
                      <tr key={request.id} className="hover:bg-orange-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{request.company_name}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{request.requester_name}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{request.requester_email}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {request.created_at ? new Date(request.created_at).toLocaleDateString() : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleApproveRequest(request.id)}
                              disabled={processingRequest === request.id}
                              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition"
                            >
                              {processingRequest === request.id ? 'Processing...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => setShowRejectModal(request.id)}
                              disabled={processingRequest === request.id}
                              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:bg-gray-400 transition"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {showRejectModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Reject Request</h3>
              <p className="text-gray-600 mb-4">
                Please provide a reason for rejecting this company registration request.
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter rejection reason..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none mb-4"
                rows={3}
              />
              <div className="flex space-x-3">
                <button
                  onClick={() => handleRejectRequest(showRejectModal)}
                  disabled={processingRequest === showRejectModal}
                  className="flex-1 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:bg-gray-400 transition"
                >
                  {processingRequest === showRejectModal ? 'Processing...' : 'Confirm Reject'}
                </button>
                <button
                  onClick={() => {
                    setShowRejectModal(null)
                    setRejectReason('')
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Company Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mr-4">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Delete Company</h3>
                  <p className="text-sm text-red-600 font-medium">This action cannot be undone</p>
                </div>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-red-800">
                  You are about to permanently delete <strong>{showDeleteModal.name}</strong> and ALL associated data including:
                </p>
                <ul className="text-sm text-red-700 mt-2 ml-4 list-disc">
                  <li>All HR and employee accounts</li>
                  <li>All candidates</li>
                  <li>All interviews</li>
                  <li>All audit logs</li>
                </ul>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Enter Admin Code to confirm
                </label>
                <input
                  type="password"
                  value={adminCode}
                  onChange={(e) => setAdminCode(e.target.value)}
                  placeholder="Enter admin code..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                />
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={handleDeleteCompany}
                  disabled={deletingCompany || !adminCode.trim()}
                  className="flex-1 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:bg-gray-400 transition"
                >
                  {deletingCompany ? 'Deleting...' : 'Delete Company'}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteModal(null)
                    setAdminCode('')
                    setError('')
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Company Section */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Companies</h2>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition"
            >
              {showCreateForm ? 'Cancel' : 'Create Company'}
            </button>
          </div>

          {showCreateForm && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">Create New Company</h3>
              <form onSubmit={handleCreateCompany} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                    placeholder="Acme Corporation"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Domain
                  </label>
                  <input
                    type="text"
                    value={formData.email_domain}
                    onChange={(e) => setFormData({ ...formData, email_domain: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                    placeholder="acme.com"
                  />
                  <p className="text-xs text-gray-500 mt-1">Optional - used to restrict user registration by email domain</p>
                </div>
                <button
                  type="submit"
                  className="w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 transition font-medium"
                >
                  Create Company
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Companies List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {companies.length === 0 ? (
            <div className="p-8 text-center text-gray-600">
              No companies found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Company Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Join Code</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Email Domain</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Created</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {companies.map((company) => (
                    <tr key={company.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{company.name}</td>
                      <td className="px-6 py-4 text-sm">
                        <code className="px-2 py-1 bg-blue-50 text-blue-700 rounded font-mono text-xs">
                          {(company as any).join_code || '-'}
                        </code>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{(company as any).email_domain || (company as any).email || '-'}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${company.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                          }`}>
                          {company.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {company.created_at ? new Date(company.created_at).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex space-x-3">
                          <button
                            onClick={() => router.push(`/admin/companies/${company.id}`)}
                            className="text-primary-600 hover:text-primary-900 font-medium"
                          >
                            View Details
                          </button>
                          <button
                            onClick={() => setShowDeleteModal({ id: company.id, name: company.name })}
                            className="text-red-600 hover:text-red-900 font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
