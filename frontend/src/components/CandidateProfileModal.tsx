import React, { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api'
import { Button } from '@/components/Button'

interface CandidateProfile {
  id: string
  email: string
  first_name?: string
  last_name?: string
  phone?: string
  position?: string
  experience_years?: number
  status: string
  created_at: string
  resume_url?: string
  qualifications?: string
  notes?: string
  assigned_to?: string
  company_name?: string
}

interface Interview {
  id: string
  round: string
  status: string
  scheduled_time?: string
  score?: number
  feedback?: string
  ai_interview_token?: string
}

interface CandidateProfileModalProps {
  isOpen: boolean
  onClose: () => void
  candidateId: string | null
  onCreateAIInterview?: (candidateId: string) => void
}

export default function CandidateProfileModal({
  isOpen,
  onClose,
  candidateId,
  onCreateAIInterview,
}: CandidateProfileModalProps) {
  const [loading, setLoading] = useState(true)
  const [candidate, setCandidate] = useState<CandidateProfile | null>(null)
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'profile' | 'interviews' | 'notes'>('profile')
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  useEffect(() => {
    if (isOpen && candidateId) {
      fetchCandidateData()
    }
  }, [isOpen, candidateId])

  const fetchCandidateData = async () => {
    if (!candidateId) return
    
    setLoading(true)
    setError('')
    
    try {
      // Fetch candidate profile
      const candidateData = await apiClient.get<CandidateProfile>(`/candidates/${candidateId}`)
      setCandidate(candidateData)
      setNotes(candidateData.notes || '')
      
      // Fetch candidate interviews
      try {
        const interviewsData = await apiClient.get<Interview[]>(`/interviews?candidate_id=${candidateId}`)
        setInterviews(Array.isArray(interviewsData) ? interviewsData : [])
      } catch {
        setInterviews([])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load candidate data')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveNotes = async () => {
    if (!candidateId) return
    
    setSavingNotes(true)
    try {
      await apiClient.patch(`/candidates/${candidateId}`, { notes })
      setCandidate(prev => prev ? { ...prev, notes } : null)
    } catch (err) {
      console.error('Failed to save notes:', err)
    } finally {
      setSavingNotes(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'hired':
        return 'bg-green-100 text-green-800'
      case 'rejected':
        return 'bg-red-100 text-red-800'
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'scheduled':
        return 'bg-blue-100 text-blue-800'
      case 'screening':
        return 'bg-purple-100 text-purple-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-xl font-bold text-gray-900">Candidate Profile</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={fetchCandidateData}>Retry</Button>
            </div>
          ) : candidate ? (
            <>
              {/* Candidate Header */}
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center font-bold text-2xl text-primary-600">
                    {candidate.first_name?.charAt(0) || candidate.email.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-gray-900">
                      {candidate.first_name && candidate.last_name 
                        ? `${candidate.first_name} ${candidate.last_name}` 
                        : candidate.email}
                    </h3>
                    <p className="text-gray-500">{candidate.email}</p>
                    {candidate.position && (
                      <p className="text-sm text-gray-600 mt-1">{candidate.position}</p>
                    )}
                    <div className="flex items-center gap-3 mt-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(candidate.status)}`}>
                        {candidate.status?.toUpperCase()}
                      </span>
                      {candidate.experience_years !== undefined && (
                        <span className="text-sm text-gray-500">
                          {candidate.experience_years} years experience
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {onCreateAIInterview && (
                      <Button 
                        size="sm" 
                        onClick={() => onCreateAIInterview(candidate.id)}
                        className="bg-primary-600 hover:bg-primary-700"
                      >
                        Create AI Interview
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-100 px-6">
                <div className="flex gap-6">
                  {(['profile', 'interviews', 'notes'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`py-3 border-b-2 transition-colors font-medium ${
                        activeTab === tab 
                          ? 'border-primary-600 text-primary-600' 
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {activeTab === 'profile' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-500">Email</label>
                        <p className="text-gray-900">{candidate.email}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Phone</label>
                        <p className="text-gray-900">{candidate.phone || '-'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Position</label>
                        <p className="text-gray-900">{candidate.position || '-'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Experience</label>
                        <p className="text-gray-900">
                          {candidate.experience_years !== undefined 
                            ? `${candidate.experience_years} years` 
                            : '-'}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <label className="text-sm font-medium text-gray-500">Qualifications</label>
                        <p className="text-gray-900">{candidate.qualifications || '-'}</p>
                      </div>
                      <div className="col-span-2">
                        <label className="text-sm font-medium text-gray-500">Applied Date</label>
                        <p className="text-gray-900">
                          {new Date(candidate.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                    {candidate.resume_url && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <a 
                          href={candidate.resume_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-primary-600 hover:text-primary-700 font-medium"
                        >
                          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          View Resume
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'interviews' && (
                  <div className="space-y-4">
                    {interviews.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">No interviews scheduled yet.</p>
                    ) : (
                      interviews.map((interview) => (
                        <div 
                          key={interview.id} 
                          className="p-4 bg-gray-50 rounded-xl border border-gray-100"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-semibold text-gray-900">{interview.round}</h4>
                              {interview.scheduled_time && (
                                <p className="text-sm text-gray-500 mt-1">
                                  {new Date(interview.scheduled_time).toLocaleString()}
                                </p>
                              )}
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(interview.status)}`}>
                              {interview.status?.toUpperCase()}
                            </span>
                          </div>
                          {interview.score !== undefined && (
                            <div className="mt-3">
                              <span className="text-sm text-gray-500">Score: </span>
                              <span className="font-semibold text-gray-900">{interview.score}/100</span>
                            </div>
                          )}
                          {interview.feedback && (
                            <p className="text-sm text-gray-600 mt-2">{interview.feedback}</p>
                          )}
                          {interview.ai_interview_token && interview.status === 'SCHEDULED' && (
                            <p className="text-sm text-primary-600 mt-2">
                              AI Interview Ready (Token: {interview.ai_interview_token.slice(0, 8)}...)
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'notes' && (
                  <div className="space-y-4">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add notes about this candidate..."
                      className="w-full h-48 p-4 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <div className="flex justify-end">
                      <Button 
                        onClick={handleSaveNotes}
                        disabled={savingNotes}
                      >
                        {savingNotes ? 'Saving...' : 'Save Notes'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
