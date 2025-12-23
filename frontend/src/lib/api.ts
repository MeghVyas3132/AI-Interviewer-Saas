
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';
import { LoginRequest, LoginResponse, RefreshTokenRequest, ApiError } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

class APIClient {
  private client: AxiosInstance;
  private refreshPromise: Promise<string> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = Cookies.get('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiError>) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          try {
            const newToken = await this.refreshAccessToken();
            if (newToken) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              return this.client(originalRequest);
            }
          } catch (refreshError) {
            return Promise.reject(refreshError);
          }
        }
        return Promise.reject(error);
      }
    );
  }

  private async refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    const refreshToken = Cookies.get('refresh_token');
    if (!refreshToken) {
      return null;
    }
    this.refreshPromise = (async () => {
      try {
        const response = await axios.post<LoginResponse>(`${API_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });
        const { access_token } = response.data;
        Cookies.set('access_token', access_token, {
          sameSite: 'strict',
          expires: 1 / 24 / 60 * 15,
        });
        return access_token;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  async login(request: LoginRequest): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>('/auth/login', request);
    const { access_token } = response.data;
    Cookies.set('access_token', access_token, {
      sameSite: 'strict',
      expires: 1 / 24 / 60 * 15,
    });
    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await this.client.post('/auth/logout');
    } finally {
      Cookies.remove('access_token');
      Cookies.remove('refresh_token');
    }
  }

  async verifyToken(): Promise<boolean> {
    try {
      await this.client.post('/auth/verify');
      return true;
    } catch {
      return false;
    }
  }

  async candidateLogin(email: string): Promise<LoginResponse & { companies: any[], interviews: any[] }> {
    const response = await this.client.post<LoginResponse & { companies: any[], interviews: any[] }>('/candidate-portal/login', { email });
    const { access_token, refresh_token, user } = response.data;
    Cookies.set('access_token', access_token, {
      sameSite: 'strict',
      expires: 1 / 24 / 60 * 15,
    });
    if (refresh_token) {
      Cookies.set('refresh_token', refresh_token, {
        sameSite: 'strict',
        expires: 7,
      });
    }
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    }
    return response.data;
  }

  async get<T>(url: string, config = {}): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data: unknown, config = {}): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data: unknown, config = {}): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async patch<T>(url: string, data: unknown, config = {}): Promise<T> {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, data?: unknown, config = {}): Promise<T> {
    const response = await this.client.delete<T>(url, { ...config, data });
    return response.data;
  }
}

export const apiClient = new APIClient();
