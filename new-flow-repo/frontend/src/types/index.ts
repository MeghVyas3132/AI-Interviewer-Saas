// User types
export interface User {
  id: string;
  email: string;
  fullName: string;
  name?: string; // Alias for fullName
  role: 'hr' | 'employee' | 'candidate';
  companyName?: string;
}

// Job role
export interface JobRole {
  id: string;
  title: string;
  department?: string;
  description?: string;
  requirements: string[];
}

// Candidate
export interface Candidate {
  id: string;
  userId: string;
  fullName: string;
  name: string; // Alias for fullName
  email: string;
  phone?: string;
  resumeJson: ResumeData;
  jobRoleId: string;
  assignedTo: string;
  status: 'pending' | 'in_progress' | 'completed' | 'rejected' | 'hired' | 'scheduled';
}

// Resume data structure (enhanced for backend compatibility)
export interface ResumeData {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  summary?: string;
  contact?: {
    phone?: string;
    location?: string;
    email?: string;
  };
  personalInfo?: {
    name: string;
    email: string;
    phone?: string;
    location?: string;
    linkedinUrl?: string;
    githubUrl?: string;
  };
  experience: {
    company: string;
    role: string;
    title?: string;
    duration: string;
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
    description?: string;
    skills: string[];
    highlights?: string[];
    technologies?: string[];
  }[];
  education: {
    degree: string;
    institution: string;
    field?: string;
    year: number;
    startDate?: string;
    endDate?: string;
    gpa?: string;
  }[];
  skills: string[];
  skillsDetailed?: {
    programming?: string[];
    frameworks?: string[];
    databases?: string[];
    tools?: string[];
    soft?: string[];
  };
  projects?: {
    name: string;
    description: string;
    technologies: string[];
    url?: string;
    highlights?: string[];
  }[];
  certifications?: {
    name: string;
    issuer: string;
    issueDate: string;
    expiryDate?: string;
    credentialId?: string;
  }[];
}

// Interview round (updated for backend compatibility)
export interface InterviewRound {
  id: string;
  interviewId?: string;
  candidateId: string;
  interviewerId: string;
  jobRoleId?: string;
  roundNumber: number;
  roundType: 'technical' | 'behavioral' | 'hr' | 'culture_fit' | 'final' | 'technical_ai' | 'screening' | 'managerial';
  scheduledAt: string;
  durationMinutes?: number;
  status: 'scheduled' | 'waiting' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  startedAt?: string;
  endedAt?: string;
  roomId?: string;
  videosdkMeetingId?: string;
  aiConsentGiven: boolean;
  consentTimestamp?: string;
}

// Live insights from AI (updated for backend compatibility)
export interface LiveInsight {
  id: string;
  roundId: string;
  timestampMs: number;
  insightType: InsightType;
  category: 'fraud' | 'contradiction' | 'speech' | 'video';
  severity: 'low' | 'medium' | 'high' | 'info' | 'warning' | 'alert';
  confidence: number;
  title: string;
  description: string;
  evidence?: string[];
  sourceServices?: string[];
  followupQuestions?: string[];
  isAlert: boolean;
  metrics: Record<string, any>;
}

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
  | 'aggregate';

// AI Metrics Panel data
export interface AIMetrics {
  speechConfidence: number;
  engagementScore: number;
  hesitationsCount: number;
  avgResponseTime: number;
  headMovement: 'stable' | 'moderate' | 'unstable';
  videoQuality: 'good' | 'fair' | 'poor';
  authenticity: 'verified' | 'suspicious' | 'alert';
}

// Recommendation from AI
export interface Recommendation {
  type: 'action' | 'clarification' | 'observation';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  suggestedQuestions?: string[];
  suggestedActions?: string[];
  relatedInsightId?: string;
}

// Fraud alerts
export interface FraudAlert {
  id: string;
  type: 'tab_switch' | 'multiple_faces' | 'voice_mismatch' | 'reading_detected' | 'face_mismatch';
  message: string;
  timestampMs?: number;
  timestamp?: string;
  severity: 'warning' | 'alert' | 'low' | 'medium' | 'high';
}

// Transcript segment
export interface TranscriptSegment {
  id: string;
  speaker: 'candidate' | 'interviewer';
  text: string;
  startMs?: number;
  endMs?: number;
  timestamp?: string;
  confidence?: number;
}

// Interview summary
export interface InterviewSummary {
  roundId: string;
  speechConfidenceAvg: number;
  hesitationsCount: number;
  avgResponseTimeMs: number;
  headMovementStability: number;
  videoQualityAvg: number;
  authenticityScore: number;
  fraudFlagsCount: number;
  tabSwitchesCount: number;
  candidateSpeakingPct: number;
  interviewerSpeakingPct: number;
}

// Human verdict (updated for backend compatibility)
export interface HumanVerdict {
  id?: string;
  roundId: string;
  interviewerId: string;
  verdict?: 'strong_advance' | 'advance' | 'hold' | 'lean_reject' | 'reject';
  // Support both backend API values and form values
  decision?: 'proceed' | 'reject' | 'on_hold' | 'needs_discussion' | 'pending' | 'pass' | 'hold';
  communicationScore: number;
  technicalScore: number;
  problemSolvingScore?: number;
  culturalFitScore?: number;
  cultureFitScore?: number; // Alias
  overallScore?: number;
  strengths: string[];
  weaknesses?: string[];
  improvements?: string[]; // For form compatibility
  notes?: string;
  feedback?: string; // For form compatibility
  additionalNotes?: string; // For form compatibility
  aiAlignment?: 'agreed' | 'partially_agreed' | 'disagreed';
  aiContributions?: string[];
  createdAt?: string;
  submittedAt?: string;
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// VideoSDK Room Response
export interface VideoRoomResponse {
  roomId: string;
  candidateLink: string;
  interviewerToken: string;
  candidateToken: string;
}

// Insight Batch (from WebSocket)
export interface InsightBatch {
  insights: LiveInsight[];
  recommendations: Recommendation[];
  summary?: {
    totalInsights: number;
    alertCount: number;
    topCategory: string;
  };
}
