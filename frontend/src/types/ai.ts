// AI Service Type Definitions
// Types for interacting with AI service on port 3001

export interface AIExam {
    id: string;
    name: string;
    description?: string;
    subcategories?: AISubcategory[];
}

export interface AISubcategory {
    id: string;
    name: string;
    examId: string;
}

export interface AIQuestion {
    id: string;
    question: string;
    subcategoryId: string;
    difficulty?: 'easy' | 'medium' | 'hard';
}

export interface AIInterviewSession {
    id: string;
    candidateId: string;
    examId: string;
    subcategoryId: string;
    status: 'pending' | 'in_progress' | 'completed' | 'paused';
    token?: string;
    resumeData?: string;
    language?: string;
    college?: string;
    mode?: 'voice' | 'text';
    proctoringMode?: 'proctored' | 'unproctored';
    createdAt?: string;
    completedAt?: string;
}

export interface AIInterviewResult {
    id: string;
    sessionId: string;
    overallScore: number;
    feedback: {
        strengths: string[];
        improvements: string[];
        recommendations: string[];
    };
    scoring: {
        technicalKnowledge: number;
        communication: number;
        problemSolving: number;
        culturalFit: number;
    };
    transcript?: string;
}

export interface ResumeAnalysis {
    score: number;
    feedback: string;
    strengths: string[];
    improvements: string[];
    keywords: string[];
}

export interface AIMetrics {
    totalInterviews: number;
    averageScore: number;
    completionRate: number;
    topPerformers: Array<{
        candidateId: string;
        score: number;
        date: string;
    }>;
}

export interface CreateInterviewRequest {
    candidateId: string;
    examId: string;
    subcategoryId: string;
    resumeFile?: File;
    language: string;
    college?: string;
    mode: 'voice' | 'text';
    proctoringMode?: 'proctored' | 'unproctored';
}

export interface GenerateQuestionsRequest {
    examId: string;
    subcategoryId: string;
    numQuestions?: number;
    difficulty?: 'easy' | 'medium' | 'hard';
}
