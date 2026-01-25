'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import { Navigation } from '@/components/Navigation'
import { Card } from '@/components/Card'

interface Employee {
  id: string
  email: string
  name: string
  role: string
  department: string
  is_active: boolean
  assigned_count: number
  can_accept_more: boolean
  available_slots: number
}

interface Candidate {
  id: string
  email: string
  first_name: string
  last_name: string
  position: string
  domain: string
  status: string
  assigned_to: string | null
  assigned_employee_name: string | null
}

export default function AssignCandidatesPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  
  const [employees, setEmployees] = useState<Employee[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  const [searchTerm, setSearchTerm] = useState('')
  const [assignmentFilter, setAssignmentFilter] = useState('all')
  const [assigningId, setAssigningId] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/auth/login')
        return
      }
      if (!['SYSTEM_ADMIN', 'HR'].includes(user.role)) {
        router.push('/dashboard')
        return
      }
    }
  }, [user, authLoading, router])

  const fetchData = useCallback(async () => {
    if (!user) return
    
    try {
      setLoading(true)
      setError('')
      
      const employeesData = await apiClient.get<Employee[]>('/hr/employees')
      setEmployees(employeesData || [])
      
      const candidatesData = await apiClient.get<{ candidates: Candidate[] }>('/candidates?limit=100')
      setCandidates(candidatesData.candidates || [])
    } catch (err: any) {
      console.error('Error fetching data:', err)
      setError(err.response?.data?.detail || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user && !authLoading) {
      fetchData()
    }
  }, [user, authLoading, fetchData])

  const handleAssign = async (candidateId: string, employeeId: string) => {
    if (!employeeId) return
    
    try {
      setAssigningId(candidateId)
      setError('')
      
      await apiClient.post(`/hr/candidates/${candidateId}/assign?employee_id=${employeeId}`, {})
      
      setSuccess('Candidate assigned successfully!')
      await fetchData()
      
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to assign candidate')
    } finally {
      setAssigningId(null)
    }
  }

  const handleUnassign = async (candidateId: string) => {
    try {
      setAssigningId(candidateId)
      setError('')
      await apiClient.delete(`/hr/candidates/${candidateId}/assign`)
      setSuccess('Assignment removed successfully!')
      await fetchData()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to remove assignment')
    } finally {
      setAssigningId(null)
    }
  }

  const filteredCandidates = candidates.filter(c => {
    const matchesSearch = 
      c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.position?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesFilter = 
      assignmentFilter === 'all' ? true :
      assignmentFilter === 'unassigned' ? !c.assigned_to :
      assignmentFilter === 'assigned' ? !!c.assigned_to : true
    
    return matchesSearch && matchesFilter
  })

  const availableEmployees = employees.filter(e => e.can_accept_more)

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Assign Candidates to Employees</h1>
          <p className="text-gray-600 mt-1">Select an employee from the dropdown to assign each candidate</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-600">{success}</p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{candidates.length}</p>
            <p className="text-sm text-gray-500">Total Candidates</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">
              {candidates.filter(c => !c.assigned_to).length}
            </p>
            <p className="text-sm text-gray-500">Unassigned</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {candidates.filter(c => c.assigned_to).length}
            </p>
            <p className="text-sm text-gray-500">Assigned</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{availableEmployees.length}</p>
            <p className="text-sm text-gray-500">Available Employees</p>
          </Card>
        </div>

        <Card className="mb-6">
          <div className="p-4 flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search candidates..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <select
                value={assignmentFilter}
                onChange={(e) => setAssignmentFilter(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              >
                <option value="all">All Candidates</option>
                <option value="unassigned">Unassigned Only</option>
                <option value="assigned">Assigned Only</option>
              </select>
            </div>
          </div>
        </Card>

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Candidate</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Position</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Assign To Employee</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      No candidates found
                    </td>
                  </tr>
                ) : (
                  filteredCandidates.map((candidate) => (
                    <tr key={candidate.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center">
                            <span className="text-brand-600 font-medium">
                              {candidate.first_name?.[0]}{candidate.last_name?.[0]}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {candidate.first_name} {candidate.last_name}
                            </div>
                            <div className="text-sm text-gray-500">{candidate.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{candidate.position || '-'}</div>
                        <div className="text-xs text-gray-500">{candidate.domain || '-'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          candidate.assigned_to 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {candidate.assigned_to ? 'Assigned' : 'Unassigned'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {candidate.assigned_to ? (
                          <span className="text-sm text-gray-900 font-medium">
                            {candidate.assigned_employee_name || 'Assigned'}
                          </span>
                        ) : (
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleAssign(candidate.id, e.target.value)
                              }
                            }}
                            disabled={assigningId === candidate.id || availableEmployees.length === 0}
                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed min-w-[200px]"
                            defaultValue=""
                          >
                            <option value="">
                              {availableEmployees.length === 0 
                                ? 'No employees available' 
                                : 'Select employee...'}
                            </option>
                            {availableEmployees.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.name} ({emp.assigned_count}/10)
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {candidate.assigned_to && (
                          <button
                            onClick={() => handleUnassign(candidate.id)}
                            disabled={assigningId === candidate.id}
                            className="px-3 py-1.5 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded disabled:opacity-50"
                          >
                            {assigningId === candidate.id ? 'Removing...' : 'Remove'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {availableEmployees.length === 0 && employees.length === 0 && (
          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-yellow-800 text-sm">
              <strong>No employees found.</strong> Add employees from the HR Dashboard to assign candidates to them.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
