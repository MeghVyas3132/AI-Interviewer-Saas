'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'

interface CompanyDetails {
  id: string
  name: string
  join_code: string
  email_domain: string | null
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export default function CompanyDetailsPage() {
  const router = useRouter()
  const params = useParams()
  const companyId = params.id as string
  const { user, isLoading: authLoading } = useAuth()
  const [company, setCompany] = useState<CompanyDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  // Check if user is system admin
  useEffect(() => {
    if (!authLoading && user?.role !== 'SYSTEM_ADMIN') {
      router.push('/dashboard')
    }
  }, [authLoading, user, router])

  // Fetch company details
  useEffect(() => {
    if (authLoading || user?.role !== 'SYSTEM_ADMIN' || !companyId) return

    const fetchCompany = async () => {
      try {
        setLoading(true)
        setError('')
        const data = await apiClient.get<CompanyDetails>(`/admin/companies/${companyId}`)
        setCompany(data)
      } catch (err: any) {
        console.error('Error fetching company:', err)
        setError(err.response?.data?.detail || 'Failed to fetch company details')
      } finally {
        setLoading(false)
      }
    }

    fetchCompany()
  }, [authLoading, user, companyId])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (user?.role !== 'SYSTEM_ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
          <p className="text-gray-600 mt-2">Only system administrators can access this page</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <button
                onClick={() => router.push('/admin')}
                className="flex items-center text-gray-600 hover:text-gray-900"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Admin
              </button>
            </div>
          </div>
        </nav>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <h2 className="text-xl font-semibold text-red-700 mb-2">Error</h2>
            <p className="text-red-600">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!company) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Company not found</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <button
              onClick={() => router.push('/admin')}
              className="flex items-center text-gray-600 hover:text-gray-900 transition"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Admin
            </button>
            <h1 className="text-xl font-bold text-primary-600">Company Details</h1>
            <div className="w-24"></div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Company Header */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{company.name}</h1>
              <p className="text-gray-500 mt-1">
                Created on {new Date(company.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
            <span className={`px-4 py-2 rounded-full text-sm font-semibold ${
              company.is_active 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {company.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>

          {company.description && (
            <p className="text-gray-600 mb-6">{company.description}</p>
          )}
        </div>

        {/* Company Join Code Section - Important for HR Registration */}
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-lg shadow-lg p-8 mb-8 border-2 border-primary-200">
          <div className="flex items-center mb-4">
            <svg className="w-6 h-6 text-primary-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <h2 className="text-xl font-bold text-gray-900">Company Join Code</h2>
          </div>
          <p className="text-gray-600 mb-4">
            Share this Join Code with HR users so they can register and join this company.
          </p>
          <div className="flex items-center space-x-4">
            <code className="flex-1 bg-white px-6 py-4 rounded-lg font-mono text-2xl text-center text-gray-800 border border-gray-200 tracking-wider">
              {company.join_code}
            </code>
            <button
              onClick={() => copyToClipboard(company.join_code)}
              className={`px-6 py-3 rounded-lg font-medium transition flex items-center ${
                copied 
                  ? 'bg-green-600 text-white' 
                  : 'bg-primary-600 text-white hover:bg-primary-700'
              }`}
            >
              {copied ? (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy Code
                </>
              )}
            </button>
          </div>
        </div>

        {/* Company Information */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Company Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Company Name</label>
              <p className="text-lg text-gray-900">{company.name}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Email Domain</label>
              <p className="text-lg text-gray-900">{company.email_domain || '-'}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Status</label>
              <p className="text-lg text-gray-900">{company.is_active ? 'Active' : 'Inactive'}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Created At</label>
              <p className="text-lg text-gray-900">
                {new Date(company.created_at).toLocaleString()}
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Last Updated</label>
              <p className="text-lg text-gray-900">
                {new Date(company.updated_at).toLocaleString()}
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Description</label>
              <p className="text-lg text-gray-900">{company.description || 'No description provided'}</p>
            </div>
          </div>
        </div>

        {/* HR Registration Instructions */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mt-8">
          <div className="flex items-start">
            <svg className="w-6 h-6 text-yellow-600 mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-semibold text-yellow-800 mb-2">HR Registration Instructions</h3>
              <ol className="text-yellow-700 space-y-2 list-decimal list-inside">
                <li>Copy the Join Code shown above (e.g., <code className="bg-yellow-100 px-1 rounded">{company.join_code}</code>)</li>
                <li>Send it to the HR administrator of this company</li>
                <li>They can use this code during registration to join this company</li>
                <li>The first HR user will be created as the company admin</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
