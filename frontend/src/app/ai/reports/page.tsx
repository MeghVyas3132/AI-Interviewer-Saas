'use client'

import React, { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api'

interface AIReport {
  id: string;
  report_type: string;
  score: number | null;
  summary: string | null;
  created_at: string;
}

export default function AiReportsPage() {
  const [reports, setReports] = useState<AIReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const loadReports = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await apiClient.get<{ reports: AIReport[] }>('/ai/reports')
        if (mounted) {
          setReports(data?.reports || [])
        }
      } catch (err: any) {
        if (mounted) {
          setError('Failed to load reports from server')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }
    loadReports()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <a href="/dashboard" className="text-gray-500 hover:text-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </a>
        <h1 className="section-title">AI Reports</h1>
      </div>

      {loading && <div className="text-sm text-gray-500 mb-4">Loading reports...</div>}
      {error && <div className="text-sm text-red-600 mb-4">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(reports || []).map((r: any) => (
          <div key={r.id} className="card">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm text-gray-500">{r.created_at ?? r.createdAt ?? ''}</div>
                <div className="text-lg font-semibold mt-1">{r.title ?? r.report_type ?? 'AI Report'}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-brand-600">{r.score ?? '—'}%</div>
              </div>
            </div>
            <p className="text-sm text-gray-700 mt-3">{r.summary ?? ''}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
