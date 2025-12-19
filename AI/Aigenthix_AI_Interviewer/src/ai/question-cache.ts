/**
 * @fileOverview Question caching system for faster response times
 */

interface CachedQuestion {
  question: string;
  category: string;
  timestamp: number;
  usageCount: number;
}

// In-memory cache for questions
const questionCache = new Map<string, CachedQuestion[]>();

// Cache expiration time (1 hour)
const CACHE_EXPIRY = 60 * 60 * 1000;

/**
 * Get cached questions for a specific key
 */
export function getCachedQuestions(key: string): string[] {
  const cached = questionCache.get(key);
  if (!cached) return [];
  
  // Filter out expired entries
  const now = Date.now();
  const validQuestions = cached.filter(q => now - q.timestamp < CACHE_EXPIRY);
  
  // Update cache with valid questions
  questionCache.set(key, validQuestions);
  
  return validQuestions.map(q => q.question);
}

/**
 * Cache questions for a specific key
 */
export function cacheQuestions(key: string, questions: string[], category: string = 'general'): void {
  const now = Date.now();
  const cachedQuestions: CachedQuestion[] = questions.map(question => ({
    question,
    category,
    timestamp: now,
    usageCount: 0,
  }));
  
  questionCache.set(key, cachedQuestions);
}

/**
 * Get a random question from cache
 */
export function getRandomCachedQuestion(key: string): string | null {
  const questions = getCachedQuestions(key);
  if (questions.length === 0) return null;
  
  const randomIndex = Math.floor(Math.random() * questions.length);
  return questions[randomIndex];
}

/**
 * Generate cache key for different scenarios
 */
export function generateCacheKey(
  jobRole: string,
  college?: string,
  background?: string,
  category?: string
): string {
  const parts = [jobRole];
  if (college) parts.push(college);
  if (background) parts.push(background);
  if (category) parts.push(category);
  return parts.join('-');
}

/**
 * Pre-generate common questions for faster response
 */
export async function preGenerateQuestions(): Promise<void> {
  const commonScenarios = [
    { jobRole: 'cat', college: 'iim-ahmedabad', category: 'aptitude' },
    { jobRole: 'cat', college: 'iim-bangalore', category: 'aptitude' },
    { jobRole: 'cat', college: 'iim-calcutta', category: 'aptitude' },
    { jobRole: 'cat', category: 'aptitude' },
    { jobRole: 'cat', category: 'hr' },
    { jobRole: 'cat', category: 'technical' },
  ];
  
  // Pre-generate questions for common scenarios
  for (const scenario of commonScenarios) {
    const key = generateCacheKey(scenario.jobRole, scenario.college, undefined, scenario.category);
    
    // Only pre-generate if not already cached
    if (!questionCache.has(key)) {
      const sampleQuestions = [
        "Tell me about yourself and your background.",
        "Why do you want to pursue an MBA?",
        "What are your short-term and long-term career goals?",
        "Describe a challenging situation you faced and how you handled it.",
        "What are your strengths and weaknesses?",
        "How do you handle stress and pressure?",
        "Tell me about a time when you had to work in a team.",
        "What motivates you in your career?",
        "How do you stay updated with current affairs?",
        "What do you know about our institution?",
      ];
      
      cacheQuestions(key, sampleQuestions, scenario.category);
    }
  }
}

/**
 * Clear expired cache entries
 */
export function clearExpiredCache(): void {
  const now = Date.now();
  for (const [key, questions] of questionCache.entries()) {
    const validQuestions = questions.filter(q => now - q.timestamp < CACHE_EXPIRY);
    if (validQuestions.length === 0) {
      questionCache.delete(key);
    } else {
      questionCache.set(key, validQuestions);
    }
  }
}


