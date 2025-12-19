// Global type declarations for resume analysis cache

interface ResumeAnalysisCacheData {
  analysis: {
    candidateName: string;
    skills: string[];
    experienceSummary: string;
    comprehensiveSummary?: string;
    strengths: string[];
    areasForImprovement: string[];
    structuredData?: any;
  };
  comprehensiveResumeText: string;
  extractedText: string;
  uploadedAt: string;
}

declare global {
  var resumeAnalysisCache: Map<string, ResumeAnalysisCacheData> | undefined;
}

export {};

