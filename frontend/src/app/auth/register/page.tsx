'use client'

import React, { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api'

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<number>(1)
  const [formData, setFormData] = useState({
    mode: 'create' as 'create' | 'join',
    company_name: '',
    join_code: '',
    full_name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((p) => ({ ...p, [name]: value }))
  }

  const handleNextStep = () => {
    if (formData.mode === 'create' && !formData.company_name) {
      setError('Company name is required')
      return
    }
    if (formData.mode === 'join' && !formData.join_code) {
      setError('Join code is required to join an existing company')
      return
    }
    setError('')
    setStep(2)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.email || !formData.password || !formData.full_name) {
      setError('All fields are required')
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

    const payload: Record<string, string> = {
      email: formData.email,
      password: formData.password,
      full_name: formData.full_name,
    }
    if (formData.mode === 'create') payload.company_name = formData.company_name
    else payload.company_id = formData.join_code

    try {
      setIsLoading(true)
      await apiClient.post('/auth/register', payload)
      router.push('/auth/login')
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Registration failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="h-screen flex overflow-hidden">
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
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <img
              src="/images/logo.png"
              alt="AIGENTHIX"
              className="h-10 w-auto"
            />
          </div>

          {/* Center Content */}
          <div className="flex-1 flex flex-col justify-center max-w-lg">
            <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight mb-6">
              Start Your AI-Powered Hiring Journey
            </h1>
            <p className="text-xl text-white/80 leading-relaxed mb-8">
              Create your company account or join an existing team to revolutionize your recruitment process.
            </p>

            {/* Features */}
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-white/90">Quick Setup in Minutes</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-white/90">Invite Team Members Instantly</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-white/90">Enterprise-Grade Security</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Form (40%) */}
      <div className="w-full lg:w-[40%] flex flex-col h-screen bg-white overflow-hidden">
        {/* Top Navigation */}
        <nav className="flex items-center justify-end px-8 py-6 border-b border-gray-100">
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
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Create your account</h2>
              <p className="text-gray-500">
                {step === 1 ? 'Choose how you want to get started' : 'Complete your profile details'}
              </p>
            </div>

            {/* Step Indicator */}
            <div className="flex items-center justify-center mb-8">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= 1 ? 'bg-brand-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                1
              </div>
              <div className={`w-16 h-1 ${step >= 2 ? 'bg-brand-500' : 'bg-gray-200'}`}></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= 2 ? 'bg-brand-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                2
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                {error}
              </div>
            )}

            {step === 1 ? (
              <div className="space-y-6">
                {/* Mode Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    I want to
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, mode: 'create' }))}
                      className={`p-4 border-2 rounded-xl text-left transition-all ${
                        formData.mode === 'create'
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium mb-1">Create Company</div>
                      <div className="text-xs text-gray-500">Start a new organization</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, mode: 'join' }))}
                      className={`p-4 border-2 rounded-xl text-left transition-all ${
                        formData.mode === 'join'
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium mb-1">Join Company</div>
                      <div className="text-xs text-gray-500">Use an invite code</div>
                    </button>
                  </div>
                </div>

                {formData.mode === 'create' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Name
                    </label>
                    <input
                      name="company_name"
                      value={formData.company_name}
                      onChange={handleChange}
                      className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition placeholder:text-gray-400"
                      placeholder="Enter your company name"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Join Code
                    </label>
                    <input
                      name="join_code"
                      value={formData.join_code}
                      onChange={handleChange}
                      className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition placeholder:text-gray-400"
                      placeholder="Enter your company's join code"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleNextStep}
                  className="w-full bg-brand-500 text-white py-3.5 rounded-xl font-semibold hover:bg-brand-600 transition-all duration-200 shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30"
                >
                  Continue
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name
                  </label>
                  <input
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleChange}
                    className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition placeholder:text-gray-400"
                    placeholder="Enter your full name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition placeholder:text-gray-400"
                    placeholder="Enter your email"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <input
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition placeholder:text-gray-400"
                    placeholder="Create a password (min 8 characters)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm Password
                  </label>
                  <input
                    name="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition placeholder:text-gray-400"
                    placeholder="Confirm your password"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 border border-gray-200 text-gray-700 py-3.5 rounded-xl font-semibold hover:bg-gray-50 transition-all"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 bg-brand-500 text-white py-3.5 rounded-xl font-semibold hover:bg-brand-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-brand-500/25"
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Creating...
                      </span>
                    ) : (
                      'Create Account'
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Links */}
            <div className="mt-8 text-center">
              <p className="text-gray-500">
                Already have an account?{' '}
                <Link href="/auth/login" className="text-brand-500 hover:text-brand-600 font-medium transition">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-gray-50 px-8 py-6 border-t border-gray-100">
          <p className="text-center text-gray-400 text-sm">
            Copyright 2025 Aigenthix - All Rights Reserved.
          </p>
        </footer>
      </div>
    </div>
  )
}
