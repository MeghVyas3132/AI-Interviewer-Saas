'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { EmployeeModal } from '@/components/EmployeeModal'
import { AssignCandidateModal } from '@/components/AssignCandidateModal'
import { Navigation } from '@/components/Navigation'
import { KanbanCandidatePipeline } from '@/components/KanbanCandidatePipeline'
import { AIConfigManager } from '@/components/ai-admin'
import { AIAnalyticsDashboard } from '@/components/ai-analytics'
import { aiServiceClient } from '@/services/ai-service-client'
import BulkImportModal from '@/components/BulkImportModal'
import CandidateProfileModal from '@/components/CandidateProfileModal'

interface Candidate {
  id: string
  email: string
  name: string
  first_name?: string
  last_name?: string
  status: string
  created_at: string
  assigned_to?: string
  scheduled_at?: string
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
  const [activeTab, setActiveTab] = useState<'overview' | 'candidates' | 'employees' | 'pipeline' | 'ai-tools' | 'ai-reports'>('overview')
  const [activeFilter, setActiveFilter] = useState<'all' | 'assigned' | 'unassigned'>('all')
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  // Delete all confirmation modal
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false)
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('')
  const [isDeletingAll, setIsDeletingAll] = useState(false)
  // Kanban pipeline state
  const [pendingPipeline, setPendingPipeline] = useState<Record<string, string>>({})
  const [pipelineDirty, setPipelineDirty] = useState(false)

  const handleStageChange = (candidateId: string, newStage: string) => {
    setPendingPipeline(prev => ({ ...prev, [candidateId]: newStage }))
    setPipelineDirty(true)
  }
  const handleUndoPipeline = () => {
    setPendingPipeline({})
    setPipelineDirty(false)
  }
  const handleConfirmPipeline = async () => {
    // For each candidate with a changed stage, send update to backend
    try {
      await Promise.all(Object.entries(pendingPipeline).map(([id, status]) =>
        apiClient.patch(`/candidates/${id}`, { status })
      ))
      setPendingPipeline({})
      setPipelineDirty(false)
      fetchData()
    } catch (err) {
      alert('Failed to update pipeline. Please try again.')
    }
  }

  // Filter Selection Logic
  const filteredCandidates = candidates.filter(candidate => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'assigned') return !!candidate.assigned_to;
    if (activeFilter === 'unassigned') return !candidate.assigned_to;
    return true;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredCandidates.length / itemsPerPage);
  const paginatedCandidates = filteredCandidates.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter]);

  const handleDeleteCandidate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this candidate?')) return;
    try {
      await apiClient.delete(`/candidates/${id}`);
      setCandidates(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Failed to delete candidate');
    }
  };

  // Delete employee handler
  const handleDeleteEmployee = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete employee "${name}"? This action cannot be undone.`)) return;
    try {
      await apiClient.delete(`/users/${id}`);
      setEmployees(prev => prev.filter(e => e.id !== id));
    } catch (err: any) {
      console.error('Failed to delete employee:', err);
      alert(err.response?.data?.detail || 'Failed to delete employee');
    }
  };

  // Delete all candidates handler
  const handleDeleteAllCandidates = async () => {
    if (deleteAllConfirmText !== 'DELETE ALL') return;
    
    setIsDeletingAll(true);
    try {
      // Delete all candidates one by one (or use bulk endpoint if available)
      await Promise.all(candidates.map(c => apiClient.delete(`/candidates/${c.id}`)));
      setCandidates([]);
      setShowDeleteAllModal(false);
      setDeleteAllConfirmText('');
    } catch (err) {
      console.error('Failed to delete all candidates:', err);
      alert('Failed to delete all candidates. Some may have been deleted.');
      fetchData(); // Refresh to get current state
    } finally {
      setIsDeletingAll(false);
    }
  };

  // Modal States
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false)
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)

  // Check if user has HR or Admin access
  useEffect(() => {
    if (!authLoading && !['HR', 'ADMIN', 'SYSTEM_ADMIN'].includes(user?.role || '')) {
      router.push('/dashboard')
    }
  }, [authLoading, user?.role, router])

  // Fetch HR data
  const fetchData = async () => {
    try {
      setLoading(true)
      setError('')

      // Fetch candidates for this company
      const { candidates = [] } = await apiClient.get<{ candidates: Candidate[] }>('/candidates')
      setCandidates(candidates)

      // Fetch employees (users with role EMPLOYEE/TEAM_LEAD)
      const empData = await apiClient.get<Employee[]>('/users?role=EMPLOYEE') // Assuming simplified endpoint or filtering
      // If endpoint returns UserListResponse array, adaptable.
      // Mocking fetch of employees if direct endpoint isn't perfectly mapped yet or using a known working one:
      // In real scenario, we'd hit /api/v1/hr/employees or similar exposed in hr.py
      const hrEmployeesRes = await apiClient.get<{ items: Employee[] }>('/hr/employees?limit=100')
      // Note: backend 'get_employees' returns custom structure, adjusting if needed.
      // Assuming it returns standard pagination or list. 
      // Safely handling potential response structure variation
      const empList = Array.isArray(hrEmployeesRes) ? hrEmployeesRes : (hrEmployeesRes.items || [])
      setEmployees(empList)

      // Fetch interviews to map schedules
      const interviewsResponse = await apiClient.get<any[]>('/hr/interviews')
      const interviews = Array.isArray(interviewsResponse) ? interviewsResponse : []

      // Create a map of candidateId -> scheduled_at (using the latest or upcoming interview)
      const scheduleMap = new Map<string, string>()
      interviews.forEach((interview) => {
        if (interview.candidate_id && interview.status === 'SCHEDULED' && interview.scheduled_time) {
          // Simple logic: overwrite with latest found, or check dates if needed. 
          // Assuming API returns latest first or we just want *an* upcoming one.
          scheduleMap.set(interview.candidate_id, interview.scheduled_time)
        }
      })

      // Enrich candidates with schedule info and name
      const enrichedCandidates = candidates.map(c => ({
        ...c,
        name: c.first_name && c.last_name ? `${c.first_name} ${c.last_name}` : c.email,
        scheduled_at: scheduleMap.get(c.id)
      }))
      
      // Debug: Log assigned_to values
      console.log('Candidates with assigned_to:', enrichedCandidates.map(c => ({
        name: c.name,
        assigned_to: c.assigned_to,
        assigned_employee_name: (c as any).assigned_employee_name
      })))
      
      setCandidates(enrichedCandidates)


      // Calculate metrics from candidates data (or fetch real metrics /hr/metrics)
      const metricsRes = await apiClient.get<HRMetrics>('/hr/metrics')
      setMetrics(metricsRes)

    } catch (err: any) {
      console.error('Error fetching HR data:', err)
      if (err.message === 'Network Error') {
        setError('Network error: Unable to connect to the server. Please check if the backend is running and CORS is configured.')
      } else {
        setError(err.response?.data?.detail || 'Failed to load dashboard data. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    // Allow HR, ADMIN, and SYSTEM_ADMIN roles to access this dashboard
    if (!['HR', 'ADMIN', 'SYSTEM_ADMIN'].includes(user?.role || '')) return
    fetchData()
  }, [authLoading, user])

  const handleAssignClick = (candidateId: string) => {
    setSelectedCandidateId(candidateId)
    setIsAssignModalOpen(true)
  }

  const handleCandidateClick = (candidateId: string) => {
    setSelectedCandidateId(candidateId)
    setIsProfileModalOpen(true)
  }

  const handleCreateAIInterview = async (candidateId: string) => {
    try {
      const resp = await apiClient.post(`/hr/interviews/generate-ai-token/${candidateId}`, {});
      alert('AI Interview created successfully! The candidate can now start the interview from their portal.');
      fetchData();
    } catch (err) {
      console.error('Failed to create AI interview:', err);
      alert('Failed to create AI interview. Please try again.');
    }
  };

  if (authLoading || (loading && !metrics)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8 flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">HR Dashboard</h1>
              <p className="mt-2 text-gray-600 font-medium">Manage talent pipeline • {user?.company_id?.slice(0, 8)}</p>
            </div>
          </div>

          {error && (
            <div className="mb-8 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-700 flex justify-between items-center shadow-sm">
              <span className="font-medium">{error}</span>
              <Button
                onClick={() => { fetchData() }}
                variant="outline"
                className="bg-white hover:bg-red-50 text-red-600 border-red-200 rounded-xl"
                size="sm"
              >
                Retry
              </Button>
            </div>
          )}

          {/* Navigation Tabs (Window Style) - Global */}
          <div className="mb-8">
            <div className="bg-gray-100/50 border border-gray-200 rounded-2xl p-1.5 inline-flex gap-1 shadow-sm backdrop-blur-sm">
              {['Overview', 'Candidates', 'Pipeline', 'Job Listing', 'Employees', 'AI Tools', 'AI Reports'].map((tab) => {
                const tabKey = tab.toLowerCase().replace(' ', '-') as typeof activeTab;
                const isActive = activeTab === tabKey;
                if (tab === 'Job Listing') {
                  return (
                    <a
                      key={tabKey}
                      href="/hr/jobs"
                      className={`px-6 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 ${isActive
                        ? 'bg-white text-primary-600 shadow-lg ring-1 ring-black/5 scale-105'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-white/50'
                        }`}
                    >
                      {tab}
                    </a>
                  );
                }
                return (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => setActiveTab(tabKey)}
                    className={`px-6 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 ${isActive
                      ? 'bg-white text-primary-600 shadow-lg ring-1 ring-black/5 scale-105'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-white/50'
                      }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab Content */}
          <div className="min-h-[400px]">
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* Metrics Cards inside Overview */}
                {metrics && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card className="hover:shadow-md transition-shadow border-none ring-1 ring-gray-100">
                      <div className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-500 mb-1">Total Candidates</p>
                            <p className="text-3xl font-bold text-gray-900">{metrics.total_candidates}</p>
                          </div>
                          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center">
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </Card>

                    <Card className="hover:shadow-md transition-shadow border-none ring-1 ring-gray-100">
                      <div className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-500 mb-1">Active Pipeline</p>
                            <p className="text-3xl font-bold text-gray-900">{metrics.active_candidates}</p>
                          </div>
                          <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center">
                            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </Card>

                    <Card className="hover:shadow-md transition-shadow border-none ring-1 ring-gray-100">
                      <div className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-500 mb-1">Total Employees</p>
                            <p className="text-3xl font-bold text-gray-900">{metrics.total_employees}</p>
                          </div>
                          <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center">
                            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </Card>

                    <Card className="hover:shadow-md transition-shadow border-none ring-1 ring-gray-100">
                      <div className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-500 mb-1">Pending Interviews</p>
                            <p className="text-3xl font-bold text-gray-900">{metrics.pending_interviews}</p>
                          </div>
                          <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center">
                            <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>
                )}

                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 min-h-[500px]">
                  <div className="mb-10">
                    <h2 className="text-3xl font-bold text-gray-900">AI Hiring Assistant</h2>
                    <p className="text-lg text-gray-500 mt-2 font-medium">Your intelligent partner for resume screening, interview evaluation, and candidate insights.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card className="p-8 bg-blue-50/50 border-blue-100 rounded-3xl border-none ring-1 ring-blue-100 shadow-none">
                      <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-200">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a2 2 0 00-1.96 1.414l-.722 2.166a2 2 0 01-2.433 1.282l-2.527-.632A2 2 0 017 15.15V13h10v2.15a2 2 0 01-1.472 1.933l-2.527.632a2 2 0 01-2.433-1.282l-.722-2.166a2 2 0 00-1.96-1.414l-2.387.477a2 2 0 00-1.022.547" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-blue-900 mb-3">Automated Screenings</h3>
                      <p className="text-blue-700 mb-8 leading-relaxed font-medium">Let our AI interview candidates at scale. Set your requirements once and let the system do the heavy lifting.</p>
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all active:scale-95 border-none" onClick={() => setActiveTab('ai-tools')}>
                        Configure AI Flow
                      </Button>
                    </Card>
                    <Card className="p-8 bg-purple-50/50 border-purple-100 rounded-3xl border-none ring-1 ring-purple-100 shadow-none">
                      <div className="w-14 h-14 bg-purple-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-purple-200">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-purple-900 mb-3">Talent Insights</h3>
                      <p className="text-purple-700 mb-8 leading-relaxed font-medium">Deep dive into candidate performance with AI-generated reports and match scores.</p>
                      <Button className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-purple-200 transition-all active:scale-95 border-none" onClick={() => setActiveTab('ai-reports')}>
                        View AI Reports
                      </Button>
                    </Card>
                  </div>
                  <div className="mt-16">
                    <h3 className="text-2xl font-bold text-gray-900 mb-6">Recommended Actions</h3>
                    <div className="space-y-4">
                      {candidates.filter(c => c.status === 'Applied').slice(0, 3).map(c => (
                        <div key={c.id} className="flex items-center justify-between p-5 bg-gray-50/50 rounded-2xl border border-gray-100 hover:bg-white hover:shadow-md transition-all group">
                          <div className="flex items-center gap-5">
                            <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center font-bold text-gray-400 border border-gray-100 group-hover:bg-primary-50 group-hover:text-primary-600 transition-colors">
                              {c.name?.charAt(0) || '?'}
                            </div>
                            <div>
                              <p className="text-lg font-bold text-gray-900">{c.name || 'Unknown'}</p>
                              <p className="text-base text-gray-500 font-medium">Applied for Frontend Developer</p>
                            </div>
                          </div>
                          <Button size="lg" variant="outline" className="rounded-xl px-8 font-bold text-primary-600 border-primary-100 bg-white hover:bg-primary-50" onClick={() => handleCreateAIInterview(c.id)}>
                            Assign AI Interview
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'candidates' && (
              <Card className="rounded-3xl overflow-hidden shadow-sm border-gray-100 border-none ring-1 ring-gray-100">
                <div className="p-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div className="flex items-center gap-6">
                      <h2 className="text-2xl font-bold text-gray-900">All Candidates</h2>
                      <div className="flex bg-gray-100/80 rounded-2xl p-1 backdrop-blur-sm border">
                        <button
                          onClick={() => setActiveFilter('all')}
                          className={`px-5 py-2 text-sm rounded-xl transition-all font-bold ${activeFilter === 'all' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                          All
                        </button>
                        <button
                          onClick={() => setActiveFilter('assigned')}
                          className={`px-5 py-2 text-sm rounded-xl transition-all font-bold ${activeFilter === 'assigned' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                          Assigned
                        </button>
                        <button
                          onClick={() => setActiveFilter('unassigned')}
                          className={`px-5 py-2 text-sm rounded-xl transition-all font-bold ${activeFilter === 'unassigned' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                          Unassigned
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button 
                        variant="outline" 
                        className="rounded-xl px-6 font-bold text-red-600 border-red-200 bg-white hover:bg-red-50" 
                        onClick={() => setShowDeleteAllModal(true)}
                        disabled={candidates.length === 0}
                      >
                        Delete All
                      </Button>
                      <Button variant="outline" className="rounded-xl px-6 font-bold text-gray-600 bg-white border-gray-200" onClick={() => setIsBulkImportModalOpen(true)}>Import CSV</Button>
                      <Button className="rounded-xl px-6 font-bold" onClick={() => router.push('/candidates/new')}>+ Add Candidate</Button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 font-bold text-gray-400 text-xs uppercase tracking-wider">
                          <th className="px-6 py-4 text-left">Candidate</th>
                          <th className="px-6 py-4 text-left">Status</th>
                          <th className="px-6 py-4 text-left">Applied Date</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {paginatedCandidates.map((candidate) => (
                          <tr key={candidate.id} className="group hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => handleCandidateClick(candidate.id)}>
                            <td className="px-6 py-5 whitespace-nowrap">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center font-bold text-gray-400 border border-gray-100">
                                  {candidate.name?.charAt(0) || '?'}
                                </div>
                                <div>
                                  <div className="text-base font-bold text-gray-900">{candidate.name || 'Unknown'}</div>
                                  <div className="text-sm text-gray-400 font-medium">{candidate.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap">
                              <span className={`px-4 py-1.5 inline-flex text-xs leading-5 font-bold rounded-xl shadow-sm ${candidate.status === 'hired' ? 'bg-green-50 text-green-600 ring-1 ring-green-100' :
                                candidate.status === 'rejected' ? 'bg-red-50 text-red-600 ring-1 ring-red-100' :
                                  'bg-blue-50 text-blue-600 ring-1 ring-blue-100'
                                }`}>
                                {candidate.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-500 font-bold">
                              {new Date(candidate.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-1 group-hover:translate-x-0">
                                <Button size="sm" variant="outline" className="rounded-xl font-bold bg-white" onClick={(e) => { e.stopPropagation(); handleAssignClick(candidate.id); }}>
                                  {candidate.assigned_to ? 'Reassign' : 'Assign'}
                                </Button>
                                <Button size="sm" variant="outline" className="rounded-xl font-bold text-red-600 hover:bg-red-50 border-red-100 bg-white" onClick={(e) => handleDeleteCandidate(candidate.id, e)}>
                                  Delete
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                      <div className="text-sm text-gray-500 font-medium">
                        Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredCandidates.length)} of {filteredCandidates.length} candidates
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl font-bold"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${
                                currentPage === page
                                  ? 'bg-primary-600 text-white'
                                  : 'text-gray-500 hover:bg-gray-100'
                              }`}
                            >
                              {page}
                            </button>
                          ))}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl font-bold"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {activeTab === 'pipeline' && (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 ring-1 ring-gray-50">
                <KanbanCandidatePipeline
                  candidates={candidates}
                  pendingChanges={pendingPipeline}
                  onStageChange={handleStageChange}
                  onUndo={pipelineDirty ? handleUndoPipeline : undefined}
                  onConfirm={pipelineDirty ? handleConfirmPipeline : undefined}
                />
              </div>
            )}

            {activeTab === 'employees' && (
              <Card className="rounded-3xl shadow-sm border-gray-100 overflow-hidden p-8 border-none ring-1 ring-gray-100">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold text-gray-900">Employee Directory</h2>
                  <Button className="rounded-xl px-6 font-bold shadow-lg shadow-primary-50" onClick={() => setIsEmployeeModalOpen(true)}>Add Team Member</Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {employees.map((emp) => (
                    <div key={emp.id} className="p-6 bg-gray-50/50 rounded-3xl border border-gray-100 hover:bg-white hover:shadow-xl hover:border-transparent transition-all group relative">
                      <div className="flex items-center gap-5">
                        <div className="w-16 h-16 bg-white shadow-md rounded-2xl flex items-center justify-center font-bold text-2xl text-primary-600 border border-gray-100 group-hover:scale-105 transition-transform group-hover:bg-primary-50">
                          {emp.name?.charAt(0) || '?'}
                        </div>
                        <div className="flex-1">
                          <p className="text-lg font-bold text-gray-900 leading-tight">{emp.name || 'Unknown'}</p>
                          <p className="text-sm text-gray-500 font-bold mt-1 uppercase tracking-wider">{emp.role}</p>
                          <p className="text-xs text-primary-600 font-black mt-1 bg-primary-50 inline-block px-2 py-0.5 rounded-lg">{emp.department || 'General'}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                          title="Delete employee"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {activeTab === 'ai-tools' && (
              <div className="bg-white rounded-3xl shadow-2xl shadow-primary-100/20 border border-gray-100 p-8 min-h-[600px] ring-1 ring-gray-50">
                <AIConfigManager />
              </div>
            )}

            {activeTab === 'ai-reports' && (
              <div className="bg-white rounded-3xl shadow-2xl shadow-purple-100/20 border border-gray-100 p-8 min-h-[600px] ring-1 ring-gray-50">
                <AIAnalyticsDashboard />
              </div>
            )}
          </div>
        </div>
      </div>

      <EmployeeModal
        isOpen={isEmployeeModalOpen}
        onClose={() => setIsEmployeeModalOpen(false)}
        onSuccess={fetchData}
      />

      <AssignCandidateModal
        isOpen={isAssignModalOpen}
        onClose={() => {
          setIsAssignModalOpen(false)
          setSelectedCandidateId(null)
        }}
        candidateId={selectedCandidateId}
        employees={employees}
        onSuccess={fetchData}
      />

      <BulkImportModal
        isOpen={isBulkImportModalOpen}
        onClose={() => setIsBulkImportModalOpen(false)}
        onSuccess={fetchData}
      />

      <CandidateProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => {
          setIsProfileModalOpen(false)
          setSelectedCandidateId(null)
        }}
        candidateId={selectedCandidateId}
        useDetailedEndpoint={true}
        userRole="hr"
      />

      {/* Delete All Confirmation Modal */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Delete All Candidates</h3>
                <p className="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            
            <p className="text-gray-600 mb-6">
              You are about to permanently delete <span className="font-bold text-red-600">{candidates.length}</span> candidates. 
              This will remove all their data, interview history, and scores.
            </p>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type <span className="font-bold text-red-600">DELETE ALL</span> to confirm:
              </label>
              <input
                type="text"
                value={deleteAllConfirmText}
                onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                placeholder="Type DELETE ALL"
              />
            </div>
            
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 rounded-xl font-bold"
                onClick={() => {
                  setShowDeleteAllModal(false)
                  setDeleteAllConfirmText('')
                }}
                disabled={isDeletingAll}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white"
                onClick={handleDeleteAllCandidates}
                disabled={deleteAllConfirmText !== 'DELETE ALL' || isDeletingAll}
              >
                {isDeletingAll ? 'Deleting...' : 'Delete All'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
