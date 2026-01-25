'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { USER_ROLES } from '@/lib/constants'

export function Navigation() {
  const router = useRouter()
  const { user, logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    router.push('/auth/login')
  }

  return (
    <nav className="bg-white shadow sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left Side: Logo */}
          <div className="flex">
            <div
              className="flex flex-shrink-0 items-center cursor-pointer"
              onClick={() => router.push('/hr')}
            >
              <img src="/images/logo.png" alt="AiGENTHix" className="h-8 w-auto mr-2" />
            </div>
          </div>

          {/* Right Side: User Info & Menu */}
          <div className="flex items-center space-x-6">
            <div className="hidden md:flex flex-col items-end text-right mr-3">
              <span className="text-gray-900 font-medium text-sm leading-tight">{user?.full_name}</span>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="font-semibold text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded capitalize">
                  {user?.role?.toLowerCase().replace('_', ' ')}
                </span>
                <span>-</span>
                <span className="font-medium">{user?.company_name || 'Company'}</span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center text-sm font-semibold">
                {user?.full_name?.charAt(0).toUpperCase()}
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
