'use server';

/**
 * @fileOverview CAT interview question reference system for generating college and background-specific questions.
 * 
 * Guidelines:
 * - Background-specific questions: Generate questions matching candidate's degree
 * - Difficulty adaptation: Use institute-specific question patterns
 * - Don't copy verbatim: Use as inspiration, not direct copying
 * - Respect copyright: These are real interview questions
 * - Add value: Generate new, improved questions
 * - Review generated questions: Ensure they make sense
 */

export interface CATInterviewQuestion {
  id: number;
  category: string;
  subcategory: string;
  subsection: string; // Contains college info and background
  question: string;
}

let catQuestions: CATInterviewQuestion[] = [];
let catQuestionsLoaded = false;
let catQuestionsPromise: Promise<CATInterviewQuestion[]> | null = null;

// Load CAT questions on first access with caching
async function loadCATQuestions(): Promise<CATInterviewQuestion[]> {
  if (catQuestionsLoaded) {
    return catQuestions;
  }
  
  if (catQuestionsPromise) {
    return catQuestionsPromise;
  }
  
  catQuestionsPromise = (async () => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join(process.cwd(), 'cat_interview_questions.json');
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      catQuestions = JSON.parse(fileContent);
      catQuestionsLoaded = true;
      return catQuestions;
    } catch (error) {
      console.error('Failed to load CAT interview questions:', error);
      catQuestionsLoaded = true; // Prevent retries
      return [];
    }
  })();
  
  return catQuestionsPromise;
}

/**
 * Get CAT questions for a specific college/institute
 */
export async function getCATQuestionsByCollege(college: string): Promise<CATInterviewQuestion[]> {
  const questions = await loadCATQuestions();
  
  // Map our college values to actual college names in the data
  const collegeMapping: Record<string, string[]> = {
    'iim-ahmedabad': ['IIM Ahmedabad'],
    'iim-bangalore': ['IIM Bangalore'],
    'iim-calcutta': ['IIM Calcutta'],
    'iim-indore': ['IIM Indore'],
    'iim-lucknow': ['IIM Lucknow'],
    'iim-kozhikode': ['IIM Kozhikode'],
    'iim-cap': ['CAP', 'IIM CAP'],
    'iim-amritsar': ['IIM Amritsar'],
    'iim-shillong': ['IIM Shillong'],
    'iim-rohtak': ['IIM Rohtak'],
    'iim-raipur': ['IIM Raipur'],
    'iim-mumbai': ['IIM Mumbai'],
    'iim-udaipur': ['IIM Udaipur'],
    'iim-kashipur': ['IIM Kashipur'],
    'fms-delhi': ['FMS Delhi'],
    'iift': ['IIFT'],
    'xlri': ['XLRI'],
    'spjimr': ['SPJIMR'],
    'mdi-gurgaon': ['MDI Gurgaon'],
    'imt': ['IMT'],
    'nmims': ['NMIMS'],
    'ximb': ['XIMB'],
    'mica': ['MICA'],
    'sibm-pune': ['SIBM Pune'],
    'scmhrd': ['SCMHRD']
  };

  const searchTerms = collegeMapping[college] || [college];
  
  return questions.filter(q => 
    searchTerms.some(term => 
      q.subsection.toLowerCase().includes(term.toLowerCase())
    )
  );
}

/**
 * Get CAT questions by academic background/degree
 */
export async function getCATQuestionsByBackground(background: string): Promise<CATInterviewQuestion[]> {
  const questions = await loadCATQuestions();
  
  // Common degree patterns to search for
  const backgroundMapping: Record<string, string[]> = {
    'engineering': ['B.Tech', 'B.E.', 'Engineering'],
    'computer-science': ['CSE', 'Computer Science', 'IT'],
    'commerce': ['B.Com', 'Commerce'],
    'arts': ['B.A.', 'Arts', 'Literature', 'Political Science'],
    'science': ['B.Sc.', 'Physics', 'Chemistry', 'Mathematics'],
    'medicine': ['MBBS', 'BDS', 'Medical'],
    'economics': ['Economics', 'Econ'],
    'finance': ['Finance', 'CFA'],
    'management': ['BBA', 'Management'],
    'law': ['LLB', 'Law']
  };

  const searchTerms = backgroundMapping[background] || [background];
  
  return questions.filter(q => 
    searchTerms.some(term => 
      q.subsection.toLowerCase().includes(term.toLowerCase())
    )
  );
}

