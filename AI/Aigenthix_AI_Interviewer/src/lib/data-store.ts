'use client';

import type { InterviewAgentOutput } from '@/ai/flows/interview-agent';
import type { AnalyzeResumeOutput } from '@/ai/flows/resume-analyzer';
import type { GenerateRoleSpecificQuestionsOutput } from '@/ai/flows/interview-question-generator';

const RESUME_ANALYSIS_KEY = 'timeAIPoweredCoach_resumeAnalysis';
const QUESTIONS_KEY = 'timeAIPoweredCoach_questions';
const INTERVIEW_SUMMARY_KEY = 'timeAIPoweredCoach_interviewSummary';
const VIDEO_PREFERENCE_KEY = 'timeAIPoweredCoach_videoPreference';
const INTERVIEW_MODE_KEY = 'timeAIPoweredCoach_interviewMode';
const PROCTORING_MODE_KEY = 'timeAIPoweredCoach_proctoringMode';
const INTERVIEW_SESSION_KEY = 'timeAIPoweredCoach_interviewSession';
const INTERVIEW_PAUSE_STATE_KEY = 'timeAIPoweredCoach_interviewPauseState';
const EXAM_CONFIG_KEY = 'timeAIPoweredCoach_examConfig';

export type InterviewMode = 'voice' | 'text';
export type ProctoringMode = 'proctored' | 'unproctored';

export type ConversationEntry = {
  speaker: 'ai' | 'user';
  text: string;
  hint?: string;
  isCorrect?: boolean;
  explanation?: string;
};

export type InterviewPauseState = {
  isPaused: boolean;
  pausedAt?: number;
  pausedQuestion?: string;
  pausedTranscript?: string;
  pausedConversationLog?: ConversationEntry[];
  pausedInterviewData?: InterviewData[];
  pausedTime?: number;
};

export type ScoringCategory = {
  score: number;
  justification: string;
};

export type Scoring = {
  ideas: ScoringCategory;
  organization: ScoringCategory;
  accuracy: ScoringCategory;
  voice: ScoringCategory;
  grammar: ScoringCategory;
  stopwords: ScoringCategory;
  overall: ScoringCategory;
};

export type InterviewData = {
  question: string;
  answer: string;
  isRealQuestion: boolean; // Track if this is a real interview question
  responseType?: 'spoken' | 'typed' | 'mixed'; // Track whether response was spoken, typed, or mixed
  attempts?: number; // Number of attempts for this question
  hintsGiven?: string[]; // Hints provided for this question
  isCorrect?: boolean; // Whether the answer was correct
  questionCategory?: 'general-knowledge' | 'academics' | 'work-experience' | 'about-self'; // Question category
  isCurrentAffairs?: boolean; // Whether this was a current affairs question
  currentAffairsTopic?: string; // Topic of the current affairs question (if applicable)
  currentAffairsCategory?: string; // Category of the current affairs question (if applicable)
  referenceQuestionIds?: number[]; // IDs of questions from DB used as reference for generating this question
  feedback: {
    contentFeedback: string;
    toneFeedback: string;
    clarityFeedback: string;
    visualFeedback: string;
    
    // Presentation scoring (1-5 scale)
    physicalAppearanceScore?: number;
    physicalAppearanceJustification?: string;
    bodyLanguageScore?: number;
    bodyLanguageJustification?: string;
    confidenceScore?: number;
    confidenceJustification?: string;
    
    // Response scoring fields (1-10 scale)
    ideasScore: number;
    ideasJustification: string;
    organizationScore: number;
    organizationJustification: string;
    accuracyScore: number;
    accuracyJustification: string;
    voiceScore: number;
    voiceJustification: string;
    grammarScore: number;
    grammarJustification: string;
    stopWordsScore: number;
    stopWordsJustification: string;
    overallScore: number;
    // Optional disqualification flag
    isDisqualified?: boolean;
  };
};

export type QuestionsData = GenerateRoleSpecificQuestionsOutput & {
  language: string;
  jobRole: string;
  company: string;
  college?: string;
};

export type ExamConfigData = {
  numQuestions: number;
  randomizeQuestions: boolean;
  examId: string | number;
  subcategoryId: string | number;
  examName?: string;
  subcategoryName?: string;
};

// Interview Mode
export const saveInterviewMode = (mode: InterviewMode) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem(INTERVIEW_MODE_KEY, mode);
    }
};

export const getInterviewMode = (): InterviewMode | null => {
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem(INTERVIEW_MODE_KEY);
    return data as InterviewMode | null;
};

export const setProctoringMode = (mode: ProctoringMode): void => {
    if (typeof window !== 'undefined') {
        localStorage.setItem(PROCTORING_MODE_KEY, mode);
    }
};

export const getProctoringMode = (): ProctoringMode | null => {
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem(PROCTORING_MODE_KEY);
    return data as ProctoringMode | null;
};

export const clearProctoringMode = (): void => {
    if (typeof window !== 'undefined') {
        localStorage.removeItem(PROCTORING_MODE_KEY);
    }
};

// Video Preference
export const saveVideoPreference = (enabled: boolean) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem(VIDEO_PREFERENCE_KEY, JSON.stringify(enabled));
    }
};

export const getVideoPreference = (): boolean => {
    if (typeof window === 'undefined') return false;
    const data = localStorage.getItem(VIDEO_PREFERENCE_KEY);
    // Defaults to false if not set
    return data ? JSON.parse(data) : false;
};

// Resume Analysis
export const saveResumeAnalysis = (data: AnalyzeResumeOutput) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(RESUME_ANALYSIS_KEY, JSON.stringify(data));
  }
};

