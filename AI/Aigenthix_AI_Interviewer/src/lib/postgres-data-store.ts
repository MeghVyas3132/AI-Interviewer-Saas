/**
 * PostgreSQL data store for admin panel
 */

import { query, initializeDatabase } from './postgres';
import { cache, CacheKeys } from './cache';
import { validateColumnName, sanitizeUpdateObject } from './input-validation';

export interface Exam {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface Subcategory {
  id: number;
  exam_id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface Question {
  id: number;
  exam_id: number;
  subcategory_id: number;
  category: string;
  subcategory: string;
  subsection: string;
  question: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface CATQuestion {
  id: number;
  category: string;
  subcategory: string;
  subsection: string;
  question: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface ExamConfig {
  id: number;
  exam_id: number;
  subcategory_id: number;
  num_questions: number;
  randomize_questions: boolean;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

// Exams
export async function getExams(): Promise<Exam[]> {
  const result = await query(
    'SELECT * FROM exams WHERE is_active = true ORDER BY created_at DESC'
  );
  return result.rows;
}

export async function getExamById(id: number): Promise<Exam | null> {
  // Use cache for frequently accessed exam data
  return cache.getOrSet(
    CacheKeys.exam(id),
    async () => {
      const result = await query(
        'SELECT * FROM exams WHERE id = $1 AND is_active = true',
        [id]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    },
    600000 // Cache for 10 minutes
  );
}

export async function createExam(exam: Omit<Exam, 'id' | 'created_at' | 'updated_at'>): Promise<Exam> {
  const result = await query(
    'INSERT INTO exams (name, description, is_active) VALUES ($1, $2, $3) RETURNING *',
    [exam.name, exam.description, exam.is_active]
  );
  return result.rows[0];
}

export async function updateExam(id: number, updates: Partial<Exam>): Promise<void> {
  // Security: Whitelist allowed columns to prevent SQL injection
  const allowedKeys = new Set(['name', 'description', 'is_active']);
  const sanitized = sanitizeUpdateObject(updates, allowedKeys);
  
  if (Object.keys(sanitized).length === 0) {
    throw new Error('No valid fields to update');
  }
  
  const setClause = Object.keys(sanitized)
    .filter(key => validateColumnName(key))
    .map((key, index) => `${key} = $${index + 2}`)
    .join(', ');
  
  const values = Object.values(sanitized);
  
  await query(
    `UPDATE exams SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id, ...values]
  );
  
  // Invalidate cache
  cache.delete(CacheKeys.exam(id));
}

export async function deleteExam(id: number): Promise<void> {
  await query('UPDATE exams SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
}

// Subcategories
export async function getSubcategories(examId?: number): Promise<Subcategory[]> {
  if (examId) {
    const result = await query(
      'SELECT * FROM subcategories WHERE exam_id = $1 AND is_active = true ORDER BY created_at DESC',
      [examId]
    );
    return result.rows;
  } else {
    const result = await query(
      'SELECT * FROM subcategories WHERE is_active = true ORDER BY created_at DESC'
    );
    return result.rows;
  }
}

export async function getSubcategoryById(id: number): Promise<Subcategory | null> {
  // Use cache for frequently accessed subcategory data
  return cache.getOrSet(
    CacheKeys.subcategory(id),
    async () => {
      const result = await query(
        'SELECT * FROM subcategories WHERE id = $1 AND is_active = true',
        [id]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    },
    600000 // Cache for 10 minutes
  );
}

export async function createSubcategory(subcategory: Omit<Subcategory, 'id' | 'created_at' | 'updated_at'>): Promise<Subcategory> {
  const result = await query(
    'INSERT INTO subcategories (exam_id, name, description, is_active) VALUES ($1, $2, $3, $4) RETURNING *',
    [subcategory.exam_id, subcategory.name, subcategory.description, subcategory.is_active]
  );
  return result.rows[0];
}

export async function updateSubcategory(id: number, updates: Partial<Subcategory>): Promise<void> {
  // Security: Whitelist allowed columns to prevent SQL injection
  const allowedKeys = new Set(['exam_id', 'name', 'description', 'is_active']);
  const sanitized = sanitizeUpdateObject(updates, allowedKeys);
  
  if (Object.keys(sanitized).length === 0) {
    throw new Error('No valid fields to update');
  }
  
  const setClause = Object.keys(sanitized)
    .filter(key => validateColumnName(key))
    .map((key, index) => `${key} = $${index + 2}`)
    .join(', ');
  
  const values = Object.values(sanitized);
  
  await query(
    `UPDATE subcategories SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id, ...values]
  );
}

export async function deleteSubcategory(id: number): Promise<void> {
  await query('UPDATE subcategories SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
}

// Questions
export async function getQuestions(
  examId?: number, 
  subcategoryId?: number, 
  page = 1, 
  limit = 50,
  category?: string,
  subcategory?: string,
  subsection?: string
): Promise<{ data: Question[], pagination: any }> {
  let whereClause = 'WHERE is_active = true';
  const params: any[] = [];
  let paramCount = 0;

  if (examId) {
    paramCount++;
    whereClause += ` AND exam_id = $${paramCount}`;
    params.push(examId);
  }

  if (subcategoryId) {
    paramCount++;
    whereClause += ` AND subcategory_id = $${paramCount}`;
    params.push(subcategoryId);
  }

  if (category) {
    paramCount++;
    whereClause += ` AND category ILIKE $${paramCount}`;
    params.push(`%${category}%`);
  }

  if (subcategory) {
    paramCount++;
    whereClause += ` AND subcategory ILIKE $${paramCount}`;
    params.push(`%${subcategory}%`);
  }

  if (subsection) {
    paramCount++;
    whereClause += ` AND subsection ILIKE $${paramCount}`;
    params.push(`%${subsection}%`);
  }

  // Get total count
  const countResult = await query(`SELECT COUNT(*) FROM questions ${whereClause}`, params);
  const total = parseInt(countResult.rows[0].count);

  // Get paginated results
  const offset = (page - 1) * limit;
  const result = await query(
    `SELECT * FROM questions ${whereClause} ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
    [...params, limit, offset]
  );

  return {
    data: result.rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

export async function createQuestion(question: Omit<Question, 'id' | 'created_at' | 'updated_at'>): Promise<Question> {
  const result = await query(
    'INSERT INTO questions (exam_id, subcategory_id, category, subcategory, subsection, question, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
    [question.exam_id, question.subcategory_id, question.category, question.subcategory, question.subsection, question.question, question.is_active]
  );
  return result.rows[0];
}

export async function updateQuestion(id: number, updates: Partial<Question>): Promise<void> {
  // Security: Whitelist allowed columns to prevent SQL injection
  const allowedKeys = new Set(['exam_id', 'subcategory_id', 'category', 'subcategory', 'subsection', 'question', 'is_active']);
  const sanitized = sanitizeUpdateObject(updates, allowedKeys);
  
  if (Object.keys(sanitized).length === 0) {
    throw new Error('No valid fields to update');
  }
  
  const setClause = Object.keys(sanitized)
    .filter(key => validateColumnName(key))
    .map((key, index) => `${key} = $${index + 2}`)
    .join(', ');
  
  const values = Object.values(sanitized);
  
  await query(
    `UPDATE questions SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id, ...values]
  );
}

export async function deleteQuestion(id: number): Promise<void> {
  await query('UPDATE questions SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
}

export async function bulkCreateQuestions(questions: Omit<Question, 'id' | 'created_at' | 'updated_at'>[]): Promise<Question[]> {
  const createdQuestions: Question[] = [];
  
  for (const questionData of questions) {
    const question = await createQuestion(questionData);
    createdQuestions.push(question);
  }
  
  return createdQuestions;
}

// Get unique filter values for dropdowns
export async function getQuestionFilterValues(): Promise<{
  categories: string[];
  subcategories: string[];
  subsections: string[];
}> {
  try {
    const [categoryResult, subcategoryResult, subsectionResult] = await Promise.all([
      query('SELECT DISTINCT category FROM questions WHERE is_active = true ORDER BY category'),
      query('SELECT DISTINCT subcategory FROM questions WHERE is_active = true ORDER BY subcategory'),
      query('SELECT DISTINCT subsection FROM questions WHERE is_active = true ORDER BY subsection')
    ]);

    return {
      categories: categoryResult.rows.map(row => row.category),
      subcategories: subcategoryResult.rows.map(row => row.subcategory),
      subsections: subsectionResult.rows.map(row => row.subsection)
    };
  } catch (error) {
    console.error('Error fetching filter values:', error);
    return {
      categories: [],
      subcategories: [],
      subsections: []
    };
  }
}

// CAT Questions
export async function getCATQuestions(
  page = 1, 
  limit = 50,
  category?: string,
  subcategory?: string,
  subsection?: string
): Promise<{ data: CATQuestion[], pagination: any }> {
  let whereClause = 'WHERE is_active = true';
  const params: any[] = [];
  let paramCount = 0;

  if (category) {
    paramCount++;
    whereClause += ` AND category ILIKE $${paramCount}`;
    params.push(`%${category}%`);
  }

  if (subcategory) {
    paramCount++;
    whereClause += ` AND subcategory ILIKE $${paramCount}`;
    params.push(`%${subcategory}%`);
  }

  if (subsection) {
    paramCount++;
    whereClause += ` AND subsection ILIKE $${paramCount}`;
    params.push(`%${subsection}%`);
  }

  // Get total count
  const countResult = await query(`SELECT COUNT(*) FROM cat_questions ${whereClause}`, params);
  const total = parseInt(countResult.rows[0].count);

  // Get paginated results
  const offset = (page - 1) * limit;
  const result = await query(
    `SELECT * FROM cat_questions ${whereClause} ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
    [...params, limit, offset]
  );

  return {
    data: result.rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

export async function createCATQuestion(question: Omit<CATQuestion, 'id' | 'created_at' | 'updated_at'>): Promise<CATQuestion> {
  const result = await query(
    'INSERT INTO cat_questions (category, subcategory, subsection, question, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [question.category, question.subcategory, question.subsection, question.question, question.is_active]
  );
  return result.rows[0];
}

export async function updateCATQuestion(id: number, updates: Partial<CATQuestion>): Promise<void> {
  // Security: Whitelist allowed columns to prevent SQL injection
  const allowedKeys = new Set(['category', 'subcategory', 'subsection', 'question', 'is_active']);
  const sanitized = sanitizeUpdateObject(updates, allowedKeys);
  
  if (Object.keys(sanitized).length === 0) {
    throw new Error('No valid fields to update');
  }
  
  const setClause = Object.keys(sanitized)
    .filter(key => validateColumnName(key))
    .map((key, index) => `${key} = $${index + 2}`)
    .join(', ');
  
  const values = Object.values(sanitized);
  
  await query(
    `UPDATE cat_questions SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id, ...values]
  );
}

export async function deleteCATQuestion(id: number): Promise<void> {
  await query('UPDATE cat_questions SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
}

export async function bulkCreateCATQuestions(questions: Omit<CATQuestion, 'id' | 'created_at' | 'updated_at'>[]): Promise<CATQuestion[]> {
  const createdQuestions: CATQuestion[] = [];
  
  for (const questionData of questions) {
    const question = await createCATQuestion(questionData);
    createdQuestions.push(question);
  }
  
  return createdQuestions;
}

// Get unique filter values for CAT questions dropdowns
export async function getCATQuestionFilterValues(): Promise<{
  categories: string[];
  subcategories: string[];
  subsections: string[];
}> {
  try {
    const [categoryResult, subcategoryResult, subsectionResult] = await Promise.all([
      query('SELECT DISTINCT category FROM cat_questions WHERE is_active = true ORDER BY category'),
      query('SELECT DISTINCT subcategory FROM cat_questions WHERE is_active = true ORDER BY subcategory'),
      query('SELECT DISTINCT subsection FROM cat_questions WHERE is_active = true ORDER BY subsection')
    ]);

    return {
      categories: categoryResult.rows.map(row => row.category),
      subcategories: subcategoryResult.rows.map(row => row.subcategory),
      subsections: subsectionResult.rows.map(row => row.subsection)
    };
  } catch (error) {
    console.error('Error fetching CAT question filter values:', error);
    return {
      categories: [],
      subcategories: [],
      subsections: []
    };
  }
}

// Exam Configs
export async function getExamConfigs(): Promise<ExamConfig[]> {
  const result = await query(
    'SELECT * FROM exam_configs WHERE is_active = true ORDER BY created_at DESC'
  );
  return result.rows;
}

export async function getExamConfigByExamAndSubcategory(examId: number, subcategoryId: number): Promise<ExamConfig | null> {
  // Use cache for frequently accessed exam configs (cache for 10 minutes)
  return cache.getOrSet(
    CacheKeys.examConfig(examId, subcategoryId),
    async () => {
      const result = await query(
        'SELECT * FROM exam_configs WHERE exam_id = $1 AND subcategory_id = $2 AND is_active = true LIMIT 1',
        [examId, subcategoryId]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    },
    600000 // Cache for 10 minutes
  );
}

export async function createExamConfig(config: Omit<ExamConfig, 'id' | 'created_at' | 'updated_at'>): Promise<ExamConfig> {
  const result = await query(
    'INSERT INTO exam_configs (exam_id, subcategory_id, num_questions, randomize_questions, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [config.exam_id, config.subcategory_id, config.num_questions, config.randomize_questions, config.is_active]
  );
  
  // Cache the new config
  cache.set(CacheKeys.examConfig(config.exam_id, config.subcategory_id), result.rows[0], 600000);
  
  return result.rows[0];
}

export async function updateExamConfig(id: number, updates: Partial<ExamConfig>): Promise<void> {
  // Get current config to find exam_id and subcategory_id for cache invalidation
  const currentConfig = await query('SELECT exam_id, subcategory_id FROM exam_configs WHERE id = $1', [id]);
  
  // Security: Whitelist allowed columns to prevent SQL injection
  const allowedKeys = new Set(['exam_id', 'subcategory_id', 'num_questions', 'randomize_questions', 'is_active']);
  const sanitized = sanitizeUpdateObject(updates, allowedKeys);
  
  if (Object.keys(sanitized).length === 0) {
    throw new Error('No valid fields to update');
  }
  
  const setClause = Object.keys(sanitized)
    .filter(key => validateColumnName(key))
    .map((key, index) => `${key} = $${index + 2}`)
    .join(', ');
  
  const values = Object.values(sanitized);
  
  await query(
    `UPDATE exam_configs SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id, ...values]
  );
  
  // Invalidate cache
  if (currentConfig.rows.length > 0) {
    const { exam_id, subcategory_id } = currentConfig.rows[0];
    cache.delete(CacheKeys.examConfig(exam_id, subcategory_id));
  }
}

export async function deleteExamConfig(id: number): Promise<void> {
  await query('UPDATE exam_configs SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
}

// Candidates
export interface Candidate {
  candidate_id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  exam_id?: number;
  subcategory_id?: number;
  resume_url?: string;
  resume_file_path?: string;
  resume_analysis_json?: any; // Store full resume analysis (ATS score, skills, etc.)
  status: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export async function getCandidates(includeDeleted: boolean = false): Promise<Candidate[]> {
  const queryText = includeDeleted 
    ? 'SELECT * FROM candidates ORDER BY created_at DESC'
    : 'SELECT * FROM candidates WHERE is_active = true ORDER BY created_at DESC';
  const result = await query(queryText);
  return result.rows;
}

export async function restoreCandidate(id: number): Promise<void> {
  // Support both old schema (candidate_id) and new schema (id as UUID)
  await query(
    'UPDATE candidates SET is_active = true, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id::text = $1::text OR ai_candidate_id::text = $1::text',
    [id, 'active']
  );
}

export async function getCandidateById(id: number | string): Promise<Candidate | null> {
  // Support both old schema (candidate_id integer) and new schema (id UUID)
  // Try matching by id (UUID) or ai_candidate_id (integer)
  const result = await query(
    "SELECT * FROM candidates WHERE id::text = $1::text OR ai_candidate_id::text = $1::text",
    [id]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

export async function getCandidateByEmail(email: string): Promise<Candidate | null> {
  // Do not filter by is_active here because a soft-deleted row will still
  // violate the unique index during INSERT. We need to detect any existing row.
  const result = await query(
    'SELECT * FROM candidates WHERE email = $1',
    [email]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

export async function createCandidate(candidate: Omit<Candidate, 'candidate_id' | 'created_at' | 'updated_at'>): Promise<Candidate> {
  const result = await query(
    'INSERT INTO candidates (first_name, last_name, email, phone, exam_id, subcategory_id, resume_url, status, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
    [candidate.first_name, candidate.last_name, candidate.email, candidate.phone, candidate.exam_id, candidate.subcategory_id, candidate.resume_url, candidate.status, candidate.is_active]
  );
  return result.rows[0];
}

export async function updateCandidate(id: number, updates: Partial<Candidate>): Promise<void> {
  // Security: Whitelist allowed columns to prevent SQL injection
  const allowedKeys = new Set(['first_name', 'last_name', 'email', 'phone', 'exam_id', 'subcategory_id', 'resume_url', 'resume_file_path', 'resume_analysis_json', 'status', 'is_active']);
  const sanitized = sanitizeUpdateObject(updates, allowedKeys);
  
  if (Object.keys(sanitized).length === 0) {
    throw new Error('No valid fields to update');
  }
  
  const setClause = Object.keys(sanitized)
    .filter(key => validateColumnName(key))
    .map((key, index) => {
      // Handle JSONB fields
      if (key === 'resume_analysis_json') {
        return `${key} = $${index + 2}::jsonb`;
      }
      return `${key} = $${index + 2}`;
    })
    .join(', ');
  
  const values = Object.keys(sanitized).map(key => {
    // Stringify JSONB fields
    if (key === 'resume_analysis_json' && sanitized[key]) {
      return JSON.stringify(sanitized[key]);
    }
    return sanitized[key as keyof Candidate];
  });
  
  await query(
    `UPDATE candidates SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE candidate_id = $1`,
    [id, ...values]
  );
}

export async function deleteCandidate(id: number): Promise<void> {
  await query('UPDATE candidates SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE candidate_id = $1', [id]);
}

// Interview Sessions
export interface Resume {
  resume_id: number;
  candidate_id: number;
  file_name: string;
  file_path: string;
  file_size?: number;
  file_type?: string;
  extracted_text?: string;
  parsed_data?: any;
  upload_date: string;
  is_active: boolean;
}

export interface JobPosition {
  position_id: number;
  title: string;
  department?: string;
  description?: string;
  requirements?: string;
  experience_level?: string;
  salary_range_min?: number;
  salary_range_max?: number;
  location?: string;
  employment_type?: string;
  status: string;
  exam_id?: number;
  subcategory_id?: number;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface InterviewSession {
  id: number;
  candidate_id: number;
  job_role_id?: number;
  resume_id?: number;
  exam_id?: number;
  subcategory_id?: number;
  token: string;
  status: string;
  scheduled_time?: string;
  scheduled_end_time?: string;
  link_sent_at?: string;
  started_at?: string;
  completed_at?: string;
  expires_at: string;
  results_json?: any;
  questions_generated?: any;
  interview_mode?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export async function getInterviewSessions(filters?: {
  status?: string;
  candidateId?: number;
  examId?: number;
  subcategoryId?: number;
}): Promise<InterviewSession[]> {
  let whereClause = 'WHERE is_active = true';
  const params: any[] = [];
  let paramCount = 0;

  if (filters?.status) {
    paramCount++;
    whereClause += ` AND status = $${paramCount}`;
    params.push(filters.status);
  }

  if (filters?.candidateId) {
    paramCount++;
    whereClause += ` AND candidate_id = $${paramCount}`;
    params.push(filters.candidateId);
  }

  if (filters?.examId) {
    paramCount++;
    whereClause += ` AND exam_id = $${paramCount}`;
    params.push(filters.examId);
  }

  if (filters?.subcategoryId) {
    paramCount++;
    whereClause += ` AND subcategory_id = $${paramCount}`;
    params.push(filters.subcategoryId);
  }

  const result = await query(
    `SELECT * FROM interview_sessions ${whereClause} ORDER BY created_at DESC`,
    params
  );
  return result.rows;
}

export async function getInterviewSessionById(id: number): Promise<InterviewSession | null> {
  const result = await query(
    'SELECT * FROM interview_sessions WHERE id = $1 AND is_active = true',
    [id]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

export async function getInterviewSessionByToken(token: string): Promise<InterviewSession | null> {
  // Use cache for interview sessions (shorter TTL since they change frequently)
  return cache.getOrSet(
    CacheKeys.interviewSession(token),
    async () => {
      // Use COALESCE to handle both candidate_id (integer) and id (uuid) column naming
      // This makes the query compatible with both old and new schema versions
      const result = await query(`
        SELECT iss.*, 
               c.first_name, c.last_name, c.email,
               e.name as exam_name,
               s.name as subcategory_name,
               jp.title as job_title,
               r.file_name as resume_name
        FROM interview_sessions iss
        LEFT JOIN candidates c ON iss.candidate_id::text = c.id::text OR iss.candidate_id::text = COALESCE(c.ai_candidate_id::text, '')
        LEFT JOIN exams e ON iss.exam_id = e.id
        LEFT JOIN subcategories s ON iss.subcategory_id = s.id
        LEFT JOIN job_positions jp ON iss.job_role_id = jp.position_id
        LEFT JOIN resumes r ON iss.resume_id = r.resume_id
        WHERE iss.token = $1 AND iss.is_active = true
      `, [token]);
      return result.rows.length > 0 ? result.rows[0] : null;
    },
    60000 // Cache for 1 minute (sessions change more frequently)
  );
}

export async function createInterviewSession(session: Omit<InterviewSession, 'id' | 'created_at' | 'updated_at'>): Promise<InterviewSession> {
  const result = await query(
    'INSERT INTO interview_sessions (candidate_id, job_role_id, resume_id, exam_id, subcategory_id, token, status, scheduled_time, scheduled_end_time, expires_at, interview_mode, results_json, questions_generated, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *',
    [session.candidate_id, session.job_role_id || null, session.resume_id || null, session.exam_id || null, session.subcategory_id || null, session.token, session.status, session.scheduled_time || null, session.scheduled_end_time || null, session.expires_at, session.interview_mode, session.results_json ? JSON.stringify(session.results_json) : null, session.questions_generated ? JSON.stringify(session.questions_generated) : null, session.is_active]
  );
  return result.rows[0];
}

export async function updateInterviewSession(id: number, updates: Partial<InterviewSession>): Promise<void> {
  // Get current session to find token for cache invalidation
  const currentSession = await query('SELECT token FROM interview_sessions WHERE id = $1', [id]);
  
  // Security: Whitelist allowed columns to prevent SQL injection
  const allowedKeys = new Set(['candidate_id', 'job_role_id', 'resume_id', 'exam_id', 'subcategory_id', 'token', 'status', 'scheduled_time', 'scheduled_end_time', 'link_sent_at', 'started_at', 'completed_at', 'expires_at', 'results_json', 'questions_generated', 'interview_mode', 'is_active']);
  const sanitized = sanitizeUpdateObject(updates, allowedKeys);
  
  if (Object.keys(sanitized).length === 0) {
    throw new Error('No valid fields to update');
  }
  
  const setClause = Object.keys(sanitized)
    .filter(key => validateColumnName(key))
    .map((key, index) => {
      if (key === 'results_json' || key === 'questions_generated') {
        return `${key} = $${index + 2}::jsonb`;
      }
      return `${key} = $${index + 2}`;
    })
    .join(', ');
  
  const values = Object.keys(sanitized).map(key => {
    if (key === 'results_json' || key === 'questions_generated') {
      return sanitized[key as keyof InterviewSession] ? JSON.stringify(sanitized[key as keyof InterviewSession]) : null;
    }
    return sanitized[key as keyof InterviewSession];
  });
  
  await query(
    `UPDATE interview_sessions SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id, ...values]
  );
  
  // Invalidate cache
  if (currentSession.rows.length > 0 && currentSession.rows[0].token) {
    cache.delete(CacheKeys.interviewSession(currentSession.rows[0].token));
  }
}

export async function deleteInterviewSession(id: number): Promise<void> {
  await query('UPDATE interview_sessions SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
}

// Job Positions
export async function getJobPositions(): Promise<JobPosition[]> {
  const result = await query(
    'SELECT * FROM job_positions WHERE is_active = true ORDER BY created_at DESC'
  );
  return result.rows;
}

export async function getJobPositionById(id: number): Promise<JobPosition | null> {
  const result = await query(
    'SELECT * FROM job_positions WHERE position_id = $1 AND is_active = true',
    [id]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

export async function createJobPosition(position: Omit<JobPosition, 'position_id' | 'created_at' | 'updated_at'>): Promise<JobPosition> {
  const result = await query(
    'INSERT INTO job_positions (title, department, description, requirements, experience_level, salary_range_min, salary_range_max, location, employment_type, status, exam_id, subcategory_id, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *',
    [position.title, position.department, position.description, position.requirements, position.experience_level, position.salary_range_min, position.salary_range_max, position.location, position.employment_type, position.status, position.exam_id, position.subcategory_id, position.is_active]
  );
  return result.rows[0];
}

export async function updateJobPosition(id: number, updates: Partial<JobPosition>): Promise<void> {
  // Security: Whitelist allowed columns to prevent SQL injection
  const allowedKeys = new Set(['title', 'department', 'description', 'requirements', 'experience_level', 'salary_range_min', 'salary_range_max', 'location', 'employment_type', 'status', 'exam_id', 'subcategory_id', 'is_active']);
  const sanitized = sanitizeUpdateObject(updates, allowedKeys);
  
  if (Object.keys(sanitized).length === 0) {
    throw new Error('No valid fields to update');
  }
  
  const setClause = Object.keys(sanitized)
    .filter(key => validateColumnName(key))
    .map((key, index) => `${key} = $${index + 2}`)
    .join(', ');
  
  const values = Object.values(sanitized);
  
  await query(
    `UPDATE job_positions SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE position_id = $1`,
    [id, ...values]
  );
}

export async function deleteJobPosition(id: number): Promise<void> {
  await query('UPDATE job_positions SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE position_id = $1', [id]);
}

// Resumes
export async function getResumes(candidateId?: number): Promise<Resume[]> {
  if (candidateId) {
    const result = await query(
      'SELECT * FROM resumes WHERE candidate_id = $1 AND is_active = true ORDER BY upload_date DESC',
      [candidateId]
    );
    return result.rows;
  } else {
    const result = await query(
      'SELECT * FROM resumes WHERE is_active = true ORDER BY upload_date DESC'
    );
    return result.rows;
  }
}

export async function getResumeById(id: number): Promise<Resume | null> {
  const result = await query(
    'SELECT * FROM resumes WHERE resume_id = $1 AND is_active = true',
    [id]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

export async function createResume(resume: Omit<Resume, 'resume_id' | 'upload_date'>): Promise<Resume> {
  const result = await query(
    'INSERT INTO resumes (candidate_id, file_name, file_path, file_size, file_type, extracted_text, parsed_data, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
    [resume.candidate_id, resume.file_name, resume.file_path, resume.file_size, resume.file_type, resume.extracted_text, resume.parsed_data ? JSON.stringify(resume.parsed_data) : null, resume.is_active]
  );
  return result.rows[0];
}

export async function updateResume(id: number, updates: Partial<Resume>): Promise<void> {
  // Security: Whitelist allowed columns to prevent SQL injection
  const allowedKeys = new Set(['candidate_id', 'file_name', 'file_path', 'file_size', 'file_type', 'extracted_text', 'parsed_data', 'is_active']);
  const sanitized = sanitizeUpdateObject(updates, allowedKeys);
  
  if (Object.keys(sanitized).length === 0) {
    throw new Error('No valid fields to update');
  }
  
  const setClause = Object.keys(sanitized)
    .filter(key => validateColumnName(key))
    .map((key, index) => {
      if (key === 'parsed_data') {
        return `${key} = $${index + 2}::jsonb`;
      }
      return `${key} = $${index + 2}`;
    })
    .join(', ');
  
  const values = Object.keys(sanitized).map(key => {
    if (key === 'parsed_data') {
      return sanitized[key] ? JSON.stringify(sanitized[key]) : null;
    }
    return sanitized[key as keyof Resume];
  });
  
  await query(
    `UPDATE resumes SET ${setClause} WHERE resume_id = $1`,
    [id, ...values]
  );
}

export async function deleteResume(id: number): Promise<void> {
  await query('UPDATE resumes SET is_active = false WHERE resume_id = $1', [id]);
}

// Initialize database on module load (but don't block)
// This allows the app to start even if DB isn't ready yet
if (typeof window === 'undefined') {
  initializeDatabase().catch(console.error);
}