/**
 * Get CAT questions by both college and background for more targeted results
 */
export async function getCATQuestionsByCollegeAndBackground(
  college: string, 
  background?: string
): Promise<CATInterviewQuestion[]> {
  const collegeQuestions = await getCATQuestionsByCollege(college);
  
  if (!background) {
    return collegeQuestions;
  }
  
  const backgroundQuestions = await getCATQuestionsByBackground(background);
  
  // Combine and deduplicate
  const combinedQuestions = [...collegeQuestions];
  
  // Add background questions that aren't already included
  backgroundQuestions.forEach(bq => {
    if (!combinedQuestions.find(cq => cq.id === bq.id)) {
      combinedQuestions.push(bq);
    }
  });
  
  return combinedQuestions;
}

/**
 * Get sample CAT questions for inspiration (used when generating new questions)
 * Returns a diverse set of questions from similar contexts
 */
export async function getSampleCATQuestions(
  college: string,
  background?: string,
  limit: number = 10
): Promise<CATInterviewQuestion[]> {
  const targetedQuestions = await getCATQuestionsByCollegeAndBackground(college, background);
  
  if (targetedQuestions.length >= limit) {
    // Shuffle and return limited set
    const shuffled = [...targetedQuestions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, limit);
  }
  
  // If we don't have enough targeted questions, supplement with general CAT questions
  const allQuestions = await loadCATQuestions();
  const generalCATQuestions = allQuestions.filter(q => 
    q.subcategory === 'CAT' && !targetedQuestions.find(tq => tq.id === q.id)
  );
  
  const additionalNeeded = limit - targetedQuestions.length;
  const shuffledGeneral = [...generalCATQuestions].sort(() => Math.random() - 0.5);
  
  return [
    ...targetedQuestions,
    ...shuffledGeneral.slice(0, additionalNeeded)
  ];
}

/**
 * Analyze question patterns for a specific college/background combination
 * Returns insights about the types of questions typically asked
 */
export async function analyzeCATQuestionPatterns(
  college: string,
  background?: string
): Promise<{
  totalQuestions: number;
  commonTopics: string[];
  questionTypes: string[];
  difficulty: 'basic' | 'intermediate' | 'advanced';
}> {
  const questions = await getCATQuestionsByCollegeAndBackground(college, background);
  
  // Analyze question content to identify patterns
  const questionTexts = questions.map(q => q.question.toLowerCase());
  
  // Identify common topics/keywords
  const topicKeywords = [
    'algorithm', 'technical', 'programming', 'software',
    'business', 'management', 'strategy', 'leadership',
    'current affairs', 'politics', 'economics', 'finance',
    'culture', 'society', 'ethics', 'philosophy',
    'goals', 'career', 'future', 'experience',
    'teamwork', 'conflict', 'decision', 'problem'
  ];
  
  const commonTopics = topicKeywords.filter(keyword =>
    questionTexts.some(text => text.includes(keyword))
  );
  
  // Determine question types
  const questionTypes: string[] = [];
  if (questionTexts.some(text => text.includes('why'))) questionTypes.push('why-questions');
  if (questionTexts.some(text => text.includes('what'))) questionTypes.push('what-questions');
  if (questionTexts.some(text => text.includes('how'))) questionTypes.push('how-questions');
  if (questionTexts.some(text => text.includes('explain'))) questionTypes.push('explanation-questions');
  
  // Estimate difficulty based on question complexity
  const avgLength = questionTexts.reduce((sum, text) => sum + text.length, 0) / questionTexts.length;
  const difficulty = avgLength > 100 ? 'advanced' : avgLength > 50 ? 'intermediate' : 'basic';
  
  return {
    totalQuestions: questions.length,
    commonTopics,
    questionTypes,
    difficulty
  };
}

