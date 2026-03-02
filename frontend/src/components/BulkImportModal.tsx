import React, { useState, useRef } from 'react'
import Cookies from 'js-cookie'
import { API_BASE_URL } from '@/lib/constants'

interface BulkImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

type ImportMode = 'csv' | 'resume'

export default function BulkImportModal({ isOpen, onClose, onSuccess }: BulkImportModalProps) {
  const [mode, setMode] = useState<ImportMode>('csv')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [result, setResult] = useState<any>(null)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [resumePositionOverride, setResumePositionOverride] = useState('')
  const [resumeDomainOverride, setResumeDomainOverride] = useState('')
  const [sendInvitation, setSendInvitation] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetMessages = () => {
    setError('')
    setSuccess('')
    setResult(null)
  }

  const getToken = () => {
    const token = Cookies.get('access_token') || ''
    if (!token) {
      setError('Authentication required. Please login again.')
      return ''
    }
    return token
  }

  const handleCsvUpload = async (file: File) => {
    resetMessages()
    setIsLoading(true)
    try {
      const token = getToken()
      if (!token) return

      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE_URL}/candidates/bulk/import-csv`, {
        method: 'POST',
        body: formData,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data?.detail || 'CSV upload failed')
        return
      }

      setResult(data)
      setSuccess(`Successfully imported ${data.created} candidates.`)
      setTimeout(() => {
        onSuccess()
        onClose()
        if (fileInputRef.current) fileInputRef.current.value = ''
      }, 1500)
    } catch (err: any) {
      setError(err.message || 'Failed to import candidates')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResumeImport = async () => {
    resetMessages()
    setIsLoading(true)
    try {
      if (!resumeFile) {
        setError('Please select a resume file.')
        return
      }

      const token = getToken()
      if (!token) return

      const body = new FormData()
      body.append('resume', resumeFile)
      if (resumePositionOverride.trim()) {
        body.append('position_override', resumePositionOverride.trim())
      }
      if (resumeDomainOverride.trim()) {
        body.append('domain_override', resumeDomainOverride.trim())
      }
      body.append('send_invitation', String(sendInvitation))

      const response = await fetch(`${API_BASE_URL}/candidates/import/resume`, {
        method: 'POST',
        body,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data?.detail || 'Resume import failed')
        return
      }

      setResult(data)
      setSuccess(`Created candidate ${data?.candidate?.email || ''} from resume.`)
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 1500)
    } catch (err: any) {
      setError(err.message || 'Failed to import candidate from resume')
    } finally {
      setIsLoading(false)
    }
  }

  const downloadSampleCSV = () => {
    const sampleData = `email,first_name,last_name,position,experience_years
john.doe@example.com,John,Doe,Senior Engineer,5
jane.smith@example.com,Jane,Smith,Product Manager,3
bob.wilson@example.com,Bob,Wilson,Software Developer,2`

    const blob = new Blob([sampleData], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'candidates_sample.csv'
    anchor.click()
    window.URL.revokeObjectURL(url)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Import Candidates</h2>
          <button onClick={onClose} className="text-2xl leading-none text-gray-500 hover:text-gray-700">
            ×
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMode('csv')
              resetMessages()
            }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              mode === 'csv' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
            }`}
          >
            CSV Bulk
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('resume')
              resetMessages()
            }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              mode === 'resume' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
            }`}
          >
            Resume
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded border border-error-200 bg-error-50 p-3 text-sm text-error-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded border border-success-200 bg-success-50 p-3 text-sm text-success-700">
            {success}
          </div>
        )}

        {mode === 'csv' ? (
          <>
            {result && (
              <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                <p className="mb-2 font-semibold">Import Results</p>
                <ul className="space-y-1 text-xs">
                  <li>Total: {result.total}</li>
                  <li>Created: {result.created}</li>
                  <li>Failed: {result.failed}</li>
                </ul>
              </div>
            )}

            <div className="mb-4 rounded-lg border-2 border-dashed border-gray-300 p-6 text-center transition hover:border-primary-500">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleCsvUpload(file)
                }}
                disabled={isLoading}
                className="hidden"
                id="csv-input"
              />
              <label htmlFor="csv-input" className="block cursor-pointer">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <p className="mt-2 text-sm text-gray-600">
                  <span className="font-medium text-primary-600">Click to upload</span> CSV
                </p>
              </label>
            </div>

            <div className="mb-4 rounded-lg bg-gray-50 p-4 text-sm">
              <p className="mb-2 font-semibold text-gray-900">Required CSV Columns</p>
              <p className="mb-3 rounded border border-gray-200 bg-white p-2 font-mono text-xs text-gray-600">
                email,first_name,last_name,position,experience_years
              </p>
              <button
                type="button"
                onClick={downloadSampleCSV}
                className="text-xs font-medium text-primary-600 underline hover:text-primary-800"
              >
                Download Sample CSV
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-sm font-medium text-gray-700">Resume File</label>
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">Supported formats: PDF, DOCX, TXT</p>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-3">
              <input
                type="text"
                value={resumePositionOverride}
                onChange={(e) => setResumePositionOverride(e.target.value)}
                className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
                placeholder="Optional position override"
              />
              <input
                type="text"
                value={resumeDomainOverride}
                onChange={(e) => setResumeDomainOverride(e.target.value)}
                className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
                placeholder="Optional domain override"
              />
            </div>

            <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={sendInvitation}
                onChange={(e) => setSendInvitation(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600"
              />
              Send invitation email after import
            </label>

            <button
              type="button"
              onClick={handleResumeImport}
              disabled={isLoading}
              className="mb-4 w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:bg-gray-300"
            >
              Parse Resume and Create Candidate
            </button>
          </>
        )}

        <button
          onClick={onClose}
          disabled={isLoading}
          className="w-full rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 transition hover:bg-gray-50 disabled:bg-gray-100"
        >
          Close
        </button>
      </div>
    </div>
  )
}
