// API Service - Axios-based HTTP client for backend communication
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

// API Base URL - connects to API Gateway (no /v1 suffix - matches backend routes)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - adds auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handles errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Clear token and redirect to login
      if (typeof window !== 'undefined') {
        localStorage.removeItem('authToken');
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

// ============== Auth API ==============
export const authApi = {
  // Dev login for testing
  devLogin: async (email: string, role: string) => {
    const response = await api.post('/auth/dev-login', { email, role });
    return response.data;
  },
  
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },
  
  logout: async () => {
    const response = await api.post('/auth/logout');
    return response.data;
  },
  
  me: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
  
  setToken: (token: string) => {
    localStorage.setItem('authToken', token);
  },
  
  clearToken: () => {
    localStorage.removeItem('authToken');
  },
};

// ============== Interview Rounds API ==============
export interface CreateRoundPayload {
  externalInterviewId: string;
  externalCandidateId: string;
  externalInterviewerId?: string;
  externalJobRoleId: string;
  roundNumber?: number;
  roundType: 'TECHNICAL_AI' | 'SCREENING_HUMAN' | 'HR_HUMAN' | 'MANAGERIAL_HUMAN' | 'CULTURAL_FIT_HUMAN';
  interviewMode: 'AI_CONDUCTED' | 'HUMAN_AI_ASSISTED' | 'HUMAN_ONLY';
  scheduledAt?: string;
  scheduledDurationMinutes?: number;
}

export interface RoundResponse {
  id: string;
  external_interview_id: string;
  external_candidate_id: string;
  external_interviewer_id: string | null;
  external_job_role_id: string;
  round_number: number;
  round_type: string;
  interview_mode: string;
  scheduled_at: string | null;
  scheduled_duration_minutes: number;
  started_at: string | null;
  ended_at: string | null;
  videosdk_meeting_id: string | null;
  videosdk_token: string | null;
  status: string;
  candidate_consent_given: boolean;
  candidate_consent_timestamp: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRoomResponse {
  roomId: string;
  candidateLink: string;
  interviewerToken: string;
  candidateToken: string;
}

export const roundsApi = {
  // List all rounds
  list: async (params?: { status?: string; interviewer_id?: string; candidate_id?: string }) => {
    const response = await api.get('/rounds', { params });
    return response.data;
  },
  
  // Get round by ID
  get: async (id: string) => {
    const response = await api.get(`/rounds/${id}`);
    return response.data;
  },
  
  // Create new round
  create: async (payload: CreateRoundPayload) => {
    const response = await api.post('/rounds', payload);
    return response.data;
  },
  
  // Start a round
  start: async (id: string) => {
    const response = await api.patch(`/rounds/${id}/start`);
    return response.data;
  },
  
  // End a round
  end: async (id: string) => {
    const response = await api.patch(`/rounds/${id}/end`);
    return response.data;
  },

  // Delete a round
  delete: async (id: string) => {
    const response = await api.delete(`/rounds/${id}`);
    return response.data;
  },

  // Update a round
  update: async (id: string, payload: Partial<CreateRoundPayload>) => {
    const response = await api.put(`/rounds/${id}`, payload);
    return response.data;
  },

  // Create VideoSDK room for interview
  createRoom: async (id: string): Promise<CreateRoomResponse> => {
    const response = await api.post(`/rounds/${id}/create-room`);
    return response.data;
  },
  
  // Update consent status
  updateConsent: async (id: string, consent: boolean) => {
    const response = await api.patch(`/rounds/${id}/consent`, { consent });
    return response.data;
  },
};

// ============== Verdicts API ==============
export interface VerdictPayload {
  round_id: string;
  decision: 'proceed' | 'reject' | 'on_hold' | 'needs_discussion';
  technical_score?: number;
  communication_score?: number;
  overall_score?: number;
  notes: string;
  ai_contributions?: string[];
}

export const verdictsApi = {
  // Submit verdict
  submit: async (payload: VerdictPayload) => {
    const response = await api.post('/verdicts', payload);
    return response.data;
  },
  
  // Get verdict for a round
  getByRound: async (roundId: string) => {
    const response = await api.get(`/verdicts/round/${roundId}`);
    return response.data;
  },
  
  // Update verdict
  update: async (id: string, payload: Partial<VerdictPayload>) => {
    const response = await api.patch(`/verdicts/${id}`, payload);
    return response.data;
  },
};

// ============== Insights API ==============
export const insightsApi = {
  // Get insights for a round
  getByRound: async (roundId: string) => {
    const response = await api.get(`/insights/round/${roundId}`);
    return response.data;
  },
  
  // Get aggregated insights (immediate)
  getAggregated: async (roundId: string) => {
    const response = await api.get(`/insights/${roundId}/aggregate`);
    return response.data;
  },
};

// ============== Resume API ==============
export const resumeApi = {
  // Get candidate resume
  getByCandidate: async (candidateId: string) => {
    const response = await api.get(`/resumes/candidate/${candidateId}`);
    return response.data;
  },
  
  // Upload resume
  upload: async (candidateId: string, resumeData: any) => {
    const response = await api.post('/resumes', { candidate_id: candidateId, ...resumeData });
    return response.data;
  },
};

// ============== Candidates API ==============
export const candidatesApi = {
  // Get candidate by ID
  get: async (id: string) => {
    const response = await api.get(`/candidates/${id}`);
    return response.data;
  },
  
  // List candidates
  list: async (params?: { status?: string; job_role_id?: string }) => {
    const response = await api.get('/candidates', { params });
    return response.data;
  },
};

// ============== Video Token API ==============
export const videoApi = {
  // Get VideoSDK token
  getToken: async (roundId: string, role: 'interviewer' | 'candidate') => {
    const response = await api.get(`/video/token`, { params: { roundId, role } });
    return response.data;
  },
};

export { api, API_BASE_URL };
