import React, { useState, useRef } from 'react'
import Cookies from 'js-cookie'

// Backend API URL for direct fetch calls - use environment variable
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

interface BulkImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function BulkImportModal({ isOpen, onClose, onSuccess }: BulkImportModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [result, setResult] = useState<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')
    setSuccess('')
    setResult(null)

    try {
      setIsLoading(true)

      // Create FormData
      const formData = new FormData()
      formData.append('file', file)

      // Upload using raw fetch since apiClient may not support FormData well
      const token = Cookies.get('access_token') || ''
      
      if (!token) {
        setError('Authentication required. Please login again.')
        return
      }
      
      const response = await fetch(`${API_URL}/candidates/bulk/import-csv`, {
        method: 'POST',
        body: formData,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.detail || 'Upload failed')
        return
      }

      setResult(data)
      setSuccess(`Successfully imported ${data.created} candidates!`)
      
      // Auto-close after success
      setTimeout(() => {
        onSuccess()
        onClose()
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Failed to import candidates')
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
    const a = document.createElement('a')
    a.href = url
    a.download = 'candidates_sample.csv'
    a.click()
    window.URL.revokeObjectURL(url)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Bulk Import Candidates</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-error-50 border border-error-200 rounded text-error-700 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-success-50 border border-success-200 rounded text-success-700 text-sm">
            {success}
          </div>
        )}

        {result && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-blue-700 text-sm">
            <p className="font-semibold mb-2">Import Results:</p>
            <ul className="space-y-1 text-xs">
              <li>• Total: {result.total}</li>
              <li>• Created: {result.created}</li>
              <li>• Failed: {result.failed}</li>
            </ul>
            {result.errors && result.errors.length > 0 && (
              <div className="mt-2 pt-2 border-t border-blue-200">
                <p className="font-semibold mb-1">Errors:</p>
                <ul className="space-y-1 text-xs">
                  {result.errors.slice(0, 3).map((err: string, idx: number) => (
                    <li key={idx}>• {err}</li>
                  ))}
                  {result.errors.length > 3 && <li>• ... and {result.errors.length - 3} more</li>}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mb-6">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary-500 transition">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={isLoading}
              className="hidden"
              id="csv-input"
            />
            <label
              htmlFor="csv-input"
              className="cursor-pointer block"
            >
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <p className="mt-2 text-sm text-gray-600">
                <span className="font-medium text-primary-600">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-gray-500">CSV file only</p>
            </label>
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg mb-4 text-sm">
          <p className="font-semibold text-gray-900 mb-2">CSV Format (Required Columns):</p>
          <p className="text-gray-600 text-xs font-mono bg-white p-2 rounded border border-gray-200 mb-3">
            email,first_name,last_name,position,experience_years
          </p>
          <button
            type="button"
            onClick={downloadSampleCSV}
            className="text-primary-600 hover:text-primary-800 text-xs font-medium underline"
          >
            Download Sample CSV
          </button>
        </div>

        <button
          onClick={onClose}
          disabled={isLoading}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:bg-gray-100 transition"
        >
          Close
        </button>
      </div>
    </div>
  )
}
