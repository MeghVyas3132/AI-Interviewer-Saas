import { z } from 'zod';

// =============================================================================
// Interview Round Types
// =============================================================================

export const InterviewRoundTypeEnum = z.enum([
  'TECHNICAL_AI',
  'SCREENING_HUMAN',
  'HR_HUMAN',
  'MANAGERIAL_HUMAN',
  'CULTURAL_FIT_HUMAN',
]);

export const InterviewModeEnum = z.enum([
  'AI_CONDUCTED',
  'HUMAN_AI_ASSISTED',
  'HUMAN_ONLY',
]);

export const RoundStatusEnum = z.enum([
  'SCHEDULED',
  'WAITING_FOR_CANDIDATE',
  'WAITING_FOR_INTERVIEWER',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]);

// =============================================================================
// Insight Types
// =============================================================================

export const InsightTypeEnum = z.enum([
  'SPEECH_CONFIDENCE',
  'HESITATION',
  'RESPONSE_LATENCY',
  'HEAD_MOVEMENT',
  'VIDEO_QUALITY',
  'MULTIPLE_FACES',
  'FACE_SWITCH',
  'TAB_SWITCH',
  'BACKGROUND_VOICE',
  'RESUME_CONTRADICTION',
]);

export const AlertSeverityEnum = z.enum([
  'INFO',
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);

// =============================================================================
// Request Schemas
// =============================================================================

export const CreateInterviewRoundSchema = z.object({
  externalInterviewId: z.string().min(1),
  externalCandidateId: z.string().min(1),
  externalInterviewerId: z.string().optional(),
  externalJobRoleId: z.string().min(1),
  roundNumber: z.number().int().positive().default(1),
  roundType: InterviewRoundTypeEnum,
  interviewMode: InterviewModeEnum,
  scheduledAt: z.string().datetime().optional(),
  scheduledDurationMinutes: z.number().int().positive().default(60),
});

export const UpdateInterviewRoundSchema = z.object({
  status: RoundStatusEnum.optional(),
  scheduledAt: z.string().datetime().optional(),
  videosdkMeetingId: z.string().optional(),
});

export const RecordConsentSchema = z.object({
  roundId: z.string().uuid(),
  consentGiven: z.boolean(),
});

export const SubmitVerdictSchema = z.object({
  decision: z.enum(['ADVANCE', 'REJECT', 'HOLD', 'REASSESS']),
  overallRating: z.number().int().min(1).max(5).optional(),
  criteriaScores: z.record(z.number().int().min(1).max(5)).optional(),
  notes: z.string().optional(),
  aiInsightsHelpful: z.boolean().optional(),
  aiFeedbackNotes: z.string().optional(),
});

// =============================================================================
// Resume Schema
// =============================================================================

export const ResumeExperienceSchema = z.object({
  company: z.string(),
  title: z.string(),
  startDate: z.string(), // "YYYY-MM" format
  endDate: z.string(), // "YYYY-MM" or "present"
  durationMonths: z.number().optional(),
  description: z.string().optional(),
  technologies: z.array(z.string()).optional(),
});

export const ResumeEducationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  field: z.string().optional(),
  graduationYear: z.number(),
  gpa: z.number().optional(),
});

export const ResumeSchema = z.object({
  personalInfo: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
  }),
  summary: z.string().optional(),
  experience: z.array(ResumeExperienceSchema),
  education: z.array(ResumeEducationSchema).optional(),
  skills: z.object({
    programmingLanguages: z.array(z.string()).optional(),
    frameworks: z.array(z.string()).optional(),
    databases: z.array(z.string()).optional(),
    tools: z.array(z.string()).optional(),
  }).optional(),
  certifications: z.array(z.object({
    name: z.string(),
    issuer: z.string().optional(),
    year: z.number().optional(),
  })).optional(),
  projects: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    technologies: z.array(z.string()).optional(),
  })).optional(),
});

export const SaveResumeSchema = z.object({
  externalCandidateId: z.string().min(1),
  resumeJson: ResumeSchema,
});

// =============================================================================
// Type Exports
// =============================================================================

export type InterviewRoundType = z.infer<typeof InterviewRoundTypeEnum>;
export type InterviewMode = z.infer<typeof InterviewModeEnum>;
export type RoundStatus = z.infer<typeof RoundStatusEnum>;
export type InsightType = z.infer<typeof InsightTypeEnum>;
export type AlertSeverity = z.infer<typeof AlertSeverityEnum>;
export type CreateInterviewRoundInput = z.infer<typeof CreateInterviewRoundSchema>;
export type UpdateInterviewRoundInput = z.infer<typeof UpdateInterviewRoundSchema>;
export type SubmitVerdictInput = z.infer<typeof SubmitVerdictSchema>;
export type Resume = z.infer<typeof ResumeSchema>;
export type SaveResumeInput = z.infer<typeof SaveResumeSchema>;
