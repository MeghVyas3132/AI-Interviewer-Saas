'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import { Card } from '@/components/Card'

interface HRMetrics {
  total_candidates: number
  active_candidates: number
  total_employees: number
  pending_interviews: number
}

interface CompanyInfo {
  id: string
  name: string
}

interface Employee {
  id: string
  name: string
  email: string
  role: string
  department: string
  is_active: boolean
  created_at: string
}

export default function HRDashboard() {
  const router = useRouter()
  const { user, isLoading: authLoading, logout } = useAuth()
  const [metrics, setMetrics] = useState<HRMetrics | null>(null)
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  // Add Employee Modal State
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [addingEmployee, setAddingEmployee] = useState(false)
  const [addEmployeeError, setAddEmployeeError] = useState('')
  const [addEmployeeSuccess, setAddEmployeeSuccess] = useState('')
  const [newEmployee, setNewEmployee] = useState({
    name: '',
    email: '',
    password: '',
    department: '',
    role: 'EMPLOYEE'
  })

  // Check if user is HR
  useEffect(() => {
    if (!authLoading && user?.role !== 'HR') {
      router.push('/dashboard')
    }
  }, [authLoading, user, router])

  // Fetch HR metrics and company info
  useEffect(() => {
    if (authLoading || user?.role !== 'HR') return

    const fetchData = async () => {
      try {
        setLoading(true)
        setError('')

        // Fetch metrics
        try {
          const metricsData = await apiClient.get<HRMetrics>('/hr/metrics')
          setMetrics(metricsData)
        } catch (err) {
          console.error('Error fetching HR metrics:', err)
          setMetrics({
            total_candidates: 0,
            active_candidates: 0,
            total_employees: 0,
            pending_interviews: 0,
          })
        }

        // Fetch company info
        if (user?.company_id) {
          try {
            const companyData = await apiClient.get<CompanyInfo>(`/company/${user.company_id}`)
            setCompany(companyData)
          } catch (err) {
            console.error('Error fetching company info:', err)
          }
        }

        // Fetch employees
        try {
          const employeesData = await apiClient.get<Employee[]>('/hr/employees')
          setEmployees(employeesData || [])
        } catch (err) {
          console.error('Error fetching employees:', err)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [authLoading, user])

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddingEmployee(true)
    setAddEmployeeError('')
    setAddEmployeeSuccess('')

    try {
      await apiClient.post('/users', {
        name: newEmployee.name,
        email: newEmployee.email,
        password: newEmployee.password,
        department: newEmployee.department || null,
        role: newEmployee.role
      })

      setAddEmployeeSuccess(`Team member ${newEmployee.name} added successfully as ${newEmployee.role}!`)
      setNewEmployee({ name: '', email: '', password: '', department: '', role: 'EMPLOYEE' })
      
      // Refresh employees list and metrics
      const employeesData = await apiClient.get<Employee[]>('/hr/employees')
      setEmployees(employeesData || [])
      const metricsData = await apiClient.get<HRMetrics>('/hr/metrics')
      setMetrics(metricsData)
      
      setTimeout(() => {
        setShowAddEmployee(false)
        setAddEmployeeSuccess('')
      }, 2000)
    } catch (err: any) {
      console.error('Error adding employee:', err)
      const errorMessage = err.response?.data?.detail
      if (Array.isArray(errorMessage)) {
        setAddEmployeeError(errorMessage.map((e: any) => e.msg || e.message || JSON.stringify(e)).join(', '))
      } else if (typeof errorMessage === 'object') {
        setAddEmployeeError(JSON.stringify(errorMessage))
      } else {
        setAddEmployeeError(errorMessage || 'Failed to add employee')
      }
    } finally {
      setAddingEmployee(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    router.push('/auth/login')
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-primary-600">AI Interviewer</h1>
              {company && (
                <span className="ml-4 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                  {company.name}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700 font-medium">{user?.full_name || user?.email}</span>
              <span className="text-gray-400">|</span>
              <span className="text-sm text-gray-500">{user?.role}</span>
              <button
                onClick={handleLogout}
                className="ml-4 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">HR Dashboard</h1>
          <p className="mt-2 text-gray-600">Overview and quick access to HR functions</p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Metrics Cards */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Candidates</p>
                  <p className="text-3xl font-bold text-gray-900">{metrics.total_candidates}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Active Candidates</p>
                  <p className="text-3xl font-bold text-green-600">{metrics.active_candidates}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Employees</p>
                  <p className="text-3xl font-bold text-purple-600">{metrics.total_employees}</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Pending Interviews</p>
                  <p className="text-3xl font-bold text-orange-600">{metrics.pending_interviews}</p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Candidates Card */}
          <Link href="/candidates" className="block">
            <Card className="!p-0">
              <div className="p-6 hover:bg-gray-50 transition-colors cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">Manage Candidates</h3>
                    <p className="text-sm text-gray-600">View, add, import and manage all candidates</p>
                  </div>
                  <div className="text-gray-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Card>
          </Link>

          {/* Interviews Card */}
          <Link href="/interviews" className="block">
            <Card className="!p-0">
              <div className="p-6 hover:bg-gray-50 transition-colors cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">View Interviews</h3>
                    <p className="text-sm text-gray-600">Schedule and track candidate interviews</p>
                  </div>
                  <div className="text-gray-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Card>
          </Link>

          {/* Dashboard Card */}
          <Link href="/dashboard" className="block">
            <Card className="!p-0">
              <div className="p-6 hover:bg-gray-50 transition-colors cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">Main Dashboard</h3>
                    <p className="text-sm text-gray-600">View overall system dashboard</p>
                  </div>
                  <div className="text-gray-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        </div>

        {/* Status Summary */}
        <div className="mt-8">
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">Candidate Pipeline</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">Active in pipeline</span>
                    <span className="text-sm font-semibold text-green-600">{metrics?.active_candidates || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">Total candidates</span>
                    <span className="text-sm font-semibold text-gray-900">{metrics?.total_candidates || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">Pending interviews</span>
                    <span className="text-sm font-semibold text-orange-600">{metrics?.pending_interviews || 0}</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">Team Overview</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">Total employees</span>
                    <span className="text-sm font-semibold text-purple-600">{metrics?.total_employees || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Employees Section */}
        <div className="mt-8">
          <Card>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
                <p className="text-sm text-gray-500">Employees, Team Leads, and HR users in your company</p>
              </div>
              <button
                onClick={() => setShowAddEmployee(true)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Team Member
              </button>
            </div>

            {employees.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="text-gray-600 mb-2">No team members yet</p>
                <p className="text-sm text-gray-500">Add employees, team leads, or other HRs</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Name</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Email</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Department</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Role</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{emp.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{emp.email}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{emp.department}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                            {emp.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            emp.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {emp.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Add Team Member Modal */}
      {showAddEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">Add Team Member</h2>
                <button
                  onClick={() => {
                    setShowAddEmployee(false)
                    setAddEmployeeError('')
                    setAddEmployeeSuccess('')
                    setNewEmployee({ name: '', email: '', password: '', department: '', role: 'EMPLOYEE' })
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {addEmployeeError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {addEmployeeError}
                </div>
              )}

              {addEmployeeSuccess && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                  {addEmployeeSuccess}
                </div>
              )}

              <form onSubmit={handleAddEmployee} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newEmployee.name}
                    onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={newEmployee.email}
                    onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="john@company.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={newEmployee.password}
                    onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Min 8 chars, uppercase, lowercase, number, special char"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Must contain: 8+ characters, uppercase, lowercase, number, special character (!@#$%^&*)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={newEmployee.department}
                    onChange={(e) => setNewEmployee({ ...newEmployee, department: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Engineering, Sales, etc."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    value={newEmployee.role}
                    onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="EMPLOYEE">Employee</option>
                    <option value="TEAM_LEAD">Team Lead</option>
                    <option value="HR">HR</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    HR users can manage candidates, employees, and other HRs
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddEmployee(false)
                      setAddEmployeeError('')
                      setAddEmployeeSuccess('')
                      setNewEmployee({ name: '', email: '', password: '', department: '', role: 'EMPLOYEE' })
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                    disabled={addingEmployee}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={addingEmployee}
                  >
                    {addingEmployee ? 'Adding...' : 'Add Team Member'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
