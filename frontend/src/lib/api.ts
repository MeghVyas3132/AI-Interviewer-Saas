import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'
import Cookies from 'js-cookie'
import { LoginRequest, LoginResponse, RefreshTokenRequest, ApiError } from '@/types'

// Always use localhost:8000 for browser requests
// This client is only used client-side where localhost resolves correctly
const API_URL = 'http://localhost:8000/api/v1'

class APIClient {
  private client: AxiosInstance
  private refreshPromise: Promise<string> | null = null

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })

    // Request interceptor - add auth token (skip for auth endpoints)
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        // Don't add auth header for login/register endpoints
        const isAuthEndpoint = config.url?.includes('/auth/login') || 
                               config.url?.includes('/auth/register') ||
                               config.url?.includes('/auth/refresh')
        
        console.log('[APIClient] Request:', config.url, 'isAuthEndpoint:', isAuthEndpoint)
        
        if (!isAuthEndpoint) {
          const token = Cookies.get('access_token')
          if (token) {
            console.log('[APIClient] Adding auth header')
            config.headers.Authorization = `Bearer ${token}`
          }
        } else {
          // Explicitly remove any auth header for auth endpoints
          delete config.headers.Authorization
        }
        return config
      },
      (error) => Promise.reject(error)
    )

    // Response interceptor - handle token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiError>) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

        // Skip token refresh for auth endpoints - they should return 401 for invalid credentials
        const isAuthEndpoint = originalRequest.url?.includes('/auth/login') || 
                               originalRequest.url?.includes('/auth/register') ||
                               originalRequest.url?.includes('/auth/refresh')

        // If 401 and not already retried and not an auth endpoint, try to refresh token
        if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
          originalRequest._retry = true

          try {
            const newToken = await this.refreshAccessToken()
            if (newToken) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`
              return this.client(originalRequest)
            }
          } catch (refreshError) {
            // Token refresh failed, redirect to login
            if (typeof window !== 'undefined') {
              window.location.href = '/auth/login'
            }
            return Promise.reject(refreshError)
          }
        }

        return Promise.reject(error)
      }
    )
  }

  private async refreshAccessToken(): Promise<string | null> {
    // Prevent multiple refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise
    }

    const refreshToken = Cookies.get('refresh_token')
    if (!refreshToken) {
      return null
    }

    this.refreshPromise = (async () => {
      try {
        const response = await axios.post<LoginResponse>(`${API_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        })

        const { access_token } = response.data
        Cookies.set('access_token', access_token, {
          sameSite: 'strict',
          expires: 1 / 24 / 60 * 15, // 15 minutes
        })

        return access_token
      } finally {
        this.refreshPromise = null
      }
    })()

    return this.refreshPromise
  }

  // Auth endpoints
  async login(request: LoginRequest): Promise<LoginResponse> {
    console.log('[APIClient] Login request:', { email: request.email, passwordLength: request.password?.length })
    
    // Clear any stale tokens before login
    Cookies.remove('access_token')
    Cookies.remove('refresh_token')
    
    try {
      const response = await this.client.post<LoginResponse>('/auth/login', request)
      console.log('[APIClient] Login success:', response.status)
      const { access_token, user } = response.data

      // Store tokens
      Cookies.set('access_token', access_token, {
        sameSite: 'strict',
        expires: 1 / 24 / 60 * 15, // 15 minutes
      })

      return response.data
    } catch (error: any) {
      console.error('[APIClient] Login error:', error.response?.status, error.response?.data)
      throw error
    }
  }

  async candidateLogin(email: string): Promise<LoginResponse & { companies?: any[], interviews?: any[] }> {
    console.log('[APIClient] Candidate login request:', { email })
    
    // Clear any stale tokens before login
    Cookies.remove('access_token')
    Cookies.remove('refresh_token')
    
    try {
      const response = await this.client.post<LoginResponse & { companies?: any[], interviews?: any[] }>('/auth/candidate-login', { email })
      console.log('[APIClient] Candidate login success:', response.status)
      const { access_token, user } = response.data

      // Store tokens
      Cookies.set('access_token', access_token, {
        sameSite: 'strict',
        expires: 1 / 24 / 60 * 15, // 15 minutes
      })

      return response.data
    } catch (error: any) {
      console.error('[APIClient] Candidate login error:', error.response?.status, error.response?.data)
      throw error
    }
  }

  async logout(): Promise<void> {
    try {
      await this.client.post('/auth/logout')
    } finally {
      Cookies.remove('access_token')
      Cookies.remove('refresh_token')
    }
  }

  async verifyToken(): Promise<boolean> {
    try {
      await this.client.post('/auth/verify')
      return true
    } catch {
      return false
    }
  }

  // Generic request methods
  async get<T>(url: string, config = {}): Promise<T> {
    const response = await this.client.get<T>(url, config)
    return response.data
  }

  async post<T>(url: string, data: unknown, config = {}): Promise<T> {
    const response = await this.client.post<T>(url, data, config)
    return response.data
  }

  async put<T>(url: string, data: unknown, config = {}): Promise<T> {
    const response = await this.client.put<T>(url, data, config)
    return response.data
  }

  async patch<T>(url: string, data: unknown, config = {}): Promise<T> {
    const response = await this.client.patch<T>(url, data, config)
    return response.data
  }

  async delete<T>(url: string, data?: unknown, config = {}): Promise<T> {
    const response = await this.client.delete<T>(url, { ...config, data })
    return response.data
  }
}

export const apiClient = new APIClient()
