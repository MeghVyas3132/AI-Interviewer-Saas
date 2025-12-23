'use client'

import React, { useState } from 'react'
import { apiClient } from '@/lib/api'

export default function AtsPage() {
  const [resumeText, setResumeText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<any | null>(null)

  const handleCheck = async () => {
    setError(null)
    setLoading(true)
    setReport(null)
      try {
        const payload = { resume_text: resumeText }
        // POST to backend which will call AI service and persist the report
  const resp = await apiClient.post('/ai/ats-check-and-save', payload)
  // backend returns { report_id, ai_response }
  const anyResp = resp as any
  setReport({ id: anyResp.report_id, ...anyResp.ai_response })
      } catch (err: any) {
        setError(err?.response?.data || err?.message || 'ATS check failed')
      } finally {
        setLoading(false)
      }
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <a href="/dashboard" className="text-gray-500 hover:text-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </a>
        <h1 className="section-title">ATS Checker</h1>
      </div>

      <div className="card mb-6">
        <p className="text-sm text-gray-600 mb-4">Upload a resume or paste the text to check against your job description.</p>
        <div className="flex flex-col md:flex-row md:items-center space-y-2 md:space-y-0 md:space-x-2">
          <textarea
            className="input-field w-full h-40"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste resume text here"
          />
          <div className="flex-shrink-0">
            <button className="btn-primary" onClick={handleCheck} disabled={loading}>
              {loading ? 'Checking...' : 'Check ATS'}
            </button>
          </div>
        </div>
        {error && <div className="text-sm text-red-600 mt-2">{String(error)}</div>}
      </div>

      {report && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-2">Verdict</h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-brand-600">{report.score ?? '—'}%</div>
              <div className="text-sm text-gray-600 mt-1">{report.summary}</div>
              <div className="text-xs text-gray-400 mt-1">Report ID: {report.id}</div>
            </div>
            <div>
              <a href={`/ai/reports/${report.id}`} className="btn-secondary">Open</a>
            </div>
          </div>

          {report.highlights && (
            <div className="mt-4">
              <h3 className="font-medium">Highlights</h3>
              <ul className="list-disc pl-5 mt-2 text-sm text-gray-700">
                {report.highlights.map((h: string, idx: number) => (
                  <li key={idx}>{h}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