export const getResumeAnalysis = (): AnalyzeResumeOutput | null => {
  if (typeof window === 'undefined') return null;
  const data = localStorage.getItem(RESUME_ANALYSIS_KEY);
  return data ? JSON.parse(data) : null;
};

// Questions
export const saveQuestions = (data: GenerateRoleSpecificQuestionsOutput, language: string, jobRole: string, company: string, college?: string) => {
    if (typeof window !== 'undefined') {
      const questionsData: QuestionsData = { ...data, language, jobRole, company, college };
      localStorage.setItem(QUESTIONS_KEY, JSON.stringify(questionsData));
    }
};

export const getQuestions = (): QuestionsData | null => {
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem(QUESTIONS_KEY);
    return data ? JSON.parse(data) : null;
};

// Interview Summary
export const saveInterviewSummary = (data: InterviewData[]) => {
    if (typeof window !== 'undefined') {
      // Debug: Log what's being saved
      console.log('💾 Saving interview summary with', data.length, 'questions');
      data.forEach((item, index) => {
        if (item.referenceQuestionIds && item.referenceQuestionIds.length > 0) {
          console.log(`  Q${index + 1}: Saving with ${item.referenceQuestionIds.length} reference IDs:`, item.referenceQuestionIds);
        } else {
          console.log(`  Q${index + 1}: No reference IDs to save`);
        }
      });
      localStorage.setItem(INTERVIEW_SUMMARY_KEY, JSON.stringify(data));
    }
};

export const getInterviewSummary = (): InterviewData[] | null => {
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem(INTERVIEW_SUMMARY_KEY);
    return data ? JSON.parse(data) : null;
};

export const clearData = () => {
    if (typeof window !== 'undefined') {
        localStorage.removeItem(RESUME_ANALYSIS_KEY);
        localStorage.removeItem(QUESTIONS_KEY);
        localStorage.removeItem(VIDEO_PREFERENCE_KEY);
        localStorage.removeItem(INTERVIEW_MODE_KEY);
        // We keep the summary so user can review it later
    }
}

export const clearAllData = () => {
    if (typeof window !== 'undefined') {
        localStorage.removeItem(RESUME_ANALYSIS_KEY);
        localStorage.removeItem(QUESTIONS_KEY);
        localStorage.removeItem(VIDEO_PREFERENCE_KEY);
        localStorage.removeItem(INTERVIEW_MODE_KEY);
        localStorage.removeItem(PROCTORING_MODE_KEY);
        localStorage.removeItem(INTERVIEW_SUMMARY_KEY);
        localStorage.removeItem(INTERVIEW_SESSION_KEY);
        localStorage.removeItem(INTERVIEW_PAUSE_STATE_KEY);
        localStorage.removeItem(EXAM_CONFIG_KEY);
    }
}

// Interview Session Management
export const startInterviewSession = () => {
    if (typeof window !== 'undefined') {
        const sessionId = Date.now().toString();
        localStorage.setItem(INTERVIEW_SESSION_KEY, sessionId);
        return sessionId;
    }
    return null;
};

export const endInterviewSession = () => {
    if (typeof window !== 'undefined') {
        localStorage.removeItem(INTERVIEW_SESSION_KEY);
    }
};

export const getInterviewSession = (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(INTERVIEW_SESSION_KEY);
};

export const isInterviewActive = (): boolean => {
    return getInterviewSession() !== null;
};

// Check if session is from a previous page load (reload scenario)
export const isSessionFromReload = (): boolean => {
    if (typeof window === 'undefined') return false;
    const sessionId = getInterviewSession();
    if (!sessionId) return false;
    
    // Check if session is older than 1 second (indicating it's from a previous page load)
    const sessionTime = parseInt(sessionId);
    const currentTime = Date.now();
    return (currentTime - sessionTime) > 1000;
};

// Mark session as started (to distinguish from reload scenarios)
export const markSessionAsStarted = () => {
    if (typeof window !== 'undefined') {
        const sessionId = getInterviewSession();
        if (sessionId) {
            // Update session timestamp to mark it as started
            localStorage.setItem(INTERVIEW_SESSION_KEY, Date.now().toString());
        }
    }
};

// Pause/Resume Interview State Management
export const pauseInterview = (pauseData: Omit<InterviewPauseState, 'isPaused'>) => {
    if (typeof window !== 'undefined') {
        const pauseState: InterviewPauseState = {
            isPaused: true,
            pausedAt: Date.now(),
            ...pauseData
        };
        localStorage.setItem(INTERVIEW_PAUSE_STATE_KEY, JSON.stringify(pauseState));
    }
};

export const resumeInterview = () => {
    if (typeof window !== 'undefined') {
        const pauseState: InterviewPauseState = {
            isPaused: false
        };
        localStorage.setItem(INTERVIEW_PAUSE_STATE_KEY, JSON.stringify(pauseState));
    }
};

export const getInterviewPauseState = (): InterviewPauseState | null => {
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem(INTERVIEW_PAUSE_STATE_KEY);
    return data ? JSON.parse(data) : null;
};

export const clearInterviewPauseState = () => {
    if (typeof window !== 'undefined') {
        localStorage.removeItem(INTERVIEW_PAUSE_STATE_KEY);
    }
};

// Exam Config
export const saveExamConfig = (data: ExamConfigData) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem(EXAM_CONFIG_KEY, JSON.stringify(data));
    }
};

export const getExamConfig = (): ExamConfigData | null => {
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem(EXAM_CONFIG_KEY);
    return data ? JSON.parse(data) : null;
};

export const clearExamConfig = () => {
    if (typeof window !== 'undefined') {
        localStorage.removeItem(EXAM_CONFIG_KEY);
    }
};
