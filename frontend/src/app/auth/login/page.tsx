'use client'

import React, { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import Cookies from 'js-cookie'

type LoginTab = 'employee' | 'candidate'

export default function LoginPage() {
  const router = useRouter()
  const { login, isLoading } = useAuth()
  const [activeTab, setActiveTab] = useState<LoginTab>('employee')
  const [error, setError] = useState('')
  const [candidateLoading, setCandidateLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [candidateEmail, setCandidateEmail] = useState('')

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

    try {
      await login({
        email: formData.email,
        password: formData.password,
      })
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed. Please try again.')
    }
  }

  const handleCandidateLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setCandidateLoading(true)

    try {
      // Use environment variable for API URL
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'
      const res = await fetch(`${apiUrl}/candidate-portal/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: candidateEmail }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Login failed')
      }

      const response = await res.json()

      // Store tokens
      Cookies.set('access_token', response.access_token, { expires: 1 })

      // Store user data
      localStorage.setItem('user', JSON.stringify(response.user))
      localStorage.setItem('candidate_companies', JSON.stringify(response.companies))
      localStorage.setItem('candidate_interviews', JSON.stringify(response.interviews))

      // Use window.location for a full page redirect
      window.location.href = '/candidate-portal'
    } catch (err: any) {
      console.error('Candidate login error:', err)
      setError(err.message || 'Login failed. No candidate found with this email.')
      setCandidateLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding (60%) */}
      <div className="hidden lg:flex lg:w-[60%] bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-white rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-white rounded-full blur-3xl"></div>
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between w-full p-12">
          {/* Logo - Bookmark style in top-left corner */}
          <div className="absolute top-0 left-0 bg-white/10 backdrop-blur-sm px-4 py-3 rounded-br-2xl">
            <img
              src="/images/logo.png"
              alt="AIGENTHIX"
              className="h-10 w-auto rounded-lg"
            />
          </div>

          {/* Center Content */}
          <div className="flex-1 flex flex-col justify-center max-w-lg mt-16">
            <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight mb-6">
              Transform Your Hiring Process with AI
            </h1>
            <p className="text-xl text-white/80 leading-relaxed mb-8">
              Streamline interviews, evaluate candidates objectively, and make data-driven hiring decisions with our intelligent platform.
            </p>

            {/* Features */}
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-white/90">AI-Powered Interview Analysis</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-white/90">Automated Candidate Scoring</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-white/90">Seamless Team Collaboration</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Right Side - Form (40%) */}
      <div className="w-full lg:w-[40%] flex flex-col min-h-screen bg-white">
        {/* Top Navigation */}
        <nav className="flex items-center justify-between px-8 py-6 border-b border-gray-100">
          {/* Mobile Logo */}
          <div className="flex items-center space-x-2 lg:hidden">
            <img src="/images/logo.png" alt="AIGENTHIX" className="h-8 w-auto" />
          </div>
          <div className="hidden lg:block"></div>

          {/* Help Icon */}
          <button className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center hover:bg-gray-100 transition">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </nav>

        {/* Form Container */}
        <div className="flex-1 flex items-center justify-center px-8 py-12">
          <div className="w-full max-w-md">
            {/* Header */}
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Account sign in</h2>
              <p className="text-gray-500">
                Sign in to your account to access your profile and dashboard.
              </p>
            </div>

            {/* Tab Selector */}
            <div className="flex mb-8 bg-gray-100 rounded-xl p-1">
              <button
                type="button"
                onClick={() => { setActiveTab('employee'); setError(''); }}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-200 ${activeTab === 'employee'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                Employee / HR
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('candidate'); setError(''); }}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-200 ${activeTab === 'candidate'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                Candidate
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-error-50 border border-error-200 rounded-xl text-error-600 text-sm">
                {error}
              </div>
            )}

            {/* Employee/HR Login Form */}
            {activeTab === 'employee' && (
              <>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition placeholder:text-gray-400"
                      placeholder="Enter your email"
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                      Password
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition placeholder:text-gray-400"
                      placeholder="Enter your password"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-brand-500 text-white py-3.5 rounded-xl font-semibold hover:bg-brand-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30"
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Signing in...
                      </span>
                    ) : (
                      'LOGIN'
                    )}
                  </button>
                </form>

                {/* Links */}
                <div className="mt-8 space-y-4 text-center">
                  <Link
                    href="/auth/forgot-password"
                    className="block text-brand-500 hover:text-brand-600 font-medium transition"
                  >
                    Reset password
                  </Link>

                  <p className="text-gray-500">
                    Not a member?{' '}
                    <Link href="/auth/register" className="text-brand-500 hover:text-brand-600 font-medium transition">
                      Create account.
                    </Link>
                  </p>
                </div>
              </>
            )}

            {/* Candidate Login Form */}
            {activeTab === 'candidate' && (
              <>
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
                  <p className="font-medium mb-1">📧 Email-only Login</p>
                  <p>Enter the email address that was used when a company added you as a candidate. No password required.</p>
                </div>

                <form onSubmit={handleCandidateLogin} className="space-y-6">
                  <div>
                    <label htmlFor="candidateEmail" className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address
                    </label>
                    <input
                      id="candidateEmail"
                      name="candidateEmail"
                      type="email"
                      required
                      value={candidateEmail}
                      onChange={(e) => setCandidateEmail(e.target.value)}
                      className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition placeholder:text-gray-400"
                      placeholder="Enter your email"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={candidateLoading}
                    className="w-full bg-brand-500 text-white py-3.5 rounded-xl font-semibold hover:bg-brand-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30"
                  >
                    {candidateLoading ? (
                      <span className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Signing in...
                      </span>
                    ) : (
                      'LOGIN AS CANDIDATE'
                    )}
                  </button>
                </form>

                <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                  <p className="font-semibold text-gray-700 mb-2">🔐 Test Candidate:</p>
                  <p className="text-xs text-gray-600">alex.smith@example.com</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-gray-50 px-8 py-6 border-t border-gray-100">
          <p className="text-center text-gray-400 text-sm">
            Copyright © 2025 Aigenthix - All Rights Reserved.
          </p>
        </footer>
      </div>
    </div>
  )
}
