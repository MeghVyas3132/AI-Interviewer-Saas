// Mock data for UI development and testing
// This will be replaced with real API calls when backend is connected

import { 
  User, 
  Candidate, 
  InterviewRound, 
  JobRole, 
  AIMetrics, 
  FraudAlert,
  TranscriptSegment,
  InterviewSummary 
} from '@/types';

// Mock Users
export const mockUsers: Record<string, User> = {
  hr: {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    email: 'hr@test.com',
    fullName: 'Priya Singh',
    name: 'Priya Singh',
    role: 'hr',
    companyName: 'TechCorp India',
  },
  interviewer: {
    id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    email: 'interviewer@test.com',
    fullName: 'Amit Kumar',
    name: 'Amit Kumar',
    role: 'employee',
    companyName: 'TechCorp India',
  },
  candidate: {
    id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    email: 'candidate@test.com',
    fullName: 'Rahul Sharma',
    name: 'Rahul Sharma',
    role: 'candidate',
  },
};

// Mock Job Role
export const mockJobRole: JobRole = {
  id: 'd4e5f6a7-b8c9-0123-def0-234567890123',
  title: 'Senior Frontend Developer',
  department: 'Engineering',
  description: 'Looking for an experienced React developer',
  requirements: ['React', 'TypeScript', '5+ years experience'],
};

// Mock Candidate
export const mockCandidate: Candidate = {
  id: 'e5f6a7b8-c9d0-1234-ef01-345678901234',
  userId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  fullName: 'Rahul Sharma',
  name: 'Rahul Sharma',
  email: 'candidate@test.com',
  phone: '+91 98765 43210',
  resumeJson: {
    name: 'Rahul Sharma',
    email: 'candidate@test.com',
    phone: '+91 98765 43210',
    location: 'Bangalore, India',
    experience: [
      {
        company: 'TCS',
        role: 'Software Engineer',
        duration: '2 years',
        skills: ['React', 'JavaScript'],
      },
      {
        company: 'Infosys',
        role: 'Senior Developer',
        duration: '3 years',
        skills: ['React', 'TypeScript', 'Node.js'],
      },
    ],
    education: [
      {
        degree: 'B.Tech Computer Science',
        institution: 'IIT Delhi',
        year: 2018,
      },
    ],
    skills: ['React', 'TypeScript', 'Node.js', 'Python', 'AWS'],
  },
  jobRoleId: 'd4e5f6a7-b8c9-0123-def0-234567890123',
  assignedTo: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  status: 'in_progress',
};

// Mock Interview Rounds
export const mockInterviewRounds: InterviewRound[] = [
  {
    id: 'f6a7b8c9-d0e1-2345-0123-456789012345',
    candidateId: 'e5f6a7b8-c9d0-1234-ef01-345678901234',
    interviewerId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    jobRoleId: 'd4e5f6a7-b8c9-0123-def0-234567890123',
    roundNumber: 1,
    roundType: 'screening',
    scheduledAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    durationMinutes: 45,
    status: 'scheduled',
    aiConsentGiven: false,
  },
  {
    id: 'g7b8c9d0-e1f2-3456-1234-567890123456',
    candidateId: 'e5f6a7b8-c9d0-1234-ef01-345678901234',
    interviewerId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    jobRoleId: 'd4e5f6a7-b8c9-0123-def0-234567890123',
    roundNumber: 2,
    roundType: 'hr',
    scheduledAt: new Date(Date.now() + 172800000).toISOString(), // Day after
    durationMinutes: 30,
    status: 'scheduled',
    aiConsentGiven: false,
  },
];

// Mock AI Metrics (for live interview)
export const mockAIMetrics: AIMetrics = {
  speechConfidence: 78,
  engagementScore: 82,
  hesitationsCount: 3,
  avgResponseTime: 1.8,
  headMovement: 'stable',
  videoQuality: 'good',
  authenticity: 'verified',
};

// Mock Fraud Alerts
export const mockFraudAlerts: FraudAlert[] = [];

// Simulated changing metrics for demo
export function getSimulatedMetrics(): AIMetrics {
  return {
    speechConfidence: Math.floor(70 + Math.random() * 20),
    engagementScore: Math.floor(75 + Math.random() * 20),
    hesitationsCount: Math.floor(Math.random() * 5),
    avgResponseTime: 1.5 + Math.random() * 1,
    headMovement: Math.random() > 0.2 ? 'stable' : 'moderate',
    videoQuality: Math.random() > 0.1 ? 'good' : 'fair',
    authenticity: Math.random() > 0.05 ? 'verified' : 'suspicious',
  };
}

// Mock Transcript
export const mockTranscript: TranscriptSegment[] = [
  {
    id: '1',
    speaker: 'interviewer',
    text: 'Tell me about your experience with React and TypeScript.',
    startMs: 0,
    endMs: 4000,
    confidence: 0.95,
  },
  {
    id: '2',
    speaker: 'candidate',
    text: "Sure, I've been working with React for about 5 years now. Started at TCS where I worked on their internal dashboard.",
    startMs: 5000,
    endMs: 12000,
    confidence: 0.92,
  },
  {
    id: '3',
    speaker: 'candidate',
    text: 'Then at Infosys, I led a team of 3 developers building a customer portal. TypeScript has been part of my stack for the last 3 years.',
    startMs: 12500,
    endMs: 20000,
    confidence: 0.88,
  },
];

// Mock Interview Summary (for HR view)
export const mockInterviewSummary: InterviewSummary = {
  roundId: 'f6a7b8c9-d0e1-2345-0123-456789012345',
  speechConfidenceAvg: 76,
  hesitationsCount: 5,
  avgResponseTimeMs: 1800,
  headMovementStability: 82,
  videoQualityAvg: 90,
  authenticityScore: 98,
  fraudFlagsCount: 0,
  tabSwitchesCount: 1,
  candidateSpeakingPct: 65,
  interviewerSpeakingPct: 35,
};
