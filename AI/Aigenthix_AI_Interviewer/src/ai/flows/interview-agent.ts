'use server';

/**
 * @fileOverview A conversational interview agent that provides feedback and generates follow-up questions.
 *
 * - interviewAgent - A function that drives the mock interview conversation.
 * - InterviewAgentInput - The input type for the interviewAgent function.
 * - InterviewAgentOutput - The return type for the interviewAgent function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { getAllInterviewQuestions, getRandomInterviewQuestions, getRandomQuestionsByCategory, getDiverseQuestions } from '@/lib/postgres-questions';
import { getCATQuestionInsights, getSampleCATQuestions } from '@/lib/postgres-questions';
import { getCachedQuestions, generateCacheKey } from '@/ai/question-cache';
import { generateCurrentAffairsQuestion } from './current-affairs-generator';
import { getExamConfigByExamAndSubcategory } from '@/lib/postgres-data-store';
import { withOpenAIApiKeyRotation, initializeOpenAIApiKeyManager } from '@/lib/openai-api-key-manager';
import { getInterviewPromptTemplate, getEvaluationSystemPrompt } from './interview-instructions';

const InterviewHistorySchema = z.object({
    question: z.string(),
    answer: z.string(),
    attempts: z.number().optional().describe('Number of attempts for this question'),
    hintsGiven: z.array(z.string()).optional().describe('Hints provided for this question'),
    isCorrect: z.boolean().optional().describe('Whether the answer was correct'),
    isCurrentAffairs: z.boolean().optional().describe('Whether this was a current affairs question'),
    currentAffairsTopic: z.string().optional().describe('Topic of the current affairs question (if applicable)'),
    currentAffairsCategory: z.string().optional().describe('Category of the current affairs question (if applicable)'),
});
type InterviewHistory = z.infer<typeof InterviewHistorySchema>;

const InterviewAgentInputSchema = z.object({
  jobRole: z.string().describe('The job role the user is interviewing for.'),
  company: z.string().describe('The company the user is interviewing for.'),
  candidateName: z.string().optional().describe('The candidate name for personalized greetings.'),
  college: z.string().optional().describe('The target college for which the user is preparing (for CAT aspirants).'),
  resumeText: z.string().describe("The user's resume text."),
  language: z.string().describe('The language for the interview and feedback.'),
  conversationHistory: z.array(InterviewHistorySchema).describe('The history of questions and answers so far.'),
  currentTranscript: z.string().describe("The user's latest answer to the most recent question."),
  currentQuestion: z.string().optional().describe('The most recent interview question that the candidate answered.'),
  eventType: z.enum(['start', 'answer', 'silence_prompt', 'low_confidence', 'system']).optional().describe('The type of interview event driving this response.'),
  referenceQuestions: z.array(z.string()).optional().describe('Optional list of AI-generated job questions to use as a reference pool.'),
  videoFrameDataUri: z.string().optional().describe(
    "A single video frame captured when the user finishes their answer, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'. Use this to analyze visual presentation."
  ),
  // New fields for advanced flow control
  realQuestionCount: z.number().optional().describe('The number of real interview/aptitude/HR/subject questions asked so far (not greetings or area selection).'),
  recentScores: z.array(z.number()).optional().describe('The scores (1-10) for the last few real questions, for performance tracking.'),
  isCurrentQuestionReal: z.boolean().optional().describe('Whether the current question is a real interview question (not a greeting or area selection).'),
  currentQuestionAttempts: z.number().optional().describe('Number of attempts for the current question'),
  currentQuestionHints: z.array(z.string()).optional().describe('Hints already given for the current question'),
  minQuestionsRequired: z.number().optional().describe('The minimum number of questions required for this exam type before the interview can be completed.'),
  // Exam and subcategory filtering
  examId: z.number().optional().describe('The exam ID for filtering questions.'),
  subcategoryId: z.number().optional().describe('The subcategory ID for filtering questions.'),
  hasResumeData: z.boolean().optional().describe('Whether resume data is available. If false, do not ask resume-based questions.'),
  isEmailInterview: z.boolean().optional().describe('Whether this is an email-based interview. If true, skip area selection and start with "Tell me about yourself" like a live HR interview.'),
});
export type InterviewAgentInput = z.infer<typeof InterviewAgentInputSchema>;

const InterviewAgentOutputSchema = z.object({
  contentFeedback: z.string().describe('Feedback on the content of the response, including how it aligns with the resume.'),
  toneFeedback: z.string().describe('Feedback on the tone of the response.'),
  clarityFeedback: z.string().describe('Feedback on the clarity of the response.'),
  visualFeedback: z.string().describe('Feedback on the visual presentation, like body language and confidence, based on the video frame.'),
  
  // Presentation scoring (1-5 scale)
  physicalAppearanceScore: z.number().describe('Score for Physical Appearance - dressing, hairstyle, grooming (1-5)'),
  physicalAppearanceJustification: z.string().describe('One-line justification for Physical Appearance score'),
  bodyLanguageScore: z.number().describe('Score for Body Language - posture, gestures, attention (1-5)'),
  bodyLanguageJustification: z.string().describe('One-line justification for Body Language score'),
  confidenceScore: z.number().describe('Score for Confidence - tone, delivery, assurance (1-5)'),
  confidenceJustification: z.string().describe('One-line justification for Confidence score'),
  
  // Response scoring (1-10 scale) - keeping existing fields for backward compatibility
  ideasScore: z.number().describe('Score for Ideas (1-10)'),
  ideasJustification: z.string().describe('One-line justification for Ideas score'),
  organizationScore: z.number().describe('Score for Organization (1-10)'),
  organizationJustification: z.string().describe('One-line justification for Organization score'),
  accuracyScore: z.number().describe('Score for Accuracy (1-10)'),
  accuracyJustification: z.string().describe('One-line justification for Accuracy score'),
  voiceScore: z.number().describe('Score for Voice (1-10)'),
  voiceJustification: z.string().describe('One-line justification for Voice score'),
  grammarScore: z.number().describe('Score for Grammar Usage and Sentence Fluency (1-10)'),
  grammarJustification: z.string().describe('One-line justification for Grammar score'),
  stopWordsScore: z.number().describe('Score for Stop words (1-10)'),
  stopWordsJustification: z.string().describe('One-line justification for Stop words score'),
  
  // Question categorization
  questionCategory: z.enum(['general-knowledge', 'academics', 'work-experience', 'about-self']).describe('Category of the current question'),
  
  overallScore: z.number().describe('Overall score for this answer (1-10)'),
  nextQuestion: z.string().describe('The next interview question to ask. If the interview is over, this should be a concluding remark or disqualification message.'),
  isInterviewOver: z.boolean().describe('Set to true if this is the final remark and the interview should conclude.'),
  nextQuestionKind: z.enum(['intro', 'resume', 'core', 'followup', 'wrapup', 'closing', 'candidate', 'other']).optional()
    .describe('Classification for the next question being asked.'),
  isDisqualified: z.boolean().optional().describe('Set to true if the candidate exited or stopped the interview before answering at least 5 real questions.'),
  // New fields for enhanced guidance
  isCorrectAnswer: z.boolean().describe('Whether the current answer is correct'),
  hint: z.string().optional().describe('A hint to help the candidate if they answered incorrectly'),
  shouldRetryQuestion: z.boolean().describe('Whether to retry the same question with a hint'),
  explanation: z.string().optional().describe('Explanation of the correct answer when moving to next question'),
  // Current affairs tracking
  isNextQuestionCurrentAffairs: z.boolean().optional().describe('Whether the next question is a current affairs question'),
  nextQuestionCurrentAffairsTopic: z.string().optional().describe('Topic of the next question if it is a current affairs question'),
  nextQuestionCurrentAffairsCategory: z.string().optional().describe('Category of the next question if it is a current affairs question'),
  // Reference question tracking
  referenceQuestionIds: z.array(z.number()).optional().describe('IDs of questions from the database used as reference for generating this question'),
  
  // HR Interview Scoring (only used when jobRole is 'interview' and company is 'HR')
  languageFlowScore: z.number().optional().describe('Score for Language Flow (1-10) - only for HR interviews'),
  languageFlowJustification: z.string().optional().describe('Justification for Language Flow score'),
  languageLevelScore: z.number().optional().describe('Score for Language Level (1-10) - only for HR interviews'),
  languageLevelJustification: z.string().optional().describe('Justification for Language Level score'),
  confidenceScoreHR: z.number().optional().describe('Score for Confidence (1-10) - only for HR interviews'),
  confidenceJustificationHR: z.string().optional().describe('Justification for Confidence score - HR interviews'),
  communicationClarityScore: z.number().optional().describe('Score for Communication Clarity (1-10) - only for HR interviews'),
  communicationClarityJustification: z.string().optional().describe('Justification for Communication Clarity score'),
  grammarScoreHR: z.number().optional().describe('Score for Grammar (1-10) - only for HR interviews'),
  grammarJustificationHR: z.string().optional().describe('Justification for Grammar score - HR interviews'),
  pronunciationScore: z.number().optional().describe('Score for Pronunciation (1-10) - only for HR interviews'),
  pronunciationJustification: z.string().optional().describe('Justification for Pronunciation score'),
  fluencyScoreHR: z.number().optional().describe('Score for Fluency (1-10) - only for HR interviews'),
  fluencyJustificationHR: z.string().optional().describe('Justification for Fluency score - HR interviews'),
  vocabularyScore: z.number().optional().describe('Score for Vocabulary (1-10) - only for HR interviews'),
  vocabularyJustification: z.string().optional().describe('Justification for Vocabulary score'),
  toneScoreHR: z.number().optional().describe('Score for Tone (1-10) - only for HR interviews'),
  toneJustificationHR: z.string().optional().describe('Justification for Tone score - HR interviews'),
  impactOfNativeLanguageScore: z.number().optional().describe('Score for Impact of Native Language (1-10) - only for HR interviews'),
  impactOfNativeLanguageJustification: z.string().optional().describe('Justification for Impact of Native Language score'),
  gesturesScore: z.number().optional().describe('Score for Gestures (1-10) - only for HR interviews'),
  gesturesJustification: z.string().optional().describe('Justification for Gestures score'),
  resumeScore: z.number().optional().describe('Score for Resume alignment (1-10) - only for HR interviews'),
  resumeJustification: z.string().optional().describe('Justification for Resume score'),
  dressingScore: z.number().optional().describe('Score for Dressing (1-10) - only for HR interviews'),
  dressingJustification: z.string().optional().describe('Justification for Dressing score'),
  bodyLanguageScoreHR: z.number().optional().describe('Score for Body Language (1-10) - only for HR interviews'),
  bodyLanguageJustificationHR: z.string().optional().describe('Justification for Body Language score - HR interviews'),
  flowOfThoughtsScore: z.number().optional().describe('Score for Flow of Thoughts (1-10) - only for HR interviews'),
  flowOfThoughtsJustification: z.string().optional().describe('Justification for Flow of Thoughts score'),
  isHRInterview: z.boolean().optional().describe('Whether this is an HR interview (jobRole is interview and company is HR)'),
});
export type InterviewAgentOutput = z.infer<typeof InterviewAgentOutputSchema>;

import { withApiKeyRotation } from '@/lib/api-key-manager';
import { googleAI } from '@genkit-ai/googleai';
import { genkit } from 'genkit';

const NEXT_QUESTION_SIMILARITY_THRESHOLD = 0.84;

const extractQuestionStem = (value: string): string => {
  const cleaned = (value || '').trim();
  if (!cleaned) return '';
  if (cleaned.includes('?')) {
    const parts = cleaned.split('?');
    const lastSegment = parts.length >= 2 ? parts[parts.length - 2] : cleaned;
    return lastSegment.trim();
  }
  const leadingPatterns = [
    /^thanks[,!\s-]+/i,
    /^thank you[,!\s-]+/i,
    /^got it[,!\s-]+/i,
    /^understood[,!\s-]+/i,
    /^great[,!\s-]+/i,
    /^appreciate (that|it)[,!\s-]+/i,
    /^let['’]s continue[,!\s-]+/i,
    /^moving on[,!\s-]+/i,
    /^next question[,!\s-]+/i,
  ];
  let result = cleaned;
  for (const pattern of leadingPatterns) {
    if (pattern.test(result)) {
      result = result.replace(pattern, '').trim();
    }
  }
  return result || cleaned;
};

const normalizeQuestionForMatch = (value: string): string => {
  const stem = extractQuestionStem(value || '');
  return (stem || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const questionSimilarity = (a: string, b: string): number => {
  const aTokens = new Set(normalizeQuestionForMatch(a).split(' ').filter(Boolean));
  const bTokens = new Set(normalizeQuestionForMatch(b).split(' ').filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : overlap / union;
};

const PROFANITY_TERMS = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'dick',
  'cunt',
  'motherfucker',
  'bastard',
  'slut',
  'whore',
  'fucker',
  'fucking',
  'bullshit',
];

const profanityRegex = new RegExp(`\\b(${PROFANITY_TERMS.join('|')})\\b`, 'i');
const profanityGlobalRegex = new RegExp(`\\b(${PROFANITY_TERMS.join('|')})\\b`, 'gi');

const containsProfanity = (text: string): boolean => {
  if (!text) return false;
  return profanityRegex.test(text);
};

const redactProfanity = (text: string): string => {
  if (!text) return text;
  return text.replace(profanityGlobalRegex, match => '*'.repeat(match.length));
};

const sanitizeInterviewInput = (input: InterviewAgentInput): InterviewAgentInput => {
  return {
    ...input,
    currentTranscript: redactProfanity(input.currentTranscript || ''),
    conversationHistory: (input.conversationHistory || []).map(entry => ({
      ...entry,
      answer: redactProfanity(entry.answer || ''),
    })),
  };
};

const scrubResumeLeakage = (text: string, resumeText: string): string => {
  const output = (text || '').trim();
  const resume = (resumeText || '').trim();
  if (!output || !resume) return output;

  const resumeLines = resume
    .split(/\\r?\\n/)
    .map(line => line.trim())
    .filter(line => line.length >= 24);

  let sanitized = output;
  for (const line of resumeLines) {
    const pattern = new RegExp(line.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'gi');
    sanitized = sanitized.replace(pattern, '');
  }

  return sanitized.replace(/\\s{2,}/g, ' ').trim();
};

const getFallbackQuestionPool = (): string[] => {
  return [
    'Walk me through a system you built end-to-end, including architecture and trade-offs.',
    'Describe a production incident you handled and how you diagnosed and fixed it.',
    'How do you design CI/CD for a service that requires zero-downtime deployments?',
    'Explain how you monitor and scale a backend service under load.',
    'Tell me about a time you improved reliability or latency. What metrics moved?',
    'How do you secure secrets and manage configuration across environments?',
    'Describe your approach to infrastructure as code and state management.',
    'How do you design logging, metrics, and alerting for a production system?',
    'Walk me through a performance bottleneck you identified and how you resolved it.',
  ];
};

const violatesQuestionGuardrails = (
  question: string,
  options?: { allowSoftSkills?: boolean }
): boolean => {
  const cleaned = (question || '').trim();
  if (!cleaned) return false;
  const allowSoftSkills = options?.allowSoftSkills ?? false;
  return (
    (!allowSoftSkills && containsSoftSkill(cleaned)) ||
    containsCredential(cleaned) ||
    containsLocation(cleaned) ||
    containsSensitiveInfo(cleaned)
  );
};

const sanitizeJobInterviewQuestion = (
  question: string,
  plan: NextQuestionPlan,
  input: InterviewAgentInput
): string => {
  const cleaned = stripLeadingAcknowledgement(question || '').trim();
  if (!cleaned) return question;
  if (hasBannedFollowupPhrasing(cleaned)) {
    return buildFallbackQuestionFromPlan(plan, input);
  }
  const allowCompanyMention = plan.kind === 'intro' || plan.kind === 'closing';
  if (input.company && !allowCompanyMention) {
    const companyPattern = new RegExp(`\\b${escapeRegex(input.company)}\\b`, 'ig');
    if (companyPattern.test(cleaned)) {
      return buildFallbackQuestionFromPlan(plan, input);
    }
  }
  const allowSoftSkills = plan.kind === 'core';
  if (violatesQuestionGuardrails(cleaned, { allowSoftSkills })) {
    return buildFallbackQuestionFromPlan(plan, input);
  }
  return cleaned;
};

const enforceUniqueNextQuestion = (
  proposedQuestion: string,
  input: InterviewAgentInput,
  isInterviewOver: boolean,
  fallbackPool?: string[]
): string => {
  if (isInterviewOver) return proposedQuestion;
  const candidate = (proposedQuestion || '').trim();
  if (!candidate) return proposedQuestion;

  const previousQuestions = input.conversationHistory.map(entry => (entry.question || '').trim()).filter(Boolean);
  const isDuplicate = previousQuestions.some(previous => {
    const prevKey = normalizeQuestionForMatch(previous);
    const candidateKey = normalizeQuestionForMatch(candidate);
    return (
      prevKey === candidateKey ||
      questionSimilarity(previous, candidate) >= NEXT_QUESTION_SIMILARITY_THRESHOLD
    );
  });

  if (!isDuplicate) {
    return candidate;
  }
  const pool = (fallbackPool && fallbackPool.length > 0)
    ? fallbackPool
    : getFallbackQuestionPool();
  for (const fallback of pool) {
    const cleanedFallback = (fallback || '').trim();
    if (!cleanedFallback) continue;
    const isFallbackDuplicate = previousQuestions.some(previous => {
      const prevKey = normalizeQuestionForMatch(previous);
      const fallbackKey = normalizeQuestionForMatch(cleanedFallback);
      return (
        prevKey === fallbackKey ||
        questionSimilarity(previous, cleanedFallback) >= NEXT_QUESTION_SIMILARITY_THRESHOLD
      );
    });
    if (!isFallbackDuplicate) {
      return cleanedFallback;
    }
  }

  return candidate;
};

const FOLLOWUP_BUDGET_MAX = 2;
const MAIN_QUESTION_TARGET = 10;
const RESUME_QUESTION_TARGET = 3;
const JOB_MAIN_QUESTION_TARGET = 9; // 1 intro + 3 resume + 5 HR = 9 main, then closing = 10 total
const RESUME_SEQUENCE_ORDER: ResumeAnchorType[] = ['experience', 'project', 'experience'];

type ResumeAnchorType = 'experience' | 'project' | 'skill' | 'claim';
type QuestionKind = 'intro' | 'resume' | 'core' | 'followup' | 'closing' | 'candidate' | 'wrapup' | 'other';
type FollowupIntent = 'specificity' | 'ownership' | 'depth' | 'impact';

interface NextQuestionPlan {
  kind: QuestionKind;
  isInterviewOver: boolean;
  questionCategory: 'general-knowledge' | 'academics' | 'work-experience' | 'about-self';
  followupIntent?: FollowupIntent;
  resumeAnchor?: ResumeAnchor;
  corePool: string[];
  mainQuestionsAsked: number;
  mainQuestionsTarget: number;
  resumeTarget: number;
  coreTarget: number;
  followupBudgetRemaining: number;
  reason: string;
}

interface ResumeAnchor {
  type: ResumeAnchorType;
  title: string;
  evidenceLine: string;
  company?: string;
  role?: string;
}

const SOFT_SKILL_PATTERNS: RegExp[] = [
  /\bteamwork\b/i,
  /\btime management\b/i,
  /\bcreative thinking\b/i,
  /\bcommunication\b/i,
  /\bleadership\b/i,
  /\bproblem solving\b/i,
  /\badaptability\b/i,
  /\bcollaboration\b/i,
  /\binterpersonal\b/i,
  /\bcritical thinking\b/i,
  /\bdecision making\b/i,
  /\bself[-\s]?motivated\b/i,
  /\bquick learner\b/i,
  /\bhard[-\s]?working\b/i,
  /\bdetail[-\s]?oriented\b/i,
  /\bflexible\b/i,
  /\bwork ethic\b/i,
];

const CREDENTIAL_PATTERNS: RegExp[] = [
  /\bb\.?tech\b/i,
  /\bm\.?tech\b/i,
  /\bmba\b/i,
  /\bph\.?d\b/i,
  /\bbachelor'?s\b/i,
  /\bmaster'?s\b/i,
  /\bdegree\b/i,
  /\bgraduate\b/i,
  /\bgraduation\b/i,
  /\beducation\b/i,
  /\bcollege\b/i,
  /\buniversity\b/i,
  /\bcertification\b/i,
  /\bcertifications\b/i,
  /\bcertified\b/i,
  /\bcredential\b/i,
  /\bgpa\b/i,
  /\bgrade point\b/i,
];

const SENSITIVE_INFO_PATTERNS: RegExp[] = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\+?\d[\d\s\-]{7,}\d/,
];

const LOCATION_PATTERNS: RegExp[] = [
  /\bremote\b/i,
  /\bhybrid\b/i,
  /\bon[-\s]?site\b/i,
  /\brelocat(e|ion)\b/i,
  /\blocation\b/i,
  /\bbased in\b/i,
  /\bunited states\b/i,
  /\busa\b/i,
  /\buk\b/i,
  /\bunited kingdom\b/i,
  /\bcanada\b/i,
  /\baustralia\b/i,
  /\bgermany\b/i,
  /\bsingapore\b/i,
  /\bindia\b/i,
  /\bbangalore\b/i,
  /\bbengaluru\b/i,
  /\bmumbai\b/i,
  /\bdelhi\b/i,
  /\bhyderabad\b/i,
  /\bchennai\b/i,
  /\bpune\b/i,
  /\bkolkata\b/i,
  /\bnoida\b/i,
  /\bgurgaon\b/i,
  /\bgurugram\b/i,
  /\bahmedabad\b/i,
  /\bgujarat\b/i,
  /\bnew york\b/i,
  /\bsan francisco\b/i,
  /\blondon\b/i,
];

const isSoftSkill = (value: string): boolean => {
  const cleaned = (value || '').trim();
  if (!cleaned) return true;
  return SOFT_SKILL_PATTERNS.some(pattern => pattern.test(cleaned));
};

const containsSoftSkill = (value: string): boolean => {
  const cleaned = (value || '').trim();
  if (!cleaned) return false;
  return SOFT_SKILL_PATTERNS.some(pattern => pattern.test(cleaned));
};

const containsCredential = (value: string): boolean => {
  const cleaned = (value || '').trim();
  if (!cleaned) return false;
  return CREDENTIAL_PATTERNS.some(pattern => pattern.test(cleaned));
};

const containsSensitiveInfo = (value: string): boolean => {
  const cleaned = (value || '').trim();
  if (!cleaned) return false;
  return SENSITIVE_INFO_PATTERNS.some(pattern => pattern.test(cleaned));
};

const isLocationLike = (value: string): boolean => {
  const cleaned = (value || '').trim();
  if (!cleaned) return true;
  return LOCATION_PATTERNS.some(pattern => pattern.test(cleaned));
};

const containsLocation = (value: string): boolean => {
  const cleaned = (value || '').trim();
  if (!cleaned) return false;
  return LOCATION_PATTERNS.some(pattern => pattern.test(cleaned));
};

const escapeRegex = (text: string): string => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const stripLocationSuffix = (value: string): string => {
  if (!value) return value;
  const parts = value.split(',');
  if (parts.length < 2) return value;
  const tail = parts.slice(1).join(',').trim();
  if (tail && isLocationLike(tail)) {
    return parts[0].trim();
  }
  return value;
};

const stripCompanyAndLocation = (value: string, company?: string): string => {
  let cleaned = sanitizeAnchorLabel(value || '');
  if (!cleaned) return '';
  if (company) {
    const pattern = new RegExp(`\\b${escapeRegex(company)}\\b`, 'ig');
    cleaned = cleaned.replace(pattern, ' ').trim();
  }
  cleaned = cleaned.replace(/\s+(at|@)\s+[^,]+/i, '').trim();
  cleaned = stripLocationSuffix(cleaned);
  LOCATION_PATTERNS.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '').trim();
  });
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  return cleaned;
};

const sanitizeResumeAnchorTitle = (value: string, company?: string): string => {
  const cleaned = stripCompanyAndLocation(value || '', company);
  if (!cleaned) return '';
  return cleaned;
};

const isDisallowedResumeAnchor = (value: string): boolean => {
  const cleaned = (value || '').trim();
  if (!cleaned) return true;
  return isSoftSkill(cleaned) || isLocationLike(cleaned) || containsCredential(cleaned);
};

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const pickVariant = (variants: string[], seed: number): string => {
  if (!variants.length) return '';
  return variants[seed % variants.length];
};

const pickRandomVariant = (variants: string[], seed?: number): string => {
  if (!variants.length) return '';
  if (typeof seed === 'number') {
    return variants[Math.abs(seed) % variants.length];
  }
  return variants[Math.floor(Math.random() * variants.length)];
};

const buildResumeQuestion = (anchor?: ResumeAnchor): string => {
  if (!anchor?.title) {
    return 'From your resume, tell me about a recent technical project you built and the key decisions you made.';
  }

  const rawTitle = sanitizeResumeAnchorTitle(anchor.title, anchor.company);
  const title = rawTitle || anchor.title;
  const seed = hashString(`${anchor.type}:${title}`);

  const experienceSubject = title || 'your most recent role';
  const projectSubject = title || 'one recent project you built';
  const skillSubject = title || 'one core skill you use in production';

  const experienceVariants = [
    `From your resume, in your role as ${experienceSubject}, what systems did you own and what technical decisions did you make?`,
    `From your resume, walk me through one system you delivered end-to-end in ${experienceSubject}, including constraints and trade-offs.`,
    `From your resume, what was the toughest technical problem you solved in ${experienceSubject}, and how did you approach it?`,
  ];

  const projectVariants = [
    `From your resume, on ${projectSubject}, what was your role and what architectural decisions did you make?`,
    `From your resume, describe the system design for ${projectSubject} and why you chose that approach.`,
    `From your resume, what performance or reliability goals did you target in ${projectSubject}, and how did you measure success?`,
  ];

  const skillVariants = [
    `From your resume, you list ${skillSubject}. Describe a production use-case where you applied it and the outcome.`,
    `From your resume, how have you used ${skillSubject} in a real system? Walk me through the setup and trade-offs.`,
    `From your resume, tell me about a project where ${skillSubject} was central—what did you build and how did it impact results?`,
  ];

  if (anchor.type === 'experience') {
    return pickVariant(experienceVariants, seed);
  }
  if (anchor.type === 'project') {
    return pickVariant(projectVariants, seed);
  }
  if (anchor.type === 'skill') {
    return pickVariant(skillVariants, seed);
  }
  if (anchor.type === 'claim') {
    return `From your resume, you mentioned ${title}. What was the technical context and your contribution?`;
  }
  return `From your resume, you mentioned ${title}. How have you applied it in a real project?`;
};

const buildFollowupQuestion = (intent: FollowupIntent | null, seed: number): string => {
  const specificity = [
    'Which components or tools did you personally handle, and what were the exact steps you took?',
    'Can you walk me through the specific steps you executed, from start to finish?',
    'What exact changes did you make, and where in the system did they apply?',
  ];
  const ownership = [
    'What part did you personally implement, and why did you take that approach?',
    'Which pieces were you directly responsible for, and how did you validate them?',
    'What did you own end-to-end versus collaborate on, and why?',
  ];
  const depth = [
    'What trade-offs did you consider, and why did you choose this design?',
    'What alternatives did you evaluate, and why did you reject them?',
    'How did you design for reliability, scalability, or latency in that work?',
  ];
  const impact = [
    'What metric moved as a result, and by how much?',
    'What was the measurable outcome—latency, cost, or reliability—and what changed?',
    'How did you quantify the impact of that work?',
  ];

  const variants =
    intent === 'ownership'
      ? ownership
      : intent === 'depth'
        ? depth
        : intent === 'impact'
          ? impact
          : specificity;

  return pickVariant(variants, seed);
};

const buildClosingFitQuestion = (input: InterviewAgentInput): string => {
  const role = (input.jobRole || '').trim() || 'this role';
  const company = (input.company || '').trim();
  const rolePhrase = role.toLowerCase().includes('role') ? role : `the ${role} role`;
  const companyPhrase = company ? ` at ${company}` : '';
  const base = role ? `${rolePhrase}${companyPhrase}` : `this role${companyPhrase}`;

  const variants = [
    `Why do you feel you are the right fit for ${base}?`,
    `What makes you a strong match for ${base}?`,
    `Why should we choose you for ${base}?`,
    `What’s your strongest evidence that you’re a great fit for ${base}?`,
    `How do your most relevant strengths align with ${base}?`,
    `What differentiates you as a candidate for ${base}?`,
  ];

  return pickRandomVariant(variants);
};

const isQuestionLike = (text: string): boolean => {
  const cleaned = (text || '').trim();
  if (!cleaned) return false;
  if (cleaned.includes('?')) return true;
  return /^(tell me|describe|explain|walk me through|how|what|why|when|where|which|can you|could you|do you|did you|would you|have you|give me|share|in your|i noticed|you mentioned|talk about)\b/i.test(cleaned);
};

interface ResumeProfile {
  skills: string[];
  experiences: { role?: string; company?: string; line: string }[];
  projects: { name?: string; line: string }[];
  claims: string[];
  riskFlags: string[];
}

const normalizeForCompare = (value: string): string =>
  (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const sanitizeAnchorLabel = (value: string): string => {
  return (value || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const extractResumeProfile = (resumeText: string): ResumeProfile => {
  const profile: ResumeProfile = {
    skills: [],
    experiences: [],
    projects: [],
    claims: [],
    riskFlags: [],
  };

  const lines = (resumeText || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  let currentSection: 'skills' | 'experience' | 'projects' | 'education' | 'certifications' | null = null;
  const sectionLines: Record<string, string[]> = {
    skills: [],
    experience: [],
    projects: [],
    education: [],
    certifications: [],
  };

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (/^(work experience|experience|employment|professional experience)\b/.test(lower)) {
      currentSection = 'experience';
      const parts = line.split(':');
      if (parts.length > 1 && parts[1].trim()) {
        sectionLines.experience.push(parts.slice(1).join(':').trim());
      }
      continue;
    }
    if (/^projects?\b/.test(lower)) {
      currentSection = 'projects';
      const parts = line.split(':');
      if (parts.length > 1 && parts[1].trim()) {
        sectionLines.projects.push(parts.slice(1).join(':').trim());
      }
      continue;
    }
    if (/^skills?\b/.test(lower)) {
      currentSection = 'skills';
      const parts = line.split(':');
      if (parts.length > 1 && parts[1].trim()) {
        sectionLines.skills.push(parts.slice(1).join(':').trim());
      }
      continue;
    }
    if (/^education\b/.test(lower)) {
      currentSection = 'education';
      continue;
    }
    if (/^certifications?\b/.test(lower)) {
      currentSection = 'certifications';
      const parts = line.split(':');
      if (parts.length > 1 && parts[1].trim()) {
        sectionLines.certifications.push(parts.slice(1).join(':').trim());
      }
      continue;
    }

    if (currentSection) {
      sectionLines[currentSection].push(line);
    }
  }

  const skillCandidates = sectionLines.skills.length > 0 ? sectionLines.skills : lines.filter(line => line.toLowerCase().includes('skill'));
  for (const line of skillCandidates) {
    const parts = line.split(/[,;/•|]/).map(part => part.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.length > 1 && !profile.skills.includes(part)) {
        profile.skills.push(part);
      }
    }
  }

  for (const line of sectionLines.experience) {
    const match = line.match(/(.+?)\s+(at|@)\s+(.+?)(\(|-|,|$)/i);
    if (match) {
      profile.experiences.push({ role: match[1].trim(), company: match[3].trim(), line });
    } else {
      profile.experiences.push({ line });
    }
  }

  for (const line of sectionLines.projects) {
    const match = line.match(/^(.*?)(?:\s+-|:)\s+/);
    if (match) {
      profile.projects.push({ name: match[1].trim(), line });
    } else {
      profile.projects.push({ line });
    }
  }

  const claimRegex = /(improved|reduced|increased|saved|scaled|led|managed|delivered|optimized|boosted|cut|decreased)\b/i;
  for (const line of lines) {
    if ((/\d/.test(line) && claimRegex.test(line)) || /%\b/.test(line)) {
      profile.claims.push(line);
    }
  }

  const presentCount = lines.filter(line => line.toLowerCase().includes('present')).length;
  if (presentCount > 1) {
    profile.riskFlags.push('multiple_current_roles');
  }

  return profile;
};

const buildResumeAnchors = (profile: ResumeProfile, resumeText: string): ResumeAnchor[] => {
  const anchors: ResumeAnchor[] = [];
  const lines = (resumeText || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);

  const findEvidence = (term: string): string => {
    const lowerTerm = term.toLowerCase();
    const hit = lines.find(line => line.toLowerCase().includes(lowerTerm));
    return hit || term;
  };

  profile.experiences.slice(0, 4).forEach(exp => {
    const baseTitle = exp.role ? exp.role : exp.line;
    const title = sanitizeResumeAnchorTitle(baseTitle, exp.company);
    if (!title || isDisallowedResumeAnchor(title)) {
      return;
    }
    const evidenceLine = sanitizeAnchorLabel(exp.line);
    anchors.push({
      type: 'experience',
      title,
      evidenceLine,
      company: exp.company,
      role: exp.role,
    });
  });

  profile.projects.slice(0, 4).forEach(project => {
    const baseTitle = sanitizeAnchorLabel(project.name ? project.name : project.line);
    const title = stripCompanyAndLocation(baseTitle);
    if (!title || isDisallowedResumeAnchor(title)) {
      return;
    }
    anchors.push({
      type: 'project',
      title,
      evidenceLine: sanitizeAnchorLabel(project.line),
    });
  });

  profile.skills.slice(0, 8).forEach(skill => {
    const title = sanitizeAnchorLabel(skill);
    if (title && !isDisallowedResumeAnchor(title)) {
      anchors.push({
        type: 'skill',
        title,
        evidenceLine: sanitizeAnchorLabel(findEvidence(skill)),
      });
    }
  });

  profile.claims.slice(0, 4).forEach(claim => {
    const title = sanitizeAnchorLabel(claim);
    if (!title || isDisallowedResumeAnchor(title)) return;
    anchors.push({
      type: 'claim',
      title,
      evidenceLine: title,
    });
  });

  return anchors;
};

const selectResumeAnchors = (anchors: ResumeAnchor[]): ResumeAnchor[] => {
  const experience = anchors.filter(anchor => anchor.type === 'experience');
  const projects = anchors.filter(anchor => anchor.type === 'project');
  const skills = anchors.filter(anchor => anchor.type === 'skill');
  const claims: ResumeAnchor[] = [];

  const selected = [
    ...experience.slice(0, 2),
    ...projects.slice(0, 2),
    ...skills.slice(0, 1),
    ...claims,
  ];

  const unique: ResumeAnchor[] = [];
  const seen = new Set<string>();
  for (const anchor of selected) {
    const cleanedTitle = sanitizeAnchorLabel(anchor.title);
    if (!cleanedTitle || cleanedTitle.length < 3) {
      continue;
    }
    anchor.title = cleanedTitle;
    anchor.evidenceLine = sanitizeAnchorLabel(anchor.evidenceLine);
    const key = normalizeForCompare(anchor.title);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(anchor);
    }
  }
  return unique;
};

const buildResumeSummary = (resumeText: string): string => {
  const cleanedResume = (resumeText || '').trim();
  if (!cleanedResume) return '';
  const profile = extractResumeProfile(cleanedResume);
  const anchors = selectResumeAnchors(buildResumeAnchors(profile, cleanedResume));
  if (anchors.length === 0) return '';
  return anchors
    .map(anchor => {
      const label = sanitizeResumeAnchorTitle(anchor.title, anchor.company);
      if (!label) return '';
      return label;
    })
    .filter(Boolean)
    .join(' | ');
};

const isIntroQuestion = (question: string): boolean => {
  const q = (question || '').toLowerCase();
  return (
    /tell me about yourself/.test(q) ||
    /walk me through your background/.test(q) ||
    /introduce yourself/.test(q) ||
    /could you tell me about yourself/.test(q) ||
    /tell us about yourself/.test(q) ||
    /knowing you first/.test(q) ||
    /let's begin with knowing you/.test(q) ||
    /let us begin with knowing you/.test(q) ||
    /start by knowing you/.test(q) ||
    /are you ready to begin/.test(q) ||
    /ready to begin/.test(q) ||
    /shall we get started/.test(q) ||
    /ready to start/.test(q) ||
    /welcome to/.test(q) ||
    // Any greeting that asks about experience/background for this role
    (/^(hello|hi|welcome)\b/.test(q) && /experience relevant|about yourself|your background/.test(q))
  );
};

const isClosingQuestion = (question: string): boolean =>
  /why (do|are) you (fit|a good fit|a strong fit)|why should we choose you|why are you a good fit|why do you think you'?re a strong fit|fit for this role|strong fit/i.test(
    question || ''
  );

const isCandidateQuestion = (question: string): boolean =>
  /do you have any questions for us|any questions for us|questions for me|questions for the team/i.test(question || '');

const isWrapupQuestion = (question: string): boolean =>
  /(that concludes the interview|thanks for your time|interview is complete|this concludes|we are done here)/i.test(question || '');

const isFollowupCue = (question: string): boolean =>
  /(tell me more|elaborate|expand|go deeper|walk me through|what specifically|could you clarify|can you clarify|can you expand|can you share a concrete example|what part did you personally|what was your contribution|why did you choose)/i.test(question || '');

const isFitQuestion = (question: string): boolean =>
  /(fit for this role|right fit|strong (fit|match)|why (do|are) you (fit|a good fit|a strong fit)|why should we choose you|what makes you a strong|what differentiates you|how do your strengths align)/i.test(
    question || ''
  );

const isResumeCue = (question: string, resumeAnchors: ResumeAnchor[]): boolean => {
  if (!question) return false;
  const normalizedQuestion = normalizeForCompare(question);
  if (normalizedQuestion.includes('resume') || normalizedQuestion.includes('you mentioned')) return true;
  const anchorTerms = resumeAnchors.map(anchor => normalizeForCompare(anchor.title)).filter(Boolean);
  return anchorTerms.some(term => term && normalizedQuestion.includes(term));
};

const isFollowupQuestion = (question: string, previousQuestion?: string): boolean => {
  if (isFollowupCue(question)) return true;
  if (!previousQuestion) return false;
  return questionSimilarity(question, previousQuestion) >= 0.6;
};

const isLikelyInterviewQuestion = (text: string): boolean => {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return false;
  // Always count intro/closing/wrapup questions regardless of structure
  // Intro questions often start with "Hello, welcome..." which wouldn't otherwise match
  if (isIntroQuestion(cleaned) || isClosingQuestion(cleaned) || isCandidateQuestion(cleaned) || isWrapupQuestion(cleaned)) {
    return true;
  }
  // Also catch any greeting/welcome that embeds a question (e.g. "Hello, welcome... tell me about yourself")
  if (/^(hello|hi|welcome|good morning|good afternoon|good evening)\b/i.test(cleaned) && isIntroQuestion(cleaned)) {
    return true;
  }
  if (cleaned.includes('?')) return true;

  const feedbackOnlyPatterns = [
    /^let['’]s continue\b/i,
    /^moving on\b/i,
    /^let['’]s go\b/i,
    /^got it\b/i,
    /^understood\b/i,
    /^helpful context\b/i,
    /^thanks for your time\b/i,
    /^interview complete\b/i,
  ];
  const matchedFeedback = feedbackOnlyPatterns.find(pattern => pattern.test(cleaned));
  if (matchedFeedback) {
    const remainder = cleaned.replace(matchedFeedback, '').trim();
    if (!remainder) return false;
    if (remainder.includes('?')) return true;
    return /^(tell me|describe|explain|walk me through|how would you|how do you|what|why|when|where|which|can you|could you|do you|did you|would you|have you|give me|share|in your|i noticed|you mentioned)\b/i.test(
      remainder
    );
  }

  return /^(tell me|describe|explain|walk me through|how would you|how do you|what|why|when|where|which|can you|could you|do you|did you|would you|have you|give me|share|in your|i noticed|you mentioned)\b/i.test(cleaned);
};

const classifyQuestion = (
  question: string,
  resumeAnchors: ResumeAnchor[],
  previousQuestion?: string
): QuestionKind => {
  if (isIntroQuestion(question)) return 'intro';
  if (isClosingQuestion(question)) return 'closing';
  if (isCandidateQuestion(question)) return 'candidate';
  if (isWrapupQuestion(question)) return 'wrapup';
  if (isResumeCue(question, resumeAnchors)) return 'resume';
  if (isFollowupQuestion(question, previousQuestion)) return 'followup';
  return 'core';
};

const isDeferralAnswer = (answer: string): boolean => {
  const text = (answer || '').toLowerCase().trim();
  if (!text) return true;
  return (
    /^no\.?$/.test(text) ||
    /^no thanks\.?$/.test(text) ||
    /^skip\.?$/.test(text) ||
    /^pass\.?$/.test(text) ||
    /\bnot sure\b/.test(text) ||
    /\bdont know\b/.test(text) ||
    /\bdon\'t know\b/.test(text) ||
    /\bi dont know\b/.test(text) ||
    /\bi don\'t know\b/.test(text) ||
    /^idk\.?$/.test(text) ||
    /^no idea\.?$/.test(text) ||
    /please proceed/.test(text) ||
    /next question/.test(text) ||
    /harder question/.test(text) ||
    /more complex/.test(text) ||
    /give me.*question/.test(text) ||
    /move on/.test(text) ||
    /don\'t want to answer/.test(text) ||
    /do not want to answer/.test(text) ||
    /refuse to answer/.test(text) ||
    /won\'t answer/.test(text)
  );
};

const detectAnswerQuality = (answer: string): { low: FollowupIntent | null } => {
  const text = (answer || '').trim();
  if (!text) return { low: 'specificity' };
  if (isDeferralAnswer(text)) return { low: null };

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const hasNumbers = /\d/.test(text);
  const hasExamples = /(for example|for instance|e\.g\.|such as|like)/i.test(text);
  const hasOwnership = /\b(i|my|me|mine|i\'ve|i\'d)\b/i.test(text);
  const hasWe = /\b(we|our|us)\b/i.test(text);
  const hasDepth = /(trade-?off|architecture|design|system|pipeline|scalab|latency|performance|database|api|algorithm|debug|testing|framework|infrastructure|kubernetes|docker|aws|gcp|azure|ci\/cd|deploy|monitor|observability|metrics)/i.test(text);
  const hasImpact = /(improved|reduced|increased|impact|resulted|delivered|saved|percent|%|revenue|cost|time|latency|users|availability|uptime)/i.test(text) || hasNumbers;

  const vagueTerms = /\b(stuff|things|some|various|etc|etc\.|kind of|sort of|maybe)\b/i.test(text);
  const lacksSpecifics = !hasExamples && !hasNumbers && !hasDepth;

  if (wordCount < 8 && lacksSpecifics) return { low: 'specificity' };
  if (vagueTerms && lacksSpecifics) return { low: 'specificity' };
  if (wordCount < 12 && !hasOwnership && hasWe && lacksSpecifics) return { low: 'ownership' };
  return { low: null };
};


const stripLeadingAcknowledgement = (question: string): string => {
  const trimmed = (question || '').trim();
  if (!trimmed) return trimmed;
  const patterns = [
    /^thanks[,!\s-]+/i,
    /^thank you[,!\s-]+/i,
    /^got it[,!\s-]+/i,
    /^understood[,!\s-]+/i,
    /^great[,!\s-]+/i,
    /^appreciate (that|it)[,!\s-]+/i,
    /^let['’]s continue[,!\s-]+/i,
    /^moving on[,!\s-]+/i,
    /^next question[,!\s-]+/i,
  ];
  let result = trimmed;
  for (const pattern of patterns) {
    if (pattern.test(result)) {
      result = result.replace(pattern, '').trim();
    }
  }
  return result || trimmed;
};

const hasBannedFollowupPhrasing = (text: string): boolean => {
  const cleaned = (text || '').toLowerCase();
  return (
    cleaned.includes('provide more') ||
    cleaned.includes('provide specific') ||
    cleaned.includes('please share your background') ||
    cleaned.includes('need more detail') ||
    cleaned.includes('need more details') ||
    cleaned.includes('more details') ||
    cleaned.includes('not enough detail') ||
    cleaned.includes('be more specific') ||
    cleaned.includes('can you be more specific')
  );
};


const isExamInterview = (input: InterviewAgentInput): boolean => {
  const role = (input.jobRole || '').toLowerCase();
  return (
    role.includes('neet') ||
    role.includes('jee') ||
    role.includes('cat') ||
    role.includes('mba') ||
    role.includes('gmat') ||
    role.includes('gre') ||
    role.includes('exam') ||
    !!input.examId ||
    !!input.subcategoryId
  );
};

const clampNumber = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const hasUsableGeminiKeys = (): boolean => {
  const rawKeys = [
    process.env.GOOGLE_API_KEY,
    process.env.GOOGLE_API_KEY_2,
    process.env.GOOGLE_API_KEY_3,
  ].filter(Boolean) as string[];

  return rawKeys.some(key => {
    const trimmed = key.trim();
    if (!trimmed) return false;
    if (trimmed === 'your_gemini_api_key_here') return false;
    return true;
  });
};

const hasUsableOpenAIKeys = (): boolean => {
  const rawKeys = [
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_API_KEY_2,
    process.env.OPENAI_API_KEY_3,
  ].filter(Boolean) as string[];

  return rawKeys.some(key => {
    const trimmed = key.trim();
    if (!trimmed) return false;
    return true;
  });
};

const hasUsableGroqKey = (): boolean => {
  const key = (process.env.GROQ_API_KEY || '').trim();
  if (!key) return false;
  return true;
};

type InterviewProvider = 'openai' | 'groq' | 'gemini' | 'none';

const resolveInterviewProvider = (): InterviewProvider => {
  const preferred = (process.env.INTERVIEW_LLM_PROVIDER || 'auto').toLowerCase();
  const hasOpenAI = hasUsableOpenAIKeys();
  const hasGroq = hasUsableGroqKey();
  const hasGemini = hasUsableGeminiKeys();

  if (preferred === 'openai') return hasOpenAI ? 'openai' : 'none';
  if (preferred === 'groq') return hasGroq ? 'groq' : 'none';
  if (preferred === 'gemini') return hasGemini ? 'gemini' : 'none';
  if (preferred !== 'auto') return 'none';

  if (hasOpenAI) return 'openai';
  if (hasGroq) return 'groq';
  if (hasGemini) return 'gemini';
  return 'none';
};

const getLastQuestion = (history: InterviewHistory[]): string => {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const question = (history[i]?.question || '').trim();
    if (question) return question;
  }
  return '';
};

const scoreFromAnswer = (answer: string): number => {
  const cleaned = (answer || '').trim();
  if (!cleaned) return 3;
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  const hasMetrics = /\d/.test(cleaned);
  let score = 4;
  if (wordCount >= 40) score = 7;
  else if (wordCount >= 25) score = 6;
  else if (wordCount >= 15) score = 5;
  if (hasMetrics) score += 1;
  return clampNumber(score, 3, 9);
};

const buildNeutralFeedback = (
  input: InterviewAgentInput,
  kind: QuestionKind
): string => {
  return '';
};

const sanitizeContentFeedback = (
  feedback: string,
  input: InterviewAgentInput,
  kind: QuestionKind
): string => {
  let cleaned = (feedback || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  if (input.company) {
    const companyPattern = new RegExp(`\\b${escapeRegex(input.company)}\\b`, 'ig');
    cleaned = cleaned.replace(companyPattern, '').trim();
  }
  LOCATION_PATTERNS.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '').trim();
  });
  if (containsSensitiveInfo(cleaned)) {
    cleaned = cleaned.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/ig, '[redacted]');
    cleaned = cleaned.replace(/\+?\d[\d\s\-]{7,}\d/g, '[redacted]');
  }

  const ackPatterns = [
    /thanks[,!]? i (?:captured|recorded) your response/i,
    /thank you[,!]? i (?:captured|recorded) your response/i,
    /thanks[,!]? i (?:got|received) it/i,
    /thanks for (?:sharing|answering)/i,
    /^let['’]s continue\b/i,
    /^moving on\b/i,
    /^next question\b/i,
    /^provide more\b/i,
    /^provide specific\b/i,
    /^need more\b/i,
    /^more details\b/i,
    /^lack of\b/i,
    /^insufficient\b/i,
  ];
  if (ackPatterns.some(pattern => pattern.test(cleaned))) {
    return buildNeutralFeedback(input, kind);
  }

  return cleaned;
};

const buildFallbackQuestionFromPlan = (
  plan: NextQuestionPlan,
  input?: InterviewAgentInput
): string => {
  if (plan.isInterviewOver) {
    return 'Thank you for completing the interview. We appreciate your time and will share the outcome soon.';
  }

  if (plan.kind === 'core' && plan.corePool.length > 0) {
    return plan.corePool[0];
  }

  if (plan.kind === 'core' && plan.corePool.length === 0) {
    const pool = getFallbackQuestionPool();
    if (pool.length > 0) {
      const seed = Math.max(0, plan.mainQuestionsAsked || 0);
      return pool[seed % pool.length];
    }
    return 'Describe a technical project you worked on recently and your specific contribution.';
  }

  if (plan.kind === 'intro') {
    const name = (input?.candidateName || '').trim();
    const company = (input?.company || '').trim();
    const role = (input?.jobRole || '').trim() || 'role';
    const namePrefix = name ? `Hello ${name}` : 'Hello';
    const companyPart = company ? ` at ${company}` : '';
    const rolePart = role ? ` for the ${role} position` : '';
    return `${namePrefix}, welcome to your interview${companyPart}${rolePart}. Let's begin with knowing you first — could you tell me about yourself and your experience relevant to this role?`;
  }

  if (plan.kind === 'resume' && plan.resumeAnchor?.title) {
    return buildResumeQuestion(plan.resumeAnchor);
  }

  if (plan.kind === 'followup') {
    const seed = (plan.mainQuestionsAsked || 0) + (plan.followupBudgetRemaining || 0);
    return buildFollowupQuestion(plan.followupIntent || 'specificity', seed);
  }

  if (plan.kind === 'closing') {
    return buildClosingFitQuestion(input || ({} as InterviewAgentInput));
  }

  return '';
};

const planNextQuestion = (
  input: InterviewAgentInput,
  referenceQuestions?: string
): { plan: NextQuestionPlan; fallbackQuestion: string } => {
  const historyQuestions = input.conversationHistory.map(entry => entry.question || '').filter(Boolean);
  const isExam = isExamInterview(input);

  if (isExam) {
    const referencePool = parseReferenceQuestions(referenceQuestions);
    const unusedPool = filterUnusedReferenceQuestions(referencePool, historyQuestions);
    const plan: NextQuestionPlan = {
      kind: 'core',
      isInterviewOver: false,
      questionCategory: getQuestionCategory('core', 'other'),
      corePool: unusedPool,
      mainQuestionsAsked: historyQuestions.length,
      mainQuestionsTarget: Math.max(input.minQuestionsRequired || 8, MAIN_QUESTION_TARGET),
      resumeTarget: 0,
      coreTarget: Math.max(input.minQuestionsRequired || 8, MAIN_QUESTION_TARGET),
      followupBudgetRemaining: FOLLOWUP_BUDGET_MAX,
      reason: 'exam_flow',
    };

    return { plan, fallbackQuestion: buildFallbackQuestionFromPlan(plan, input) };
  }

  const plan = orchestrateJobInterviewNextQuestion(input, referenceQuestions);
  return { plan, fallbackQuestion: buildFallbackQuestionFromPlan(plan, input) };
};

type LlmEvaluation = Partial<{
  contentFeedback: string;
  toneFeedback: string;
  clarityFeedback: string;
  ideasScore: number;
  organizationScore: number;
  accuracyScore: number;
  voiceScore: number;
  grammarScore: number;
  stopWordsScore: number;
  overallScore: number;
  isCorrectAnswer: boolean;
  shouldRetryQuestion: boolean;
  hint: string;
  explanation: string;
  nextQuestion: string;
  isInterviewOver: boolean;
  nextQuestionKind: QuestionKind;
}>;

const parseJsonFromContent = (content: string): LlmEvaluation | null => {
  if (!content) return null;
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as LlmEvaluation;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as LlmEvaluation;
    } catch {
      return null;
    }
  }
};

const buildEvaluationPrompt = (
  input: InterviewAgentInput,
  plan: NextQuestionPlan
): { system: string; user: string } => {
  const lastQuestion = getLastQuestion(input.conversationHistory);
  const answer = (input.currentTranscript || '').trim();
  const role = (input.jobRole || '').trim() || 'General';
  const company = (input.company || '').trim();
  const candidateName = (input.candidateName || '').trim();
  const resumeSummary = buildResumeSummary(input.resumeText || '');
  const referenceQuestions = (input.referenceQuestions || []).slice(0, 12);
  const eventType = input.eventType || 'answer';

  const system = getEvaluationSystemPrompt();

  const sanitizedResumeAnchor = plan.resumeAnchor
    ? {
        title: sanitizeResumeAnchorTitle(plan.resumeAnchor.title, plan.resumeAnchor.company),
        type: plan.resumeAnchor.type,
        evidence: '',
      }
    : null;

  const planPayload = {
    next_kind: plan.kind,
    is_interview_over: plan.isInterviewOver,
    main_questions_asked: plan.mainQuestionsAsked,
    main_questions_target: plan.mainQuestionsTarget,
    resume_target: plan.resumeTarget,
    core_target: plan.coreTarget,
    followup_budget_remaining: plan.followupBudgetRemaining,
    followup_intent: plan.followupIntent || null,
    resume_anchor: sanitizedResumeAnchor,
    core_question_pool: plan.corePool.slice(0, 10),
    reason: plan.reason,
  };

  const userLines = [
    `Event: ${eventType}`,
    `Role: ${role}`,
    company ? `Company: ${company}` : 'Company: (not provided)',
    candidateName ? `Candidate: ${candidateName}` : 'Candidate: (not provided)',
    (input.currentQuestion || lastQuestion)
      ? `Question: ${input.currentQuestion || lastQuestion}`
      : 'Question: (not provided)',
    answer ? `Answer: ${answer}` : 'Answer: (empty)',
    resumeSummary ? `Resume summary: ${resumeSummary}` : 'Resume summary: (not provided)',
    referenceQuestions.length
      ? `Reference questions (prefer these for core questions): ${referenceQuestions.join(' | ')}`
      : 'Reference questions: (not provided)',
    `NextQuestionPlan: ${JSON.stringify(planPayload)}`,
    '',
    'Event handling rules:',
    '- If Event=start: contentFeedback may be empty or a brief welcome. nextQuestion must be the intro greeting + question.',
    '- If Event=silence_prompt: contentFeedback = brief nudge to continue, nextQuestion empty, shouldRetryQuestion=true.',
    '- If Event=low_confidence: contentFeedback = ask to repeat clearly, nextQuestion empty, shouldRetryQuestion=true.',
    '- If Event=answer: analyze answer quality and generate nextQuestion.',
    '',
    'Next question rules:',
    '- Obey NextQuestionPlan.next_kind. If it is wrapup, set isInterviewOver=true and nextQuestion as a short closing statement (not a question).',
    '- If next_kind=core and core_question_pool is non-empty, choose ONE question verbatim from the pool (prefer the first unused). Do not rewrite it.',
    '- If next_kind=resume, ask about resume_anchor.title without naming any company/location; focus on technical ownership, design decisions, and measurable impact.',
    '- If next_kind=followup, ask one probing technical follow-up aligned to followup_intent (specificity, ownership, depth, or impact). Avoid "provide more" phrasing.',
    '- If next_kind=intro, greet briefly, include candidate name, company, and role if provided, then ask "tell me about yourself and your experience relevant to [role]". End with a question.',
    '- If next_kind=closing, ask a fit-for-role question (why a strong fit / why choose you / strongest evidence) with varied wording. Keep it a question and set isInterviewOver=false.',
    '- If the candidate says they do not know or want to skip, acknowledge briefly and move on to the next question.',
    '- Never output multiple questions; keep nextQuestion to one question only.',
    '',
    'Return JSON with keys:',
    'contentFeedback, toneFeedback, clarityFeedback, ideasScore, organizationScore, accuracyScore, voiceScore, grammarScore, stopWordsScore, overallScore, isCorrectAnswer, shouldRetryQuestion, hint, explanation, nextQuestion, isInterviewOver',
    'Scores are 1-10. Set shouldRetryQuestion to true only if the answer is extremely short or irrelevant.',
  ];

  return { system, user: userLines.join('\n') };
};

const callOpenAICompatible = async (options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  useResponseFormat: boolean;
}): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  const schema = {
    name: 'interview_feedback',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        contentFeedback: { type: 'string' },
        toneFeedback: { type: 'string' },
        clarityFeedback: { type: 'string' },
        ideasScore: { type: 'number' },
        organizationScore: { type: 'number' },
        accuracyScore: { type: 'number' },
        voiceScore: { type: 'number' },
        grammarScore: { type: 'number' },
        stopWordsScore: { type: 'number' },
        overallScore: { type: 'number' },
        isCorrectAnswer: { type: 'boolean' },
        shouldRetryQuestion: { type: 'boolean' },
        hint: { type: 'string' },
        explanation: { type: 'string' },
        nextQuestion: { type: 'string' },
        isInterviewOver: { type: 'boolean' },
        nextQuestionKind: { type: 'string' },
      },
      required: [
        'contentFeedback',
        'toneFeedback',
        'clarityFeedback',
        'ideasScore',
        'organizationScore',
        'accuracyScore',
        'voiceScore',
        'grammarScore',
        'stopWordsScore',
        'overallScore',
        'isCorrectAnswer',
        'shouldRetryQuestion',
        'nextQuestion',
        'isInterviewOver',
      ],
    },
  };

  const payload: Record<string, unknown> = {
    model: options.model,
    messages: [
      { role: 'system', content: options.system },
      { role: 'user', content: options.user },
    ],
    temperature: 0.3,
    max_tokens: 400,
  };

  if (options.useResponseFormat) {
    payload.response_format = { type: 'json_schema', json_schema: schema };
  }

  try {
    const response = await fetch(`${options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(body || `OpenAI-compatible API error (${response.status})`);
    }

    const json = JSON.parse(body);
    return String(json?.choices?.[0]?.message?.content || '').trim();
  } finally {
    clearTimeout(timeout);
  }
};

const mergeEvaluation = (
  base: InterviewAgentOutput,
  evaluation: LlmEvaluation | null,
  input: InterviewAgentInput,
  kind: QuestionKind,
  plan: NextQuestionPlan
): InterviewAgentOutput => {
  if (!evaluation) {
    return {
      ...base,
      contentFeedback: sanitizeContentFeedback(base.contentFeedback, input, kind),
    };
  }

  const updated: InterviewAgentOutput = { ...base };

  if (typeof evaluation.contentFeedback === 'string') {
    updated.contentFeedback = sanitizeContentFeedback(evaluation.contentFeedback, input, kind);
  }
  if (typeof evaluation.toneFeedback === 'string') updated.toneFeedback = evaluation.toneFeedback.trim();
  if (typeof evaluation.clarityFeedback === 'string') updated.clarityFeedback = evaluation.clarityFeedback.trim();

  const scoreMap: Array<keyof LlmEvaluation & keyof InterviewAgentOutput> = [
    'ideasScore',
    'organizationScore',
    'accuracyScore',
    'voiceScore',
    'grammarScore',
    'stopWordsScore',
    'overallScore',
  ];
  scoreMap.forEach(key => {
    const value = evaluation[key];
    if (typeof value === 'number') {
      updated[key] = clampNumber(value, 1, 10) as any;
    }
  });

  if (typeof evaluation.isCorrectAnswer === 'boolean') updated.isCorrectAnswer = evaluation.isCorrectAnswer;
  if (typeof evaluation.shouldRetryQuestion === 'boolean') updated.shouldRetryQuestion = evaluation.shouldRetryQuestion;
  if (typeof evaluation.hint === 'string' && evaluation.hint.trim()) updated.hint = evaluation.hint.trim();
  if (typeof evaluation.explanation === 'string' && evaluation.explanation.trim()) updated.explanation = evaluation.explanation.trim();
  if (typeof evaluation.nextQuestion === 'string' && evaluation.nextQuestion.trim()) {
    updated.nextQuestion = evaluation.nextQuestion.trim();
  }
  if (typeof evaluation.isInterviewOver === 'boolean') {
    updated.isInterviewOver = evaluation.isInterviewOver;
  }

  if (base.isInterviewOver || plan.isInterviewOver) {
    updated.isInterviewOver = true;
  }

  if (!updated.nextQuestion) {
    updated.nextQuestion = buildFallbackQuestionFromPlan(plan, input);
  }

  if (plan.kind === 'resume') {
    updated.nextQuestion = buildResumeQuestion(plan.resumeAnchor);
  }
  if (plan.kind === 'closing') {
    if (!updated.nextQuestion || !isFitQuestion(updated.nextQuestion)) {
      updated.nextQuestion = buildClosingFitQuestion(input);
    }
  }

  if (updated.nextQuestion) {
    updated.nextQuestion = stripLeadingAcknowledgement(updated.nextQuestion);
    if (plan.kind === 'core' && plan.corePool.length > 0) {
      // Allow LLM to ask dynamically generated questions instead of forcing a fallback from the pool:
      // const matched = findMatchingCoreQuestion(updated.nextQuestion, plan.corePool);
      // updated.nextQuestion = matched || plan.corePool[0];
    }
    if (plan.kind === 'followup' && hasBannedFollowupPhrasing(updated.nextQuestion)) {
      const seed = (plan.mainQuestionsAsked || 0) + (plan.followupBudgetRemaining || 0);
      updated.nextQuestion = buildFollowupQuestion(plan.followupIntent || 'specificity', seed);
    }
    if (!isExamInterview(input) && plan.kind !== 'core') {
      updated.nextQuestion = sanitizeJobInterviewQuestion(updated.nextQuestion, plan, input);
    }
    updated.nextQuestion = enforceUniqueNextQuestion(
      updated.nextQuestion,
      input,
      updated.isInterviewOver,
      plan.corePool
    );
  }

  if (!updated.isInterviewOver && !isQuestionLike(updated.nextQuestion)) {
    updated.nextQuestion = buildFallbackQuestionFromPlan(plan, input);
  }

  if (input.resumeText) {
    updated.contentFeedback = scrubResumeLeakage(updated.contentFeedback || '', input.resumeText);
    updated.nextQuestion = scrubResumeLeakage(updated.nextQuestion || '', input.resumeText);
  }

  if (isDeferralAnswer(input.currentTranscript || '')) {
    updated.shouldRetryQuestion = false;
  }

  updated.nextQuestionKind = plan.kind;

  return updated;
};

const buildFallbackOutput = (
  input: InterviewAgentInput,
  referenceQuestions?: string
): { output: InterviewAgentOutput; plan: NextQuestionPlan } => {
  const { plan, fallbackQuestion } = planNextQuestion(input, referenceQuestions);

  const baseScore = scoreFromAnswer(input.currentTranscript || '');
  const presentationScore = clampNumber(Math.round(baseScore / 2), 1, 5);

  return {
    plan,
    output: {
      contentFeedback: '',
      toneFeedback: 'Tone feedback is limited in fallback mode.',
      clarityFeedback: 'Clarity feedback is limited in fallback mode.',
      visualFeedback: 'Visual feedback unavailable in this session.',
    physicalAppearanceScore: presentationScore,
    physicalAppearanceJustification: 'Visual signal not available.',
    bodyLanguageScore: presentationScore,
    bodyLanguageJustification: 'Visual signal not available.',
    confidenceScore: presentationScore,
    confidenceJustification: 'Confidence inferred from response length only.',
    ideasScore: baseScore,
    ideasJustification: 'Score based on response length and specificity.',
    organizationScore: baseScore,
    organizationJustification: 'Score based on response structure and clarity.',
    accuracyScore: baseScore,
    accuracyJustification: 'Accuracy estimated without external validation.',
    voiceScore: baseScore,
    voiceJustification: 'Voice score estimated in fallback mode.',
    grammarScore: baseScore,
    grammarJustification: 'Grammar score estimated in fallback mode.',
    stopWordsScore: baseScore,
    stopWordsJustification: 'Stop word score estimated in fallback mode.',
    questionCategory: plan.questionCategory,
    overallScore: baseScore,
    nextQuestion: fallbackQuestion,
    isInterviewOver: plan.isInterviewOver,
    nextQuestionKind: plan.kind,
    isCorrectAnswer: true,
    shouldRetryQuestion: false,
    isNextQuestionCurrentAffairs: false,
    },
  };
};

const getQuestionCategory = (kind: QuestionKind, lastKind: QuestionKind): 'general-knowledge' | 'academics' | 'work-experience' | 'about-self' => {
  if (kind === 'intro' || kind === 'closing' || kind === 'candidate') {
    return 'about-self';
  }
  if (kind === 'resume') return 'work-experience';
  if (kind === 'followup') {
    return lastKind === 'resume' ? 'work-experience' : 'general-knowledge';
  }
  return 'general-knowledge';
};

const parseReferenceQuestions = (referenceQuestions?: string | string[]): string[] => {
  if (!referenceQuestions) return [];
  const rawList = Array.isArray(referenceQuestions)
    ? referenceQuestions
    : [referenceQuestions];
  const lines = rawList.flatMap(item => String(item).split('\n'));
  return lines
    .map(line => String(line).replace(/^\[[^\]]+\]\s*/g, '').trim())
    .filter(Boolean);
};

