'use client'

import React, { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Cookies from 'js-cookie'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'

type RegistrationType = 'new_company' | 'join_company'

interface RegistrationResponse {
  message: string
  status: string
  request_id?: string
  access_token?: string
  refresh_token?: string
  user?: any
}

export default function RegisterPage() {
  const router = useRouter()
  const { setUser, setToken } = useAuth()
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [pendingRequest, setPendingRequest] = useState<{ requestId: string; companyName: string } | null>(null)
  const [registrationType, setRegistrationType] = useState<RegistrationType>('join_company')
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    company_name: '',
    company_id: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    // Common validation
    if (!formData.email || !formData.password || !formData.full_name) {
      setError('Email, full name, and password are required')
      return
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    // Type-specific validation
    if (registrationType === 'new_company' && !formData.company_name) {
      setError('Company name is required to create a new company')
      return
    }

    if (registrationType === 'join_company' && !formData.company_id) {
      setError('Company Code is required to join an existing company')
      return
    }

    try {
      setIsLoading(true)
      
      // Clear any existing auth data before new registration
      Cookies.remove('access_token')
      Cookies.remove('refresh_token')
      localStorage.removeItem('user')
      
      const payload = registrationType === 'new_company' 
        ? {
            email: formData.email,
            password: formData.password,
            full_name: formData.full_name,
            company_name: formData.company_name,
          }
        : {
            email: formData.email,
            password: formData.password,
            full_name: formData.full_name,
            company_id: formData.company_id,
          }

      const response = await apiClient.post<RegistrationResponse>('/auth/register', payload)

      // Check if this is a pending request (new company) or immediate login (join existing)
      if (response.status === 'pending' && response.request_id) {
        // Show pending approval message
        setPendingRequest({
          requestId: response.request_id,
          companyName: formData.company_name,
        })
      } else if (registrationType === 'join_company') {
        // For joining a company, redirect to login page with success message
        router.push('/auth/login?registered=true')
      } else if (response.access_token && response.user) {
        // Only auto-login for new company creation (after approval)
        console.log('Registration successful, user:', response.user)
        
        Cookies.set('access_token', response.access_token, {
          sameSite: 'strict',
          expires: 1 / 24 / 60 * 15, // 15 minutes
        })
        localStorage.setItem('user', JSON.stringify(response.user))
        
        // Redirect based on role
        const role = response.user.role
        if (role === 'HR') {
          router.push('/hr')
        } else if (role === 'SYSTEM_ADMIN') {
          router.push('/admin')
        } else {
          router.push('/dashboard')
        }
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') {
        setError(detail)
      } else if (Array.isArray(detail)) {
        // Validation errors from FastAPI
        setError(detail.map((e: any) => e.msg || e.message || JSON.stringify(e)).join(', '))
      } else if (detail && typeof detail === 'object') {
        setError(detail.msg || detail.message || 'Registration failed. Please try again.')
      } else {
        setError('Registration failed. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Show pending approval screen
  if (pendingRequest) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-lg shadow-xl p-8 text-center">
            <div className="mb-6">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Request Submitted!</h1>
              <p className="text-gray-600 mt-2">Your company registration is pending approval</p>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
              <p className="text-orange-800 text-sm">
                <strong>Company:</strong> {pendingRequest.companyName}
              </p>
              <p className="text-orange-700 text-sm mt-2">
                An administrator will review your request. You'll be able to log in once it's approved.
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-gray-500 text-sm">
                Request ID: <code className="text-xs bg-gray-100 px-2 py-1 rounded">{pendingRequest.requestId}</code>
              </p>
              
              <Link 
                href="/auth/login" 
                className="block w-full bg-primary-600 text-white py-2 rounded-lg font-medium hover:bg-primary-700 transition text-center"
              >
                Return to Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900">AI Interviewer</h1>
            <p className="text-gray-600 mt-2">Create your account</p>
          </div>

          {/* Registration Type Toggle */}
          <div className="mb-6">
            <div className="flex rounded-lg bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => setRegistrationType('join_company')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
                  registrationType === 'join_company'
                    ? 'bg-white text-primary-700 shadow'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Join Existing Company
              </button>
              <button
                type="button"
                onClick={() => setRegistrationType('new_company')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
                  registrationType === 'new_company'
                    ? 'bg-white text-primary-700 shadow'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Create New Company
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-error-50 border border-error-200 rounded text-error-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                required
                value={formData.full_name}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="Jane Smith"
              />
            </div>

            {/* Conditional: Company Code for joining OR Company Name for creating */}
            {registrationType === 'join_company' ? (
              <div>
                <label htmlFor="company_id" className="block text-sm font-medium text-gray-700 mb-1">
                  Company Code
                </label>
                <input
                  id="company_id"
                  name="company_id"
                  type="text"
                  required
                  value={formData.company_id}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition font-mono text-sm uppercase"
                  placeholder="ABCD-EFGH"
                  maxLength={9}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Get this 8-character code from your company administrator
                </p>
              </div>
            ) : (
              <div>
                <label htmlFor="company_name" className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name
                </label>
                <input
                  id="company_name"
                  name="company_name"
                  type="text"
                  required
                  value={formData.company_name}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                  placeholder="Your Company Inc"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Request will be reviewed by an administrator
                </p>
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="••••••••"
              />
              <p className="text-xs text-gray-500 mt-1">Minimum 8 characters</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                value={formData.confirmPassword}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary-600 text-white py-2 rounded-lg font-medium hover:bg-primary-700 disabled:bg-gray-400 transition"
            >
              {isLoading 
                ? 'Submitting...' 
                : registrationType === 'new_company' 
                  ? 'Submit Request' 
                  : 'Join Company'
              }
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-600 text-sm">
              Already have an account?{' '}
              <Link href="/auth/login" className="text-primary-600 hover:text-primary-700 font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
