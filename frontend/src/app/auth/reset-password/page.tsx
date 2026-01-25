'use client'

import React, { useState, FormEvent, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiClient } from '@/lib/api'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setError('Invalid reset link. Please request a new password reset.')
    }
  }, [token])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    if (!password) {
      setError('Password is required')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    try {
      setIsLoading(true)
      await apiClient.post('/auth/reset-password', { 
        token, 
        new_password: password 
      })
      setIsSuccess(true)
      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push('/auth/login')
      }, 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to reset password. The link may have expired.')
    } finally {
      setIsLoading(false)
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
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">AIGENTHIX</span>
          </div>

          {/* Center Content */}
          <div className="flex-1 flex flex-col justify-center max-w-lg">
            <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mb-8">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight mb-6">
              Create New Password
            </h1>
            <p className="text-xl text-white/80 leading-relaxed mb-8">
              Choose a strong password that you haven't used before. Your new password must be at least 8 characters long.
            </p>
          </div>

          {/* Empty spacer for alignment */}
          <div></div>
        </div>
      </div>

      {/* Right Side - Form (40%) */}
      <div className="w-full lg:w-[40%] flex flex-col min-h-screen bg-white">
        {/* Top Navigation */}
        <nav className="flex items-center justify-between px-8 py-6 border-b border-gray-100">
          {/* Mobile Logo */}
          <div className="flex items-center space-x-2 lg:hidden">
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <span className="text-xl font-bold text-gray-900">AIGENTHIX</span>
          </div>
          <div className="hidden lg:block"></div>
          
          {/* Help Icon */}
          <button className="w-10 h-10 bg-dark-900 rounded-full flex items-center justify-center hover:bg-dark-800 transition">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </nav>

        {/* Form Content */}
        <div className="flex-1 flex flex-col justify-center px-8 lg:px-12">
          {!isSuccess ? (
            <div className="max-w-sm mx-auto w-full">
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Reset password</h2>
              <p className="text-gray-500 mb-8">
                Enter your new password below.
              </p>

              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                    New Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition text-gray-900"
                    placeholder="Enter new password"
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition text-gray-900"
                    placeholder="Confirm new password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !token}
                  className="w-full py-3 px-4 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>

              <div className="mt-8 text-center">
                <Link href="/auth/login" className="text-brand-500 hover:text-brand-600 font-medium text-sm">
                  ← Back to login
                </Link>
              </div>
            </div>
          ) : (
            <div className="max-w-sm mx-auto w-full text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Password Reset!</h2>
              <p className="text-gray-500 mb-8">
                Your password has been reset successfully. Redirecting you to login...
              </p>
              <Link 
                href="/auth/login"
                className="inline-block py-3 px-6 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl transition"
              >
                Go to Login
              </Link>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 text-center text-sm text-gray-400">
          © 2024 Aigenthix. All rights reserved.
        </div>
      </div>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResetPasswordForm />
    </Suspense>
  )
}