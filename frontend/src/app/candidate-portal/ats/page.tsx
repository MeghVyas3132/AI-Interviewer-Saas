'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Cookies from 'js-cookie'

// Backend API URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

interface SectionScore {
  score: number
  feedback: string
}

interface ATSReport {
  report_id?: string
  score: number
  summary: string
  highlights: string[]
  improvements: string[]
  keywords_found: string[]
  keywords_missing: string[]
  verdict?: string
  formatting_issues?: string[]
  section_scores?: {
    contact_info?: SectionScore
    format_structure?: SectionScore
    professional_summary?: SectionScore
    work_experience?: SectionScore
    technical_skills?: SectionScore
    education?: SectionScore
    keyword_optimization?: SectionScore
  }
  action_verbs_used?: string[]
  quantified_achievements?: number
  ats_friendly?: boolean
}

export default function ATSCheckerPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [jobDescription, setJobDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<ATSReport | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Check auth
  React.useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login')
    }
  }, [authLoading, user, router])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const fileName = file.name.toLowerCase()
    
    // Validate file type
    if (file.type === 'text/plain' || 
        fileName.endsWith('.txt') ||
        file.type === 'application/pdf' || 
        fileName.endsWith('.pdf') ||
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.type === 'application/msword' ||
        fileName.endsWith('.docx') ||
        fileName.endsWith('.doc')) {
      setResumeFile(file)
      setError(null)
    } else {
      setError('Please upload a PDF, Word (.doc/.docx), or text file')
      setResumeFile(null)
    }
  }

  const handleCheck = async () => {
    if (!resumeFile) {
      setError('Please upload your resume')
      return
    }

    setError(null)
    setLoading(true)
    setReport(null)

    try {
      const token = Cookies.get('access_token')
      if (!token) {
        router.push('/auth/login')
        return
      }

      // First, parse the resume file
      let resumeText = ''
      
      if (resumeFile.type === 'text/plain' || resumeFile.name.toLowerCase().endsWith('.txt')) {
        resumeText = await resumeFile.text()
      } else {
        // Parse PDF/DOCX via backend
        const formData = new FormData()
        formData.append('file', resumeFile)
        
        const parseResponse = await fetch(`${API_BASE}/ai/parse-resume`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        })
        
        const parseData = await parseResponse.json()
        
        if (!parseResponse.ok) {
          throw new Error(parseData.detail || 'Failed to parse resume file')
        }
        
        resumeText = parseData.text || ''
      }

      if (!resumeText.trim()) {
        throw new Error('Could not extract text from your resume. Please try a different file format.')
      }

      // Now run ATS check
      const response = await fetch(`${API_BASE}/ai/ats-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resume_text: resumeText,
          job_description: jobDescription || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'ATS check failed')
      }

      setReport(data)
    } catch (err: any) {
      setError(err.message || 'ATS check failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50 ring-green-200'
    if (score >= 60) return 'text-yellow-600 bg-yellow-50 ring-yellow-200'
    return 'text-red-600 bg-red-50 ring-red-200'
  }

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent'
    if (score >= 60) return 'Good'
    if (score >= 40) return 'Needs Work'
    return 'Poor Match'
  }

  const getVerdict = (score: number) => {
    if (score >= 85) return 'Your resume is highly optimized for ATS systems. It should pass most automated screenings with ease.'
    if (score >= 70) return 'Your resume is well-structured for ATS. Minor improvements could boost your visibility.'
    if (score >= 50) return 'Your resume needs some work to be ATS-friendly. Focus on the suggested improvements below.'
    return 'Your resume may struggle to pass ATS screenings. Significant improvements are recommended.'
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => router.push('/candidate-portal')}
                className="text-gray-500 hover:text-gray-700 mr-2"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="w-10 h-10 bg-brand-500 rounded-lg flex items-center justify-center shadow-sm">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-xl font-bold text-gray-900">ATS Resume Checker</span>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Info Banner */}
        <div className="bg-white rounded-2xl p-6 mb-8 shadow-sm border border-gray-100">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Check Your Resume's ATS Compatibility</h1>
          <p className="text-gray-600">
            Upload your resume to see how well it matches applicant tracking system requirements 
            and get AI-powered suggestions for improvement.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <div className="space-y-6">
            {/* Resume Upload */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload Your Resume</h2>
              
              {/* File Upload Area */}
              <div 
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  resumeFile 
                    ? 'border-brand-500 bg-brand-50' 
                    : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                {resumeFile ? (
                  <div className="space-y-2">
                    <svg className="w-12 h-12 text-brand-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-brand-700 font-medium">{resumeFile.name}</p>
                    <p className="text-sm text-gray-500">Click to change file</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <svg className="w-12 h-12 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-gray-600 font-medium">Click to upload your resume</p>
                    <p className="text-sm text-gray-400">Supports PDF, Word (.doc/.docx), and TXT files</p>
                  </div>
                )}
              </div>
            </div>

            {/* Job Description (Optional) */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Job Description (Optional)</h2>
              <p className="text-sm text-gray-500 mb-4">
                Add a job description for more targeted matching and suggestions.
              </p>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the job description here for better analysis..."
                className="w-full h-32 p-4 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
              />
            </div>

            {/* Check Button */}
            <button
              onClick={handleCheck}
              disabled={loading || !resumeFile}
              className="w-full py-4 px-6 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white font-semibold rounded-xl transition shadow-lg shadow-brand-100 disabled:shadow-none"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing Resume...
                </span>
              ) : (
                'Analyze My Resume'
              )}
            </button>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Results Section */}
          <div className="space-y-6">
            {report ? (
              <>
                {/* Score Card */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">ATS Score</h2>
                  <div className="flex items-center gap-6">
                    <div className={`w-24 h-24 rounded-2xl flex items-center justify-center ring-4 ${getScoreColor(report.score)}`}>
                      <span className="text-3xl font-bold">{report.score}%</span>
                    </div>
                    <div>
                      <p className={`text-xl font-bold ${report.score >= 60 ? 'text-green-600' : 'text-red-600'}`}>
                        {getScoreLabel(report.score)}
                      </p>
                      <p className="text-gray-600 text-sm mt-1">{report.summary}</p>
                    </div>
                  </div>
                </div>

                {/* Verdict */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                    <svg className="w-5 h-5 text-brand-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    Expert Verdict
                  </h2>
                  <p className="text-gray-700 leading-relaxed">{getVerdict(report.score)}</p>
                  {report.ats_friendly !== undefined && (
                    <div className={`mt-3 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${report.ats_friendly ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {report.ats_friendly ? '✓ ATS Compatible' : '✗ May have ATS parsing issues'}
                    </div>
                  )}
                </div>

                {/* Section-by-Section Analysis */}
                {report.section_scores && Object.keys(report.section_scores).length > 0 && (
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <svg className="w-5 h-5 text-brand-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                        <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                      </svg>
                      Section-by-Section Analysis
                    </h2>
                    <div className="space-y-4">
                      {[
                        { key: 'contact_info', label: 'Contact Information', max: 5 },
                        { key: 'format_structure', label: 'Format & Structure', max: 15 },
                        { key: 'professional_summary', label: 'Professional Summary', max: 10 },
                        { key: 'work_experience', label: 'Work Experience', max: 25 },
                        { key: 'technical_skills', label: 'Technical Skills', max: 20 },
                        { key: 'education', label: 'Education & Certifications', max: 10 },
                        { key: 'keyword_optimization', label: 'Keyword Optimization', max: 15 },
                      ].map(({ key, label, max }) => {
                        const section = report.section_scores?.[key as keyof typeof report.section_scores]
                        if (!section) return null
                        const percentage = Math.round((section.score / max) * 100)
                        return (
                          <div key={key} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-gray-800">{label}</span>
                              <span className={`text-sm font-semibold ${percentage >= 70 ? 'text-green-600' : percentage >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                                {section.score}/{max} ({percentage}%)
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                              <div 
                                className={`h-2 rounded-full transition-all ${percentage >= 70 ? 'bg-green-500' : percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <p className="text-sm text-gray-600">{section.feedback}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Quick Stats */}
                {(report.quantified_achievements !== undefined || report.action_verbs_used?.length) && (
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h2>
                    <div className="grid grid-cols-2 gap-4">
                      {report.quantified_achievements !== undefined && (
                        <div className="bg-blue-50 rounded-xl p-4 text-center">
                          <div className="text-2xl font-bold text-blue-600">{report.quantified_achievements}</div>
                          <div className="text-sm text-blue-700">Quantified Achievements</div>
                        </div>
                      )}
                      {report.action_verbs_used && report.action_verbs_used.length > 0 && (
                        <div className="bg-purple-50 rounded-xl p-4 text-center">
                          <div className="text-2xl font-bold text-purple-600">{report.action_verbs_used.length}</div>
                          <div className="text-sm text-purple-700">Action Verbs Used</div>
                        </div>
                      )}
                    </div>
                    {report.action_verbs_used && report.action_verbs_used.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm text-gray-600 mb-2">Action verbs found:</p>
                        <div className="flex flex-wrap gap-1">
                          {report.action_verbs_used.slice(0, 10).map((verb, idx) => (
                            <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                              {verb}
                            </span>
                          ))}
                          {report.action_verbs_used.length > 10 && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
                              +{report.action_verbs_used.length - 10} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Keywords Found */}
                {report.keywords_found && report.keywords_found.length > 0 && (
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Keywords Found ({report.keywords_found.length})
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {report.keywords_found.map((keyword, idx) => (
                        <span key={idx} className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm font-medium">
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Keywords Missing */}
                {report.keywords_missing && report.keywords_missing.length > 0 && (
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <svg className="w-5 h-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      Missing Keywords ({report.keywords_missing.length})
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {report.keywords_missing.map((keyword, idx) => (
                        <span key={idx} className="px-3 py-1 bg-red-50 text-red-700 rounded-full text-sm font-medium">
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Highlights */}
                {report.highlights && report.highlights.length > 0 && (
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Strengths</h2>
                    <ul className="space-y-2">
                      {report.highlights.map((highlight, idx) => (
                        <li key={idx} className="flex items-start">
                          <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span className="text-gray-700 text-sm">{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Improvements */}
                {report.improvements && report.improvements.length > 0 && (
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Suggested Improvements</h2>
                    <ul className="space-y-2">
                      {report.improvements.map((improvement, idx) => (
                        <li key={idx} className="flex items-start">
                          <svg className="w-5 h-5 text-yellow-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <span className="text-gray-700 text-sm">{improvement}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white rounded-2xl p-12 shadow-sm border border-gray-100 text-center">
                <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-lg font-medium text-gray-700 mb-2">No Analysis Yet</h3>
                <p className="text-gray-500 text-sm">
                  Upload your resume and click "Analyze My Resume" to get your personalized analysis.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
