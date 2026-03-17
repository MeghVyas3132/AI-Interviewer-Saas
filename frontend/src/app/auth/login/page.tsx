'use client'

import React, { useState, useRef, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import Cookies from 'js-cookie'
import { API_BASE_URL } from '@/lib/constants'

export default function LoginPage() {
  const router = useRouter()
  const { login, isLoading } = useAuth()
  const candidateApiBaseUrl = API_BASE_URL

  const [error, setError] = useState('')
  const [candidateLoading, setCandidateLoading] = useState(false)
  const [candidateEmail, setCandidateEmail] = useState('')

  // Admin / Employee popover state
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const adminRef = useRef<HTMLDivElement>(null)

  // Close popover when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (adminRef.current && !adminRef.current.contains(e.target as Node)) {
        setAdminOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleCandidateLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setCandidateLoading(true)

    try {
      const res = await fetch(`${candidateApiBaseUrl}/candidate-portal/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: candidateEmail }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Login failed')
      }

      const response = await res.json()
      Cookies.set('access_token', response.access_token, { expires: 1 })
      localStorage.setItem('user', JSON.stringify(response.user))
      localStorage.setItem('candidate_companies', JSON.stringify(response.companies))
      localStorage.setItem('candidate_interviews', JSON.stringify(response.interviews))
      window.location.href = '/candidate-portal'
    } catch (err: any) {
      setError(err.message || 'No candidate found with this email.')
      setCandidateLoading(false)
    }
  }

  const handleAdminLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    try {
      await login({ email: adminEmail, password: adminPassword })
      setAdminOpen(false)
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed. Please try again.')
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Side – Branding */}
      <div className="hidden lg:flex lg:w-[60%] bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-white rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-between w-full p-12">
          <div className="absolute top-0 left-0 bg-white/10 backdrop-blur-sm px-4 py-3 rounded-br-2xl">
            <img src="/images/logo.png" alt="AIGENTHIX" className="h-10 w-auto rounded-lg" />
          </div>
          <div className="flex-1 flex flex-col justify-center max-w-lg mt-16">
            <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight mb-6">
              Transform Your Hiring Process with AI
            </h1>
            <p className="text-xl text-white/80 leading-relaxed mb-8">
              Streamline interviews, evaluate candidates objectively, and make data-driven hiring decisions with our intelligent platform.
            </p>
            <div className="space-y-4">
              {['AI-Powered Interview Analysis', 'Automated Candidate Scoring', 'Seamless Team Collaboration'].map(feat => (
                <div key={feat} className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-white/90">{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Side – Candidate Form */}
      <div className="w-full lg:w-[40%] flex flex-col min-h-screen bg-white">
        {/* Top Nav */}
        <nav className="flex items-center justify-between px-8 py-6 border-b border-gray-100">
          <div className="flex items-center space-x-2 lg:hidden">
            <img src="/images/logo.png" alt="AIGENTHIX" className="h-8 w-auto" />
          </div>
          <div className="hidden lg:block" />

          {/* Admin / Employee icon — top right */}
          <div ref={adminRef} className="relative">
            <button
              type="button"
              title="Admin / Employee login"
              onClick={() => { setAdminOpen(prev => !prev); setError(''); }}
              className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center hover:bg-gray-100 transition group"
            >
              {/* Lock + person composite SVG */}
              <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>

            {/* Popover */}
            {adminOpen && (
              <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-700">Admin / HR / Employee Login</span>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">
                    {error}
                  </div>
                )}

                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div>
                    <label htmlFor="adminEmail" className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                    <input
                      id="adminEmail"
                      type="email"
                      required
                      value={adminEmail}
                      onChange={e => setAdminEmail(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition placeholder:text-gray-400"
                      placeholder="Enter your email"
                    />
                  </div>
                  <div>
                    <label htmlFor="adminPassword" className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                    <input
                      id="adminPassword"
                      type="password"
                      required
                      value={adminPassword}
                      onChange={e => setAdminPassword(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition placeholder:text-gray-400"
                      placeholder="Enter your password"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-brand-500 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                  >
                    {isLoading ? 'Signing in…' : 'Sign In'}
                  </button>
                </form>

                <div className="mt-4 flex justify-between text-xs text-gray-400">
                  <Link href="/auth/forgot-password" className="hover:text-brand-500 transition">Forgot password?</Link>
                  <Link href="/auth/register" className="hover:text-brand-500 transition">Create account</Link>
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* Candidate Form */}
        <div className="flex-1 flex items-center justify-center px-8 py-12">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Candidate Sign In</h2>
              <p className="text-gray-500">
                Enter the email your company used to invite you. No password needed.
              </p>
            </div>

            {/* Info banner */}
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
              <p className="font-medium mb-1">📧 Email-only Login</p>
              <p>Enter the email address that was used when a company added you as a candidate. No password required.</p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                {error}
              </div>
            )}

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
                  onChange={e => setCandidateEmail(e.target.value)}
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
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Signing in…
                  </span>
                ) : (
                  'LOGIN AS CANDIDATE'
                )}
              </button>
            </form>
          </div>
        </div>

        <footer className="bg-gray-50 px-8 py-6 border-t border-gray-100">
          <p className="text-center text-gray-400 text-sm">Copyright © 2025 Aigenthix - All Rights Reserved.</p>
        </footer>
      </div>
    </div>
  )
}