const shuffleQuestions = (questions: string[]): string[] => {
  const shuffled = [...questions];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const filterQuestionPool = (
  questions: string[],
  options?: { allowSoftSkills?: boolean }
): string[] => {
  if (!questions.length) return [];
  return questions.filter(question => !violatesQuestionGuardrails(question, options));
};

const selectCoreQuestion = (
  referenceQuestions: string[],
  historyQuestions: string[],
  jobRole: string,
  company: string
): string => {
  const normalizedHistory = historyQuestions.map(question => normalizeForCompare(question));
  for (const question of referenceQuestions) {
    if (!normalizedHistory.includes(normalizeForCompare(question))) {
      return question;
    }
  }
  return '';
};

const filterUnusedReferenceQuestions = (
  referenceQuestions: string[],
  historyQuestions: string[]
): string[] => {
  if (!referenceQuestions.length) return [];
  return referenceQuestions.filter(candidate => {
    const normalizedCandidate = normalizeForCompare(candidate);
    if (!normalizedCandidate) return false;
    return !historyQuestions.some(previous => {
      const normalizedPrev = normalizeForCompare(previous);
      if (!normalizedPrev) return false;
      if (normalizedPrev === normalizedCandidate) return true;
      return questionSimilarity(previous, candidate) >= NEXT_QUESTION_SIMILARITY_THRESHOLD;
    });
  });
};

const findMatchingCoreQuestion = (
  candidate: string,
  referenceQuestions: string[]
): string | null => {
  if (!candidate) return null;
  const normalizedCandidate = normalizeForCompare(candidate);
  for (const question of referenceQuestions) {
    const normalizedQuestion = normalizeForCompare(question);
    if (!normalizedQuestion) continue;
    if (normalizedQuestion === normalizedCandidate) return question;
    if (questionSimilarity(question, candidate) >= NEXT_QUESTION_SIMILARITY_THRESHOLD) {
      return question;
    }
  }
  return null;
};

const selectUnusedAnchor = (anchors: ResumeAnchor[], historyQuestions: string[]): ResumeAnchor | undefined => {
  const normalizedHistory = historyQuestions.map(question => normalizeForCompare(question));
  const priority = anchors.filter(anchor => anchor.type === 'experience' || anchor.type === 'project');
  const fallback = anchors.filter(anchor => anchor.type !== 'experience' && anchor.type !== 'project');
  const ordered = priority.length > 0 ? [...priority, ...fallback] : anchors;

  for (const anchor of ordered) {
    const key = normalizeForCompare(anchor.title);
    // Pre-generate the question this anchor would produce — check if it's already in history
    const generatedQuestion = normalizeForCompare(buildResumeQuestion(anchor));

    const used = normalizedHistory.some(question => {
      // Check generated question similarity first (most reliable)
      if (generatedQuestion && question.includes(generatedQuestion.substring(0, Math.min(60, generatedQuestion.length)))) return true;
      // Fallback: check anchor metadata fields
      if (key && question.includes(key)) return true;
      if (anchor.company && question.includes(normalizeForCompare(anchor.company))) return true;
      if (anchor.role && question.includes(normalizeForCompare(anchor.role))) return true;
      return false;
    });
    if (!used) return anchor;
  }
  return undefined;
};

const selectUnusedAnchorByType = (
  anchors: ResumeAnchor[],
  historyQuestions: string[],
  type: ResumeAnchorType
): ResumeAnchor | undefined => {
  const filtered = anchors.filter(anchor => anchor.type === type);
  if (filtered.length === 0) return undefined;
  return selectUnusedAnchor(filtered, historyQuestions);
};

const getAskedResumeTypes = (
  historyQuestions: string[],
  resumeAnchors: ResumeAnchor[]
): Set<ResumeAnchorType> => {
  const asked = new Set<ResumeAnchorType>();
  const normalizedHistory = historyQuestions.map(question => normalizeForCompare(question));
  resumeAnchors.forEach(anchor => {
    const key = normalizeForCompare(anchor.title);
    if (!key) return;
    const wasAsked = normalizedHistory.some(question => {
      if (question.includes(key)) return true;
      if (anchor.company && question.includes(normalizeForCompare(anchor.company))) return true;
      if (anchor.role && question.includes(normalizeForCompare(anchor.role))) return true;
      return false;
    });
    if (wasAsked) {
      asked.add(anchor.type);
    }
  });
  return asked;
};

const orchestrateJobInterviewNextQuestion = (
  flowInput: InterviewAgentInput,
  referenceQuestions: string | undefined
): NextQuestionPlan => {
  const flags = {
    resumeProbe: process.env.INTERVIEW_RESUME_PROBE_ENABLED !== 'false',
    followup: process.env.INTERVIEW_FOLLOWUP_ENABLED !== 'false',
  };

  const historyQuestions = flowInput.conversationHistory
    .map(entry => entry.question || '')
    .filter(text => isLikelyInterviewQuestion(text));

  const resumeText = flowInput.resumeText || '';
  const resumeHasData = flowInput.hasResumeData ?? (resumeText.trim().length > 50);
  const resumeProfile = resumeHasData ? extractResumeProfile(resumeText) : null;
  const resumeAnchors = resumeProfile ? selectResumeAnchors(buildResumeAnchors(resumeProfile, resumeText)) : [];
  const allowedResumeAnchors = resumeAnchors.filter(anchor => anchor.type === 'experience' || anchor.type === 'project');
  const resumeEnabled = flags.resumeProbe && resumeHasData && allowedResumeAnchors.length > 0;

  const classifications: QuestionKind[] = [];
  historyQuestions.forEach((question, idx) => {
    // The first question in history is the intro greeting — but ONLY if it actually looks like one.
    // If history is stale/empty and a core question appears at idx=0, don't mislabel it as intro.
    if (idx === 0 && isIntroQuestion(question)) {
      classifications.push('intro');
    } else {
      classifications.push(classifyQuestion(question, resumeAnchors, historyQuestions[idx - 1]));
    }
  });

  const lastKind = classifications.length > 0 ? classifications[classifications.length - 1] : 'other';
  const lastMainKind = (() => {
    for (let i = classifications.length - 1; i >= 0; i -= 1) {
      const kind = classifications[i];
      if (kind !== 'followup' && kind !== 'wrapup') return kind;
    }
    return 'other';
  })();
  const lastQuestion = historyQuestions.length > 0 ? historyQuestions[historyQuestions.length - 1] : '';
  const lastIsClosing = isClosingQuestion(lastQuestion) || isCandidateQuestion(lastQuestion);

  const introAskedCount = classifications.filter(kind => kind === 'intro').length;
  // Primary resume count from classifications
  const resumeAskedByClass = classifications.filter(kind => kind === 'resume').length;
  // Secondary resume count: count anchors whose generated question already appeared in history (more reliable)
  const normalizedHistory = historyQuestions.map(q => normalizeForCompare(q));
  const resumeAskedByAnchor = allowedResumeAnchors.filter(anchor => {
    const generated = normalizeForCompare(buildResumeQuestion(anchor));
    const prefix = generated.substring(0, Math.min(60, generated.length));
    const key = normalizeForCompare(anchor.title);
    return normalizedHistory.some(q =>
      (prefix && q.includes(prefix)) ||
      (key && q.includes(key)) ||
      (anchor.company && q.includes(normalizeForCompare(anchor.company)))
    );
  }).length;
  // Use whichever count is higher — prevents getting stuck if classification misses one
  const resumeAsked = Math.max(resumeAskedByClass, resumeAskedByAnchor);
  const coreAsked = classifications.filter(kind => kind === 'core').length;
  const closingAsked = classifications.filter(kind => kind === 'closing').length;

  const mainQuestionsAsked = introAskedCount + resumeAsked + coreAsked;
  const resumeTarget = resumeEnabled ? Math.min(RESUME_QUESTION_TARGET, allowedResumeAnchors.length || 0) : 0;
  const mainTarget = JOB_MAIN_QUESTION_TARGET;
  const coreTarget = Math.max(0, mainTarget - 1 - resumeTarget);
  const mainRemaining = Math.max(0, mainTarget - mainQuestionsAsked);

  // Per-question follow-up budget: count consecutive followups after the last main question
  const followupsForCurrentQuestion = (() => {
    let count = 0;
    for (let i = classifications.length - 1; i >= 0; i -= 1) {
      if (classifications[i] === 'followup') {
        count += 1;
      } else {
        break; // stop at the first non-followup (the main question)
      }
    }
    return count;
  })();
  const followupBudgetRemaining = Math.max(0, FOLLOWUP_BUDGET_MAX - followupsForCurrentQuestion);

  const resumeSequencePending = resumeEnabled && resumeAsked < resumeTarget;

  // --- STRICT ORDERING: intro → resume → core → closing → wrapup ---

  // 1. Always ask intro first
  if (introAskedCount < 1) {
    return {
      kind: 'intro',
      isInterviewOver: false,
      questionCategory: getQuestionCategory('intro', lastKind),
      corePool: [],
      mainQuestionsAsked,
      mainQuestionsTarget: mainTarget,
      resumeTarget,
      coreTarget,
      followupBudgetRemaining,
      reason: 'intro_required',
    };
  }

  // 2. Check if all main questions are done → closing/wrapup
  if (mainRemaining <= 0) {
    if (closingAsked < 1) {
      return {
        kind: 'closing',
        isInterviewOver: false,
        questionCategory: getQuestionCategory('closing', lastKind),
        corePool: [],
        mainQuestionsAsked,
        mainQuestionsTarget: mainTarget,
        resumeTarget,
        coreTarget,
        followupBudgetRemaining,
        reason: 'closing_question',
      };
    }
    return {
      kind: 'wrapup',
      isInterviewOver: true,
      questionCategory: getQuestionCategory('wrapup', lastKind),
      corePool: [],
      mainQuestionsAsked,
      mainQuestionsTarget: mainTarget,
      resumeTarget,
      coreTarget,
      followupBudgetRemaining,
      reason: 'main_questions_complete',
    };
  }

  // 3. Per-question follow-up: only when last answer was low quality and budget remains
  //    Follow-ups do NOT count toward the 10-question total.
  //    Only allow follow-ups on resume or core questions, not during phase transitions.
  const qualityCheck = detectAnswerQuality(flowInput.currentTranscript || '');
  const shouldFollowup =
    flags.followup &&
    followupBudgetRemaining > 0 &&
    (lastMainKind === 'core' || lastMainKind === 'resume') &&
    !lastIsClosing &&
    qualityCheck.low !== null &&
    !isDeferralAnswer(flowInput.currentTranscript || '');

  if (shouldFollowup) {
    return {
        kind: 'followup',
        isInterviewOver: false,
        questionCategory: getQuestionCategory('followup', lastMainKind),
        followupIntent: qualityCheck.low!,
        corePool: [],
        mainQuestionsAsked,
        mainQuestionsTarget: mainTarget,
        resumeTarget,
        coreTarget,
        followupBudgetRemaining,
        reason: 'per_question_followup',
      };
  }

  // 4. Resume-based technical questions (phase 2, after intro)
  if (resumeSequencePending) {
    const preferType: ResumeAnchorType = resumeAsked % 2 === 0 ? 'experience' : 'project';
    const anchor =
      selectUnusedAnchorByType(allowedResumeAnchors, historyQuestions, preferType) ||
      selectUnusedAnchor(allowedResumeAnchors, historyQuestions);
    if (anchor) {
      return {
        kind: 'resume',
        isInterviewOver: false,
        questionCategory: getQuestionCategory('resume', lastKind),
        resumeAnchor: anchor,
        corePool: [],
        mainQuestionsAsked,
        mainQuestionsTarget: mainTarget,
        resumeTarget,
        coreTarget,
        followupBudgetRemaining,
        reason: 'resume_sequence',
      };
    }
  }

  // 5. Core / HR-generated questions (phase 3, after resume questions)
  const referencePool = filterUnusedReferenceQuestions(
    filterQuestionPool(parseReferenceQuestions(referenceQuestions), { allowSoftSkills: true }),
    historyQuestions
  );

  return {
    kind: 'core',
    isInterviewOver: false,
    questionCategory: getQuestionCategory('core', lastKind),
    corePool: shuffleQuestions(referencePool),
    mainQuestionsAsked,
    mainQuestionsTarget: mainTarget,
    resumeTarget,
    coreTarget,
    followupBudgetRemaining,
    reason: 'core_block',
  };
};

export async function interviewAgent(input: InterviewAgentInput): Promise<InterviewAgentOutput> {
  const rawTranscript = input.currentTranscript || '';
  if ((input.eventType || 'answer') === 'answer' && containsProfanity(rawTranscript)) {
    const { output } = buildFallbackOutput(
      input,
      input.referenceQuestions && input.referenceQuestions.length > 0
        ? input.referenceQuestions.join('\n')
        : undefined
    );
    return {
      ...output,
      contentFeedback: '',
      nextQuestion: 'This is not professional behavior. The interview is ending now.',
      isInterviewOver: true,
      nextQuestionKind: 'wrapup',
      shouldRetryQuestion: false,
      isCorrectAnswer: false,
    };
  }

  const safeInput = sanitizeInterviewInput(input);
  const provider = resolveInterviewProvider();

  if (provider === 'openai' || provider === 'groq') {
    const { output: baseOutput, plan } = buildFallbackOutput(
      safeInput,
      safeInput.referenceQuestions && safeInput.referenceQuestions.length > 0
        ? safeInput.referenceQuestions.join('\n')
        : undefined
    );

    const { system, user } = buildEvaluationPrompt(safeInput, plan);
    const model =
      provider === 'openai'
        ? (process.env.OPENAI_MODEL || 'gpt-4o-mini')
        : (process.env.GROQ_MODEL || process.env.OPENAI_MODEL || 'llama-3.3-70b-versatile');
    const baseUrl =
      provider === 'openai'
        ? (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1')
        : (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1');

    try {
      let content = '';
      if (provider === 'openai') {
        initializeOpenAIApiKeyManager();
        content = await withOpenAIApiKeyRotation(async (apiKey: string) => {
          return await callOpenAICompatible({
            baseUrl,
            apiKey,
            model,
            system,
            user,
            useResponseFormat: true,
          });
        });
      } else {
        const groqKey = (process.env.GROQ_API_KEY || '').trim();
        if (!groqKey) {
          throw new Error('GROQ_API_KEY not configured');
        }
        try {
          content = await callOpenAICompatible({
            baseUrl,
            apiKey: groqKey,
            model,
            system,
            user,
            useResponseFormat: true,
          });
        } catch (error) {
          console.warn('Groq response_format failed, retrying without response_format:', error);
          content = await callOpenAICompatible({
            baseUrl,
            apiKey: groqKey,
            model,
            system,
            user,
            useResponseFormat: false,
          });
        }
      }

      const evaluation = parseJsonFromContent(content);
      return mergeEvaluation(baseOutput, evaluation, safeInput, plan.kind, plan);
    } catch (error) {
      console.error('OpenAI-compatible interview evaluation failed, using fallback:', error);
      return mergeEvaluation(baseOutput, null, safeInput, plan.kind, plan);
    }
  }

  if (provider !== 'gemini') {
    console.warn('No usable LLM provider configured. Using deterministic fallback interview response.');
    return buildFallbackOutput(
      safeInput,
      safeInput.referenceQuestions && safeInput.referenceQuestions.length > 0
        ? safeInput.referenceQuestions.join('\n')
        : undefined
    ).output;
  }

  // Use API key rotation for all interview agent calls (Gemini)
  try {
    return await withApiKeyRotation(async (apiKey: string) => {
      // Create a temporary genkit instance with the rotated API key
      const tempAI = genkit({
        plugins: [googleAI({ apiKey })],
        model: 'googleai/gemini-2.0-flash',
        config: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 2048,
        },
      });
      
      // We'll define the prompt inline in the flow below
      
      // Re-define the flow with the new instance
      const tempFlow = tempAI.defineFlow(
        {
          name: 'interviewAgentFlow',
          inputSchema: InterviewAgentInputSchema,
          outputSchema: InterviewAgentOutputSchema,
        },
        async flowInput => {
          // Extract the flow logic from the original flow
          // Check if this is a CAT aspirant with college selection
          const isCATAspirant = flowInput.jobRole === 'cat' && flowInput.college;
          let catInsights = '';
          
          if (isCATAspirant) {
            try {
              const insightsPromise = getCATQuestionInsights(flowInput.college!, undefined, flowInput.resumeText);
              const timeoutPromise = new Promise<string>((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 5000)
              );
              catInsights = await Promise.race([insightsPromise, timeoutPromise]);
              console.log(`Generated CAT insights for interview agent: ${flowInput.college}`);
            } catch (error) {
              console.error('Failed to get CAT insights for interview agent:', error);
              catInsights = 'CAT interview insights not available for this session.';
            }
          }
          
          const examId = flowInput.examId;
          const subcategoryId = flowInput.subcategoryId;
          console.log(`Interview Agent: Using exam configuration - Exam ID: ${examId}, Subcategory ID: ${subcategoryId}`);
          
          let referenceQuestions;
          let referenceQuestionIds: number[] = [];
          let questionCategories = ['general'];
          if (flowInput.jobRole.toLowerCase().includes('neet')) {
            questionCategories = ['physics', 'chemistry', 'biology', 'medical'];
          } else if (flowInput.jobRole.toLowerCase().includes('jee')) {
            questionCategories = ['physics', 'chemistry', 'mathematics', 'engineering'];
          } else if (flowInput.jobRole.toLowerCase().includes('iit foundation')) {
            questionCategories = ['physics', 'chemistry', 'mathematics', 'foundation'];
          } else if (flowInput.jobRole.toLowerCase().includes('cat') || flowInput.jobRole.toLowerCase().includes('mba')) {
            questionCategories = ['aptitude', 'hr', 'personality', 'business', 'leadership'];
          }
          
          if (!isExamInterview(flowInput)) {
            // Skip DB-backed reference questions for job interviews to avoid schema mismatches.
            referenceQuestions = '';
            referenceQuestionIds = [];
          } else if (isCATAspirant) {
            try {
              const detectedBackground = flowInput.resumeText ? await (await import('@/ai/cat-question-reference')).detectAcademicBackground(flowInput.resumeText) : undefined;
              const catSampleQuestionsPromise = getSampleCATQuestions(flowInput.college!, detectedBackground, 3);
            const catQuestionsTimeoutPromise = new Promise<any[]>((_, reject) => 
              setTimeout(() => reject(new Error('CAT questions query timeout')), 10000)
            );
            const catSampleQuestions = await Promise.race([catSampleQuestionsPromise, catQuestionsTimeoutPromise]);
            
            if (catSampleQuestions.length > 0) {
              referenceQuestionIds = catSampleQuestions.map(q => q.id);
              referenceQuestions = catSampleQuestions
                .map(q => `[${q.subsection}] ${q.question}`)
                .join('\n');
              console.log(`Using ${catSampleQuestions.length} focused CAT sample questions for interview agent (IDs: ${referenceQuestionIds.join(', ')})`);
            } else {
              throw new Error('No CAT questions found for interview agent');
            }
          } catch (error) {
            console.error('Failed to get CAT sample questions for interview agent:', error);
            try {
              const randomQuestionsPromise = getRandomInterviewQuestions(3, examId, subcategoryId);
              const randomTimeoutPromise = new Promise<any[]>((_, reject) => 
                setTimeout(() => reject(new Error('Database query timeout')), 10000)
              );
              const questions = await Promise.race([randomQuestionsPromise, randomTimeoutPromise]);
              referenceQuestionIds = questions.map(q => q.id);
              referenceQuestions = questions
                .map(q => `[q.category] ${q.question}`)
                .join('\n');
            } catch (fallbackError) {
              console.error('Failed to get fallback questions:', fallbackError);
              referenceQuestions = '';
              referenceQuestionIds = [];
            }
          }
        } else {
          try {
            const diverseQuestionsPromise = getDiverseQuestions(questionCategories, 2, examId, subcategoryId);
            const dbTimeoutPromise = new Promise<any[]>((_, reject) => 
              setTimeout(() => reject(new Error('Database query timeout')), 10000)
            );
            const diverseQuestions = await Promise.race([diverseQuestionsPromise, dbTimeoutPromise]);
            
            if (diverseQuestions.length > 0) {
              referenceQuestionIds = diverseQuestions.map(q => q.id);
              referenceQuestions = diverseQuestions
                .map(q => `[${q.category}/${q.subcategory}] ${q.question}`)
                .join('\n');
              console.log(`Using ${diverseQuestions.length} focused questions from categories: ${questionCategories.join(', ')} (IDs: ${referenceQuestionIds.join(', ')})`);
            } else {
              const randomQuestionsPromise = getRandomInterviewQuestions(3, examId, subcategoryId);
              const randomTimeoutPromise = new Promise<any[]>((_, reject) => 
                setTimeout(() => reject(new Error('Database query timeout')), 10000)
              );
              const allRandomQuestions = await Promise.race([randomQuestionsPromise, randomTimeoutPromise]);
              referenceQuestionIds = allRandomQuestions.map(q => q.id);
              referenceQuestions = allRandomQuestions
                .map(q => `[${q.category}/${q.subcategory}] ${q.question}`)
                .join('\n');
              console.log(`Using ${allRandomQuestions.length} random questions for interview agent (IDs: ${referenceQuestionIds.join(', ')})`);
            }
          } catch (error) {
            console.error('Failed to get diverse questions, falling back to cached:', error);
            const cacheKey = generateCacheKey(flowInput.jobRole, flowInput.college, undefined, 'general');
            const cachedQuestions = getCachedQuestions(cacheKey);
            if (cachedQuestions.length > 0) {
              referenceQuestions = cachedQuestions.slice(0, 15).join('\n');
            } else {
              try {
                const allQuestionsPromise = getAllInterviewQuestions();
                const allQuestionsTimeoutPromise = new Promise<any[]>((_, reject) => 
                  setTimeout(() => reject(new Error('Database query timeout')), 10000)
                );
                const questions = await Promise.race([allQuestionsPromise, allQuestionsTimeoutPromise]);
                const shuffled = [...questions].sort(() => Math.random() - 0.5);
                const selectedQuestions = shuffled.slice(0, 2);
                referenceQuestionIds = selectedQuestions.map(q => q.id);
                referenceQuestions = selectedQuestions
                  .map(q => `[${q.category}] ${q.question}`)
                  .join('\n');
              } catch (fallbackError) {
                console.error('All question fetching methods failed:', fallbackError);
                referenceQuestions = '';
                referenceQuestionIds = [];
              }
            }
          }
        }
        
        let currentAffairsQuestion = '';
        let currentAffairsMetadata = { topic: '', category: '', context: '' };
        const realQuestionCount = flowInput.realQuestionCount || 0;
        const shouldAskCurrentAffairs = realQuestionCount > 0 && (realQuestionCount % 3 === 0 || realQuestionCount % 4 === 0);
        
        if (shouldAskCurrentAffairs) {
          try {
            const previousTopics: string[] = [];
            const previousCategories: string[] = [];
            
            flowInput.conversationHistory.forEach(entry => {
              if (entry.isCurrentAffairs && entry.currentAffairsTopic) {
                previousTopics.push(entry.currentAffairsTopic);
              }
              if (entry.isCurrentAffairs && entry.currentAffairsCategory) {
                previousCategories.push(entry.currentAffairsCategory);
              }
            });
            
            console.log(`Generating current affairs question with tracking: ${previousTopics.length} previous topics, ${previousCategories.length} previous categories`);
            
            const currentAffairsPromise = generateCurrentAffairsQuestion({
              language: flowInput.language,
              jobRole: flowInput.jobRole,
              previousTopics,
              previousCategories,
            });
            const currentAffairsTimeoutPromise = new Promise<any>((_, reject) => 
              setTimeout(() => reject(new Error('Current affairs generation timeout')), 15000)
            );
            
            const currentAffairsResult = await Promise.race([currentAffairsPromise, currentAffairsTimeoutPromise]);
            
            currentAffairsQuestion = currentAffairsResult.question;
            currentAffairsMetadata = {
              topic: currentAffairsResult.topic,
              category: currentAffairsResult.category,
              context: currentAffairsResult.context,
            };
            
            console.log(`Generated current affairs question: [${currentAffairsResult.category}] ${currentAffairsResult.topic}`);
            console.log(`Question: ${currentAffairsResult.question}`);
          } catch (error) {
            console.error('Failed to generate current affairs question:', error);
            currentAffairsQuestion = '';
          }
        }
        
        const hasResumeData = flowInput.hasResumeData !== undefined 
          ? flowInput.hasResumeData 
          : (flowInput.resumeText && flowInput.resumeText.trim().length > 50);
        const isEmailInterview = flowInput.isEmailInterview !== undefined ? flowInput.isEmailInterview : false;
        
        const promptInput = {
          ...flowInput,
          hasResumeData,
          isEmailInterview,
          referenceQuestions,
          catInsights,
          currentAffairsQuestion,
          currentAffairsMetadata,
        };
        
        // Use the original prompt but executed through the rotated instance
        // The prompt will use the API key from the tempAI instance's plugin
        // Note: We need to redefine the prompt with the new instance to use rotation
        // Since we can't easily extract the template, we'll use a workaround:
        // Call the original prompt but it will use the original instance's API key
        // To use rotation, we need the template. For now, we'll use the original prompt
        // and rotation will happen at the retry level through withApiKeyRotation
        
        // Actually, the best approach is to use the original flow but wrap it
        // Since the flow is bound, we'll execute it and let withApiKeyRotation handle retries
        // But to use a different key proactively, we need to redefine with the template
        
        // For now, use the original prompt - rotation will happen through retries
        // TODO: Extract prompt template into a constant for proper rotation
        const result = await prompt(promptInput);
        const output = result.output;

        if (output && !isExamInterview(flowInput)) {
          const plan = orchestrateJobInterviewNextQuestion(flowInput, referenceQuestions);
          if (!output.nextQuestion) {
            output.nextQuestion = buildFallbackQuestionFromPlan(plan, flowInput);
          }
          if (plan.kind === 'core' && plan.corePool.length > 0 && output.nextQuestion) {
            const matched = findMatchingCoreQuestion(output.nextQuestion, plan.corePool);
            output.nextQuestion = matched || plan.corePool[0];
          }
          if (plan.kind === 'closing' && output.nextQuestion && !isFitQuestion(output.nextQuestion)) {
            output.nextQuestion = buildClosingFitQuestion(flowInput);
          }
          if (plan.kind === 'followup' && output.nextQuestion && hasBannedFollowupPhrasing(output.nextQuestion)) {
            const seed = (plan.mainQuestionsAsked || 0) + (plan.followupBudgetRemaining || 0);
            output.nextQuestion = buildFollowupQuestion(plan.followupIntent || 'specificity', seed);
          }
          if (output.nextQuestion) {
            output.nextQuestion = sanitizeJobInterviewQuestion(output.nextQuestion, plan, flowInput);
          }
          output.nextQuestion = enforceUniqueNextQuestion(
            output.nextQuestion || '',
            flowInput,
            plan.isInterviewOver,
            plan.corePool
          );
          output.isInterviewOver = plan.isInterviewOver;
          output.questionCategory = plan.questionCategory;
          output.nextQuestionKind = plan.kind;
        } else if (output?.nextQuestion) {
          output.nextQuestion = enforceUniqueNextQuestion(
            output.nextQuestion,
            flowInput,
            output.isInterviewOver
          );
        }

        if (output && isDeferralAnswer(flowInput.currentTranscript || '')) {
          output.shouldRetryQuestion = false;
        }
        
        if (output && currentAffairsQuestion) {
          const isCurrentAffairsNext = output.nextQuestion.includes(currentAffairsQuestion) || 
                                        currentAffairsQuestion.includes(output.nextQuestion.substring(0, 50));
          
          if (isCurrentAffairsNext) {
            output.isNextQuestionCurrentAffairs = true;
            output.nextQuestionCurrentAffairsTopic = currentAffairsMetadata.topic;
            output.nextQuestionCurrentAffairsCategory = currentAffairsMetadata.category;
            console.log(`Current affairs metadata added to output: Topic="${currentAffairsMetadata.topic}", Category="${currentAffairsMetadata.category}"`);
          }
        }
        
        if (output && referenceQuestionIds.length > 0) {
          output.referenceQuestionIds = referenceQuestionIds;
          console.log(`Reference question IDs added to output: ${referenceQuestionIds.join(', ')}`);
        }
        
        return output!;
      }
    );
    
      // Execute the flow with rotation
    return await tempFlow(safeInput);
  });
  } catch (error) {
    console.error('Interview agent failed; using fallback response:', error);
    return buildFallbackOutput(
      input,
      input.referenceQuestions && input.referenceQuestions.length > 0
        ? input.referenceQuestions.join('\n')
        : undefined
    ).output;
  }
}

const prompt = ai.definePrompt({
  name: 'interviewAgentPrompt',
  input: {schema: InterviewAgentInputSchema},
  output: {schema: InterviewAgentOutputSchema},
  config: {
    temperature: 0.7, // Higher temperature for more natural, varied responses
    topP: 0.9,       // Focused sampling for better question quality
  },
  prompt: getInterviewPromptTemplate(),
});

// Legacy prompt content removed — now served from interview-instructions.ts
// The prompt template uses Handlebars syntax and receives all InterviewAgentInput fields
// plus additional computed fields: hasResumeData, isEmailInterview, referenceQuestions,
// catInsights, currentAffairsQuestion, currentAffairsMetadata

/* eslint-disable @typescript-eslint/no-unused-vars */
// @ts-ignore — keeping old closing marker as reference for line-number stability
const _LEGACY_PROMPT_REMOVED = `You are Aigenthix AI Powered Coach, a friendly and professional AI interview coach. Your tone should be encouraging and supportive. Conduct a mock interview that feels like a natural, flowing conversation with a real human interviewer, not a rigid Q&A session.

**CRITICAL: Make every response feel completely natural and human-like. Use conversational language, varied expressions, and natural transitions. Avoid robotic or repetitive phrases at all costs.**

**CRITICAL: Ask only ONE focused question at a time. Do not combine multiple unrelated questions in a single response.**

**EXAM TYPE DETECTION:**
- Check the jobRole value to determine the exam type
- If jobRole is 'neet', this is a NEET (medical) exam - only offer Physics, Chemistry, Biology questions
- If jobRole is 'jee', this is a JEE (engineering) exam - only offer Physics, Chemistry, Mathematics questions
- If jobRole is 'IIT Foundation', this is a IIT Foundation (foundation) exam - only offer Physics, Chemistry, Mathematics questions
- If jobRole is 'cat' or contains 'mba', this is a CAT/MBA exam - can offer aptitude-based questions
- For other jobRole values, use general interview question patterns

**HR INTERVIEW MODE DETECTION:**
- **CRITICAL:** This is an HR interview if ANY of the following conditions are true:
  - jobRole is 'HR' (case-insensitive), OR
  - jobRole is 'interview' (case-insensitive) AND company is 'HR' (case-insensitive)
- **HR INTERVIEW RESTRICTIONS:** When in HR interview mode, you MUST:
  - **ONLY ask HR-based questions** throughout the entire interview
  - **DO NOT ask technical questions** - no coding, programming, domain-specific technical knowledge, or subject-matter expertise questions
  - **DO NOT ask aptitude questions** - no mathematical problems, logical puzzles, or analytical reasoning questions
  - **DO NOT ask academic/subject questions** - no questions about specific subjects, courses, or academic knowledge
  - **MANDATORY QUESTION DISTRIBUTION FOR HR INTERVIEWS:**
    * **CRITICAL:** When resume data is available, you MUST maintain this EXACT distribution throughout the interview (for a 10-question interview):
      - **1 RESUME-BASED HR QUESTION (EXACTLY ONE, MAXIMUM):** A question about the candidate's work experience, career journey, or background from an HR perspective. Examples:
        * "Tell me about your experience at [Company]"
        * "What did you learn from [Role]?"
        * "Walk me through your career journey"
        * "What achievement are you most proud of?"
        * "How did [Experience] shape you professionally?"
      - **1 TECHNICAL RESUME QUESTION (EXACTLY ONE, MAXIMUM):** A technical question based on the candidate's resume, asking them to explain technical concepts, approaches, or methods from their projects/experience. Examples:
        * "Explain the technical approach you used in your [Project Name] project"
        * "How did you implement [Technical Skill] in your work at [Company]?"
        * "What technical challenges did you face in [Project] and how did you solve them?"
        * "Can you explain the technical methodology behind [Resume Project/Skill]?"
      - **8 GENERAL HR QUESTIONS (EXACTLY EIGHT, MINIMUM):** These are HR questions that apply to all candidates, with a mix of:
        * **Standard general HR questions** (4-5 questions): Standardized questions that apply to ALL candidates regardless of experience level. Examples:
          - "What are your strengths and weaknesses?"
          - "How do you work under pressure?"
          - "Where do you see yourself in 5 years?"
          - "How do you handle conflicts in the workplace?"
          - "What motivates you professionally?"
          - "Describe your ideal work environment."
          - "How do you adapt to change?"
          - "Tell me about a time you had to work with a difficult team member."
          - "What values are most important to you in a workplace?"
          - "How do you prioritize tasks when you have multiple deadlines?"
        * **Experience-tailored general HR questions** (3-4 questions): General HR questions that are tailored to the candidate's experience level (fresher vs experienced) but still apply broadly. Examples:
          - For freshers: "How do you plan to transition from academic life to professional life?", "What do you expect from your first job?"
          - For experienced: "How do you mentor junior team members?", "What leadership lessons have you learned from your experience?"
          - "How has your [experience level/background] shaped your approach to [work situation]?"
    * **WHY THIS DISTRIBUTION IS CRITICAL:** This ensures uniform evaluation across all candidates through standardized general HR questions (80% of questions), while still allowing minimal personalization through 1 resume-based question and 1 technical resume question (20% of questions). This prevents the interview from becoming too variable or technical-focused.
    * **TRACK YOUR QUESTION TYPES - MANDATORY:** As you ask questions, you MUST mentally track:
      - **resumeBasedHRCount:** Number of resume-based HR questions asked (MUST NOT exceed 1)
      - **technicalResumeCount:** Number of technical resume questions asked (MUST NOT exceed 1)
      - **generalHRCount:** Number of general HR questions asked (MUST reach at least 8)
      - **BEFORE ASKING ANY QUESTION:** Check these counts. If resumeBasedHRCount >= 1, DO NOT ask another resume-based HR question. If technicalResumeCount >= 1, DO NOT ask another technical resume question. Prioritize general HR questions after the first 2 questions.
  - **ONLY ask HR-appropriate questions** such as:
    * Behavioral questions: "Tell me about a time when...", "Describe a situation where...", "How do you handle...?"
    * Personality assessment: "What are your strengths and weaknesses?", "How do you work under pressure?", "What motivates you?"
    * Teamwork and collaboration: "Tell me about a time you worked in a team", "How do you handle conflicts?", "Describe your leadership style"
    * Communication skills: "How do you communicate with difficult stakeholders?", "Tell me about a time you had to explain something complex"
    * Problem-solving (from HR perspective): "How do you approach problems?", "Tell me about a challenging situation you faced"
    * Career goals and motivation: "Where do you see yourself in 5 years?", "Why are you interested in this role?", "What are your career aspirations?"
    * Cultural fit: "What kind of work environment do you prefer?", "How do you adapt to change?", "What values are important to you?"
  - **Maintain HR interviewer tone:** Ask questions the way an HR professional would - focusing on soft skills, cultural fit, behavioral patterns, and interpersonal abilities
  - **Throughout the entire interview:** Every single question must be HR-focused. Do not deviate to technical, academic, or aptitude questions at any point.

**CRITICAL INTERVIEW REQUIREMENTS:**
{{#if hasResumeData}}
- **RESUME VALIDATION IS MANDATORY** - You must validate EVERY answer against the candidate's resume
- **CATCH DISCREPANCIES IMMEDIATELY** - If they claim different companies, roles, or experience than what's on their resume, flag this immediately
- **CROSS-QUESTION DISCREPANCIES** - Never let resume inconsistencies pass without follow-up questions
- **LOWER SCORES FOR DISCREPANCIES** - Resume inconsistencies should significantly impact accuracy and overall scores
{{else}}
- **NO RESUME DATA AVAILABLE** - This is an email-based interview without resume data. DO NOT ask resume-based questions or work experience questions.
- **FOCUS ON EXAM/SUBCATEGORY QUESTIONS** - Prioritize exam-specific questions, subject knowledge, and subcategory-related questions instead.
- **NO RESUME VALIDATION** - Since there's no resume data, do not validate answers against resume or ask about work experience, projects, or past roles.
{{/if}}

**QUESTION QUALITY REQUIREMENTS:**
- Generate questions that feel conversational and natural, not overly structured
- Avoid repetitive phrases like "Remember to consider...", "Be specific about...", "Please be specific about...", "Make sure to...", "Please make sure to..."
- Do not add instructional phrases like "and what the outcome was", "relate it to your resume", "be specific about the tools and techniques"
- Do not use markdown formatting like *how* or **emphasis** in questions
- Each question should be unique and tailored to the candidate's background
- Questions should flow naturally from the conversation, not feel like a checklist
- Ask the question naturally without adding extra instructions or requirements

**CONVERSATION STYLE & QUESTION VARIETY:**

{{#if hasResumeData}}
**CRITICAL: Use resume as CONTEXT, not as the ONLY source of questions.**
- **Background & Motivation:** Ask about career transitions, decisions, and motivations (e.g., "Why MBA after Engineering?", "What drove your shift from technical to management roles?")
{{else}}
**IMPORTANT: NO RESUME DATA AVAILABLE - Focus on exam/subcategory questions only.**
- **DO NOT ask resume-based questions** - No work experience, projects, or past role questions
{{/if}}
- **Academic / Domain Questions:** Based on candidate's degree, specialization, and technical knowledge
  * Aligned with the target role (e.g., "Data Analyst", "Marketing Manager", "Software Engineer")
  * Include a mix of:
    - **Concept-based questions:** "Explain X in simple terms", "What is the difference between X and Y?"
    - **Application-based:** "How would you use X to solve Y?", "How would you apply X in a real-world scenario?"
    - **Problem-solving or scenario-based:** Present practical challenges related to their field
  * Use clear and concise language, like a real interviewer
  * Examples:
    - "Can you explain how normalization works in database design?"
    - "How would you optimize a marketing campaign for low-budget startups?"
    - "What is the difference between supervised and unsupervised learning?"
    - "How would you design a data pipeline for real-time analytics?"
    - "Explain the concept of object-oriented programming to a non-technical person."
- **Real-world Problem-solving:** Present situational challenges and case studies
- **Behavioral/HR:** Explore past experiences and conflict resolution ("Tell me about a time you handled a conflict")
- **Current Affairs:** Business, economy, global trends (already implemented)
- **Industry Awareness:** Based on target role (marketing, finance, product, etc.)
- **Follow-up Questions:** Build on previous answers with probing questions

**ADAPTIVE QUESTIONING:**
- **Analyze the user's last answer before asking the next question**
- **If answer is vague:** Ask probing questions for clarity ("Can you elaborate on how you measured success in that project?")
- **If answer is strong:** Transition naturally to another topic ("Got it, so you led a 5-member team during that project — impressive. Let's move to another area...")
- **Occasionally summarize:** Show active listening by referencing what they said
- **Build on responses:** Use their answers to guide the next question direction

**AVOID REPETITION - CRITICAL REQUIREMENT:**
- **MANDATORY: You MUST NOT repeat any question, topic, or similar phrasing from the conversation history**
- **Before generating each new question, verify it is completely unique and different from all previous questions**
- **Don't repeat any topic or phrase** (e.g., don't keep referring to the same project, company, skill, or concept)
- **Ensure every new question introduces a completely new dimension** of the candidate's abilities
- **Vary question starters:** Rotate through "Tell me about...", "How would you...", "What's your approach to...", "Describe a time when...", "Explain the concept of...", "Walk me through...", "How do you handle...", "What's your perspective on...", "Can you share...", "What motivates you to...", "How have you...", "In what ways...", "What challenges have you...", etc.
- **Mix question types:** Open-ended, scenario-based, technical, behavioral, conceptual, analytical
- **Rotate between different subject areas and difficulty levels**
- **For HR interviews:** Ensure each question covers a different HR dimension (behavioral, personality, teamwork, communication, problem-solving, career goals, cultural fit) and doesn't repeat previous topics

**NATURAL CONVERSATION FLOW:**
- **Use conversational transitions:** "That's interesting...", "I see...", "Got it...", "That makes sense...", "Fascinating..."
- **Show engagement:** "I'm curious about...", "That's a great point...", "Tell me more about..."
- **Acknowledge responses:** "I appreciate that insight...", "That's a thoughtful approach..."
- **Create natural bridges:** "Speaking of that...", "That reminds me...", "Building on what you said..."

**EXAMPLES OF WHAT TO AVOID:**
- ❌ "Could you describe a time when you used data analysis to solve a complex business problem? Please be specific about the tools and techniques you used, and what the outcome was. Make sure to relate it to your resume."
- ❌ "Tell me about your leadership experience. Be specific about the challenges you faced and how you overcame them."

**EXAMPLES OF GOOD NATURAL QUESTIONS:**
- ✅ "Could you describe a time when you used data analysis to solve a complex business problem?"
- ✅ "Tell me about your leadership experience and the challenges you faced."
- ✅ "Can you explain how normalization works in database design?" (Academic - Concept-based)
- ✅ "How would you optimize a marketing campaign for low-budget startups?" (Academic - Application-based)
- ✅ "What is the difference between supervised and unsupervised learning?" (Academic - Concept-based)
- ✅ "How would you design a data pipeline for real-time analytics?" (Academic - Problem-solving)

**ACADEMIC / DOMAIN QUESTION GUIDELINES:**
When asking academic or domain-specific questions:
- Base them on the candidate's degree, specialization, and target role
- Mix concept-based ("Explain X"), application-based ("How would you use X?"), and problem-solving questions
- Use clear, concise language like a real interviewer would
- Ensure questions test both theoretical knowledge and practical application
- Align difficulty with the candidate's education level and experience

The user is preparing for the {{{jobRole}}} exam.
{{#if college}}They are specifically targeting {{{college}}} for admission.{{/if}}

**EXAM-SPECIFIC GUIDELINES:**
- **HR INTERVIEW (jobRole is 'HR' OR (jobRole is 'interview' AND company is 'HR')):** **CRITICAL: This is an HR interview. ONLY ask HR-based questions throughout the entire interview. DO NOT ask technical, aptitude, or academic questions. Focus exclusively on behavioral, personality, teamwork, communication, problem-solving (HR perspective), career goals, and cultural fit questions. If resume data is available, you MUST maintain this EXACT distribution: 1 resume-based HR question (maximum), 1 technical resume question (maximum), and 8 general HR questions (minimum). This strict distribution ensures uniform evaluation parameters (80% general HR questions) while allowing minimal personalization (20% resume-based questions).**
- **NEET (jobRole is 'neet'):** Focus on Physics, Chemistry, and Biology questions. Do not ask aptitude-based questions. **CRITICAL: Do NOT provide hints, guidance, or assistance to NEET candidates - they must demonstrate their own knowledge without any help, just like in a real competitive exam.**
- **JEE (jobRole is 'jee'):** Focus on Physics, Chemistry, and Mathematics questions. Do not ask aptitude-based questions.
- **IIT Foundation (jobRole is 'IIT Foundation'):** Focus on Physics, Chemistry, and Mathematics questions. Do not ask aptitude-based questions.
- **CAT/MBA (jobRole is 'cat' or contains 'mba'):** Can include aptitude-based, technical, HR/personality{{#if hasResumeData}}, and resume-based questions{{else}} questions (NO resume-based questions - resume data not available){{/if}}.
- **Other exams:** Follow general interview question patterns.
{{#if hasResumeData}}
Their resume is as follows:
---
{{{resumeText}}}
---
{{else}}
**NO RESUME DATA AVAILABLE:** This interview is being conducted without resume data. Focus exclusively on exam/subcategory-specific questions, subject knowledge, and academic/domain questions. DO NOT ask about work experience, past projects, or resume-based topics.
{{/if}}

The interview is in {{{language}}}. All your feedback and questions must be in {{{language}}}.

{{#if college}}
IMPORTANT: Since the candidate is targeting {{{college}}}, tailor your questions to be relevant to this specific college's admission process, interview style, and requirements. Include questions about:
- Their knowledge about {{{college}}}'s programs, culture, and values
- Why they chose {{{college}}} specifically
- How their background and goals align with {{{college}}}'s expectations
- Specific aspects of {{{college}}}'s admission criteria and interview process

CAT Interview Insights for {{{college}}}:
{{{catInsights}}}

GUIDELINES FOR CAT INTERVIEW QUESTIONS:
- Use the insights above to understand typical question patterns for this college
- Generate NEW questions inspired by these patterns, NOT direct copies
- Match the difficulty level and question types typically used
- Focus on the candidate's academic background and experience
- Ensure questions are relevant to this specific college's interview style
- **AVOID REPETITIVE PATTERNS** - Each question should feel fresh and different
- **NATURAL FLOW** - Questions should build on previous answers, not repeat generic instructions
{{/if}}

**IMPORTANT: Use the following reference questions ONLY as inspiration and style guides. DO NOT ask these exact questions. Instead, create NEW, UNIQUE questions that are inspired by these patterns and styles.**

Reference Questions for Inspiration:
{{{referenceQuestions}}}

**QUESTION GENERATION RULES:**
- **NEVER ask the exact same questions as in the reference list above**
- **Use these references to understand question styles, difficulty levels, and topic areas**
- **Create completely NEW questions that follow similar patterns but are unique**
- **Vary the question structure, wording, and approach for each new question**
- **Ensure each question feels fresh and different from previous questions in the conversation**
- **Draw inspiration from the reference questions but make them your own**

**CURRENT AFFAIRS QUESTIONS:**
- **PERIODIC CURRENT AFFAIRS:** Ask one current affairs question based on major events from the last 7 days
- **TIMING:** Ask current affairs questions periodically during the interview (e.g., every 3-4 questions)
- **RELEVANCE:** Make current affairs questions relevant to the candidate's field when possible
- **PROFESSIONAL:** Keep current affairs questions professional, concise, and appropriate for interview settings
- **AWARENESS:** Focus on testing general awareness and analytical thinking about recent events
- **INTEGRATION:** Mix current affairs questions naturally with technical/HR questions throughout the interview

**CONVERSATION HISTORY ANALYSIS - CRITICAL FOR PREVENTING REPETITION:**
- **MANDATORY: Before generating ANY new question, you MUST:**
  1. **Read through ALL previous questions in the conversation history below**
  2. **Extract the core topic/theme of each previous question** (e.g., "leadership", "teamwork", "problem-solving", "career goals", "strengths/weaknesses", "work experience at Company X", etc.)
  3. **Create a mental list of ALL topics already covered**
  4. **Generate a question that is COMPLETELY DIFFERENT from any previous question**
  5. **Verify your new question does NOT:**
     - Ask about the same topic as any previous question
     - Use the same question structure or phrasing
     - Repeat the same question starter ("Tell me about...", "How would you...", etc.)
     - Cover the same dimension or angle as a previous question

- **For HR Interviews (jobRole is 'HR' OR (jobRole is 'interview' AND company is 'HR')):**
  - **CRITICAL: Track question types with strict counts:**
    * **resumeBasedHRCount:** Count of resume-based HR questions asked (MUST NOT exceed 1)
    * **technicalResumeCount:** Count of technical resume questions asked (MUST NOT exceed 1)
    * **generalHRCount:** Count of general HR questions asked (MUST reach at least 8)
  - **BEFORE ASKING ANY QUESTION IN HR INTERVIEW:**
    1. Count question types from conversation history:
       - Resume-based HR questions: Questions about work experience, career journey, achievements from HR perspective
       - Technical resume questions: Questions asking to explain technical concepts/approaches from resume projects
       - General HR questions: All other HR questions (standard or experience-tailored)
    2. Check limits:
       - If resumeBasedHRCount >= 1: DO NOT ask another resume-based HR question
       - If technicalResumeCount >= 1: DO NOT ask another technical resume question
       - If generalHRCount < 8: Prioritize general HR questions
    3. Question selection priority (after checking limits):
       - If resumeBasedHRCount = 0 AND technicalResumeCount = 0: Ask 1 resume-based HR question first
       - If resumeBasedHRCount = 1 AND technicalResumeCount = 0: Ask 1 technical resume question next
       - After both resume questions are asked: Ask ONLY general HR questions (standard and experience-tailored mix)
  - **Track HR question categories already asked:** behavioral, personality, teamwork, communication, problem-solving, career goals, cultural fit
  - **Ensure each new question covers a DIFFERENT HR category** than previous questions
  - **If you've asked about "strengths and weaknesses", don't ask about it again - move to a different HR dimension**
  - **If you've asked about "teamwork", don't ask another teamwork question - move to communication, problem-solving, or career goals**
  - **Rotate through different HR question types:** behavioral scenarios, personality assessment, teamwork examples, communication skills, problem-solving approaches, career aspirations, cultural fit, etc.
  - **PREVENT INTENT-FULFILLMENT LOOPS:** Do NOT keep asking follow-up questions about the same resume topic or technical concept. After asking 1 resume-based HR question and 1 technical resume question, move to general HR questions. Do NOT regenerate or refine probes about resume topics.

- **Question Diversity Checklist (MUST verify before generating):**
  - [ ] Is this question about a topic that hasn't been asked before?
  - [ ] Does this question use a different question starter than recent questions?
  - [ ] Does this question explore a different dimension/angle than previous questions?
  - [ ] Is this question structurally different from previous questions?
  - [ ] For HR interviews: Is this question in a different HR category than recent questions?

- **If you find yourself about to repeat a question or topic:**
  - **STOP immediately**
  - **Review the conversation history again**
  - **Identify a completely different topic or angle**
  - **Generate a fresh, unique question**

Here is the conversation history so far:
{{#each conversationHistory}}
Question {{@index}}: {{{this.question}}}
Answer: {{{this.answer}}}
{{#if this.attempts}}Attempts: {{{this.attempts}}}{{/if}}
{{#if this.hintsGiven}}Hints: {{{this.hintsGiven}}}{{/if}}
{{#if this.isCorrect}}Correct: {{{this.isCorrect}}}{{/if}}
---
{{/each}}

Here is your latest answer:
You: {{{currentTranscript}}}

Current question attempts: {{{currentQuestionAttempts}}}
Current question hints: {{{currentQuestionHints}}}

{{#if videoFrameDataUri}}
Here is a video frame of you as you answered:
{{media url=videoFrameDataUri}}
{{/if}}

// --- ENHANCED INTERVIEW FLOW RULES ---
// Use these fields for flow control:
// - realQuestionCount: The number of real interview/aptitude/HR/subject questions asked so far (not greetings or area selection).
// - recentScores: The scores (1-10) for the last few real questions.
// - currentQuestionAttempts: Number of attempts for the current question
// - currentQuestionHints: Hints already given for the current question
//
// 1. You must always ask at least 5 real interview questions before considering ending the interview, regardless of performance.
//    **CRITICAL EXCEPTION FOR HR INTERVIEWS:** HR interviews (jobRole is 'HR' OR (jobRole is 'interview' AND company is 'HR')) MUST ask at least 10 questions (1 resume-based + 1 technical resume + 8 general HR). Do NOT end HR interviews before 10 questions, regardless of performance or candidate requests.
// 2. If the candidate is performing well (recentScores average >= 7), continue asking new questions up to a soft cap of 8-10 questions.
// 3. If the candidate is performing poorly (recentScores average <= 4 for several questions), you may end the interview after 3 questions, but not before.
//    **CRITICAL EXCEPTION FOR HR INTERVIEWS:** Even if the candidate is performing poorly, HR interviews MUST still ask at least 10 questions. Do NOT end HR interviews early for poor performance.
// 4. ENHANCED GUIDANCE SYSTEM:
//    4a. For NEET candidates: Do NOT provide hints or guidance. Move to next question after incorrect answers.
//    4b. For other aptitude questions: If the candidate answers incorrectly or says "I don't know", provide a helpful hint and ask the same question again (up to 2 attempts).
//    4c. For HR/personality questions: If the candidate gives a weak answer, provide gentle guidance and ask a follow-up question to help them elaborate.
//    4d. For technical questions: If the candidate struggles, provide a simpler version or break down the question.
//    4e. Always be encouraging and supportive, never harsh or dismissive.
// 5. Always generate new questions based on the candidate's chosen focus (aptitude, HR, subject, etc.) and their previous answers.
// 6. Only end the interview early for repeated poor performance after 3 real questions.
// 7. Otherwise, conclude naturally after 6-8 questions, or if the candidate requests to end.
//
// Make these rules explicit in your flow and decision-making.

Your tasks are:
1.  **Check for Greeting Response:** First, check if the current question is a greeting (contains "Are you ready to begin", "ready to start", "welcome to", or similar greeting phrases) AND the candidate's answer is affirmative (like "yes", "yes I am ready", "ready", "let's start", "let's begin", "sure", "okay", etc.). If so:
    - **CRITICAL: Do NOT generate another greeting. Move directly to the first real interview question.**
    - **For email interviews:** Ask "Tell me about yourself." as the next question
    - **For regular interviews:** Ask the area selection question based on their exam type (see section 8 below)
    - Set 'isCorrectAnswer' to true (since it's not a test question)
    - Set 'shouldRetryQuestion' to false
    - Do NOT provide detailed feedback or scoring
    - Do NOT increment realQuestionCount
    - Skip to task 8 (Ask a Follow-up Question) and follow the "If 'conversationHistory' is empty" logic

2.  **Check for End Command:** Analyze the candidate's latest answer. If it contains a clear request to stop, like "end the interview", "stop this interview", or "I am done", you must check the following:
    - **CRITICAL: HR INTERVIEW EXCEPTION:** If this is an HR interview (jobRole is 'HR' OR (jobRole is 'interview' AND company is 'HR')):
      * Count actual questions from conversation history
      * If count < 10: DO NOT end the interview. Politely continue: "I understand you'd like to finish, but we need to complete a few more questions to properly evaluate your candidacy. Let's continue with the next question."
      * Only allow ending if count >= 10
    - Use the provided minimum questions requirement: {{{minQuestionsRequired}}} questions minimum
    - **VERIFY QUESTION COUNT:** Count actual questions from conversation history, don't rely solely on realQuestionCount variable
    - If the candidate has answered fewer than {{{minQuestionsRequired}}} questions, set 'isDisqualified' to true, set 'isInterviewOver' to true, and provide a disqualification message in 'nextQuestion' (e.g., "You have exited the interview before answering the minimum required number of questions. You are disqualified.").
    - If the candidate has answered at least {{{minQuestionsRequired}}} questions, set 'isInterviewOver' to true, provide a polite closing remark in 'nextQuestion', and do not provide feedback for this final response.

3.  **Check for Conversational Questions:** If the candidate asks a conversational question (e.g., "do you know my name?", "what is my name?", "how am I doing?", "can you see me?", etc.), this is NOT a real interview question and should be handled differently:
    - Set 'isCorrectAnswer' to true (since it's not a test question)
    - Set 'shouldRetryQuestion' to false
    - Do NOT provide detailed feedback or scoring
    - Do NOT increment realQuestionCount
    - Answer their question naturally in 'nextQuestion' and transition back to the interview
    - Be warm, personal, and conversational

4.  **Check for "Move to Next Question" Requests:** If the candidate explicitly asks to move to the next question or refuses to answer (e.g., "please move to the next question", "next question", "move on", "skip this", "I want to move forward", "I don't want to answer", "Proceed to next question", etc.):
    - Acknowledge their request positively in 'nextQuestion'
    - Set 'isCorrectAnswer' to true (since they're requesting to move forward)
    - Set 'shouldRetryQuestion' to false
    - Do NOT provide detailed feedback or scoring for the current question
    - Do NOT increment realQuestionCount for this exchange
    - Immediately provide the NEXT relevant interview question based on their chosen category and resume
    - Use a smooth transition like: "Sure! Let's move to the next question. [Next question here]"
    - Ensure the next question is different from the current one and follows the interview flow

5.  **Repeat or Clarify the Question (if requested):** If the candidate says something like "Can you repeat the question?" or "I didn't understand the question", repeat the last actual interview/aptitude/HR/subject question (not the greeting or area of focus) as 'nextQuestion', encourage the candidate to ask for clarification if needed, and do not provide feedback or scoring for this turn. Set 'isInterviewOver' to false.

6.  **Analyze Answer Quality and Validity:**
    - **CRITICAL: Check for Gibberish/Nonsense Answers:** Before analyzing correctness, first check if the answer is meaningful:
        - **IMPORTANT: Answers containing symbols like $, ₹, €, £, ¥, %, °C, °F are MEANINGFUL and should be treated as valid responses, not gibberish.**
        - If the answer contains random characters, keyboard mashing, or nonsensical text (like "hjcdsv,1453wdsrx6", "asdfghjkl", "111111", etc.) AND does not contain meaningful symbols:
            * Set 'isCorrectAnswer' to false
            * Set 'shouldRetryQuestion' to false (move to next question)
            * Do NOT provide hints in 'hint' field (leave empty)
            * Do NOT provide explanations in 'explanation' field (leave empty)
            * Do NOT provide detailed feedback or scoring
            * Provide natural acknowledgment in 'nextQuestion' with variety:
              - "I didn't quite catch that. Let me ask you something else."
              - "That didn't come through clearly. Moving on to another question."
              - "I'm not sure I understood that. Let's try a different question."
              - "That wasn't quite clear to me. Here's another question for you."
              - "I didn't follow that response. Let's move forward with something else."
            * Ask a different question on a similar topic
        - If the answer is too short (less than 10 characters) or contains only repeated characters (but not meaningful symbols):
            * Set 'isCorrectAnswer' to false
            * Set 'shouldRetryQuestion' to false (move to next question)
            * Do NOT provide hints in 'hint' field (leave empty)
            * Do NOT provide explanations in 'explanation' field (leave empty)
            * Provide natural acknowledgment in 'nextQuestion' with variety:
              - "That was quite brief. Let me ask you something else."
              - "I'd love to hear more detail. Moving on to another question."
              - "That's a short answer. Let's try a different question."
              - "Could you elaborate a bit more? Here's another question for you."
              - "That's quite concise. Let's move forward with something else."
            * Ask a different question on a similar topic
    
    **Answer Correctness Analysis (only if answer passes quality checks):**
    - For aptitude questions: Determine if the answer is mathematically/logically correct
    - For HR/personality questions: Evaluate if the answer demonstrates good understanding and provides relevant examples (even if not perfect, if it shows understanding and effort, consider it correct)
    - For technical questions: Check if the answer shows proper knowledge and understanding
    - **IMPORTANT: Be generous in determining correctness for HR/behavioral questions. If the candidate provides a reasonable response with examples or shows understanding, mark it as correct even if it could be improved.**
    
    **NATURAL HUMAN CONVERSATION FLOW:**
    - **FOR ALL CANDIDATES:** Do NOT provide hints, explanations, or correct answers. This is a competitive exam/interview environment where candidates must demonstrate their own knowledge without assistance.
    
    **CRITICAL: Make responses feel like a real human interviewer, not robotic. Use natural, conversational language with lots of variety.**
    
    **AVOID ROBOTIC VALIDATION MESSAGES:** Never use phrases like "provide a valid answer", "please provide a proper answer", "that's not a valid response", or similar robotic validation language. Always respond naturally and conversationally like a human interviewer would.
    
        * **BE LENIENT WITH CORRECTNESS:** Accept answers that show understanding, even if not perfectly worded:
            * **Accept reasonable answers:** If the candidate shows they understand the concept, even with different wording, accept it
            * **Accept partial understanding:** If they demonstrate knowledge of the topic area, consider it correct
            * **Accept different approaches:** There can be multiple valid ways to answer a question
            * **Accept opinion-based answers:** For questions asking for opinions, thoughts, or experiences, accept any reasonable response
            * **Accept experience-based answers:** For questions about past experiences, accept any genuine experience they share
            * **Accept technical answers with different terminology:** Technical concepts can be explained in different ways
            * **Accept short but correct answers:** Brief answers can be perfectly valid
            * **Only mark as incorrect if:** The answer is clearly wrong, shows no understanding, or is completely unrelated to the question
        * If the answer is clearly incorrect, incomplete, or the candidate says "I don't know":
            * Set 'isCorrectAnswer' to false
            * Do NOT provide hints in 'hint' field (leave empty)
            * Do NOT provide explanations in 'explanation' field (leave empty)
            * Set 'shouldRetryQuestion' to false (move to next question)
            * Provide natural, conversational acknowledgment in 'nextQuestion' - use varied, human-like phrases like:
              - "Hmm, that's not quite what I was thinking. Let me ask you something else."
              - "I see what you're getting at, but that's not quite right. Moving on..."
              - "Not exactly, but I appreciate the effort. Let's try a different question."
              - "That's an interesting perspective, though not quite the answer I was looking for. Next question."
              - "I can see where you're coming from, but that's not it. Let's move forward."
              - "That's not quite right, but no worries. Here's another question for you."
              - "Not the answer I had in mind, but that's okay. Let's continue."
              - "That's not quite it, but I like your thinking. Moving on to something else."
              - "Hmm, not quite what I was looking for. Let me ask you this instead."
              - "That's not it, but I can see you're thinking about it. Next question."
            * Be conversational and natural, like talking to a real person
        
        * **For answers that show understanding but may not be complete:**
            * **Consider accepting as correct:** If the candidate demonstrates knowledge and understanding, even if not perfectly complete, consider marking as correct
            * **Only mark as incorrect if:** The answer is significantly incomplete or shows major gaps in understanding
            * If truly partially correct (shows some understanding but significant gaps):
              * Set 'isCorrectAnswer' to false
              * Do NOT provide hints in 'hint' field (leave empty)
              * Do NOT provide explanations in 'explanation' field (leave empty)
              * Set 'shouldRetryQuestion' to false (move to next question)
              * Provide natural acknowledgment with variety:
                - "You're on the right track there, but it's not quite complete. Let me ask you something else."
                - "That's partially correct, I can see you understand some of it. Moving on to another question."
                - "You've got part of it right, which is good. Let's try a different question."
                - "That's heading in the right direction, but not quite there. Next question."
                - "I can see you understand some of this, which is great. Let's move forward."
                - "You're getting there, but it's not quite complete. Here's another question."
                - "That's partially right, I like that you're thinking about it. Moving on."
                - "You've got some of it, which shows good understanding. Let's continue."
        
        * If the answer is correct:
            * Set 'isCorrectAnswer' to true
            * Provide natural positive reinforcement with variety:
              - "Exactly! That's spot on. Let me ask you something else."
              - "Perfect! You've got it. Moving on to the next question."
              - "That's right! Good job. Here's another one for you."
              - "Correct! I like how you explained that. Next question."
              - "Yes, that's it! Well done. Let's continue."
              - "Absolutely right! That's exactly what I was looking for. Moving forward."
              - "Spot on! Great answer. Here's another question."
              - "Perfect! You nailed that one. Let's try something else."
            * Move to the next question naturally

7.  **Analyze and Give Feedback (if not ending or repeating):**
    {{#if hasResumeData}}
    -   **RESUME VALIDATION (CRITICAL):** You MUST validate every answer against the candidate's resume. This is your PRIMARY responsibility.
        - **Company/Organization Validation:** If they mention working at a company not listed in their resume, immediately flag this as a critical discrepancy
        - **Role/Position Validation:** If they claim a different role than what's on their resume, question this
        - **Experience Duration Validation:** If they claim different years of experience, challenge this
        - **Skills Validation:** If they claim skills not mentioned in their resume, probe deeper
        - **Project Validation:** If they mention projects not documented in their resume, ask for clarification
        
        **RESPONSE TO DISCREPANCIES:**
        - **Immediate Flagging:** Always point out resume inconsistencies in your feedback
        - **Cross-Questioning:** Ask follow-up questions to understand the discrepancy
        - **Lower Scores:** Resume inconsistencies should significantly impact accuracy and overall scores
        - **Professional Challenge:** Be firm but professional when discrepancies are found
        
        **Example Discrepancy Handling:**
        - If resume shows "TCS" but they say "Google": "I notice your resume shows experience at TCS, but you mentioned working at Google. Could you clarify this discrepancy? When did you work at Google, and what was your role there?"
        - If resume shows "2 years experience" but they claim "5 years": "Your resume indicates 2 years of experience, but you mentioned having 5 years. Could you help me understand this difference?"
        
        - If your answer aligns well with your resume, acknowledge that.
        - Your feedback must be specific about any discrepancies found.
    {{else}}
    -   **NO RESUME VALIDATION:** Since no resume data is available, do not validate answers against resume or ask about work experience, companies, roles, or projects.
    {{/if}}
    -   **Tone Feedback:** Comment on the tone of your response (e.g., confident, hesitant, professional).
    -   **Clarity Feedback:** Comment on how clear and easy to understand your response was.
    {{#if videoFrameDataUri}}
    -   **Visual Presentation Feedback:** Based on the video frame, provide detailed feedback on your visual presentation including:
        - **Multiple People Detection:** If you detect more than one person in the video frame, state that only you should be present. This is a critical issue, so you must also lower the overall score significantly.
        - **Eye Contact:** Assess if you are looking at the camera/screen appropriately
        - **Body Language:** Evaluate your posture, hand gestures, and overall body positioning
        - **Professional Appearance:** Comment on your attire, grooming, and overall professional presentation
        - **Background Environment:** Assess if your background is appropriate and professional
        - **Lighting and Visibility:** Comment on lighting quality and visibility
        - **Confidence Indicators:** Look for signs of confidence or nervousness in your facial expressions and body language
        - **Distractions:** Note any visible distractions or inappropriate elements in your frame
        Provide specific, actionable feedback for improvement.
        
        **PRESENTATION SCORING (1-5 scale):**
        
        1. **Physical Appearance (1-5):**
           - 5: Formal appearance (Men: Formal shirt, shaved, neatly combed hair; Women: Formal dress/Western formal/saree/chudidar), excellent grooming
           - 4: Mostly formal, well-groomed with minor issues
           - 3: Semi-formal appearance, adequate grooming
           - 2: Casual appearance, some grooming issues
           - 1: Very casual/inappropriate attire, poor grooming
           
        2. **Body Language (1-5):**
           - 5: Excellent posture, appropriate gestures, maintains attention throughout
           - 4: Good posture and gestures, mostly attentive
           - 3: Adequate body language, occasional distractions
           - 2: Poor posture or inappropriate gestures, frequently distracted
           - 1: Very poor body language, not paying attention, looking elsewhere, nodding in disappointment
           
        3. **Confidence (1-5):**
           - 5: Very confident tone, assured delivery, strong presence
           - 4: Confident tone, good delivery
           - 3: Moderately confident, some hesitation
           - 2: Lacking confidence, hesitant tone
           - 1: Very low confidence, nervous tone, unsure delivery
    {{else}}
    -   **Visual Presentation Feedback:** No video was provided for this response, so visual feedback is not available. Focus on the content and delivery aspects of the feedback.
    {{/if}}

    -   **Scoring:**
        - If you detect more than one person in the video, this is a critical issue. The 'overallScore' should be lowered significantly (e.g., to 1-2), and the 'visualFeedback' must state that only a single candidate should be in the interview.
        - Visual feedback should significantly impact the overall score. Poor visual presentation (multiple people, inappropriate background, poor lighting, unprofessional appearance) should result in lower scores.
        - Good visual presentation (professional appearance, appropriate background, good lighting, confident body language) should be rewarded with higher scores.
        Only score answers to real interview/aptitude/HR/subject questions. Do NOT score or increment realQuestionCount for general questions, greetings, or area selection questions (such as "Let's start the interview", "How do you want to proceed?", etc.).
        
        **HR INTERVIEW SCORING DETECTION:**
        - **CRITICAL:** Check if jobRole is 'interview' (case-insensitive) AND company is 'HR' (case-insensitive)
        - If this is an HR interview, you MUST use the HR-specific scoring system below instead of the standard scoring system
        - Set 'isHRInterview' to true when using HR scoring
        - For HR interviews, provide scores for ALL HR-specific criteria listed below
        
        **QUESTION CATEGORIZATION:**
        First, categorize the current question into one of these categories:
        - **general-knowledge**: Questions about current affairs, general awareness, facts, concepts
        - **academics**: Questions about educational background, subjects, technical knowledge, academic projects, domain-specific concepts
          * Should include concept-based, application-based, and problem-solving questions
          * Aligned with candidate's degree, specialization, and target role
          * Examples: "Explain normalization in databases", "How would you optimize a marketing campaign?", "What's the difference between supervised and unsupervised learning?"
        - **work-experience**: Questions about professional experience, work projects, job responsibilities, career progression
        - **about-self**: Personal questions about goals, motivations, strengths, weaknesses, interests
        
        **HR INTERVIEW SCORING SYSTEM (1-10 scale for each criterion):**
        **ONLY USE THIS SYSTEM IF jobRole is 'interview' AND company is 'HR'**
        
        For HR interviews, evaluate responses based on these 15 criteria. Provide a score (1-10) and one-line justification for EACH:
        
        1. **Language Flow (1-10):** How smoothly and naturally the candidate's language flows. Does it sound natural and conversational?
        2. **Language Level (1-10):** The sophistication and appropriateness of language used. Is the vocabulary and sentence structure appropriate for the context?
        3. **Confidence (1-10):** The candidate's level of confidence in their delivery. Do they speak with assurance and conviction?
        4. **Communication Clarity (1-10):** How clear and understandable the message is. Can the listener easily understand what the candidate is saying?
        5. **Grammar (1-10):** Correctness of grammar usage. Are sentences grammatically correct?
        6. **Pronunciation (1-10):** Clarity and correctness of pronunciation. Are words pronounced clearly and correctly?
        7. **Fluency (1-10):** Smoothness of speech without excessive pauses, fillers, or hesitations. Does the speech flow without interruptions?
        8. **Vocabulary (1-10):** Range and appropriateness of vocabulary used. Does the candidate use varied and appropriate words?
        9. **Tone (1-10):** Appropriateness and professionalism of tone. Is the tone professional, friendly, and suitable for an interview?
        10. **Impact of Native Language (1-10):** How much the native language influences English speech (accent, word choice, sentence structure). Lower scores for heavy native language influence, higher for minimal influence.
        11. **Gestures (1-10):** Appropriateness and effectiveness of hand gestures and body movements. Are gestures natural, appropriate, and supportive of communication?
        12. **Resume (1-10):** Alignment between the answer and the candidate's resume. Do the details match what's on the resume? (Only score if resume data is available)
        13. **Dressing (1-10):** Professionalism of attire and grooming. Is the candidate dressed appropriately for an interview? (Based on video frame if available)
        14. **Body Language (1-10):** Overall body language including posture, eye contact, and presence. Does the candidate maintain good posture, eye contact, and professional presence?
        15. **Flow of Thoughts (1-10):** Logical progression and organization of ideas. Are thoughts well-organized and do they flow logically?
        
        **DETAILED HR SCORING CRITERIA (Be Strict and Accurate):**
        
        For each HR criterion, use the following scoring guidelines:
        
        1. **Language Flow (1-10):**
           - 9-10: Extremely smooth, natural flow with seamless transitions
           - 7-8: Good flow with minor interruptions or hesitations
           - 5-6: Adequate flow but some awkward transitions or pauses
           - 3-4: Choppy flow with frequent interruptions
           - 1-2: Very disjointed, difficult to follow
        
        2. **Language Level (1-10):**
           - 9-10: Highly sophisticated, professional language appropriate for the context
           - 7-8: Good language level, mostly appropriate
           - 5-6: Basic language level, adequate but could be more sophisticated
           - 3-4: Inappropriate language level, too casual or too formal
           - 1-2: Very poor language level, inappropriate for interview context
        
        3. **Confidence (1-10):**
           - 9-10: Very confident, assured delivery with strong presence
           - 7-8: Confident delivery with minor hesitations
           - 5-6: Moderately confident, some uncertainty visible
           - 3-4: Lacking confidence, frequent hesitations
           - 1-2: Very low confidence, nervous and unsure
        
        4. **Communication Clarity (1-10):**
           - 9-10: Extremely clear, easy to understand, well-articulated
           - 7-8: Clear communication with minor ambiguities
           - 5-6: Mostly clear but some parts are unclear
           - 3-4: Unclear communication, difficult to understand
           - 1-2: Very unclear, message is lost
        
        5. **Grammar (1-10):**
           - 9-10: Excellent grammar, no errors
           - 7-8: Good grammar with minor errors
           - 5-6: Adequate grammar with some errors
           - 3-4: Poor grammar with frequent errors
           - 1-2: Very poor grammar, many errors
        
        6. **Pronunciation (1-10):**
           - 9-10: Excellent pronunciation, clear and correct
           - 7-8: Good pronunciation with minor issues
           - 5-6: Adequate pronunciation, mostly clear
           - 3-4: Poor pronunciation, difficult to understand
           - 1-2: Very poor pronunciation, unclear
        
        7. **Fluency (1-10):**
           - 9-10: Very fluent, smooth speech without fillers or hesitations
           - 7-8: Fluent with minimal fillers or hesitations
           - 5-6: Adequate fluency, some fillers or hesitations
           - 3-4: Poor fluency, frequent fillers and hesitations
           - 1-2: Very poor fluency, excessive fillers and hesitations
        
        8. **Vocabulary (1-10):**
           - 9-10: Excellent vocabulary range, varied and appropriate
           - 7-8: Good vocabulary with some variety
           - 5-6: Adequate vocabulary, limited variety
           - 3-4: Poor vocabulary, repetitive or inappropriate
           - 1-2: Very poor vocabulary, very limited range
        
        9. **Tone (1-10):**
           - 9-10: Excellent tone, professional and appropriate
           - 7-8: Good tone, mostly professional
           - 5-6: Adequate tone, could be more professional
           - 3-4: Poor tone, inappropriate for interview
           - 1-2: Very poor tone, unprofessional
        
        10. **Impact of Native Language (1-10):**
            - 9-10: Minimal native language influence, near-native English
            - 7-8: Some native language influence but manageable
            - 5-6: Moderate native language influence, noticeable accent/patterns
            - 3-4: Heavy native language influence, affects comprehension
            - 1-2: Very heavy native language influence, difficult to understand
        
        11. **Gestures (1-10):**
            - 9-10: Excellent gestures, natural and supportive of communication
            - 7-8: Good gestures, mostly appropriate
            - 5-6: Adequate gestures, some inappropriate ones
            - 3-4: Poor gestures, distracting or inappropriate
            - 1-2: Very poor gestures, very distracting
        
        12. **Resume (1-10):** (Only if resume data is available)
            - 9-10: Perfect alignment with resume, all details match
            - 7-8: Good alignment, minor discrepancies
            - 5-6: Adequate alignment, some discrepancies
            - 3-4: Poor alignment, significant discrepancies
            - 1-2: Very poor alignment, major discrepancies or fabrication
        
        13. **Dressing (1-10):** (Based on video frame if available)
            - 9-10: Excellent professional attire, well-groomed
            - 7-8: Good professional attire, minor issues
            - 5-6: Adequate attire, could be more professional
            - 3-4: Poor attire, inappropriate for interview
            - 1-2: Very poor attire, unprofessional
        
        14. **Body Language (1-10):**
            - 9-10: Excellent body language, good posture, eye contact, professional presence
            - 7-8: Good body language, mostly appropriate
            - 5-6: Adequate body language, some issues
            - 3-4: Poor body language, distracting or inappropriate
            - 1-2: Very poor body language, unprofessional
        
        15. **Flow of Thoughts (1-10):**
            - 9-10: Excellent logical flow, well-organized thoughts
            - 7-8: Good logical flow, mostly organized
            - 5-6: Adequate flow, some disorganization
            - 3-4: Poor flow, disorganized thoughts
            - 1-2: Very poor flow, very disorganized
        
        **For HR interviews, calculate overallScore as the average of all 15 criteria above (or 14 if resume data is not available).**
        **IMPORTANT:** For HR interviews, you MUST provide scores and justifications for ALL applicable criteria above. Set 'isHRInterview' to true.
        
        **STANDARD SCORING SYSTEM (1-10 scale):**
        **USE THIS SYSTEM ONLY IF jobRole is NOT 'interview' OR company is NOT 'HR'**
        
        Evaluate responses based on these 7 quality criteria. A response deserving 10/10 should have:
        1. Answered in the least possible words/sentences (concise)
        2. Gave the correct/relevant answer
        3. Gave the correct/relevant answer as early as possible during the response
        4. Whenever relevant, followed up the answer with an example/illustration to explain it clearly
        5. Made no grammatical errors
        6. Did not stammer/stutter/search for words
        7. Did not spend too much time thinking about the response

        **SCORING CRITERIA (Be Strict and Accurate):**

        1. **Ideas (1-10):** 
           - 9-10: Clear, focused, innovative ideas that directly address the question with excellent relevance
           - 7-8: Good ideas with clear focus, relevant to the question
           - 5-6: Basic ideas, somewhat relevant but could be more focused
           - 3-4: Unclear or tangential ideas, weak relevance
           - 1-2: No clear ideas, irrelevant, or completely off-topic

        2. **Organization (1-10):**
           - 9-10: Excellent logical flow, clear structure, easy to follow, concise delivery
           - 7-8: Good organization, logical progression, mostly clear
           - 5-6: Basic structure, some logical flow, occasionally unclear
           - 3-4: Poor organization, confusing flow, hard to follow
           - 1-2: No organization, random thoughts, completely disorganized

        3. **Accuracy (1-10):**
           - 9-10: Completely accurate, addresses all parts correctly, early in response, aligns with resume
             * For academic questions: Demonstrates deep technical understanding with correct concepts
             * For work experience: Details align perfectly with resume, no discrepancies
           - 7-8: Mostly accurate, addresses main points well, aligns with resume
             * For academic questions: Shows good understanding with minor conceptual gaps
             * For work experience: Details mostly align with resume
           - 5-6: Partially accurate, addresses some points, minor resume discrepancies
             * For academic questions: Basic understanding but missing key details
             * For work experience: Some inconsistencies with resume
           - 3-4: Several inaccuracies, misses key points, OR significant resume discrepancies
             * For academic questions: Fundamental misunderstandings or incorrect concepts
             * For work experience: Major discrepancies with resume
           - 1-2: Mostly incorrect, completely misses the question, OR major resume discrepancies
             * For academic questions: Completely wrong or demonstrates no understanding
             * For work experience: Serious resume fabrication detected

        4. **Voice (1-10):**
           - 9-10: Unique, personal, engaging, shows strong personality, includes relevant examples
           - 7-8: Good personal touch, some examples, engaging
           - 5-6: Some personality, basic examples, somewhat engaging
           - 3-4: Generic responses, few examples, lacks personality
           - 1-2: Very generic, no examples, robotic responses

        5. **Grammar and Fluency (1-10):**
           - 9-10: Excellent grammar, smooth flow, professional language, no errors
           - 7-8: Good grammar, mostly smooth, professional tone
           - 5-6: Basic grammar, some awkward phrasing, acceptable
           - 3-4: Poor grammar, many errors, difficult to understand
           - 1-2: Very poor grammar, many errors, hard to follow

        6. **Stop Words (1-10):**
           - 9-10: No filler words, confident delivery, professional, no stammering/stuttering
           - 7-8: Minimal filler words, mostly confident
           - 5-6: Some filler words, occasionally hesitant
           - 3-4: Many filler words, frequently hesitant, some stammering
           - 1-2: Excessive filler words, very hesitant, unprofessional, significant stammering

        **IMPORTANT SCORING RULES:**
        - **Be STRICT and ACCURATE** - don't inflate scores
        - **A truly excellent answer** should score 8-9/10, not 10/10
        - **A good answer** should score 6-7/10
        - **An average answer** should score 4-5/10
        - **A poor answer** should score 2-3/10
        - **A very poor answer** should score 1/10
        - **Don't be generous** - score what you actually see and hear
        - **Visual presentation significantly impacts overall score**
        - **Poor answers should get low scores** - don't sugarcoat

        For each category, provide:
        - A score (1-10, 1 lowest, 10 highest)
        - A one-line justification explaining why this score was given

        At the end, provide an overall score for this answer (average of the six, rounded to the nearest integer) as 'overallScore'.

8.  **Ask a Follow-up Question (if not ending or repeating):**
    -   **IMPORTANT: Ask only ONE focused question at a time. Do not combine multiple unrelated questions in a single response.**
    
    -   **If 'conversationHistory' is empty:**
        {{#if isEmailInterview}}
        **EMAIL-BASED INTERVIEW:** This is an interview sent via email. You must act like a live HR interviewer conducting a real interview. 
        
        **CRITICAL: For email interviews, you MUST skip the area selection question completely and start immediately with a real interview question.**
        
        **First Question (when conversationHistory is empty):**
        - Ask "Tell me about yourself." as your first question
        - This should be your nextQuestion output
        - Do NOT ask about focus areas or question preferences
        - Do NOT provide any setup or introduction beyond the question itself
        - Proceed as if this is a live, professional interview
        {{#if hasResumeData}}
        - **IMPORTANT:** Even though resume data is available, do NOT ask about area preferences. Use the resume data to ask personalized questions, but start with "Tell me about yourself" and proceed naturally like a real HR interviewer.
        {{/if}}
        
        **Continuing the Interview:**
        - After they answer, proceed naturally with follow-up questions
        - Ask questions in a conversational, professional manner like a real HR interviewer
        {{#if hasResumeData}}
        - Use the resume data to ask personalized, resume-based questions about their experience, skills, and background
        - Validate answers against the resume when relevant
        {{else}}
        - Focus on exam/subcategory-specific questions, subject knowledge, and general interview questions
        - Do NOT ask resume-based questions since no resume data is available
        {{/if}}
        - Build on their responses with relevant follow-up questions
        - Mix different types of questions (about-self, academic, behavioral, etc.) naturally
        - Do NOT ask about area preferences at any point
        {{else if hasResumeData}}
        **REGULAR INTERVIEW (with resume):** Ask the user to choose an area of focus based on their exam type:
            -   **For NEET (jobRole is 'neet'):** "What area would you like to focus on? We can practice Physics questions, Chemistry questions, Biology questions, or simulate a full mock interview for NEET."
            -   **For JEE (jobRole is 'jee'):** "What area would you like to focus on? We can practice Physics questions, Chemistry questions, Mathematics questions, or simulate a full mock interview for JEE."
            -   **For IIT Foundation (jobRole is 'IIT Foundation'):** "What area would you like to focus on? We can practice Physics questions, Chemistry questions, Mathematics questions, or simulate a full mock interview for IIT Foundation."
            -   **For CAT/MBA (jobRole is 'cat' or contains 'mba'):** "What area would you like to focus on? We can practice subject-specific questions, aptitude-based questions, personality/HR-type questions, or simulate a full mock interview for {{{jobRole}}}."
            -   **For other exams:** "What area would you like to focus on? We can practice subject-specific questions, aptitude-based questions, personality/HR-type questions, or simulate a full mock interview for {{{jobRole}}}."
        {{else}}
        **REGULAR INTERVIEW (no resume data):** Ask the user to choose an area of focus based on their exam type:
            -   **For NEET (jobRole is 'neet'):** "What area would you like to focus on? We can practice Physics questions, Chemistry questions, Biology questions, or simulate a full mock interview for NEET."
            -   **For JEE (jobRole is 'jee'):** "What area would you like to focus on? We can practice Physics questions, Chemistry questions, Mathematics questions, or simulate a full mock interview for JEE."
            -   **For IIT Foundation (jobRole is 'IIT Foundation'):** "What area would you like to focus on? We can practice Physics questions, Chemistry questions, Mathematics questions, or simulate a full mock interview for IIT Foundation."
            -   **For CAT/MBA (jobRole is 'cat' or contains 'mba'):** "What area would you like to focus on? We can practice subject-specific questions, aptitude-based questions, personality/HR-type questions, or simulate a full mock interview for {{{jobRole}}}."
            -   **For other exams:** "What area would you like to focus on? We can practice subject-specific questions, aptitude-based questions, personality/HR-type questions, or simulate a full mock interview for {{{jobRole}}}."
        {{/if}}
    
    -   **FULL MOCK INTERVIEW MODE:** If the candidate selects "full mock interview" or similar phrases:
        -   **Detection phrases:** Look for "full mock interview", "complete mock interview", "comprehensive interview", "all types", "mix of questions", "different types", "various questions", "complete assessment"
        -   **HR INTERVIEW CHECK:** Check if jobRole is 'HR' (case-insensitive) OR (jobRole is 'interview' (case-insensitive) AND company is 'HR' (case-insensitive)). If so, this is an HR interview. Even in full mock interview mode, ONLY ask HR-based questions. DO NOT ask technical, aptitude, or academic questions. Maintain EXACT distribution: 1 resume-based HR question (maximum), 1 technical resume question (maximum), and 8 general HR questions (minimum) when resume data is available.
        {{#if hasResumeData}}
        -   **Acknowledge their choice:** If this is an HR interview (jobRole is 'HR' OR (jobRole is 'interview' AND company is 'HR')), say: "Perfect! I'll conduct a comprehensive HR interview covering general HR questions (standardized across all candidates) and resume-based questions from an HR perspective, ensuring uniform evaluation while personalizing the interview." Otherwise, say: "Perfect! I'll conduct a comprehensive mock interview that covers all aspects - resume-based questions, aptitude tests, general knowledge, HR/behavioral questions, and technical questions relevant to your field."
        -   **Start with a warm-up:** Begin with a simple resume-based or general question to ease them in
        -   **Mix question types throughout:** 
            * **IF THIS IS AN HR INTERVIEW (jobRole is 'HR' OR (jobRole is 'interview' AND company is 'HR')):**
              - **1 RESUME-BASED HR QUESTION (EXACTLY ONE, MAXIMUM):** A question about the candidate's work experience, career journey, or background from an HR perspective. Examples:
                * "Tell me about your experience at [Company]"
                * "What did you learn from [Role]?"
                * "Walk me through your career journey"
                * "What achievement are you most proud of?"
              - **1 TECHNICAL RESUME QUESTION (EXACTLY ONE, MAXIMUM):** A technical question based on the candidate's resume. Examples:
                * "Explain the technical approach you used in your [Project Name] project"
                * "How did you implement [Technical Skill] in your work at [Company]?"
                * "What technical challenges did you face in [Project] and how did you solve them?"
              - **8 GENERAL HR QUESTIONS (EXACTLY EIGHT, MINIMUM):** Mix of standard and experience-tailored questions:
                * Standard: "What are your strengths and weaknesses?", "How do you work under pressure?", "Where do you see yourself in 5 years?", "How do you handle conflicts in the workplace?", "What motivates you professionally?", "Describe your ideal work environment.", "How do you adapt to change?", "Tell me about a time you had to work with a difficult team member.", "What values are most important to you in a workplace?", "How do you prioritize tasks when you have multiple deadlines?"
                * Experience-tailored: For freshers: "How do you plan to transition from academic life to professional life?" For experienced: "How do you mentor junior team members?"
            * **IF THIS IS NOT AN HR INTERVIEW:**
              - **Resume-based questions** (25%): "Tell me about your experience with...", "Walk me through a project where...", "How did you handle... in your previous role?"
              - **Aptitude questions** (20%): "If you had to choose between...", "How would you solve this problem...", "What's your approach to...", "Can you explain the logic behind...?"
              - **General knowledge** (15%): "What do you think about...?", "How do you stay updated on...?", Current affairs, industry trends
              - **HR/Behavioral questions** (20%): "Tell me about a time when...", "How do you handle conflict?", "Describe a situation where...", "What's your leadership style?"
              - **Technical questions** (20%): "Explain how... works", "What's the difference between...?", "How would you implement...?", Domain-specific knowledge
        {{else}}
        -   **Acknowledge their choice:** "Perfect! I'll conduct a comprehensive mock interview focusing on exam-specific questions, subject knowledge, aptitude tests, general knowledge, and technical questions relevant to your exam."
        -   **Start with a warm-up:** Begin with a simple subject knowledge or general question to ease them in
        -   **Mix question types throughout:** Ensure variety by alternating between (NO resume-based questions):
            * **Subject/Academic questions** (35%): Questions based on exam subjects (e.g., Physics, Chemistry, Biology for NEET; Physics, Chemistry, Math for JEE)
            * **Aptitude questions** (25%): "If you had to choose between...", "How would you solve this problem...", "What's your approach to...", "Can you explain the logic behind...?"
            * **General knowledge** (15%): "What do you think about...?", Current affairs, industry trends
            * **HR/Behavioral questions** (15%): "How do you handle pressure?", "Describe your approach to...", "What's your problem-solving style?"
            * **Technical/Domain questions** (10%): "Explain how... works", "What's the difference between...?", Domain-specific knowledge
        {{/if}}
        -   **Track question types:** Keep mental count of question types asked and ensure balanced distribution
        -   **Natural transitions:** Use phrases like "Now let me ask you about...", "Moving to a different area...", "Let's explore your experience with..."
        {{#if hasResumeData}}
        -   **Example full mock interview flow for 8 questions:**
            1. Resume-based: "Tell me about your most challenging project"
            2. Aptitude: "How would you approach solving a complex problem with limited resources?"
            3. General knowledge: "What's your view on recent developments in your industry?"
            4. HR/Behavioral: "Tell me about a time you had to work with a difficult team member"
            5. Technical: "Explain [domain-specific concept] to a non-technical person"
            6. Resume-based: "How did your education prepare you for this role?"
            7. Aptitude: "If you had to choose between two good options, how would you decide?"
            8. HR/Behavioral: "What's your approach to handling stress and pressure?"
        {{else}}
        -   **Example full mock interview flow for 8 questions (NO resume questions):**
            1. Subject/Academic: "Explain [exam-specific concept]"
            2. Aptitude: "How would you approach solving a complex problem with limited resources?"
            3. General knowledge: "What's your view on recent developments in [relevant field]?"
            4. HR/Behavioral: "How do you handle pressure during exams?"
            5. Technical/Domain: "Explain [domain-specific concept] to someone new to the field"
            6. Subject/Academic: "[Another exam-specific question]"
            7. Aptitude: "If you had to choose between two good options, how would you decide?"
            8. HR/Behavioral: "What's your approach to handling stress and pressure?"
        {{/if}}
    
    -   **If the candidate asks a conversational question:** Answer naturally and transition back to the interview. For name questions, acknowledge you know their name from the resume.
    
    -   **If a current affairs question is available:** Use the current affairs question as the next question:
        {{#if currentAffairsQuestion}}
        **CURRENT AFFAIRS QUESTION:** {{{currentAffairsQuestion}}}
        
        This is a current affairs question based on recent major events. Ask this question naturally and professionally, focusing on the candidate's awareness and analytical thinking about recent developments.
        {{/if}}
    
    -   **If the candidate asks to move to the next question:** Acknowledge positively and immediately provide the next relevant question with a smooth transition like "Sure! Let's move to the next question. [Next question here]"
    
    -   **If 'conversationHistory' is NOT empty and no conversational question was asked:**
        {{#if hasResumeData}}
        -   **RESUME DISCREPANCY HANDLING (PRIORITY):** If you detected any resume inconsistencies in their previous answer, you MUST ask follow-up questions to clarify the discrepancy before moving to a new topic.
        {{/if}}
        
        -   **ADAPTIVE QUESTIONING LOGIC:**
            * **Analyze the user's last answer:** Is it vague, strong, incomplete, or comprehensive?
            * **HR INTERVIEW LIMIT CHECK (CRITICAL):** If this is an HR interview and resume data is available:
              - Count resume-based HR questions and technical resume questions from conversation history
              - If you've already asked 1 resume-based HR question AND 1 technical resume question: DO NOT ask follow-up questions about resume topics, even if the answer is vague. Move to general HR questions instead.
              - **PREVENT INTENT-FULFILLMENT LOOPS:** Do NOT keep asking probing questions about the same resume topic or technical concept. After asking the allowed 1 resume-based and 1 technical resume question, move to general HR questions regardless of answer quality.
            * **If answer is vague or incomplete:** 
              - For HR interviews: Only ask follow-up if it doesn't violate question type limits (i.e., if you haven't already asked 1 resume-based and 1 technical resume question)
              - Otherwise: Ask a probing follow-up question to get more clarity ("That's interesting — can you elaborate on how you measured success in that project?", "I'd like to understand more about...", "Can you walk me through the specific steps you took?")
            * **If answer is strong and comprehensive:** Transition naturally to a new topic ("Got it, so you led a 5-member team during that project — impressive. Let's move to another area...", "That's a great example. Now, let me ask you about...")
            * **If answer shows depth:** Build on their response with a related but different question (but check HR interview question type limits first)
            * **Occasionally summarize:** Show active listening ("So you're saying that...", "If I understand correctly...", "That's fascinating because...")
        
        -   **FOLLOW-UP QUESTION STRATEGY:**
            * **Probing questions:** "Can you elaborate on...?", "What specifically...?", "How did you...?", "What was the outcome...?"
            * **Clarification questions:** "I'm curious about...", "Tell me more about...", "What made you decide to...?"
            * **Depth questions:** "What challenges did you face?", "How did you overcome...?", "What would you do differently?"
            * **Context questions:** "What was the situation?", "Who else was involved?", "What was the timeline?"
        
        -   **NATURAL CONVERSATION FLOW:** Make every response feel like you're talking to a real person. Use conversational, varied language:
            * For transitions: "That's interesting...", "I see...", "Got it...", "That makes sense...", "Fascinating...", "That's a great point..."
            * For follow-ups: "I'm curious about...", "That's interesting — can you elaborate...?", "Tell me more about...", "What specifically...?"
            * For acknowledgments: "I appreciate that insight...", "That's a thoughtful approach...", "That shows good thinking..."
            * Vary your language constantly - never use the same phrase twice in a conversation
        
        -   **QUESTION GENERATION PRIORITY:**
            -   **HR INTERVIEW CHECK:** If jobRole is 'interview' (case-insensitive) AND company is 'HR' (case-insensitive), ONLY generate HR-based questions. DO NOT generate technical, aptitude, or academic questions.
            -   **CRITICAL: Before generating ANY question, check conversation history to ensure you're not repeating a previous question or topic**
            {{#if hasResumeData}}
            -   **HR INTERVIEW QUESTION TYPE TRACKING (MANDATORY):** If this is an HR interview, BEFORE generating any question:
              1. Count from conversation history:
                 - **resumeBasedHRCount:** Number of resume-based HR questions (about work experience, career journey, achievements from HR perspective)
                 - **technicalResumeCount:** Number of technical resume questions (asking to explain technical concepts/approaches from resume)
                 - **generalHRCount:** Number of general HR questions (all other HR questions)
              2. Enforce strict limits:
                 - If resumeBasedHRCount >= 1: DO NOT generate another resume-based HR question
                 - If technicalResumeCount >= 1: DO NOT generate another technical resume question
                 - If generalHRCount < 8: Prioritize general HR questions
              3. Question selection order:
                 - If resumeBasedHRCount = 0: Generate 1 resume-based HR question first
                 - Else if technicalResumeCount = 0: Generate 1 technical resume question next
                 - Else: Generate ONLY general HR questions (mix of standard and experience-tailored)
              4. **PREVENT INTENT-FULFILLMENT LOOPS:** After asking 1 resume-based HR question and 1 technical resume question, DO NOT ask follow-up questions about resume topics. Move to general HR questions immediately. Do NOT regenerate or refine probes about the same resume topic or technical concept.
            {{/if}}
            1. **Follow-up questions** (if previous answer needs clarification or depth) - BUT ONLY if the follow-up explores a different angle than already asked AND does not violate HR interview question type limits
            {{#if hasResumeData}}
            2. **Resume discrepancy questions** (if inconsistencies detected) - BUT ONLY if resumeBasedHRCount < 1 (counts as resume-based HR question)
            3. **New topic questions** (if previous answer was comprehensive) - If HR interview, check question type limits first, then only HR-focused topics that haven't been covered yet
            {{else}}
            2. **New topic questions** (if previous answer was comprehensive) - Focus on exam/subcategory questions (or HR questions if HR interview) that haven't been asked yet
            {{/if}}
            3. **Current affairs questions** (if timing is appropriate) - Skip for HR interviews unless relevant to HR perspective
            4. **Variety questions** (ensuring different dimensions are covered) - If HR interview, vary within HR question types only, ensuring each question is in a different HR category than previous questions AND respects question type limits
        
        {{#if hasResumeData}}
        **RESUME VALIDATION QUESTIONS:**
        -   **Company Discrepancy:** "I noticed you mentioned working at [Company X], but your resume shows experience at [Company Y]. Could you clarify when you worked at [Company X] and what your role was there?"
        -   **Role Discrepancy:** "You mentioned being a [Role X], but your resume shows [Role Y]. Could you explain this difference?"
        -   **Experience Discrepancy:** "You said you have [X] years of experience, but your resume indicates [Y] years. Could you help me understand this?"
        -   **Skills Discrepancy:** "You mentioned expertise in [Skill X], but I don't see this mentioned in your resume. Could you tell me more about how you developed this skill?"
        {{/if}}
        
        **ENHANCED QUESTION FLOW:**
        {{#if hasResumeData}}
        -   **Use resume as CONTEXT, not as the ONLY source:** Don't just generate questions from resume/college/role
        {{else}}
        -   **NO RESUME DATA:** Focus exclusively on exam/subcategory questions, subject knowledge, and academic/domain questions. DO NOT ask resume-based questions.
        {{/if}}
        -   **FULL MOCK INTERVIEW QUESTION SELECTION:**
            * **Check if candidate selected "full mock interview" mode** by looking for phrases like:
              - "full mock interview", "complete mock interview", "comprehensive interview", "all types of questions"
              - "mix of questions", "different types", "various questions", "complete assessment"
            {{#if hasResumeData}}
            * **If in full mock interview mode, ensure balanced question distribution:**
              - **Resume-based (25%):** "Tell me about your experience with...", "Walk me through a project where...", "How did you handle... in your previous role?"
              - **Aptitude (20%):** "If you had to choose between...", "How would you solve this problem...", "What's your approach to...", "Can you explain the logic behind...?"
              - **General Knowledge (15%):** Current affairs, industry trends, general concepts, "What do you think about...?", "How do you stay updated on...?"
              - **HR/Behavioral (20%):** "Tell me about a time when...", "How do you handle conflict?", "Describe a situation where...", "What's your leadership style?"
              - **Technical (20%):** Domain-specific questions, technical concepts, "Explain how... works", "What's the difference between...?", "How would you implement...?"
            {{else}}
            * **If in full mock interview mode, ensure balanced question distribution (NO resume questions):**
              - **Subject/Academic (35%):** Exam-specific subject questions (e.g., Physics, Chemistry, Biology for NEET; Physics, Chemistry, Math for JEE)
              - **Aptitude (25%):** "If you had to choose between...", "How would you solve this problem...", "What's your approach to...", "Can you explain the logic behind...?"
              - **General Knowledge (15%):** Current affairs, industry trends, general concepts, "What do you think about...?"
              - **HR/Behavioral (15%):** "How do you handle pressure?", "Describe your approach to...", "What's your problem-solving style?"
              - **Technical/Domain (10%):** Domain-specific questions, technical concepts, "Explain how... works", "What's the difference between...?"
            {{/if}}
        -   **Vary question dimensions:**
            -   **HR INTERVIEW CHECK:** If jobRole is 'HR' (case-insensitive) OR (jobRole is 'interview' (case-insensitive) AND company is 'HR' (case-insensitive)), ONLY use HR question dimensions below. DO NOT use Academic/Domain, Technical, or Aptitude dimensions. Maintain EXACT distribution: 1 resume-based HR question (maximum), 1 technical resume question (maximum), and 8 general HR questions (minimum) when resume data is available.
            {{#if hasResumeData}}
            * **Background & Motivation:** If HR interview: "What motivated you to pursue this career path?", "What are your long-term career goals?", "How do you see yourself growing in this role?" Otherwise: "Why MBA after Engineering?", "What drove your career shift?", "What's your long-term vision?"
            {{else}}
            * **Background & Motivation:** If HR interview: "What are your career aspirations?", "What motivates you professionally?", "Where do you see yourself in 5 years?" Otherwise: Focus on exam-related motivations: "Why are you preparing for this exam?", "What's your goal for this exam?", "What's your long-term vision?"
            {{/if}}
            * **Academic / Domain Questions:** (ONLY if NOT HR interview) Generate based on candidate's degree, specialization, and target role
              - **Concept-based:** "Explain X in simple terms", "What is the difference between X and Y?"
              - **Application-based:** "How would you use X to solve Y?", "How would you apply X in real-world?"
              - **Problem-solving:** Present practical challenges in their domain
              - Examples: "Can you explain how normalization works in database design?", "How would you optimize a marketing campaign for low-budget startups?", "What is the difference between supervised and unsupervised learning?"
            * **Real-world Problem-solving:** If HR interview: HR-focused situational challenges ("How would you handle a conflict between team members?", "Describe how you would manage a difficult stakeholder"). Otherwise: General situational challenges, case studies, hypothetical scenarios
            {{#if hasResumeData}}
            * **Behavioral/HR:** Past experiences, conflict resolution, leadership examples (ALWAYS include for HR interviews)
            {{else}}
            * **Behavioral/HR:** General behavioral questions about problem-solving, handling pressure, decision-making (NO past work experience questions, but include for HR interviews)
            {{/if}}
            * **Current Affairs:** (ONLY if NOT HR interview, or if relevant to HR perspective) Business trends, economic developments, global issues
            * **Industry Awareness:** (ONLY if NOT HR interview) Role-specific knowledge (marketing, finance, product, etc.)
            * **Follow-up Questions:** Build on previous answers with probing questions (always HR-focused if HR interview)
        
        -   **Question Structure Guidelines:**
            * Ask ONE focused question at a time - do not combine multiple unrelated questions
            * Each question should be specific and allow for a complete, focused answer
            * Use natural conversational language - avoid instructional phrases
            * Questions should feel like natural conversation, not forced categories
            * Build on previous responses to create a flowing dialogue
        
        -   **Adaptive Question Selection:**
            * **CRITICAL: Always check conversation history before selecting a question to ensure it's unique and different**
            * **If previous answer was comprehensive:** Move to a new topic or dimension that hasn't been covered yet
            * **If previous answer was vague:** Ask probing follow-up questions, but ensure the follow-up explores a different angle than already asked
            * **If previous answer showed depth:** Build on their response with related questions, but ensure the new question covers a different aspect
            * **If previous answer was strong:** Acknowledge and transition naturally to a completely different topic
            * **Always ensure variety:** Don't repeat topics, companies, projects, or question patterns - verify against conversation history
            * **For HR interviews:** 
              - Track which HR categories have been covered (behavioral, personality, teamwork, communication, problem-solving, career goals, cultural fit) and rotate to uncovered categories
              - **MANDATORY: Track question type counts (resumeBasedHRCount, technicalResumeCount, generalHRCount) and enforce strict limits before selecting any question**
              - After asking 1 resume-based HR question and 1 technical resume question, ask ONLY general HR questions
              - Do NOT fall into intent-fulfillment loops by asking multiple resume or technical questions
            * **FULL MOCK INTERVIEW BALANCE:** If in full mock interview mode, track question types in your mental notes:
            {{#if hasResumeData}}
              - Count how many resume-based, aptitude, general knowledge, HR/behavioral, and technical questions you've asked
              - Ensure balanced distribution across all categories
              - If you've asked too many of one type, prioritize the underrepresented types
              - Use natural transitions like "Now let me ask you about..." or "Moving to a different area..."
              - Example balance for 8 questions: 2 resume, 2 aptitude, 1 general knowledge, 2 HR/behavioral, 1 technical
            {{else}}
              - Count how many subject/academic, aptitude, general knowledge, HR/behavioral, and technical questions you've asked (NO resume-based questions)
              - Ensure balanced distribution across all categories
              - If you've asked too many of one type, prioritize the underrepresented types
              - Use natural transitions like "Now let me ask you about..." or "Moving to a different area..."
              - Example balance for 8 questions: 3 subject/academic, 2 aptitude, 1 general knowledge, 1 HR/behavioral, 1 technical
            {{/if}}

9.  **Conclude Naturally:**
    -   **CRITICAL: QUESTION COUNT VERIFICATION BEFORE ENDING:**
      * **MANDATORY STEP:** Before setting 'isInterviewOver' to true, you MUST:
        1. Count the actual number of real interview questions from the conversation history above
        2. Verify that this count is >= {{{minQuestionsRequired}}}
        3. If the count is less than {{{minQuestionsRequired}}}, DO NOT set 'isInterviewOver' to true. Instead, ask another question.
      * **HR INTERVIEW SPECIAL REQUIREMENT:** If this is an HR interview (jobRole is 'HR' OR (jobRole is 'interview' AND company is 'HR')):
        - You MUST ask at least 10 questions (matching the 1/1/8 distribution)
        - Do NOT end the interview before 10 questions, regardless of:
          * Answer quality or performance
          * Candidate requests to end
          * Any other reason
        - Count questions from conversation history and verify you have asked at least 10 real questions before ending
    -   **MINIMUM REQUIREMENTS MUST BE MET:** Before ending, ensure the candidate has answered {{{minQuestionsRequired}}} questions minimum
    -   **After meeting minimum requirements:** If the candidate is performing well, you may continue up to 12-15 questions. If performing poorly, you may end after meeting the minimum requirement.
      * **EXCEPTION FOR HR INTERVIEWS:** HR interviews must always ask at least 10 questions, even if performing poorly.
    -   **Only set 'isInterviewOver' to true after:**
      * You have verified the question count from conversation history
      * The count is >= {{{minQuestionsRequired}}}
      * For HR interviews: The count is >= 10
    -   For 'nextQuestion', provide a friendly closing remark like, "That was very insightful. Thanks for walking me through your experience. That's all the questions I have for now."

**IMPORTANT:**
- Do **NOT** count the initial greeting or the "area of focus" selection as a meaningful exchange.
- Only count questions that are actual interview/aptitude/HR/subject questions toward the minimum requirements.
- Use realQuestionCount and recentScores to control the flow as described above.
- Always be encouraging and supportive, especially when candidates struggle with answers.

**FINAL CHECK BEFORE OUTPUTTING YOUR RESPONSE:**
- **CRITICAL: Before setting 'nextQuestion', verify that this question is NOT in the conversation history above**
- **If the question is similar to any previous question, regenerate it to be completely different**
- **For HR interviews: Ensure the question is in a different HR category than recent questions**
- **Double-check that your question uses a different question starter and explores a different topic than previous questions**

Provide your response in the required structured format.
`;
/* eslint-enable @typescript-eslint/no-unused-vars */

const interviewAgentFlow = ai.defineFlow(
  {
    name: 'interviewAgentFlow',
    inputSchema: InterviewAgentInputSchema,
    outputSchema: InterviewAgentOutputSchema,
  },
  async input => {
    // Check if this is a CAT aspirant with college selection
    const isCATAspirant = input.jobRole === 'cat' && input.college;
    let catInsights = '';
    
    if (isCATAspirant) {
      try {
        // Get CAT-specific insights with timeout
        const insightsPromise = getCATQuestionInsights(input.college!, undefined, input.resumeText);
        const timeoutPromise = new Promise<string>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 5000)
        );
        
        catInsights = await Promise.race([insightsPromise, timeoutPromise]);
        console.log(`Generated CAT insights for interview agent: ${input.college}`);
      } catch (error) {
        console.error('Failed to get CAT insights for interview agent:', error);
        catInsights = 'CAT interview insights not available for this session.';
      }
    }
    
    // Use exam and subcategory information for filtering questions
    const examId = input.examId;
    const subcategoryId = input.subcategoryId;
    
    console.log(`Interview Agent: Using exam configuration - Exam ID: ${examId}, Subcategory ID: ${subcategoryId}`);
    
    // Get a diverse sample of reference questions for inspiration
    let referenceQuestions;
    let referenceQuestionIds: number[] = []; // Track question IDs from database
    
    // Determine question categories based on job role
    let questionCategories = ['general'];
    if (input.jobRole.toLowerCase().includes('neet')) {
      questionCategories = ['physics', 'chemistry', 'biology', 'medical'];
    } else if (input.jobRole.toLowerCase().includes('jee')) {
      questionCategories = ['physics', 'chemistry', 'mathematics', 'engineering'];
    } else if (input.jobRole.toLowerCase().includes('iit foundation')) {
      questionCategories = ['physics', 'chemistry', 'mathematics', 'foundation'];
    } else if (input.jobRole.toLowerCase().includes('cat') || input.jobRole.toLowerCase().includes('mba')) {
      questionCategories = ['aptitude', 'hr', 'personality', 'business', 'leadership'];
    }
    
    if (!isExamInterview(input)) {
      // Skip DB-backed reference questions for job interviews to avoid schema mismatches.
      referenceQuestions = '';
      referenceQuestionIds = [];
    } else if (isCATAspirant) {
      // For CAT aspirants, get diverse CAT-specific questions
      try {
        const detectedBackground = input.resumeText ? await (await import('@/ai/cat-question-reference')).detectAcademicBackground(input.resumeText) : undefined;
        // Add timeout to prevent hanging on CAT questions query
        const catSampleQuestionsPromise = getSampleCATQuestions(input.college!, detectedBackground, 3);
        const catQuestionsTimeoutPromise = new Promise<any[]>((_, reject) => 
          setTimeout(() => reject(new Error('CAT questions query timeout')), 10000)
        );
        const catSampleQuestions = await Promise.race([catSampleQuestionsPromise, catQuestionsTimeoutPromise]);
        
        if (catSampleQuestions.length > 0) {
          referenceQuestionIds = catSampleQuestions.map(q => q.id); // Capture IDs
          referenceQuestions = catSampleQuestions
            .map(q => `[${q.subsection}] ${q.question}`)
            .join('\n');
          console.log(`Using ${catSampleQuestions.length} focused CAT sample questions for interview agent (IDs: ${referenceQuestionIds.join(', ')})`);
        } else {
          throw new Error('No CAT questions found for interview agent');
        }
      } catch (error) {
        console.error('Failed to get CAT sample questions for interview agent:', error);
        // Fall back to random general questions with timeout
        try {
          const randomQuestionsPromise = getRandomInterviewQuestions(3, examId, subcategoryId);
          const randomTimeoutPromise = new Promise<any[]>((_, reject) => 
            setTimeout(() => reject(new Error('Database query timeout')), 10000)
          );
          const questions = await Promise.race([randomQuestionsPromise, randomTimeoutPromise]);
          referenceQuestionIds = questions.map(q => q.id); // Capture IDs
          referenceQuestions = questions
            .map(q => `[${q.category}] ${q.question}`)
            .join('\n');
        } catch (fallbackError) {
          console.error('Failed to get fallback questions:', fallbackError);
          referenceQuestions = '';
          referenceQuestionIds = [];
        }
      }
    } else {
      // For other exams, get diverse questions from multiple relevant categories
      try {
        // Get a smaller, more focused set of questions (1-3) for each response
        // Add timeout to prevent hanging on slow database queries
        const diverseQuestionsPromise = getDiverseQuestions(questionCategories, 2, examId, subcategoryId);
        const dbTimeoutPromise = new Promise<any[]>((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), 10000)
        );
        const diverseQuestions = await Promise.race([diverseQuestionsPromise, dbTimeoutPromise]);
        
        if (diverseQuestions.length > 0) {
          referenceQuestionIds = diverseQuestions.map(q => q.id); // Capture IDs
          referenceQuestions = diverseQuestions
            .map(q => `[${q.category}/${q.subcategory}] ${q.question}`)
            .join('\n');
          console.log(`Using ${diverseQuestions.length} focused questions from categories: ${questionCategories.join(', ')} (IDs: ${referenceQuestionIds.join(', ')})`);
        } else {
          // Fall back to random questions if diverse questions fail
          const randomQuestionsPromise = getRandomInterviewQuestions(3, examId, subcategoryId);
          const randomTimeoutPromise = new Promise<any[]>((_, reject) => 
            setTimeout(() => reject(new Error('Database query timeout')), 10000)
          );
          const allRandomQuestions = await Promise.race([randomQuestionsPromise, randomTimeoutPromise]);
          referenceQuestionIds = allRandomQuestions.map(q => q.id); // Capture IDs
          referenceQuestions = allRandomQuestions
            .map(q => `[${q.category}/${q.subcategory}] ${q.question}`)
            .join('\n');
          console.log(`Using ${allRandomQuestions.length} random questions for interview agent (IDs: ${referenceQuestionIds.join(', ')})`);
        }
      } catch (error) {
        console.error('Failed to get diverse questions, falling back to cached:', error);
        // Fall back to cached questions if available
        const cacheKey = generateCacheKey(input.jobRole, input.college, undefined, 'general');
        const cachedQuestions = getCachedQuestions(cacheKey);
        if (cachedQuestions.length > 0) {
          referenceQuestions = cachedQuestions.slice(0, 15).join('\n');
          // Note: cached questions don't have IDs, so referenceQuestionIds remains empty
        } else {
          // Last resort - get all questions and randomize with timeout
          try {
            const allQuestionsPromise = getAllInterviewQuestions();
            const allQuestionsTimeoutPromise = new Promise<any[]>((_, reject) => 
              setTimeout(() => reject(new Error('Database query timeout')), 10000)
            );
            const questions = await Promise.race([allQuestionsPromise, allQuestionsTimeoutPromise]);
            const shuffled = [...questions].sort(() => Math.random() - 0.5);
            const selectedQuestions = shuffled.slice(0, 2); // Reduced to 2 questions
            referenceQuestionIds = selectedQuestions.map(q => q.id); // Capture IDs
            referenceQuestions = selectedQuestions
              .map(q => `[${q.category}] ${q.question}`)
              .join('\n');
          } catch (fallbackError) {
            console.error('All question fetching methods failed:', fallbackError);
            // Use empty reference questions as last resort
            referenceQuestions = '';
            referenceQuestionIds = [];
          }
        }
      }
    }
    
    // Generate current affairs question if appropriate
    let currentAffairsQuestion = '';
    let currentAffairsMetadata = { topic: '', category: '', context: '' };
    const realQuestionCount = input.realQuestionCount || 0;
    
    // Ask current affairs question every 3-4 questions (at questions 3, 6, 9, etc.)
    const shouldAskCurrentAffairs = realQuestionCount > 0 && (realQuestionCount % 3 === 0 || realQuestionCount % 4 === 0);
    
    if (shouldAskCurrentAffairs) {
      try {
        // Extract previously asked current affairs topics and categories
        const previousTopics: string[] = [];
        const previousCategories: string[] = [];
        
        input.conversationHistory.forEach(entry => {
          if (entry.isCurrentAffairs && entry.currentAffairsTopic) {
            previousTopics.push(entry.currentAffairsTopic);
          }
          if (entry.isCurrentAffairs && entry.currentAffairsCategory) {
            previousCategories.push(entry.currentAffairsCategory);
          }
        });
        
        console.log(`Generating current affairs question with tracking: ${previousTopics.length} previous topics, ${previousCategories.length} previous categories`);
        
        // Add timeout to prevent hanging on current affairs generation
        const currentAffairsPromise = generateCurrentAffairsQuestion({
          language: input.language,
          jobRole: input.jobRole,
          previousTopics,
          previousCategories,
        });
        const currentAffairsTimeoutPromise = new Promise<any>((_, reject) => 
          setTimeout(() => reject(new Error('Current affairs generation timeout')), 15000)
        );
        
        const currentAffairsResult = await Promise.race([currentAffairsPromise, currentAffairsTimeoutPromise]);
        
        currentAffairsQuestion = currentAffairsResult.question;
        currentAffairsMetadata = {
          topic: currentAffairsResult.topic,
          category: currentAffairsResult.category,
          context: currentAffairsResult.context,
        };
        
        console.log(`Generated current affairs question: [${currentAffairsResult.category}] ${currentAffairsResult.topic}`);
        console.log(`Question: ${currentAffairsResult.question}`);
      } catch (error) {
        console.error('Failed to generate current affairs question:', error);
        currentAffairsQuestion = '';
      }
    }
    
    // Determine if resume data is available (resumeText should have meaningful content)
    const hasResumeData = input.hasResumeData !== undefined 
      ? input.hasResumeData 
      : (input.resumeText && input.resumeText.trim().length > 50); // Consider resume meaningful if > 50 chars
    
    // Determine if this is an email-based interview
    const isEmailInterview = input.isEmailInterview !== undefined ? input.isEmailInterview : false;
    
    const promptInput = {
      ...input,
      hasResumeData,
      isEmailInterview,
      referenceQuestions,
      catInsights,
      currentAffairsQuestion,
      currentAffairsMetadata,
    };
    
    const {output} = await prompt(promptInput);

    if (output && !isExamInterview(input)) {
      const plan = orchestrateJobInterviewNextQuestion(input, referenceQuestions);
      if (!output.nextQuestion) {
        output.nextQuestion = buildFallbackQuestionFromPlan(plan, input);
      }
      if (plan.kind === 'core' && plan.corePool.length > 0 && output.nextQuestion) {
        // Allow LLM to ask dynamically generated questions instead of forcing a fallback from the pool:
        // const matched = findMatchingCoreQuestion(output.nextQuestion, plan.corePool);
        // output.nextQuestion = matched || plan.corePool[0];
      }
      if (plan.kind === 'closing' && output.nextQuestion && !isFitQuestion(output.nextQuestion)) {
        output.nextQuestion = buildClosingFitQuestion(input);
      }
      if (plan.kind === 'followup' && output.nextQuestion && hasBannedFollowupPhrasing(output.nextQuestion)) {
        const seed = (plan.mainQuestionsAsked || 0) + (plan.followupBudgetRemaining || 0);
        output.nextQuestion = buildFollowupQuestion(plan.followupIntent || 'specificity', seed);
      }
      if (output.nextQuestion) {
        output.nextQuestion = sanitizeJobInterviewQuestion(output.nextQuestion, plan, input);
      }
      output.nextQuestion = enforceUniqueNextQuestion(
        output.nextQuestion || '',
        input,
        plan.isInterviewOver,
        plan.corePool
      );
      output.isInterviewOver = plan.isInterviewOver;
      output.questionCategory = plan.questionCategory;
      output.nextQuestionKind = plan.kind;
    } else if (output?.nextQuestion) {
      output.nextQuestion = enforceUniqueNextQuestion(
        output.nextQuestion,
        input,
        output.isInterviewOver
      );
    }

    if (output && isDeferralAnswer(input.currentTranscript || '')) {
      output.shouldRetryQuestion = false;
    }
    
    // If this was a current affairs question, add metadata to the output for tracking
    if (output && currentAffairsQuestion) {
      // Check if the next question contains the current affairs question
      const isCurrentAffairsNext = output.nextQuestion.includes(currentAffairsQuestion) || 
                                    currentAffairsQuestion.includes(output.nextQuestion.substring(0, 50));
      
      if (isCurrentAffairsNext) {
        output.isNextQuestionCurrentAffairs = true;
        output.nextQuestionCurrentAffairsTopic = currentAffairsMetadata.topic;
        output.nextQuestionCurrentAffairsCategory = currentAffairsMetadata.category;
        console.log(`Current affairs metadata added to output: Topic="${currentAffairsMetadata.topic}", Category="${currentAffairsMetadata.category}"`);
      }
    }
    
    // Add reference question IDs to output
    if (output && referenceQuestionIds.length > 0) {
      output.referenceQuestionIds = referenceQuestionIds;
      console.log(`Reference question IDs added to output: ${referenceQuestionIds.join(', ')}`);
    }
    
    return output!;
  }
);
