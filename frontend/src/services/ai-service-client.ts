// AI Service API Client
// Handles communication with AI service running on port 3001

import axios, { AxiosInstance } from 'axios';
import Cookies from 'js-cookie';
import type {
    AIExam,
    AISubcategory,
    AIQuestion,
    AIInterviewSession,
    AIInterviewResult,
    ResumeAnalysis,
    AIMetrics,
    CreateInterviewRequest,
    GenerateQuestionsRequest,
} from '@/types/ai';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// Helper to get auth header
const getAuthHeader = () => {
    const token = Cookies.get('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export const aiServiceClient = {
    // Interview Session
    async createInterviewSession(data: any) {
        const response = await axios.post(`${API_BASE_URL}/ai/interview-session`, data, {
            headers: getAuthHeader(),
        });
        return response.data;
    },
    async getInterviewSession(sessionId: string) {
        const response = await axios.get(`${API_BASE_URL}/ai/interview-session/${sessionId}`, {
            headers: getAuthHeader(),
        });
        return response.data;
    },
    // Resume Analysis
    async analyzeResume(file: File) {
        const formData = new FormData();
        formData.append('resume', file);
        const response = await axios.post(`${API_BASE_URL}/ai/resume-analysis`, formData, {
            headers: { 
                'Content-Type': 'multipart/form-data',
                ...getAuthHeader(),
            },
        });
        return response.data;
    },
    // ATS Checker
    async atsChecker(data: any) {
        const response = await axios.post(`${API_BASE_URL}/ai/ats-checker`, data, {
            headers: getAuthHeader(),
        });
        return response.data;
    },
    // Transcript - Get
    async getTranscript(sessionId: string) {
        const response = await axios.get(`${API_BASE_URL}/ai/transcript/${sessionId}`, {
            headers: getAuthHeader(),
        });
        return response.data;
    },
    // Transcript - Submit
    async submitTranscript(sessionId: string, data: {
        candidate_id: string;
        transcript_text: string;
        answers: Array<{
            question_id: string;
            answer_text: string;
            timestamp: string;
        }>;
    }) {
        const response = await axios.post(`${API_BASE_URL}/ai/transcript-callback`, {
            session_id: sessionId,
            ...data,
        }, {
            headers: getAuthHeader(),
        });
        return response.data;
    },
    // AI Reports
    async getAIReports(limit: number = 20, offset: number = 0) {
        const response = await axios.get(`${API_BASE_URL}/ai/reports`, {
            params: { limit, offset },
            headers: getAuthHeader(),
        });
        return response.data;
    },
};