/**
 * Detect academic background from resume text
 */
export async function detectAcademicBackground(resumeText: string): Promise<string | undefined> {
  const text = resumeText.toLowerCase();
  
  // Engineering patterns
  if (text.includes('b.tech') || text.includes('b.e.') || text.includes('engineering') || 
      text.includes('computer science') || text.includes('cse') || text.includes('ece') ||
      text.includes('mechanical') || text.includes('civil') || text.includes('electrical')) {
    if (text.includes('computer') || text.includes('cse') || text.includes('software')) {
      return 'computer-science';
    }
    return 'engineering';
  }
  
  // Commerce patterns
  if (text.includes('b.com') || text.includes('commerce') || text.includes('accounting') ||
      text.includes('finance') || text.includes('economics')) {
    if (text.includes('finance') || text.includes('cfa')) {
      return 'finance';
    }
    if (text.includes('economics')) {
      return 'economics';
    }
    return 'commerce';
  }
  
  // Arts patterns
  if (text.includes('b.a.') || text.includes('arts') || text.includes('literature') ||
      text.includes('political science') || text.includes('sociology') || text.includes('psychology')) {
    return 'arts';
  }
  
  // Science patterns
  if (text.includes('b.sc') || text.includes('physics') || text.includes('chemistry') ||
      text.includes('mathematics') || text.includes('biology')) {
    return 'science';
  }
  
  // Medicine patterns
  if (text.includes('mbbs') || text.includes('bds') || text.includes('medical') ||
      text.includes('doctor') || text.includes('physician')) {
    return 'medicine';
  }
  
  // Management patterns
  if (text.includes('bba') || text.includes('management') || text.includes('business administration')) {
    return 'management';
  }
  
  // Law patterns
  if (text.includes('llb') || text.includes('law') || text.includes('legal')) {
    return 'law';
  }
  
  return undefined;
}

// Cache for CAT insights to avoid repeated processing
const insightsCache = new Map<string, string>();

/**
 * Extract key insights from CAT questions for prompt enhancement
 */
export async function getCATQuestionInsights(
  college: string,
  background?: string,
  resumeText?: string
): Promise<string> {
  // Create cache key
  const cacheKey = `${college}-${background || 'none'}-${resumeText ? 'with-resume' : 'no-resume'}`;
  
  // Check cache first
  if (insightsCache.has(cacheKey)) {
    return insightsCache.get(cacheKey)!;
  }
  
  // Auto-detect background from resume if not provided
  const detectedBackground = resumeText ? await detectAcademicBackground(resumeText) : undefined;
  const finalBackground = background || detectedBackground;
  
  const analysis = await analyzeCATQuestionPatterns(college, finalBackground);
  const sampleQuestions = await getSampleCATQuestions(college, finalBackground, 5);
  
  const insights = [
    `Based on ${analysis.totalQuestions} real CAT interview questions from ${college}${finalBackground ? ` for ${finalBackground} background` : ''}:`,
    ...(detectedBackground && !background ? [`Auto-detected academic background: ${detectedBackground}`] : []),
    '',
    'Common Question Patterns:',
    ...analysis.questionTypes.map(type => `- ${type.replace('-', ' ')}`),
    '',
    'Typical Topics Covered:',
    ...analysis.commonTopics.slice(0, 8).map(topic => `- ${topic}`),
    '',
    'Question Difficulty Level: ' + analysis.difficulty,
    '',
    'Sample Question Styles (for inspiration only):',
    ...sampleQuestions.slice(0, 3).map((q, i) => `${i + 1}. ${q.question.substring(0, 100)}...`),
    '',
    'Note: Generate NEW questions inspired by these patterns, not direct copies.'
  ].join('\n');
  
  // Cache the result
  insightsCache.set(cacheKey, insights);
  
  return insights;
}
