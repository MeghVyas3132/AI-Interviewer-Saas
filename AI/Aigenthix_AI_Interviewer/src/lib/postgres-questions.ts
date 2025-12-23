/**
 * PostgreSQL-based question reference system
 */

import { query } from './postgres';

export interface InterviewQuestion {
  id: number;
  category: string;
  subcategory: string;
  subsection: string;
  question: string;
}

export interface CATInterviewQuestion {
  id: number;
  category: string;
  subcategory: string;
  subsection: string;
  question: string;
}

/**
 * Gets all interview questions from PostgreSQL (both questions and cat_questions tables)
 */
export async function getAllInterviewQuestions(): Promise<InterviewQuestion[]> {
  try {
    // Fetch from both tables using UNION and wrap in subquery for ORDER BY
    const result = await query(`
      SELECT * FROM (
        SELECT id, category, subcategory, subsection, question FROM questions WHERE is_active = true
        UNION ALL
        SELECT id, category, subcategory, subsection, question FROM cat_questions WHERE is_active = true
      ) AS combined_questions
      ORDER BY RANDOM()
    `);
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching questions from PostgreSQL:', error);
    return [];
  }
}

/**
 * Gets random interview questions for variety (from both tables)
 */
export async function getRandomInterviewQuestions(limit: number = 20, examId?: number, subcategoryId?: number): Promise<InterviewQuestion[]> {
  try {
    const allQuestions: InterviewQuestion[] = [];
    
    // Get questions from questions table with exam/subcategory filtering
    let questionsQuery = `SELECT id, category, subcategory, subsection, question FROM questions WHERE is_active = true`;
    const questionsParams: any[] = [];
    let paramCount = 0;
    
    if (examId !== undefined) {
      paramCount++;
      questionsQuery += ` AND exam_id = $${paramCount}`;
      questionsParams.push(examId);
    }
    
    if (subcategoryId !== undefined) {
      paramCount++;
      questionsQuery += ` AND subcategory_id = $${paramCount}`;
      questionsParams.push(subcategoryId);
    }
    
    const questionsResult = await query(questionsQuery, questionsParams);
    allQuestions.push(...questionsResult.rows);
    
    // Only get questions from cat_questions table if we don't have enough questions from the questions table
    // This prevents overwhelming correct results with too many cat_questions
    if (allQuestions.length < limit) {
      // Get questions from cat_questions table
      // First try to filter by exam/subcategory name if available
      let catQuestionsQuery = `SELECT id, category, subcategory, subsection, question FROM cat_questions WHERE is_active = true`;
      const catQuestionsParams: any[] = [];
      
      // If we have exam and subcategory IDs, try to get their names and filter by category/subcategory
      if (examId !== undefined && subcategoryId !== undefined) {
        try {
          const examResult = await query(`SELECT name FROM exams WHERE id = $1`, [examId]);
          const subcategoryResult = await query(`SELECT name FROM subcategories WHERE id = $1`, [subcategoryId]);
          
          if (examResult.rows.length > 0 && subcategoryResult.rows.length > 0) {
            const examName = examResult.rows[0].name;
            const subcategoryName = subcategoryResult.rows[0].name;
            
            // Try to filter by exam name AND subcategory name in cat_questions
            catQuestionsQuery += ` AND category ILIKE $1 AND subcategory ILIKE $2`;
            catQuestionsParams.push(`%${examName}%`, `%${subcategoryName}%`);
          }
        } catch (error) {
          console.warn('Failed to get exam/subcategory names for filtering:', error);
        }
      }
      
      const catQuestionsResult = await query(catQuestionsQuery, catQuestionsParams);
      allQuestions.push(...catQuestionsResult.rows);
    }
    
    // Shuffle and limit results
    const shuffled = allQuestions.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, limit);
  } catch (error) {
    console.error('Error fetching random questions from PostgreSQL:', error);
    return [];
  }
}

/**
 * Gets random questions by category for variety (from both tables)
 */
