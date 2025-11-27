'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useProtectedRoute } from '@/hooks/useProtectedRoute'
import { apiClient } from '@/lib/api'
import { Candidate, PaginatedResponse } from '@/types'
import BulkImportModal from '@/components/BulkImportModal'

interface Employee {
  id: string
  name: string
  email: string
  department: string
  assigned_count: number
  can_accept_more: boolean
  available_slots: number
}

export default function CandidatesPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const { isAuthorized } = useProtectedRoute({
    allowedRoles: ['ADMIN', 'HR'],
  })

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<string>('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    position: '',
  })

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCandidates, setTotalCandidates] = useState(0)
  const pageSize = 100  // Max allowed by backend

  // Fetch employees for assignment dropdown
  const fetchEmployees = async () => {
    try {
      const response = await apiClient.get<Employee[]>('/hr/employees')
      console.log('Employees response:', response)
      // Response is an array directly, not { employees: [...] }
      setEmployees(Array.isArray(response) ? response : [])
    } catch (error) {
      console.error('Failed to fetch employees:', error)
    }
  }

  // Fetch candidates
  useEffect(() => {
    if (!isAuthorized || authLoading) {
      console.log('Skipping fetch - isAuthorized:', isAuthorized, 'authLoading:', authLoading)
      return
    }

    fetchEmployees()

    const fetchCandidates = async () => {
      try {
        setLoading(true)
        // Use 'limit' and 'skip' as the backend expects
        const skip = (currentPage - 1) * pageSize
        // Add cache-busting timestamp to prevent stale data
        const timestamp = Date.now()
        console.log('Fetching candidates with skip:', skip, 'limit:', pageSize)
        const data = await apiClient.get<any>(`/candidates?skip=${skip}&limit=${pageSize}&_t=${timestamp}`)
        console.log('Candidates API response:', data)
        // Handle both response structures: items or candidates
        const items = data?.items || data?.candidates || []
        console.log('Parsed candidates:', items.length, 'total:', data?.total)
        setCandidates(items)
        setTotalCandidates(data?.total || items.length)
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
  }, [isAuthorized, authLoading, currentPage])

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
      console.log('Creating candidate with data:', formData)
      const newCandidate = await apiClient.post<Candidate>('/candidates', formData)
      console.log('Created candidate response:', newCandidate)
      setCandidates([newCandidate, ...candidates])
      setTotalCandidates(prev => prev + 1)
      setFormData({ email: '', first_name: '', last_name: '', phone: '', position: '' })
      setShowForm(false)
    } catch (err: any) {
      console.error('Create candidate error:', err)
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to create candidate'
      setError(errorMessage)
    }
  }

  const handleDeleteCandidate = async (candidateId: string) => {
    if (!confirm('Are you sure you want to delete this candidate?')) return

    try {
      setDeleting(candidateId)
      await apiClient.delete(`/candidates/${candidateId}`)
      setCandidates(candidates.filter(c => c.id !== candidateId))
      setTotalCandidates(prev => prev - 1)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete candidate')
    } finally {
      setDeleting(null)
    }
  }

  const handleDeleteAll = async () => {
    if (!confirm(`Are you sure you want to delete ALL ${totalCandidates} candidates? This action cannot be undone!`)) return

    try {
      setDeletingAll(true)
      setError('')
      
      // Delete all candidates one by one
      let deletedCount = 0
      const errors: string[] = []
      
      for (const candidate of candidates) {
        try {
          await apiClient.delete(`/candidates/${candidate.id}`)
          deletedCount++
        } catch (err) {
          errors.push(candidate.email)
        }
      }
      
      // If there are more pages, fetch and delete those too
      if (totalCandidates > candidates.length) {
        let hasMore = true
        while (hasMore) {
          try {
            const data = await apiClient.get<any>('/candidates?skip=0&limit=100')
            const items = data?.items || data?.candidates || []
            if (items.length === 0) {
              hasMore = false
            } else {
              for (const candidate of items) {
                try {
                  await apiClient.delete(`/candidates/${candidate.id}`)
                  deletedCount++
                } catch (err) {
                  errors.push(candidate.email)
                }
              }
            }
          } catch (err) {
            hasMore = false
          }
        }
      }
      
      setCandidates([])
      setTotalCandidates(0)
      
      if (errors.length > 0) {
        setError(`Deleted ${deletedCount} candidates. Failed to delete: ${errors.slice(0, 5).join(', ')}${errors.length > 5 ? '...' : ''}`)
      }
    } catch (err: any) {
      setError('Failed to delete all candidates')
    } finally {
      setDeletingAll(false)
    }
  }

  // Toggle candidate selection
  const toggleCandidateSelection = (candidateId: string) => {
    setSelectedCandidates(prev => 
      prev.includes(candidateId) 
        ? prev.filter(id => id !== candidateId)
        : [...prev, candidateId]
    )
  }

  // Select all candidates
  const toggleSelectAll = () => {
    if (selectedCandidates.length === candidates.length) {
      setSelectedCandidates([])
    } else {
      setSelectedCandidates(candidates.map(c => c.id))
    }
  }

  // Assign single candidate
  const handleAssignCandidate = async (candidateId: string, employeeId: string) => {
    if (!employeeId) return
    
    try {
      setAssigning(true)
      setError('')
      await apiClient.post(`/hr/candidates/${candidateId}/assign?employee_id=${employeeId}`, {})
      
      // Update local state
      const employee = employees.find(e => e.id === employeeId)
      setCandidates(candidates.map(c => 
        c.id === candidateId 
          ? { ...c, assigned_to: employeeId, assigned_employee_name: employee?.name }
          : c
      ))
      setSuccess('Candidate assigned successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      let msg = 'Failed to assign candidate'
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') {
        msg = detail
      } else if (Array.isArray(detail)) {
        msg = detail.map((e: any) => e.msg || String(e)).join(', ')
      }
      setError(msg)
    } finally {
      setAssigning(false)
    }
  }

  // Revoke assignment
  const handleRevokeAssignment = async (candidateId: string) => {
    try {
      setAssigning(true)
      setError('')
      await apiClient.post(`/hr/candidates/${candidateId}/revoke`, {})
      
      // Update local state
      setCandidates(candidates.map(c => 
        c.id === candidateId 
          ? { ...c, assigned_to: undefined, assigned_employee_name: undefined }
          : c
      ))
      setSuccess('Assignment revoked successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      let msg = 'Failed to revoke assignment'
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') {
        msg = detail
      } else if (Array.isArray(detail)) {
        msg = detail.map((e: any) => e.msg || String(e)).join(', ')
      }
      setError(msg)
    } finally {
      setAssigning(false)
    }
  }

  // Bulk assign candidates
  const handleBulkAssign = async () => {
    if (!selectedEmployee || selectedCandidates.length === 0) {
      setError('Please select an employee and at least one candidate')
      return
    }
    
    if (selectedCandidates.length > 10) {
      setError('Maximum 10 candidates can be assigned to one employee per slot')
      return
    }
    
    try {
      setAssigning(true)
      setError('')
      
      // Build query string with multiple candidate_ids parameters
      const candidateIdsParams = selectedCandidates.map(id => `candidate_ids=${id}`).join('&')
      await apiClient.post(`/hr/candidates/assign-bulk?${candidateIdsParams}&employee_id=${selectedEmployee}`, {})
      
      // Update local state
      const employee = employees.find(e => e.id === selectedEmployee)
      setCandidates(candidates.map(c => 
        selectedCandidates.includes(c.id)
          ? { ...c, assigned_to: selectedEmployee, assigned_employee_name: employee?.name }
          : c
      ))
      
      setSelectedCandidates([])
      setSelectedEmployee('')
      setShowAssignModal(false)
      setSuccess(`${selectedCandidates.length} candidates assigned successfully`)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      let msg = 'Failed to assign candidates'
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') {
        msg = detail
      } else if (Array.isArray(detail)) {
        msg = detail.map((e: any) => e.msg || String(e)).join(', ')
      } else if (detail && typeof detail === 'object') {
        msg = detail.msg || JSON.stringify(detail)
      }
      setError(msg)
    } finally {
      setAssigning(false)
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
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Candidates</h2>
            {totalCandidates > 0 && (
              <p className="text-gray-600 mt-1">
                Showing {candidates.length} of {totalCandidates} candidates
              </p>
            )}
          </div>
          <div className="flex gap-3">
            {selectedCandidates.length > 0 && (
              <button
                onClick={() => setShowAssignModal(true)}
                className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition"
              >
                Assign Selected ({selectedCandidates.length})
              </button>
            )}
            <button
              onClick={handleDeleteAll}
              disabled={deletingAll || candidates.length === 0}
              className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deletingAll ? 'Deleting...' : 'Delete All'}
            </button>
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

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded text-green-700">
            {success}
          </div>
        )}

        {/* Add candidate form */}
        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4">Add New Candidate</h3>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                name="first_name"
                placeholder="First Name"
                value={formData.first_name}
                onChange={handleFormChange}
                required
                className="input-field"
              />
              <input
                type="text"
                name="last_name"
                placeholder="Last Name"
                value={formData.last_name}
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
                className="input-field md:col-span-2"
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
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedCandidates.length === candidates.length && candidates.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Email</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Position</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Assigned To</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {candidates.map((candidate) => (
                    <tr key={candidate.id} className={`hover:bg-gray-50 ${selectedCandidates.includes(candidate.id) ? 'bg-primary-50' : ''}`}>
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedCandidates.includes(candidate.id)}
                          onChange={() => toggleCandidateSelection(candidate.id)}
                          className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {(candidate as any).first_name && (candidate as any).last_name 
                          ? `${(candidate as any).first_name} ${(candidate as any).last_name}`
                          : candidate.full_name || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{candidate.email}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{candidate.position || '-'}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-primary-100 text-primary-800">
                          {candidate.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {(candidate as any).assigned_to ? (
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                              {(candidate as any).assigned_employee_name || 'Assigned'}
                            </span>
                            <button
                              onClick={() => handleRevokeAssignment(candidate.id)}
                              disabled={assigning}
                              className="text-red-600 hover:text-red-800 text-xs"
                              title="Revoke assignment"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <select
                            onChange={(e) => handleAssignCandidate(candidate.id, e.target.value)}
                            disabled={assigning}
                            className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-primary-500 focus:border-primary-500"
                            defaultValue=""
                          >
                            <option value="">Select employee...</option>
                            {employees
                              .filter(emp => emp.can_accept_more)
                              .map((emp) => (
                                <option key={emp.id} value={emp.id}>
                                  {emp.name} ({emp.available_slots} slots)
                                </option>
                              ))}
                            {employees.length > 0 && employees.filter(emp => emp.can_accept_more).length === 0 && (
                              <option disabled>All employees at capacity</option>
                            )}
                          </select>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm space-x-3">
                        <button
                          onClick={() => router.push(`/candidates/${candidate.id}`)}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleDeleteCandidate(candidate.id)}
                          disabled={deleting === candidate.id}
                          className="text-red-600 hover:text-red-900 disabled:opacity-50"
                        >
                          {deleting === candidate.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalCandidates > pageSize && (
          <div className="mt-6 flex justify-center items-center space-x-4">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-gray-700">
              Page {currentPage} of {Math.ceil(totalCandidates / pageSize)}
            </span>
            <button
              onClick={() => setCurrentPage(p => p + 1)}
              disabled={currentPage >= Math.ceil(totalCandidates / pageSize)}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <BulkImportModal
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        onSuccess={() => {
          // Refresh candidates list
          window.location.reload()
        }}
      />

      {/* Bulk Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Assign {selectedCandidates.length} Candidate(s)
            </h3>
            
            {selectedCandidates.length > 10 && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Maximum 10 candidates can be assigned to one employee. Please reduce selection.
              </div>
            )}

            {/* Warning if selected employee doesn't have enough slots */}
            {selectedEmployee && (() => {
              const emp = employees.find(e => e.id === selectedEmployee)
              if (emp && emp.available_slots < selectedCandidates.length) {
                return (
                  <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded text-orange-800 text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {emp.name} can only accept {emp.available_slots} more candidate(s). Please reduce selection.
                  </div>
                )
              }
              return null
            })()}
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Employee
              </label>
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Choose an employee...</option>
                {employees
                  .filter(emp => emp.can_accept_more) // Only show employees with available slots
                  .map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} - {emp.assigned_count}/10 assigned ({emp.available_slots} slots available)
                    </option>
                  ))}
              </select>
              {employees.length > 0 && employees.filter(emp => emp.can_accept_more).length === 0 && (
                <p className="mt-2 text-sm text-red-600">
                  All employees have reached their maximum capacity (10 candidates each).
                </p>
              )}
              {employees.length === 0 && (
                <p className="mt-2 text-sm text-gray-500">
                  No employees found. Please add employees first from the HR dashboard.
                </p>
              )}
            </div>
            
            <div className="mb-4 text-sm text-gray-600">
              <p><strong>Selected candidates:</strong></p>
              <ul className="mt-2 max-h-32 overflow-y-auto">
                {selectedCandidates.slice(0, 5).map(id => {
                  const c = candidates.find(c => c.id === id)
                  return c ? <li key={id} className="py-1">- {c.email}</li> : null
                })}
                {selectedCandidates.length > 5 && (
                  <li className="py-1 text-gray-500">...and {selectedCandidates.length - 5} more</li>
                )}
              </ul>
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAssignModal(false)
                  setSelectedEmployee('')
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAssign}
                disabled={
                  assigning || 
                  !selectedEmployee || 
                  selectedCandidates.length > 10 ||
                  (selectedEmployee && (() => {
                    const emp = employees.find(e => e.id === selectedEmployee)
                    return emp ? emp.available_slots < selectedCandidates.length : true
                  })())
                }
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {assigning ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
