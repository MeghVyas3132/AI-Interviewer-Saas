// AI Service API Client
// Handles communication with AI service running on port 3001

import axios, { AxiosInstance } from 'axios';
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

const AI_SERVICE_URL = process.env.NEXT_PUBLIC_AI_SERVICE_URL || 'http://localhost:3001';

class AIServiceClient {
    private client: AxiosInstance;

    constructor() {
        this.client = axios.create({
            baseURL: AI_SERVICE_URL,
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 30000, // 30 seconds
        });
    }

    // Exams & Templates
    async getExams(): Promise<AIExam[]> {
        try {
            const response = await this.client.get('/api/exams');
            // Handle various response formats: data.exams, data.data, or directly data
            return response.data?.exams || response.data?.data || (Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('aiServiceClient: Failed to fetch exams', error);
            throw error;
        }
    }

    async getExam(examId: string): Promise<AIExam> {
        const response = await this.client.get(`/api/exams/${examId}`);
        return response.data?.exam || response.data?.data || response.data;
    }

    async createExam(data: Partial<AIExam>): Promise<AIExam> {
        const response = await this.client.post('/api/exams', data);
        return response.data?.exam || response.data?.data || response.data;
    }

    // Subcategories
    async getSubcategories(examId?: string): Promise<AISubcategory[]> {
        try {
            const response = await this.client.get('/api/subcategories', {
                params: examId ? { examId } : undefined,
            });
            return response.data?.subcategories || response.data?.data || (Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('aiServiceClient: Failed to fetch subcategories', error);
            throw error;
        }
    }

    async getSubcategory(subcategoryId: string): Promise<AISubcategory> {
        const response = await this.client.get(`/api/subcategories/${subcategoryId}`);
        return response.data?.subcategory || response.data?.data || response.data;
    }

    // Questions
    async getQuestions(subcategoryId: string): Promise<AIQuestion[]> {
        const response = await this.client.get('/api/questions', {
            params: { subcategoryId },
        });
        return response.data?.questions || response.data?.data || (Array.isArray(response.data) ? response.data : []);
    }

    async generateQuestions(request: GenerateQuestionsRequest): Promise<AIQuestion[]> {
        const response = await this.client.post('/api/questions/generate', request);
        return response.data?.questions || response.data?.data || (Array.isArray(response.data) ? response.data : []);
    }

    // Interview Sessions
    async createInterviewSession(request: CreateInterviewRequest): Promise<AIInterviewSession> {
        const formData = new FormData();
        formData.append('candidateId', request.candidateId);
        formData.append('examId', request.examId);
        formData.append('subcategoryId', request.subcategoryId);
        formData.append('language', request.language);
        formData.append('mode', request.mode);

        if (request.college) {
            formData.append('college', request.college);
        }

        if (request.proctoringMode) {
            formData.append('proctoringMode', request.proctoringMode);
        }

        if (request.resumeFile) {
            formData.append('resume', request.resumeFile);
        }

        const response = await this.client.post('/api/interviews', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data?.session || response.data?.data || response.data;
    }

    async getInterviewSession(sessionId: string): Promise<AIInterviewSession> {
        const response = await this.client.get(`/api/interviews/${sessionId}`);
        return response.data?.session || response.data?.data || response.data;
    }

    async getInterviewResult(sessionId: string): Promise<AIInterviewResult> {
        const response = await this.client.get(`/api/interviews/${sessionId}/result`);
        return response.data?.result || response.data?.data || response.data;
    }

    // Resume Analysis
    async analyzeResume(file: File): Promise<ResumeAnalysis> {
        const formData = new FormData();
        formData.append('resume', file);

        const response = await this.client.post('/api/resume/analyze', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data?.analysis || response.data?.data || response.data;
    }

    // Analytics & Metrics
    async getInterviewMetrics(companyId?: string): Promise<AIMetrics | any> {
        try {
            const response = await this.client.get('/api/analytics/metrics', {
                params: companyId ? { companyId } : undefined,
            });
            return response.data?.metrics || response.data?.data || response.data;
        } catch (error) {
            console.warn('aiServiceClient: Metrics API failed or not implemented. Fallback should be handled by components.', error);
            throw error;
        }
    }

    async getCandidatePerformance(candidateId: string): Promise<AIInterviewResult[]> {
        const response = await this.client.get(`/api/analytics/candidates/${candidateId}`);
        return response.data?.results || response.data?.data || (Array.isArray(response.data) ? response.data : []);
    }

    // Reports
    async getInterviewTranscript(sessionId: string): Promise<{ transcript: string }> {
        const response = await this.client.get(`/api/reports/transcripts/${sessionId}`);
        return response.data?.data || response.data;
    }

    async downloadReport(sessionId: string, format: 'pdf' | 'json' = 'pdf'): Promise<Blob> {
        const response = await this.client.get(`/api/reports/${sessionId}`, {
            params: { format },
            responseType: 'blob',
        });
        return response.data;
    }
}

// Export singleton instance
export const aiServiceClient = new AIServiceClient();

// Export class for custom instances
export { AIServiceClient };