export async function getRandomQuestionsByCategory(category: string, limit: number = 15, examId?: number, subcategoryId?: number): Promise<InterviewQuestion[]> {
  try {
    const allQuestions: InterviewQuestion[] = [];
    
    // Get questions from questions table with exam/subcategory filtering
    let questionsQuery = `SELECT id, category, subcategory, subsection, question FROM questions WHERE is_active = true AND category = $1`;
    const questionsParams: any[] = [category];
    let paramCount = 1;
    
    if (examId !== undefined) {
      paramCount++;
      questionsQuery += ` AND exam_id = $${paramCount}`;
      questionsParams.push(examId);
    }
    
    if (subcategoryId !== undefined) {
      paramCount++;
      questionsQuery += ` AND subcategory_id = $${paramCount}`;
      questionsParams.push(subcategoryId);
    }
    
    const questionsResult = await query(questionsQuery, questionsParams);
    allQuestions.push(...questionsResult.rows);
    
    // Only get questions from cat_questions table if we don't have enough questions from the questions table
    if (allQuestions.length < limit) {
      // Get questions from cat_questions table
      let catQuestionsQuery = `SELECT id, category, subcategory, subsection, question FROM cat_questions WHERE is_active = true AND category = $1`;
      const catQuestionsParams = [category];
      
      // If we have exam and subcategory IDs, try to get their names and filter by subcategory name
      if (examId !== undefined && subcategoryId !== undefined) {
        try {
          const subcategoryResult = await query(`SELECT name FROM subcategories WHERE id = $1`, [subcategoryId]);
          
          if (subcategoryResult.rows.length > 0) {
            const subcategoryName = subcategoryResult.rows[0].name;
            
            // Try to filter by subcategory name in cat_questions
            catQuestionsQuery += ` AND subcategory ILIKE $2`;
            catQuestionsParams.push(`%${subcategoryName}%`);
          }
        } catch (error) {
          console.warn('Failed to get subcategory name for filtering:', error);
        }
      }
      
      const catQuestionsResult = await query(catQuestionsQuery, catQuestionsParams);
      allQuestions.push(...catQuestionsResult.rows);
    }
    
    // Shuffle and limit results
    const shuffled = allQuestions.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, limit);
  } catch (error) {
    console.error('Error fetching random questions by category from PostgreSQL:', error);
    return [];
  }
}

/**
 * Gets diverse questions from multiple categories for maximum variety
 */
export async function getDiverseQuestions(categories: string[], limitPerCategory: number = 5, examId?: number, subcategoryId?: number): Promise<InterviewQuestion[]> {
  try {
    const allQuestions: InterviewQuestion[] = [];
    
    for (const category of categories) {
      const questions = await getRandomQuestionsByCategory(category, limitPerCategory, examId, subcategoryId);
      allQuestions.push(...questions);
    }
    
    // Shuffle the combined results for maximum diversity
    return allQuestions.sort(() => Math.random() - 0.5);
  } catch (error) {
    console.error('Error fetching diverse questions from PostgreSQL:', error);
    return [];
  }
}

/**
 * Gets interview questions filtered by category (from both tables)
 */
export async function getQuestionsByCategory(category: string): Promise<InterviewQuestion[]> {
  try {
    const result = await query(`
      SELECT id, category, subcategory, subsection, question FROM questions WHERE is_active = true AND category = $1
      UNION ALL
      SELECT id, category, subcategory, subsection, question FROM cat_questions WHERE is_active = true AND category = $1
    `, [category]);
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching questions by category:', error);
    return [];
  }
}

/**
 * Gets interview questions filtered by subcategory (from both tables)
 */
export async function getQuestionsBySubcategory(subcategory: string): Promise<InterviewQuestion[]> {
  try {
    const result = await query(`
      SELECT id, category, subcategory, subsection, question FROM questions WHERE is_active = true AND subcategory = $1
      UNION ALL
      SELECT id, category, subcategory, subsection, question FROM cat_questions WHERE is_active = true AND subcategory = $1
    `, [subcategory]);
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching questions by subcategory:', error);
    return [];
  }
}

