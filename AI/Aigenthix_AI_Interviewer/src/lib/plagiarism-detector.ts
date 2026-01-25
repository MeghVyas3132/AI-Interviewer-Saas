/**
 * Plagiarism Detection Service
 * Analyzes candidate answers to detect potential plagiarism
 */

interface AnswerItem {
  answer: string;
  question?: string;
}

interface PlagiarismResult {
  overallPlagiarism: number; // 0-100
  authenticityScore: number; // 100 - overallPlagiarism
  details?: Array<{
    answer: string;
    plagiarismScore: number;
  }>;
}

// Common generic/phrase patterns that indicate plagiarism
const GENERIC_PATTERNS = [
  /i would like to/i,
  /thank you for this opportunity/i,
  /i am excited to/i,
  /i am passionate about/i,
  /i believe that/i,
  /in today's competitive/i,
  /as we all know/i,
  /it is evident that/i,
  /last but not least/i,
  /first and foremost/i,
];

// Overly formal/generic phrases often found in plagiarized content
const FORMAL_GENERIC_PHRASES = [
  'according to the research',
  'it has been proven',
  'studies have shown',
  'experts agree',
  'it is widely acknowledged',
  'the consensus is',
];

// Minimum length for meaningful analysis
const MIN_ANSWER_LENGTH = 20;

/**
 * Calculate similarity between two strings
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  // Simple word-based similarity
  const words1 = str1.toLowerCase().split(/\s+/);
  const words2 = str2.toLowerCase().split(/\s+/);
  const commonWords = words1.filter(word => words2.includes(word) && word.length > 2);
  const totalWords = Math.max(words1.length, words2.length);
  
  return commonWords.length / totalWords;
}

/**
 * Detect similar answers across multiple questions (copy-paste detection)
 */
function detectAnswerSimilarity(answers: string[]): number {
  if (answers.length < 2) return 0;
  
  let totalSimilarity = 0;
  let comparisons = 0;
  
  for (let i = 0; i < answers.length; i++) {
    for (let j = i + 1; j < answers.length; j++) {
      if (answers[i].length >= MIN_ANSWER_LENGTH && answers[j].length >= MIN_ANSWER_LENGTH) {
        const similarity = calculateSimilarity(answers[i], answers[j]);
        totalSimilarity += similarity;
        comparisons++;
      }
    }
  }
  
  if (comparisons === 0) return 0;
  
  const avgSimilarity = totalSimilarity / comparisons;
  // High similarity (above 0.5) suggests copy-paste
  return avgSimilarity > 0.5 ? Math.round((avgSimilarity - 0.5) * 100) : 0;
}

/**
 * Analyze a single answer for plagiarism
 */
function analyzeAnswer(answer: string): number {
  if (!answer || answer.trim().length === 0) {
    return 100; // No answer = high plagiarism risk
  }
  
  let score = 0;
  const lowerAnswer = answer.toLowerCase();
  
  // Check for generic patterns
  for (const pattern of GENERIC_PATTERNS) {
    if (pattern.test(answer)) {
      score += 5;
    }
  }
  
  // Check for formal generic phrases
  for (const phrase of FORMAL_GENERIC_PHRASES) {
    if (lowerAnswer.includes(phrase)) {
      score += 8;
    }
  }
  
  // Check for very short answers
  if (answer.length < MIN_ANSWER_LENGTH) {
    score += 15;
  }
  
  // Check for repetitive content
  const words = answer.split(/\s+/);
  const wordFrequency: Record<string, number> = {};
  words.forEach(word => {
    const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
    if (cleanWord.length > 3) {
      wordFrequency[cleanWord] = (wordFrequency[cleanWord] || 0) + 1;
    }
  });
  
  const maxFrequency = Math.max(...Object.values(wordFrequency), 0);
  if (maxFrequency > words.length * 0.15) {
    score += 10;
  }
  
  return Math.min(score, 50);
}

/**
 * Calculate overall plagiarism score from multiple answers
 */
export function calculatePlagiarismScore(answers: AnswerItem[]): PlagiarismResult {
  if (!answers || answers.length === 0) {
    return {
      overallPlagiarism: 0,
      authenticityScore: 100,
      details: []
    };
  }
  
  // Analyze each answer
  const answerAnalyses = answers.map(a => ({
    answer: a.answer,
    plagiarismScore: analyzeAnswer(a.answer)
  }));
  
  // Calculate average plagiarism score from individual answers
  const avgPlagiarism = answerAnalyses.reduce((sum, analysis) => sum + analysis.plagiarismScore, 0) / answerAnalyses.length;
  
  // Check for similarity between answers (copy-paste detection)
  const answerTexts = answers.map(a => a.answer);
  const similarityScore = detectAnswerSimilarity(answerTexts);
  
  // Combine scores (weighted: 70% individual analysis, 30% similarity)
  const overallPlagiarism = Math.round(
    avgPlagiarism * 0.7 + similarityScore * 0.3
  );
  
  const authenticityScore = Math.max(0, 100 - overallPlagiarism);
  
  return {
    overallPlagiarism,
    authenticityScore,
    details: answerAnalyses
  };
}

