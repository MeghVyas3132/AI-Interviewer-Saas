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
  const activeQuestion = (input.currentQuestion || '').trim();
  if (
    activeQuestion &&
    !previousQuestions.some(previous => normalizeQuestionForMatch(previous) === normalizeQuestionForMatch(activeQuestion))
  ) {
    previousQuestions.push(activeQuestion);
  }
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
const RESUME_QUESTION_TARGET = 3; // Q2-Q4: exactly 3 resume questions
const CORE_QUESTION_TARGET = 5;   // Q5-Q9: exactly 5 HR-generated questions
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
  // Only match TRUE intro questions - NOT HR questions that happen to contain greetings
  // Intro question must be the welcoming "tell me about yourself" type question
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
    // Welcome that directly asks about background (not generic welcome + HR question)
    (/^(hello|hi|welcome)/.test(q) && /tell me about yourself|about yourself and your experience/.test(q))
  );
};

const isClosingQuestion = (question: string): boolean =>
  /why (do|are) you (fit|a good fit|a strong fit)|why should we choose you|why are you a good fit|why do you think you'?re a strong fit|fit for this role|strong fit|strong match|right fit|what makes you a strong|how do your (strengths|skills) align|evidence that you(?:'re| are) a great fit/i.test(
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
    '- Obey NextQuestionPlan.next_kind strictly. The flow is: intro(1) -> resume(3) -> core(5) -> closing(1) = 10 questions total.',
    '- If next_kind=wrapup, set isInterviewOver=true and nextQuestion as a short closing statement (not a question).',
    '- If next_kind=core and core_question_pool is non-empty, choose ONE question verbatim from the pool (prefer the first unused). Do not rewrite it.',
    '- If next_kind=resume, ask about resume_anchor.title focusing on technical ownership, design decisions, and measurable impact. Do NOT repeat any previous questions.',
    '- If next_kind=followup, ask one probing technical follow-up aligned to followup_intent (specificity, ownership, depth, or impact). Avoid "provide more" phrasing.',
    '- If next_kind=intro, greet briefly, include candidate name, company, and role if provided, then ask "tell me about yourself and your experience relevant to [role]". End with a question.',
    '- If next_kind=closing, ask a fit-for-role question (why a strong fit / why choose you / strongest evidence) with varied wording. Keep it a question and set isInterviewOver=false.',
    '- If the candidate says they do not know or want to skip, acknowledge briefly and move on to the next question without asking followups.',
    '- Never output multiple questions; keep nextQuestion to one question only.',
    '- NEVER repeat a question that was already asked in the conversation. Each question must be unique.',
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

  // Track which anchors have been used to prevent any duplicates
  const usedAnchors = new Set<string>();

  for (const anchor of ordered) {
    const key = normalizeForCompare(anchor.title);

    // Skip if this anchor was already marked as used in this selection round
    if (usedAnchors.has(key)) continue;

    // Pre-generate the question this anchor would produce — check if it's already in history
    const generatedQuestion = normalizeForCompare(buildResumeQuestion(anchor));

    const used = normalizedHistory.some(question => {
      // Check generated question similarity first (most reliable)
      // Use a shorter prefix check and also check from the beginning
      const prefix30 = generatedQuestion.substring(0, 30);
      const prefix60 = generatedQuestion.substring(0, Math.min(60, generatedQuestion.length));
      if (prefix30 && question.includes(prefix30)) return true;
      if (prefix60 && question.includes(prefix60)) return true;

      // Also check if the history question is similar overall
      if (questionSimilarity(question, generatedQuestion) >= 0.5) return true;

      // Fallback: check anchor metadata fields
      if (key && key.length > 3 && question.includes(key)) return true;
      if (anchor.company && question.includes(normalizeForCompare(anchor.company))) return true;
      if (anchor.role && question.includes(normalizeForCompare(anchor.role))) return true;
      return false;
    });

    if (!used) {
      usedAnchors.add(key);
      return anchor;
    }
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
    // Followups disabled by default - only enable if explicitly set to 'true'
    followup: process.env.INTERVIEW_FOLLOWUP_ENABLED === 'true',
  };

  const historyQuestions = flowInput.conversationHistory
    .map(entry => entry.question || '')
    .filter(text => isLikelyInterviewQuestion(text));

  // Frontend turn timing can occasionally lag conversationHistory by one step.
  // Include the actively displayed question so sequencing never regresses
  // (e.g., repeating intro/resume/closing because the latest turn was not counted yet).
  const currentQuestion = (flowInput.currentQuestion || '').trim();
  if (
    currentQuestion &&
    isLikelyInterviewQuestion(currentQuestion) &&
    !historyQuestions.some(question => normalizeForCompare(question) === normalizeForCompare(currentQuestion))
  ) {
    historyQuestions.push(currentQuestion);
  }

  const resumeText = flowInput.resumeText || '';
  const resumeHasData = flowInput.hasResumeData ?? (resumeText.trim().length > 50);
  const resumeProfile = resumeHasData ? extractResumeProfile(resumeText) : null;
  const resumeAnchors = resumeProfile ? selectResumeAnchors(buildResumeAnchors(resumeProfile, resumeText)) : [];
  const allowedResumeAnchors = resumeAnchors.filter(anchor => anchor.type === 'experience' || anchor.type === 'project');
  // Resume stage must still run even when anchors are sparse; fallback resume prompts will be used.
  const resumeEnabled = flags.resumeProbe && resumeHasData;

  const classifications: QuestionKind[] = [];
  historyQuestions.forEach((question, idx) => {
    // STRICT RULE: Only the FIRST question (idx === 0) can be classified as 'intro'
    // Any subsequent question that looks like intro should be classified based on content
    if (idx === 0 && isIntroQuestion(question)) {
      classifications.push('intro');
    } else {
      // For non-first questions, classify based on content but NEVER as 'intro'
      const classification = classifyQuestion(question, resumeAnchors, historyQuestions[idx - 1]);
      // If any non-first question would be classified as 'intro', treat it as 'core' instead
      classifications.push(classification === 'intro' ? 'core' : classification);
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

  const explicitAnsweredCount = Number.isFinite(flowInput.realQuestionCount as number)
    ? Math.max(0, Number(flowInput.realQuestionCount || 0))
    : 0;
  const effectiveMainAskedFloor = Math.max(historyQuestions.length, explicitAnsweredCount);

  // Intro is strictly a single opening turn. If any interview question already exists,
  // treat intro as already consumed to avoid duplicate intro loops.
  const introAskedCount = effectiveMainAskedFloor > 0 ? 1 : 0;
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
  const nextMainOrdinal = effectiveMainAskedFloor + 1;

  const mainQuestionsAsked = introAskedCount + resumeAsked + coreAsked;
  const resumeTarget = resumeEnabled ? RESUME_QUESTION_TARGET : 0;
  const mainTarget = JOB_MAIN_QUESTION_TARGET;
  const coreTarget = resumeEnabled
    ? CORE_QUESTION_TARGET
    : Math.max(0, mainTarget - 1 - resumeTarget);
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

  const resumeSequencePending = nextMainOrdinal >= 2 && nextMainOrdinal <= 4;

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

  // Strict ordinal guard: Q10 must be closing, Q11+ must wrap up.
  if (nextMainOrdinal >= 10) {
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
        reason: 'strict_turn_10_closing',
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
      reason: 'strict_turn_11_wrapup',
    };
  }

  // 2. Check if all main questions are done → closing/wrapup
  // Hard guard: force closing at turn 10 (after 9 pre-closing interview questions).
  // This protects against occasional classification drift that can otherwise delay closing.
  if (historyQuestions.length >= JOB_MAIN_QUESTION_TARGET) {
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
        reason: 'turn_10_closing_guard',
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
      reason: 'closing_already_asked_guard',
    };
  }

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

  // 3. Per-question follow-up: ONLY for core (HR-generated) questions when answer is very vague
  //    Follow-ups do NOT count toward the 10-question total.
  //    DISABLED for resume questions - we want to move through the interview flow smoothly
  const qualityCheck = detectAnswerQuality(flowInput.currentTranscript || '');
  const shouldFollowup =
    flags.followup &&
    followupBudgetRemaining > 0 &&
    lastMainKind === 'core' && // ONLY core questions, NOT resume
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
    const resumeOrdinal = Math.max(0, Math.min(RESUME_SEQUENCE_ORDER.length - 1, nextMainOrdinal - 2));
    const preferType: ResumeAnchorType = RESUME_SEQUENCE_ORDER[resumeOrdinal] || 'experience';
    const anchor =
      selectUnusedAnchorByType(allowedResumeAnchors, historyQuestions, preferType) ||
      selectUnusedAnchor(allowedResumeAnchors, historyQuestions);

    const resumeAnchor = anchor || {
      type: preferType,
      title: preferType === 'project' ? 'a key project from your resume' : 'your recent experience from the resume',
      evidenceLine: '',
    };

    return {
      kind: 'resume',
      isInterviewOver: false,
      questionCategory: getQuestionCategory('resume', lastKind),
      resumeAnchor,
      corePool: [],
      mainQuestionsAsked,
      mainQuestionsTarget: mainTarget,
      resumeTarget,
      coreTarget,
      followupBudgetRemaining,
      reason: 'resume_sequence',
    };
  }

  // 5. Core / HR-generated questions (phase 3, after resume questions)
  const referencePool = filterUnusedReferenceQuestions(
    filterQuestionPool(parseReferenceQuestions(referenceQuestions), { allowSoftSkills: true }),
    historyQuestions
  ).filter(question => {
    if (isIntroQuestion(question)) return false;
    if (isClosingQuestion(question) || isFitQuestion(question)) return false;
    if (isCandidateQuestion(question)) return false;
    return true;
  });

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
const _LEGACY_PROMPT_REMOVED = `Deprecated legacy prompt placeholder.`;
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
