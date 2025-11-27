'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import Cookies from 'js-cookie'
import { apiClient } from '@/lib/api'
import { User, LoginRequest, LoginResponse } from '@/types'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (request: LoginRequest) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Initialize auth state from localStorage on mount
  useEffect(() => {
    const initializeAuth = () => {
      const token = Cookies.get('access_token')
      
      if (!token) {
        setIsLoading(false)
        return
      }
      
      // Try to restore user from localStorage
      try {
        const storedUser = localStorage.getItem('user')
        if (storedUser) {
          const userData = JSON.parse(storedUser) as User
          setUser(userData)
        }
      } catch (error) {
        console.error('Failed to restore user from storage:', error)
        // Clear invalid data
        localStorage.removeItem('user')
        Cookies.remove('access_token')
        Cookies.remove('refresh_token')
      }
      
      setIsLoading(false)
    }
    
    initializeAuth()
  }, [])

  const login = async (request: LoginRequest) => {
    setIsLoading(true)
    try {
      const response = await apiClient.login(request)
      
      if (response.user) {
        setUser(response.user)
        // Persist user to localStorage for session restoration
        localStorage.setItem('user', JSON.stringify(response.user))
      }
      
      // Store refresh token if provided
      if ('refresh_token' in response) {
        Cookies.set('refresh_token', (response as any).refresh_token, {
          sameSite: 'strict',
          expires: 7,
        })
      }
    } catch (error) {
      console.error('Login error:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    setIsLoading(true)
    try {
      await apiClient.logout()
      setUser(null)
      // Clear persisted user data
      localStorage.removeItem('user')
    } finally {
      setIsLoading(false)
    }
  }

  const refreshUser = async () => {
    try {
      const isValid = await apiClient.verifyToken()
      if (!isValid) {
        setUser(null)
        Cookies.remove('access_token')
      }
    } catch (error) {
      console.error('Failed to refresh user:', error)
      setUser(null)
    }
  }

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
