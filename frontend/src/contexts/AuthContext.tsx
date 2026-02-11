import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import Cookies from 'js-cookie'
import { apiClient } from '@/lib/api'
import { User, LoginRequest, LoginResponse } from '@/types'
import { hasPermission, hasAnyPermission, hasAllPermissions, canAccessRoute, canCallApi } from '@/middleware/rbac'
import { Permission } from '@/components/ai-shared/types'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (request: LoginRequest) => Promise<void>
  candidateLogin: (email: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  // Permission checking utilities
  hasPermission: (permission: Permission) => boolean
  hasAnyPermission: (permissions: Permission[]) => boolean
  hasAllPermissions: (permissions: Permission[]) => boolean
  canAccessRoute: (path: string) => boolean
  canCallApi: (method: string, path: string) => boolean
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

  const candidateLogin = async (email: string) => {
    setIsLoading(true)
    try {
      const response = await apiClient.candidateLogin(email)

      if (response.user) {
        setUser(response.user)
        localStorage.setItem('user', JSON.stringify(response.user))
      }

      if (response.companies) {
        localStorage.setItem('candidate_companies', JSON.stringify(response.companies))
      }
      if (response.interviews) {
        localStorage.setItem('candidate_interviews', JSON.stringify(response.interviews))
      }

      // access_token is set by apiClient.candidateLogin
    } catch (error) {
      console.error('Candidate login error:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    // Try to call backend logout BEFORE clearing tokens (so the request has auth)
    try {
      await apiClient.logout()
    } catch {
      // Ignore logout API errors - not critical
    }
    
    // Clear user state and tokens
    setUser(null)
    localStorage.removeItem('user')
    localStorage.removeItem('candidate_companies')
    localStorage.removeItem('candidate_interviews')
    Cookies.remove('access_token')
    Cookies.remove('refresh_token')
  }

  const refreshUser = async () => {
    try {
      const result = await apiClient.verifyToken()
      // Note: backend verifyToken returns { valid: true, user: ... }
      if (!result || !(result as any).valid) {
        setUser(null)
        Cookies.remove('access_token')
      } else if ((result as any).user) {
        setUser((result as any).user)
        localStorage.setItem('user', JSON.stringify((result as any).user))
      }
    } catch (error) {
      console.error('Failed to refresh user:', error)
      setUser(null)
    }
  }

  const value = React.useMemo(() => ({
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    candidateLogin,
    logout,
    refreshUser,
    hasPermission: (permission: Permission) => {
      if (!user) return false;
      return hasPermission(user.role, permission);
    },
    hasAnyPermission: (permissions: Permission[]) => {
      if (!user) return false;
      return hasAnyPermission(user.role, permissions);
    },
    hasAllPermissions: (permissions: Permission[]) => {
      if (!user) return false;
      return hasAllPermissions(user.role, permissions);
    },
    canAccessRoute: (path: string) => {
      if (!user) return false;
      return canAccessRoute(user.role, path);
    },
    canCallApi: (method: string, path: string) => {
      if (!user) return false;
      return canCallApi(user.role, method, path);
    },
  }), [user, isLoading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