/**
 * Gets interview questions filtered by subsection (from both tables)
 */
export async function getQuestionsBySubsection(subsection: string): Promise<InterviewQuestion[]> {
  try {
    const result = await query(`
      SELECT id, category, subcategory, subsection, question FROM questions WHERE is_active = true AND subsection = $1
      UNION ALL
      SELECT id, category, subcategory, subsection, question FROM cat_questions WHERE is_active = true AND subsection = $1
    `, [subsection]);
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching questions by subsection:', error);
    return [];
  }
}

/**
 * Gets a random sample of interview questions (from both tables)
 */
export async function getRandomQuestions(count: number): Promise<InterviewQuestion[]> {
  try {
    const result = await query(`
      SELECT * FROM (
        SELECT id, category, subcategory, subsection, question FROM questions WHERE is_active = true
        UNION ALL
        SELECT id, category, subcategory, subsection, question FROM cat_questions WHERE is_active = true
      ) AS combined_questions
      ORDER BY RANDOM() LIMIT $1
    `, [count]);
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching random questions:', error);
    return [];
  }
}

/**
 * Gets questions filtered by exam ID (from both tables)
 */
export async function getQuestionsByExam(examId: number): Promise<InterviewQuestion[]> {
  try {
    const result = await query(`
      SELECT id, category, subcategory, subsection, question FROM questions WHERE is_active = true AND exam_id = $1
      UNION ALL
      SELECT id, category, subcategory, subsection, question FROM cat_questions WHERE is_active = true AND exam_id = $1
    `, [examId]);
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching questions by exam:', error);
    return [];
  }
}

/**
 * Gets questions filtered by subcategory ID (from both tables)
 */
export async function getQuestionsBySubcategoryId(subcategoryId: number): Promise<InterviewQuestion[]> {
  try {
    const result = await query(`
      SELECT id, category, subcategory, subsection, question FROM questions WHERE is_active = true AND subcategory_id = $1
      UNION ALL
      SELECT id, category, subcategory, subsection, question FROM cat_questions WHERE is_active = true AND subcategory_id = $1
    `, [subcategoryId]);
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching questions by subcategory ID:', error);
    return [];
  }
}

/**
 * Gets questions filtered by multiple criteria (from both tables)
 */
export async function getQuestionsByFilters(filters: {
  examId?: number;
  subcategoryId?: number;
  category?: string;
  subcategory?: string;
  subsection?: string;
  limit?: number;
}): Promise<InterviewQuestion[]> {
  try {
    let whereClause = 'WHERE is_active = true';
    const params: any[] = [];
    let paramCount = 0;

    if (filters.examId) {
      paramCount++;
      whereClause += ` AND exam_id = $${paramCount}`;
      params.push(filters.examId);
    }

    if (filters.subcategoryId) {
      paramCount++;
      whereClause += ` AND subcategory_id = $${paramCount}`;
      params.push(filters.subcategoryId);
    }

    if (filters.category) {
      paramCount++;
      whereClause += ` AND category ILIKE $${paramCount}`;
      params.push(`%${filters.category}%`);
    }

    if (filters.subcategory) {
      paramCount++;
      whereClause += ` AND subcategory ILIKE $${paramCount}`;
      params.push(`%${filters.subcategory}%`);
    }

    if (filters.subsection) {
      paramCount++;
      whereClause += ` AND subsection ILIKE $${paramCount}`;
      params.push(`%${filters.subsection}%`);
    }

    const limitClause = filters.limit ? ` LIMIT $${paramCount + 1}` : '';
    if (filters.limit) {
      params.push(filters.limit);
    }

    const result = await query(`
      SELECT * FROM (
        SELECT id, category, subcategory, subsection, question FROM questions ${whereClause}
        UNION ALL
        SELECT id, category, subcategory, subsection, question FROM cat_questions ${whereClause}
      ) AS combined_questions
      ORDER BY RANDOM()${limitClause}
    `, params);
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching questions by filters:', error);
    return [];
  }
}

