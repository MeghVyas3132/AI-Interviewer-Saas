'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import { apiClient } from '@/lib/api'
import { API_BASE_URL } from '@/lib/constants'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'

type EntryMode = 'manual' | 'resume'

export default function NewCandidatePage() {
  const router = useRouter()
  const [entryMode, setEntryMode] = useState<EntryMode>('manual')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [resumePositionOverride, setResumePositionOverride] = useState('')
  const [resumeDomainOverride, setResumeDomainOverride] = useState('')
  const [sendInvitation, setSendInvitation] = useState(false)

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    position: '',
    domain: '',
    experience_years: '',
    qualifications: '',
    resume_url: '',
  })

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const payload = {
        first_name: formData.first_name || null,
        last_name: formData.last_name || null,
        email: formData.email,
        phone: formData.phone || null,
        position: formData.position || null,
        domain: formData.domain || null,
        experience_years: formData.experience_years ? parseInt(formData.experience_years, 10) : null,
        qualifications: formData.qualifications || null,
      }

      await apiClient.post('/candidates', payload)
      router.push('/hr')
    } catch (err: any) {
      const msg =
        err.response?.data?.detail?.[0]?.msg ||
        err.response?.data?.detail ||
        err.message ||
        'Failed to create candidate'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleResumeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (!resumeFile) {
        setError('Please upload a resume file.')
        return
      }

      const token = Cookies.get('access_token')
      if (!token) {
        setError('Authentication required. Please login again.')
        return
      }

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
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body,
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data?.detail || 'Failed to import candidate from resume')
        return
      }

      router.push('/hr')
    } catch (err: any) {
      setError(err.message || 'Failed to import candidate from resume')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Button variant="outline" onClick={() => router.back()}>
            ← Back
          </Button>
        </div>

        <Card>
          <div className="p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Add New Candidate</h1>
            <p className="text-gray-600 mb-6">
              Choose how you want to onboard this candidate.
            </p>

            <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setEntryMode('manual')
                  setError('')
                }}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  entryMode === 'manual'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Manual Details
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryMode('resume')
                  setError('')
                }}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  entryMode === 'resume'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Upload Resume
              </button>
            </div>

            {error && (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                {error}
              </div>
            )}

            {entryMode === 'manual' ? (
              <form onSubmit={handleManualSubmit} className="space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full rounded-lg border border-gray-300 p-2.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full rounded-lg border border-gray-300 p-2.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      className="w-full rounded-lg border border-gray-300 p-2.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="john.doe@example.com"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Phone Number</label>
                    <input
                      type="tel"
                      className="w-full rounded-lg border border-gray-300 p-2.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Position / Role <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full rounded-lg border border-gray-300 p-2.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                      placeholder="Software Engineer"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Domain / Department</label>
                    <select
                      className="w-full rounded-lg border border-gray-300 p-2.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                      value={formData.domain}
                      onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                    >
                      <option value="">Select Domain</option>
                      <option value="Engineering">Engineering</option>
                      <option value="Product">Product</option>
                      <option value="Design">Design</option>
                      <option value="Marketing">Marketing</option>
                      <option value="Sales">Sales</option>
                      <option value="HR">Human Resources</option>
                      <option value="Finance">Finance</option>
                      <option value="Operations">Operations</option>
                      <option value="Data Science">Data Science</option>
                      <option value="DevOps">DevOps</option>
                      <option value="QA">Quality Assurance</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Years of Experience</label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    className="w-full rounded-lg border border-gray-300 p-2.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    value={formData.experience_years}
                    onChange={(e) => setFormData({ ...formData, experience_years: e.target.value })}
                    placeholder="e.g. 3"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Qualifications / Skills</label>
                  <textarea
                    rows={3}
                    className="w-full resize-none rounded-lg border border-gray-300 p-2.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    value={formData.qualifications}
                    onChange={(e) => setFormData({ ...formData, qualifications: e.target.value })}
                    placeholder="e.g. Bachelor's in Computer Science, Python, React, AWS..."
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Resume URL <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="url"
                    className="w-full rounded-lg border border-gray-300 p-2.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    value={formData.resume_url}
                    onChange={(e) => setFormData({ ...formData, resume_url: e.target.value })}
                    placeholder="https://drive.google.com/..."
                  />
                </div>

                <div className="flex justify-end gap-3 border-t pt-4">
                  <Button type="button" variant="outline" onClick={() => router.back()}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading} isLoading={loading}>
                    Create Candidate
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResumeSubmit} className="space-y-6">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Resume File <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    required
                    accept=".pdf,.docx,.txt"
                    className="w-full rounded-lg border border-gray-300 p-2.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Supported formats: PDF, DOCX, TXT. We will auto-extract candidate details and create the profile.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Position Override <span className="text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-gray-300 p-2.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                      value={resumePositionOverride}
                      onChange={(e) => setResumePositionOverride(e.target.value)}
                      placeholder="e.g. DevOps Engineer"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Domain Override <span className="text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-gray-300 p-2.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                      value={resumeDomainOverride}
                      onChange={(e) => setResumeDomainOverride(e.target.value)}
                      placeholder="e.g. Engineering"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={sendInvitation}
                    onChange={(e) => setSendInvitation(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  Send invitation email after creating candidate
                </label>

                <div className="flex justify-end gap-3 border-t pt-4">
                  <Button type="button" variant="outline" onClick={() => router.back()}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading} isLoading={loading}>
                    Parse Resume & Create Candidate
                  </Button>
                </div>
              </form>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
