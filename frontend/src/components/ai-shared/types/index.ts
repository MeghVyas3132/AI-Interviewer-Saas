/**
 * Shared TypeScript interfaces for AI interview features
 * These types are used across HR Dashboard, Candidate Portal, and AI components
 */

// ============================================================================
// User & Authentication
// ============================================================================

export type UserRole = 'HR' | 'ADMIN' | 'EMPLOYEE' | 'TEAM_LEAD' | 'CANDIDATE' | 'SYSTEM_ADMIN';

export interface User {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    company_id: string;
    company_name?: string;
    is_active: boolean;
    department?: string;
    created_at: string;
}

// ============================================================================
// Interview Types
// ============================================================================

export type InterviewMode = 'voice' | 'text';
export type ProctoringMode = 'proctored' | 'unproctored';
export type ConversationState =
    | 'loading'
    | 'speaking'
    | 'listening'
    | 'thinking'
    | 'finished'
    | 'idle'
    | 'paused';

export interface InterviewSession {
    id: string;
    token: string;
    candidate_id: string;
    interviewer_id?: string;
    round: string;
    status: 'scheduled' | 'in_progress' | 'completed' | 'canceled' | 'abandoned';
    scheduled_time: string;
    started_at?: string;
    ended_at?: string;
    mode: InterviewMode;
    is_proctored: boolean;
    ai_session_id?: string;
    meeting_link?: string;
}

export interface InterviewQuestion {
    id: string;
    question: string;
    category?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    expected_answer?: string;
    hints?: string[];
}

export interface InterviewAnswer {
    question_id: string;
    question: string;
    answer: string;
    timestamp: number;
    audio_url?: string;
    transcript?: string;
}

export interface Scoring {
    technical_accuracy?: number;
    communication?: number;
    problem_solving?: number;
    overall?: number;
    strengths?: string[];
    improvements?: string[];
}

export interface InterviewFeedback {
    question_id: string;
    scoring: Scoring;
    detailed_feedback: string;
    follow_up_suggestions?: string[];
}

export interface InterviewData {
    question: string;
    answer: string;
    feedback?: InterviewFeedback;
    timestamp: number;
    attempts?: number;
    hints_used?: string[];
}

// ============================================================================
// Resume Analysis
// ============================================================================

export interface ResumeAnalysis {
    candidate_name?: string;
    extracted_text: string;
    skills: string[];
    experience_years?: number;
    education?: string[];
    key_projects?: string[];
    strengths?: string[];
    areas_for_improvement?: string[];
    job_role_match?: {
        role: string;
        match_percentage: number;
        reasoning: string;
    };
}

// ============================================================================
// Conversation & Transcript
// ============================================================================

export interface ConversationEntry {
    role: 'interviewer' | 'candidate';
    content: string;
    timestamp: number;
    type?: 'question' | 'answer' | 'feedback' | 'system';
}

export interface TranscriptSegment {
    text: string;
    timestamp: number;
    confidence?: number;
    speaker?: 'interviewer' | 'candidate';
}

// ============================================================================
// Interview Configuration
// ============================================================================

export interface ExamConfig {
    job_role: string;
    company?: string;
    domain?: string;
    language: string;
    num_questions?: number;
    difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
    time_limit_minutes?: number;
    enable_hints?: boolean;
    enable_proctoring?: boolean;
}

export interface AIConfiguration {
    model: string;
    temperature: number;
    max_tokens: number;
    enable_voice_feedback: boolean;
    enable_real_time_hints: boolean;
    scoring_rubric: {
        technical_weight: number;
        communication_weight: number;
        problem_solving_weight: number;
    };
}

// ============================================================================
// Interview State Management
// ============================================================================

export interface InterviewPauseState {
    isPaused: boolean;
    pausedAt: number;
    pausedQuestion?: string;
    pausedTranscript?: string;
    pausedConversationLog?: ConversationEntry[];
    pausedInterviewData?: InterviewData[];
    pausedTime?: number;
}

export interface InterviewProgress {
    current_question_index: number;
    total_questions: number;
    questions_answered: number;
    time_elapsed_seconds: number;
    is_paused: boolean;
    pause_count: number;
}

// ============================================================================
// Media & Permissions
// ============================================================================

export interface MediaPermissions {
    camera: boolean | null;
    microphone: boolean | null;
    screen_share?: boolean | null;
}

export interface VideoPreferences {
    enable_video: boolean;
    video_quality: 'low' | 'medium' | 'high';
    enable_background_blur: boolean;
}

// ============================================================================
// WebSocket & Real-time Communication
// ============================================================================

export interface WebSocketMessage {
    type: 'transcript_update' | 'question_update' | 'feedback' | 'session_end' | 'error';
    data: any;
    timestamp: number;
}

export interface AssemblyAIStatus {
    status: 'idle' | 'connecting' | 'listening' | 'processing' | 'error';
    error?: string;
    session_id?: string;
}

// ============================================================================
// API Responses
// ============================================================================

export interface InterviewStartResponse {
    session: InterviewSession;
    questions: InterviewQuestion[];
    resume_analysis?: ResumeAnalysis;
    config: ExamConfig;
}

export interface InterviewEndResponse {
    summary: InterviewSummary;
    redirect_url: string;
    success: boolean;
}

export interface InterviewSummary {
    session_id: string;
    candidate_name: string;
    total_questions: number;
    questions_answered: number;
    time_taken_minutes: number;
    overall_score: number;
    scoring_breakdown: Scoring;
    interview_data: InterviewData[];
    recommendations: string[];
    interviewer_feedback?: string;
}

// ============================================================================
// Proctoring Types
// ============================================================================

export interface ProctoringEvent {
    type: 'tab_switch' | 'window_blur' | 'fullscreen_exit' | 'suspicious_activity';
    timestamp: number;
    details?: string;
}

export interface ProctoringReport {
    session_id: string;
    events: ProctoringEvent[];
    violation_count: number;
    severity: 'none' | 'low' | 'medium' | 'high';
    auto_terminated: boolean;
}

// ============================================================================
// Permission System (RBAC)
// ============================================================================

export type Permission =
    | 'VIEW_ALL_CANDIDATES'
    | 'MANAGE_EMPLOYEES'
    | 'CONFIGURE_AI'
    | 'VIEW_AI_ANALYTICS'
    | 'VIEW_OWN_APPLICATION'
    | 'START_AI_INTERVIEW'
    | 'VIEW_OWN_RESULTS'
    | 'VIEW_ASSIGNED_CANDIDATES'
    | 'SCHEDULE_INTERVIEWS';

export interface RolePermissions {
    role: UserRole;
    permissions: Permission[];
}

// ============================================================================
// Analytics & Reporting
// ============================================================================

export interface InterviewAnalytics {
    total_interviews: number;
    completed_interviews: number;
    average_score: number;
    average_duration_minutes: number;
    completion_rate: number;
    top_performing_candidates: Array<{
        candidate_id: string;
        candidate_name: string;
        score: number;
    }>;
    question_difficulty_distribution: {
        easy: number;
        medium: number;
        hard: number;
    };
}

export interface AIPerformanceMetrics {
    model_name: string;
    average_response_time_ms: number;
    accuracy_rate: number;
    total_questions_generated: number;
    feedback_quality_score: number;
}