/**
 * Searches for interview questions containing specific keywords (from both tables)
 */
export async function searchQuestionsByKeywords(keywords: string[], examId?: number, subcategoryId?: number): Promise<InterviewQuestion[]> {
  try {
    if (keywords.length === 0) {
      return [];
    }
    
    const allQuestions: InterviewQuestion[] = [];
    
    // Create parameterized conditions for each keyword
    const keywordConditions = keywords.map((_, index) => `question ILIKE $${index + 1}`).join(' OR ');
    const keywordParams = keywords.map(keyword => `%${keyword}%`);
    
    // Search in questions table with exam/subcategory filtering
    let questionsWhereClause = `WHERE is_active = true AND (${keywordConditions})`;
    const questionsParams = [...keywordParams];
    let paramCount = keywords.length;
    
    if (examId !== undefined) {
      paramCount++;
      questionsWhereClause += ` AND exam_id = $${paramCount}`;
      questionsParams.push(examId);
    }
    
    if (subcategoryId !== undefined) {
      paramCount++;
      questionsWhereClause += ` AND subcategory_id = $${paramCount}`;
      questionsParams.push(subcategoryId);
    }
    
    const questionsResult = await query(`
      SELECT id, category, subcategory, subsection, question FROM questions ${questionsWhereClause}
    `, questionsParams);
    
    allQuestions.push(...questionsResult.rows);
    
    // Only search in cat_questions table if we don't have enough questions from the questions table
    // This prevents overwhelming correct results with too many cat_questions
    if (allQuestions.length < 10) { // Use a reasonable threshold for keyword search
      // Search in cat_questions table
      let catQuestionsWhereClause = `WHERE is_active = true AND (${keywordConditions})`;
      const catQuestionsParams = [...keywordParams];
      
      // If we have exam and subcategory IDs, try to get their names and filter by category/subcategory
      if (examId !== undefined && subcategoryId !== undefined) {
        try {
          const examResult = await query(`SELECT name FROM exams WHERE id = $1`, [examId]);
          const subcategoryResult = await query(`SELECT name FROM subcategories WHERE id = $1`, [subcategoryId]);
          
          if (examResult.rows.length > 0 && subcategoryResult.rows.length > 0) {
            const examName = examResult.rows[0].name;
            const subcategoryName = subcategoryResult.rows[0].name;
            
            // Try to filter by exam name AND subcategory name in cat_questions
            catQuestionsWhereClause += ` AND category ILIKE $${keywordParams.length + 1} AND subcategory ILIKE $${keywordParams.length + 2}`;
            catQuestionsParams.push(`%${examName}%`, `%${subcategoryName}%`);
          }
        } catch (error) {
          console.warn('Failed to get exam/subcategory names for filtering:', error);
        }
      }
      
      const catQuestionsResult = await query(`
        SELECT id, category, subcategory, subsection, question FROM cat_questions ${catQuestionsWhereClause}
      `, catQuestionsParams);
      
      allQuestions.push(...catQuestionsResult.rows);
    }
    
    return allQuestions;
  } catch (error) {
    console.error('Error searching questions by keywords:', error);
    return [];
  }
}

// CAT Questions functions
let catQuestions: CATInterviewQuestion[] = [];
let catQuestionsLoaded = false;
let catQuestionsPromise: Promise<CATInterviewQuestion[]> | null = null;

/**
 * Load CAT questions from PostgreSQL with caching
 */
async function loadCATQuestions(): Promise<CATInterviewQuestion[]> {
  if (catQuestionsLoaded) {
    return catQuestions;
  }
  
  if (catQuestionsPromise) {
    return catQuestionsPromise;
  }
  
  catQuestionsPromise = (async () => {
    try {
      const result = await query(
        'SELECT id, category, subcategory, subsection, question FROM cat_questions WHERE is_active = true'
      );
      
      catQuestions = result.rows;
      catQuestionsLoaded = true;
      return catQuestions;
    } catch (error) {
      console.error('Failed to load CAT questions from PostgreSQL:', error);
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
