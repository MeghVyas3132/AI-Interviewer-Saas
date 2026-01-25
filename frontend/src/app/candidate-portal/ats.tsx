import React, { useState } from 'react'
import { apiClient } from '@/lib/api'

interface SectionScore {
  score: number
  feedback: string
}

interface ATSReport {
  id?: string
  score: number
  summary: string
  section_scores?: {
    contact_info?: SectionScore
    format_structure?: SectionScore
    professional_summary?: SectionScore
    work_experience?: SectionScore
    technical_skills?: SectionScore
    education?: SectionScore
    keyword_optimization?: SectionScore
  }
  highlights?: string[]
  improvements?: string[]
  keywords_found?: string[]
  keywords_missing?: string[]
  formatting_issues?: string[]
  action_verbs_used?: string[]
  quantified_achievements?: number
  ats_friendly?: boolean
}

const sectionLabels: Record<string, { label: string; maxScore: number }> = {
  contact_info: { label: 'Contact Information', maxScore: 5 },
  format_structure: { label: 'Format & Structure', maxScore: 15 },
  professional_summary: { label: 'Professional Summary', maxScore: 10 },
  work_experience: { label: 'Work Experience', maxScore: 25 },
  technical_skills: { label: 'Technical Skills', maxScore: 20 },
  education: { label: 'Education & Certifications', maxScore: 10 },
  keyword_optimization: { label: 'Keyword Optimization', maxScore: 15 },
}

function ScoreBar({ score, maxScore, label }: { score: number; maxScore: number; label: string }) {
  const percentage = (score / maxScore) * 100
  const colorClass = percentage >= 80 ? 'bg-green-500' : percentage >= 60 ? 'bg-yellow-500' : 'bg-red-500'
  
  return (
    <div className="mb-2">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-700">{label}</span>
        <span className="font-medium">{score}/{maxScore}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${colorClass} transition-all duration-500`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}

export default function CandidateAtsPage() {
  const [resumeText, setResumeText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<ATSReport | null>(null)

  const handleCheck = async () => {
    setError(null)
    setLoading(true)
    setReport(null)
    try {
      const payload = { resume_text: resumeText }
      const resp = await apiClient.post('/ai/ats-check-and-save', payload)
      const anyResp = resp as any
      setReport({ id: anyResp.report_id, ...anyResp.ai_response })
    } catch (err: any) {
      setError(err?.response?.data || err?.message || 'ATS check failed')
    } finally {
      setLoading(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="section-title">ATS Resume Checker</h1>
      
      {/* Input Section */}
      <div className="card mb-6">
        <p className="text-sm text-gray-600 mb-4">
          Paste your resume text below to get a detailed ATS compatibility analysis. 
          Our AI will evaluate your resume against industry-standard ATS criteria.
        </p>
        <textarea
          className="input-field w-full h-48 mb-4"
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          placeholder="Paste your full resume text here..."
        />
        <button 
          className="btn-primary w-full md:w-auto" 
          onClick={handleCheck} 
          disabled={loading || !resumeText.trim()}
        >
          {loading ? 'Analyzing Resume...' : 'Analyze Resume'}
        </button>
        {error && <div className="text-sm text-red-600 mt-3 p-3 bg-red-50 rounded">{String(error)}</div>}
      </div>

      {/* Results Section */}
      {report && (
        <div className="space-y-6">
          {/* Overall Score Card */}
          <div className="card">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
              <div className="mb-4 md:mb-0">
                <h2 className="text-lg font-semibold mb-2">Overall ATS Score</h2>
                <div className={`text-5xl font-bold ${getScoreColor(report.score)}`}>
                  {report.score ?? '—'}<span className="text-2xl text-gray-400">/100</span>
                </div>
                <div className="flex items-center mt-2 space-x-2">
                  {report.ats_friendly !== undefined && (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      report.ats_friendly ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {report.ats_friendly ? 'ATS Friendly' : 'Not ATS Friendly'}
                    </span>
                  )}
                  {report.quantified_achievements !== undefined && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800">
                      {report.quantified_achievements} Quantified Achievements
                    </span>
                  )}
                </div>
              </div>
              {report.id && (
                <div>
                  <a href={`/ai/reports/${report.id}`} className="btn-secondary">
                    View Full Report
                  </a>
                  <div className="text-xs text-gray-400 mt-2 text-right">Report ID: {report.id}</div>
                </div>
              )}
            </div>
            
            {report.summary && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-gray-700">{report.summary}</p>
              </div>
            )}
          </div>

          {/* Section Scores */}
          {report.section_scores && Object.keys(report.section_scores).length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Section-by-Section Analysis</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {Object.entries(report.section_scores).map(([key, section]) => {
                  const sectionInfo = sectionLabels[key] || { label: key, maxScore: 10 }
                  return (
                    <div key={key} className="border rounded-lg p-4">
                      <ScoreBar 
                        score={section?.score || 0} 
                        maxScore={sectionInfo.maxScore} 
                        label={sectionInfo.label} 
                      />
                      {section?.feedback && (
                        <p className="text-sm text-gray-600 mt-2">{section.feedback}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Strengths & Improvements */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Strengths */}
            {report.highlights && report.highlights.length > 0 && (
              <div className="card border-l-4 border-green-500">
                <h3 className="font-semibold text-green-700 mb-3 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Strengths
                </h3>
                <ul className="space-y-2">
                  {report.highlights.map((h, idx) => (
                    <li key={idx} className="text-sm text-gray-700 flex items-start">
                      <span className="text-green-500 mr-2">•</span>
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Improvements */}
            {report.improvements && report.improvements.length > 0 && (
              <div className="card border-l-4 border-yellow-500">
                <h3 className="font-semibold text-yellow-700 mb-3 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Areas for Improvement
                </h3>
                <ul className="space-y-2">
                  {report.improvements.map((i, idx) => (
                    <li key={idx} className="text-sm text-gray-700 flex items-start">
                      <span className="text-yellow-500 mr-2">•</span>
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Keywords Analysis */}
          {((report.keywords_found && report.keywords_found.length > 0) || 
            (report.keywords_missing && report.keywords_missing.length > 0)) && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Keyword Analysis</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {report.keywords_found && report.keywords_found.length > 0 && (
                  <div>
                    <h4 className="font-medium text-green-700 mb-2">Keywords Found</h4>
                    <div className="flex flex-wrap gap-2">
                      {report.keywords_found.map((k, idx) => (
                        <span key={idx} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {report.keywords_missing && report.keywords_missing.length > 0 && (
                  <div>
                    <h4 className="font-medium text-red-700 mb-2">Missing Keywords</h4>
                    <div className="flex flex-wrap gap-2">
                      {report.keywords_missing.map((k, idx) => (
                        <span key={idx} className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Verbs */}
          {report.action_verbs_used && report.action_verbs_used.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-3">Action Verbs Detected</h2>
              <div className="flex flex-wrap gap-2">
                {report.action_verbs_used.map((v, idx) => (
                  <span key={idx} className="px-2 py-1 bg-cyan-100 text-cyan-800 text-xs rounded-full">
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Formatting Issues */}
          {report.formatting_issues && report.formatting_issues.length > 0 && (
            <div className="card border-l-4 border-red-500">
              <h3 className="font-semibold text-red-700 mb-3 flex items-center">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Formatting Issues
              </h3>
              <ul className="space-y-2">
                {report.formatting_issues.map((issue, idx) => (
                  <li key={idx} className="text-sm text-gray-700 flex items-start">
                    <span className="text-red-500 mr-2">•</span>
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
