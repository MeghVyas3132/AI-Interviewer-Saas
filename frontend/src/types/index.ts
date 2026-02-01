// Auth Types
export type UserRole = 'SYSTEM_ADMIN' | 'ADMIN' | 'HR' | 'EMPLOYEE' | 'CANDIDATE'

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
  full_name: string
  phone?: string
  position?: string
  status: 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'REJECTED' | 'HIRED'
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
  round_number: number
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  scheduled_at: string
  duration_minutes: number
  questions: InterviewQuestion[]
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

// ============== Real-time AI Insights Types ==============

// Interview mode types
export type InterviewModeType = 'AI_CONDUCTED' | 'HUMAN_AI_ASSISTED'

// Insight types for AI analysis
export type InsightType = 
  | 'speech_confidence'
  | 'speech_hesitation'
  | 'speech_transcript'
  | 'video_head_movement'
  | 'video_quality'
  | 'video_authenticity'
  | 'nlp_relevance'
  | 'fraud_tab_switch'
  | 'fraud_multiple_faces'
  | 'fraud_voice_mismatch'
  | 'fraud_face_switch'
  | 'fraud_background_voice'
  | 'resume_contradiction'
  | 'skill_verification'
  | 'aggregate'

// Live insights from AI analysis
export interface LiveInsight {
  id: string
  roundId: string
  timestampMs: number
  insightType: InsightType
  category: 'fraud' | 'contradiction' | 'speech' | 'video'
  severity: 'low' | 'medium' | 'high' | 'info' | 'warning' | 'alert'
  confidence: number
  title: string
  description: string
  evidence?: string[]
  sourceServices?: string[]
  followupQuestions?: string[]
  isAlert: boolean
  metrics: Record<string, unknown>
}

// AI Metrics Panel data
export interface AIMetrics {
  speechConfidence: number
  engagementScore: number
  hesitationsCount: number
  avgResponseTime: number
  headMovement: 'stable' | 'moderate' | 'unstable'
  videoQuality: 'good' | 'fair' | 'poor'
  authenticity: 'verified' | 'suspicious' | 'alert'
}

// Recommendation from AI
export interface Recommendation {
  type: 'action' | 'clarification' | 'observation'
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  suggestedQuestions?: string[]
  suggestedActions?: string[]
  relatedInsightId?: string
}

// Fraud alerts
export interface FraudAlert {
  id: string
  type: 'tab_switch' | 'multiple_faces' | 'voice_mismatch' | 'reading_detected' | 'face_mismatch'
  message: string
  timestampMs?: number
  timestamp?: string
  severity: 'warning' | 'alert' | 'low' | 'medium' | 'high'
}

// Transcript segment
export interface TranscriptSegment {
  id: string
  speaker: 'candidate' | 'interviewer'
  text: string
  startMs?: number
  endMs?: number
  timestamp?: string
  confidence?: number
}

// Interview summary for human-assisted interviews
export interface InterviewSummary {
  roundId: string
  speechConfidenceAvg: number
  hesitationsCount: number
  avgResponseTimeMs: number
  headMovementStability: number
  videoQualityAvg: number
  authenticityScore: number
  fraudFlagsCount: number
  tabSwitchesCount: number
  candidateSpeakingPct: number
  interviewerSpeakingPct: number
}

// Human verdict for interview decision
export interface HumanVerdict {
  id?: string
  roundId: string
  interviewerId: string
  decision: 'proceed' | 'reject' | 'on_hold' | 'needs_discussion' | 'pending'
  communicationScore: number
  technicalScore: number
  problemSolvingScore?: number
  cultureFitScore?: number
  overallScore?: number
  strengths: string[]
  improvements?: string[]
  feedback?: string
  aiAlignment?: 'agreed' | 'partially_agreed' | 'disagreed'
  aiContributions?: string[]
  createdAt?: string
}

// Insight Batch from WebSocket
export interface InsightBatch {
  insights: LiveInsight[]
  recommendations: Recommendation[]
  summary?: {
    totalInsights: number
    alertCount: number
    topCategory: string
  }
}

// Metrics summary from WebSocket
export interface MetricsSummary {
  speechConfidence: number
  hesitationCount: number
  avgResponseTime: number
  headMovementScore: number
  videoQualityScore: number
  authenticityScore: number
  engagementScore?: number
}

// VideoSDK Room Response
export interface VideoRoomResponse {
  roomId: string
  candidateLink: string
  interviewerToken: string
  candidateToken: string
}
