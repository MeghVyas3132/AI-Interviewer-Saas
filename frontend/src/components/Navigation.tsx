'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { APP_NAME, USER_ROLES } from '@/lib/constants'

export function Navigation() {
  const router = useRouter()
  const { user, logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    router.push('/auth/login')
  }

  const canAccessAdminPanel = user?.role === USER_ROLES.ADMIN
  const canManageCandidates = [USER_ROLES.ADMIN, USER_ROLES.HR].includes(user?.role as any)
  const canViewInterviews = [USER_ROLES.ADMIN, USER_ROLES.HR, USER_ROLES.EMPLOYEE].includes(user?.role as any)

  return (
    <nav className="bg-white shadow sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div
            onClick={() => router.push('/dashboard')}
            className="flex items-center cursor-pointer hover:opacity-80 transition"
          >
            <h1 className="text-2xl font-bold text-primary-600">{APP_NAME}</h1>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-6">
            {canManageCandidates && (
              <button
                onClick={() => router.push('/candidates')}
                className="text-gray-700 hover:text-primary-600 transition"
              >
                Candidates
              </button>
            )}
            {canViewInterviews && (
              <button
                onClick={() => router.push('/interviews')}
                className="text-gray-700 hover:text-primary-600 transition"
              >
                Interviews
              </button>
            )}
            {canAccessAdminPanel && (
              <button
                onClick={() => router.push('/admin')}
                className="text-gray-700 hover:text-primary-600 transition"
              >
                Admin
              </button>
            )}
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center text-sm font-semibold">
                {user?.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-gray-900">{user?.full_name}</p>
                <p className="text-xs text-gray-500">{user?.role}</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 transition text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
