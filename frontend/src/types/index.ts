// Auth Types
export type UserRole = 'SYSTEM_ADMIN' | 'HR' | 'EMPLOYEE' | 'CANDIDATE'

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user: User
}

export interface User {
  id: string
  email: string
  full_name: string
  // compatibility alias: some UI components expect `user.name`
  name?: string
  role: UserRole
  company_id: string
  company_name?: string
  is_active: boolean
  department?: string
  created_at: string
}

export interface Company {
  id: string
  name: string
  email: string
  email_domain?: string
  description?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface RefreshTokenRequest {
  refresh_token: string
}

// Candidate Types
export interface Candidate {
  id: string
  email: string
  full_name?: string // Optional to handle backend response variations
  first_name?: string
  last_name?: string
  phone?: string
  position?: string
  domain?: string
  status: 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'REJECTED' | 'HIRED' | string
  resume_url?: string
  created_at: string
  updated_at: string
}

export interface CreateCandidateRequest {
  email: string
  full_name: string
  phone?: string
  position?: string
}

// Interview Types
export interface Interview {
  id: string
  candidate_id: string
  round_type: 'SCREENING' | 'TECHNICAL' | 'FINAL' | 'HR' | string
  round_number?: number // Optional for backward compatibility
  status: 'scheduled' | 'in_progress' | 'completed' | 'canceled' | 'cancelled' | 'expired' | 'abandoned' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED' | 'CANCELLED' | 'EXPIRED' | 'ABANDONED' // Support all formats
  scheduled_at: string
  scheduled_time?: string // Alternative field name
  duration_minutes?: number
  timezone?: string
  meeting_link?: string
  ai_interview_token?: string
  questions?: InterviewQuestion[]
  scores?: InterviewScore
  created_at: string
}

export interface InterviewQuestion {
  id: string
  question_text: string
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
  category: string
}

export interface InterviewScore {
  id: string
  interview_id: string
  technical_score: number
  communication_score: number
  problem_solving_score: number
  overall_score: number
  feedback: string
  created_at: string
}

export interface ScheduleInterviewRequest {
  candidate_id: string
  round_number: number
  scheduled_at: string
  duration_minutes: number
}

// Pagination
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface ApiError {
  detail: string | { [key: string]: string[] }
  status_code?: number
}
