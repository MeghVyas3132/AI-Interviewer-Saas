import React, { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api'
import { Button } from '@/components/Button'

interface QAPair {
  question: string
  answer: string
  timestamp?: string
}

interface KeyAnswer {
  question: string
  answer: string
  rating?: number | string
}

interface InterviewDetail {
  interview_id: string
  round: string
  scheduled_time?: string
  status?: string
  verdict?: string
  overall_score?: number
  behavior_score?: number
  confidence_score?: number
  answer_score?: number
  strengths?: string[]
  weaknesses?: string[]
  detailed_feedback?: string
  key_answers?: KeyAnswer[]
  summary?: string
  duration_seconds?: number
  total_questions?: number
  total_answers?: number
  qa_pairs: QAPair[]
  resume_text?: string
  resume_filename?: string
  ats_score?: number
  employee_verdict?: string
}

interface CandidateProfile {
  id: string
  email: string
  first_name?: string
  last_name?: string
  full_name?: string
  phone?: string
  position?: string
  domain?: string
  experience_years?: number
  status?: string
  qualifications?: string
}

interface DetailedProfileResponse {
  candidate: CandidateProfile
  interviews: InterviewDetail[]
  total_interviews: number
  completed_interviews: number
}

interface CandidateProfileModalProps {
  isOpen: boolean
  onClose: () => void
  candidateId: string | null
  onCreateAIInterview?: (candidateId: string) => void
  useDetailedEndpoint?: boolean
  userRole?: 'hr' | 'employee'
}

export default function CandidateProfileModal({
  isOpen,
  onClose,
  candidateId,
  onCreateAIInterview,
  useDetailedEndpoint = false,
  userRole = 'employee',
}: CandidateProfileModalProps) {
  const [loading, setLoading] = useState(true)
  const [candidate, setCandidate] = useState<CandidateProfile | null>(null)
  const [interviews, setInterviews] = useState<InterviewDetail[]>([])
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'profile' | 'interviews' | 'qa' | 'resume'>('profile')
  const [expandedInterview, setExpandedInterview] = useState<string | null>(null)
  const [selectedResume, setSelectedResume] = useState<{text: string, filename: string} | null>(null)

  useEffect(() => {
    if (isOpen && candidateId) {
      fetchCandidateData()
      setActiveTab('profile')
    }
  }, [isOpen, candidateId])

  const fetchCandidateData = async () => {
    if (!candidateId) return
    
    setLoading(true)
    setError('')
    
    try {
      if (useDetailedEndpoint) {
        // Use detailed endpoint based on user role
        const endpoint = userRole === 'hr' 
          ? `/hr/candidate-profile/${candidateId}`
          : `/employee/candidate-profile/${candidateId}`
        const data = await apiClient.get<DetailedProfileResponse>(endpoint)
        setCandidate(data.candidate)
        setInterviews(data.interviews || [])
      } else {
        // Use basic endpoint
        const candidateData = await apiClient.get<CandidateProfile>(`/candidates/${candidateId}`)
        setCandidate(candidateData)
        setInterviews([])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load candidate data')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'hired':
      case 'pass':
        return 'bg-green-100 text-green-800'
      case 'rejected':
      case 'fail':
        return 'bg-red-100 text-red-800'
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'scheduled':
        return 'bg-blue-100 text-blue-800'
      case 'screening':
      case 'review':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getVerdictColor = (verdict?: string) => {
    switch (verdict?.toUpperCase()) {
      case 'PASS':
        return 'bg-green-500 text-white'
      case 'FAIL':
        return 'bg-red-500 text-white'
      case 'REVIEW':
        return 'bg-yellow-500 text-white'
      default:
        return 'bg-gray-500 text-white'
    }
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  // Handle employee verdict submission
  const handleEmployeeVerdict = async (interviewId: string, verdict: string) => {
    try {
      await apiClient.post(`/employee/interviews/${interviewId}/verdict`, { verdict })
      // Refresh data
      fetchCandidateData()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit verdict'
      setError(errorMessage)
    }
  }

  // Find first available resume
  const resumeData = interviews.find(i => i.resume_text)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
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
                    {candidate.first_name?.charAt(0) || candidate.email.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-gray-900">
                      {candidate.full_name || 
                       (candidate.first_name && candidate.last_name 
                        ? `${candidate.first_name} ${candidate.last_name}` 
                        : candidate.email)}
                    </h3>
                    <p className="text-gray-500">{candidate.email}</p>
                    {candidate.position && (
                      <p className="text-sm text-gray-600 mt-1">{candidate.position}</p>
                    )}
                    <div className="flex items-center gap-3 mt-3">
                      {candidate.status && (
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(candidate.status)}`}>
                          {candidate.status.toUpperCase()}
                        </span>
                      )}
                      {candidate.experience_years !== undefined && (
                        <span className="text-sm text-gray-500">
                          {candidate.experience_years} years experience
                        </span>
                      )}
                      {interviews.length > 0 && (
                        <span className="text-sm text-gray-500">
                          {interviews.length} interview{interviews.length !== 1 ? 's' : ''}
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
                  {(['profile', 'interviews', 'qa', 'resume'] as const).map((tab) => {
                    // Hide resume tab if no resume available
                    if (tab === 'resume' && !resumeData) return null
                    // Hide qa tab if no interviews with qa_pairs
                    if (tab === 'qa' && !interviews.some(i => i.qa_pairs?.length > 0)) return null
                    
                    return (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`py-3 border-b-2 transition-colors font-medium ${
                          activeTab === tab 
                            ? 'border-primary-600 text-primary-600' 
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {tab === 'qa' ? 'Q&A' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </button>
                    )
                  })}
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
                        <label className="text-sm font-medium text-gray-500">Domain</label>
                        <p className="text-gray-900">{candidate.domain || '-'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Experience</label>
                        <p className="text-gray-900">
                          {candidate.experience_years !== undefined 
                            ? `${candidate.experience_years} years` 
                            : '-'}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Status</label>
                        <p className="text-gray-900">{candidate.status || '-'}</p>
                      </div>
                      <div className="col-span-2">
                        <label className="text-sm font-medium text-gray-500">Qualifications</label>
                        <p className="text-gray-900">{candidate.qualifications || '-'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'interviews' && (
                  <div className="space-y-4">
                    {interviews.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">No interviews found.</p>
                    ) : (
                      interviews.map((interview) => (
                        <div 
                          key={interview.interview_id} 
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
                            <div className="flex gap-2">
                              {interview.verdict && (
                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${getVerdictColor(interview.verdict)}`}>
                                  {interview.verdict}
                                </span>
                              )}
                              <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(interview.status)}`}>
                                {interview.status?.toUpperCase()}
                              </span>
                            </div>
                          </div>
                          
                          {/* Show message if interview is completed but no scores */}
                          {interview.status?.toUpperCase() === 'COMPLETED' && interview.overall_score == null && (
                            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                              <p className="text-sm text-yellow-800">
                                📊 AI analysis is being processed. Scores will appear shortly.
                              </p>
                            </div>
                          )}
                          
                          {/* Scores - only show if overall_score has a value */}
                          {interview.overall_score != null && interview.overall_score !== undefined && (
                            <div className="mt-3 grid grid-cols-4 gap-2">
                              <div className="bg-white p-2 rounded-lg text-center">
                                <span className="text-xs text-gray-500 block">Overall</span>
                                <span className="font-bold text-lg text-gray-900">{interview.overall_score}%</span>
                              </div>
                              {interview.behavior_score != null && (
                                <div className="bg-white p-2 rounded-lg text-center">
                                  <span className="text-xs text-gray-500 block">Behavior</span>
                                  <span className="font-bold text-lg text-blue-600">{interview.behavior_score}%</span>
                                </div>
                              )}
                              {interview.confidence_score != null && (
                                <div className="bg-white p-2 rounded-lg text-center">
                                  <span className="text-xs text-gray-500 block">Confidence</span>
                                  <span className="font-bold text-lg text-purple-600">{interview.confidence_score}%</span>
                                </div>
                              )}
                              {interview.answer_score != null && (
                                <div className="bg-white p-2 rounded-lg text-center">
                                  <span className="text-xs text-gray-500 block">Answers</span>
                                  <span className="font-bold text-lg text-green-600">{interview.answer_score}%</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Strengths & Weaknesses */}
                          {(interview.strengths?.length || interview.weaknesses?.length) && (
                            <div className="mt-3 grid grid-cols-2 gap-3">
                              {interview.strengths && interview.strengths.length > 0 && (
                                <div className="bg-green-50 p-3 rounded-lg">
                                  <h5 className="text-xs font-semibold text-green-800 mb-2">Strengths</h5>
                                  <ul className="space-y-1">
                                    {interview.strengths.slice(0, 3).map((s, i) => (
                                      <li key={i} className="text-xs text-green-700">• {s}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {interview.weaknesses && interview.weaknesses.length > 0 && (
                                <div className="bg-orange-50 p-3 rounded-lg">
                                  <h5 className="text-xs font-semibold text-orange-800 mb-2">Areas to Improve</h5>
                                  <ul className="space-y-1">
                                    {interview.weaknesses.slice(0, 3).map((w, i) => (
                                      <li key={i} className="text-xs text-orange-700">• {w}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Stats - only show if we have values */}
                          {(interview.duration_seconds != null || interview.total_questions != null || interview.total_answers != null) && (
                            <div className="mt-2 flex gap-4 text-sm text-gray-500">
                              {interview.duration_seconds != null && (
                                <span>Duration: {formatDuration(interview.duration_seconds)}</span>
                              )}
                              {interview.total_questions != null && (
                                <span>Questions: {interview.total_questions}</span>
                              )}
                              {interview.total_answers != null && (
                                <span>Answers: {interview.total_answers}</span>
                              )}
                            </div>
                          )}

                          {/* Summary */}
                          {interview.summary && (
                            <p className="text-sm text-gray-600 mt-3 bg-white p-3 rounded-lg">{interview.summary}</p>
                          )}

                          {/* Detailed Feedback */}
                          {interview.detailed_feedback && (
                            <div className="mt-3 bg-blue-50 p-3 rounded-lg">
                              <h5 className="text-xs font-semibold text-blue-800 mb-1">AI Feedback</h5>
                              <p className="text-sm text-blue-700">{interview.detailed_feedback}</p>
                            </div>
                          )}

                          {/* ATS Score - only show if we have a value */}
                          {interview.ats_score != null && (
                            <div className="mt-2">
                              <span className="text-sm text-gray-500">ATS Score: </span>
                              <span className="font-semibold text-primary-600">{interview.ats_score}%</span>
                            </div>
                          )}

                          {/* Employee Verdict Actions - Show if AI verdict is REVIEW */}
                          {interview.verdict === 'REVIEW' && !interview.employee_verdict && (
                            <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                              <p className="text-sm text-yellow-800 mb-3">
                                AI recommends manual review. Please submit your verdict:
                              </p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEmployeeVerdict(interview.interview_id, 'APPROVED')}
                                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleEmployeeVerdict(interview.interview_id, 'REJECTED')}
                                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Show employee verdict if submitted */}
                          {interview.employee_verdict && (
                            <div className={`mt-3 p-2 rounded-lg text-center font-semibold ${
                              interview.employee_verdict === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              Employee Verdict: {interview.employee_verdict}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'qa' && (
                  <div className="space-y-6">
                    {interviews.filter(i => i.qa_pairs?.length > 0).map((interview) => (
                      <div key={interview.interview_id} className="border border-gray-200 rounded-xl overflow-hidden">
                        {/* Interview Header */}
                        <button
                          onClick={() => setExpandedInterview(
                            expandedInterview === interview.interview_id ? null : interview.interview_id
                          )}
                          className="w-full px-4 py-3 bg-gray-50 flex justify-between items-center text-left hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-gray-900">{interview.round}</span>
                            {interview.verdict && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getVerdictColor(interview.verdict)}`}>
                                {interview.verdict}
                              </span>
                            )}
                            <span className="text-sm text-gray-500">
                              ({interview.qa_pairs.length} Q&A)
                            </span>
                          </div>
                          <svg 
                            className={`w-5 h-5 text-gray-500 transition-transform ${expandedInterview === interview.interview_id ? 'rotate-180' : ''}`}
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        
                        {/* Q&A Pairs */}
                        {(expandedInterview === interview.interview_id || interviews.filter(i => i.qa_pairs?.length > 0).length === 1) && (
                          <div className="p-4 space-y-4">
                            {interview.qa_pairs.map((qa, index) => (
                              <div key={index} className="space-y-2">
                                <div className="flex gap-2">
                                  <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-bold rounded">Q{index + 1}</span>
                                  <p className="text-gray-900 font-medium flex-1">{qa.question}</p>
                                </div>
                                <div className="flex gap-2 ml-6">
                                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded">A</span>
                                  <p className="text-gray-700 flex-1 bg-gray-50 p-3 rounded-lg">{qa.answer || <span className="text-gray-400 italic">No answer provided</span>}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {interviews.filter(i => i.qa_pairs?.length > 0).length === 0 && (
                      <p className="text-gray-500 text-center py-8">No Q&A data available.</p>
                    )}
                  </div>
                )}

                {activeTab === 'resume' && resumeData && (
                  <div className="space-y-4">
                    {resumeData.resume_filename && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>File: {resumeData.resume_filename}</span>
                        {resumeData.ats_score !== undefined && (
                          <span className="ml-4 px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-bold rounded">
                            ATS Score: {resumeData.ats_score}%
                          </span>
                        )}
                      </div>
                    )}
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 max-h-96 overflow-auto">
                      <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                        {resumeData.resume_text}
                      </pre>
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
