import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

interface ProtectedRouteOptions {
  allowedRoles?: string[]
  redirectTo?: string
}

export function useProtectedRoute(options: ProtectedRouteOptions = {}) {
  const router = useRouter()
  const { user, isLoading, isAuthenticated } = useAuth()
  const { allowedRoles, redirectTo = '/auth/login' } = options

  useEffect(() => {
    if (isLoading) return

    // Not authenticated, redirect to login
    if (!isAuthenticated) {
      router.push(redirectTo)
      return
    }

    // Check role-based access
    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
      router.push('/dashboard')
      return
    }
  }, [isLoading, isAuthenticated, user, router, allowedRoles, redirectTo])

  return { isAuthorized: isAuthenticated && (!allowedRoles || (user && allowedRoles.includes(user.role))) }
}
