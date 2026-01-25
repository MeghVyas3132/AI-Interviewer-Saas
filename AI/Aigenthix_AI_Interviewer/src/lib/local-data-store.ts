'use server';

/**
 * Local data store that mimics Firebase structure
 * This is a fallback when Firebase is not available
 */

import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const EXAMS_FILE = path.join(DATA_DIR, 'exams.json');
const SUBCATEGORIES_FILE = path.join(DATA_DIR, 'subcategories.json');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const CAT_QUESTIONS_FILE = path.join(DATA_DIR, 'cat_questions.json');
const EXAM_CONFIGS_FILE = path.join(DATA_DIR, 'exam_configs.json');

export interface Exam {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface Subcategory {
  id: string;
  examId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface Question {
  id: string;
  examId: string;
  subcategoryId: string;
  category: string;
  subcategory: string;
  subsection: string;
  question: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface CATQuestion {
  id: string;
  category: string;
  subcategory: string;
  subsection: string;
  question: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface ExamConfig {
  id: string;
  examId: string;
  subcategoryId: string;
  numQuestions: number;
  randomizeQuestions: boolean;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Read data from file
async function readData<T>(filePath: string): Promise<T[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Write data to file
async function writeData<T>(filePath: string, data: T[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// Generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Exams
export async function getExams(): Promise<Exam[]> {
  return readData<Exam>(EXAMS_FILE);
}

export async function createExam(exam: Omit<Exam, 'id' | 'createdAt' | 'updatedAt'>): Promise<Exam> {
  const exams = await getExams();
  const newExam: Exam = {
    ...exam,
    id: generateId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  exams.push(newExam);
  await writeData(EXAMS_FILE, exams);
  return newExam;
}

export async function updateExam(id: string, updates: Partial<Exam>): Promise<void> {
  const exams = await getExams();
  const index = exams.findIndex(exam => exam.id === id);
  if (index !== -1) {
    exams[index] = { ...exams[index], ...updates, updatedAt: new Date().toISOString() };
    await writeData(EXAMS_FILE, exams);
  }
}

export async function deleteExam(id: string): Promise<void> {
  const exams = await getExams();
  const filteredExams = exams.filter(exam => exam.id !== id);
  await writeData(EXAMS_FILE, filteredExams);
}

// Subcategories
export async function getSubcategories(examId?: string): Promise<Subcategory[]> {
  const subcategories = await readData<Subcategory>(SUBCATEGORIES_FILE);
  if (examId) {
    return subcategories.filter(sub => sub.examId === examId);
  }
  return subcategories;
}

export async function createSubcategory(subcategory: Omit<Subcategory, 'id' | 'createdAt' | 'updatedAt'>): Promise<Subcategory> {
  const subcategories = await getSubcategories();
  const newSubcategory: Subcategory = {
    ...subcategory,
    id: generateId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  subcategories.push(newSubcategory);
  await writeData(SUBCATEGORIES_FILE, subcategories);
  return newSubcategory;
}

export async function updateSubcategory(id: string, updates: Partial<Subcategory>): Promise<void> {
  const subcategories = await getSubcategories();
  const index = subcategories.findIndex(sub => sub.id === id);
  if (index !== -1) {
    subcategories[index] = { ...subcategories[index], ...updates, updatedAt: new Date().toISOString() };
    await writeData(SUBCATEGORIES_FILE, subcategories);
  }
}

export async function deleteSubcategory(id: string): Promise<void> {
  const subcategories = await getSubcategories();
  const filteredSubcategories = subcategories.filter(sub => sub.id !== id);
  await writeData(SUBCATEGORIES_FILE, filteredSubcategories);
}

// Questions
export async function getQuestions(examId?: string, subcategoryId?: string, page = 1, limit = 50): Promise<{ data: Question[], pagination: any }> {
  let questions = await readData<Question>(QUESTIONS_FILE);
  
  if (examId) {
    questions = questions.filter(q => q.examId === examId);
  }
  if (subcategoryId) {
    questions = questions.filter(q => q.subcategoryId === subcategoryId);
  }
  
  const total = questions.length;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedQuestions = questions.slice(startIndex, endIndex);
  
  return {
    data: paginatedQuestions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

export async function createQuestion(question: Omit<Question, 'id' | 'createdAt' | 'updatedAt'>): Promise<Question> {
  const questions = await readData<Question>(QUESTIONS_FILE);
  const newQuestion: Question = {
    ...question,
    id: generateId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  questions.push(newQuestion);
  await writeData(QUESTIONS_FILE, questions);
  return newQuestion;
}

export async function updateQuestion(id: string, updates: Partial<Question>): Promise<void> {
  const questions = await readData<Question>(QUESTIONS_FILE);
  const index = questions.findIndex(q => q.id === id);
  if (index !== -1) {
    questions[index] = { ...questions[index], ...updates, updatedAt: new Date().toISOString() };
    await writeData(QUESTIONS_FILE, questions);
  }
}

export async function deleteQuestion(id: string): Promise<void> {
  const questions = await readData<Question>(QUESTIONS_FILE);
  const filteredQuestions = questions.filter(q => q.id !== id);
  await writeData(QUESTIONS_FILE, filteredQuestions);
}

export async function bulkCreateQuestions(questions: Omit<Question, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Question[]> {
  const existingQuestions = await readData<Question>(QUESTIONS_FILE);
  const newQuestions: Question[] = questions.map(question => ({
    ...question,
    id: generateId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  
  const allQuestions = [...existingQuestions, ...newQuestions];
  await writeData(QUESTIONS_FILE, allQuestions);
  return newQuestions;
}

// CAT Questions
export async function getCATQuestions(page = 1, limit = 50): Promise<{ data: CATQuestion[], pagination: any }> {
  const questions = await readData<CATQuestion>(CAT_QUESTIONS_FILE);
  
  const total = questions.length;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedQuestions = questions.slice(startIndex, endIndex);
  
  return {
    data: paginatedQuestions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

export async function createCATQuestion(question: Omit<CATQuestion, 'id' | 'createdAt' | 'updatedAt'>): Promise<CATQuestion> {
  const questions = await readData<CATQuestion>(CAT_QUESTIONS_FILE);
  const newQuestion: CATQuestion = {
    ...question,
    id: generateId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  questions.push(newQuestion);
  await writeData(CAT_QUESTIONS_FILE, questions);
  return newQuestion;
}

export async function updateCATQuestion(id: string, updates: Partial<CATQuestion>): Promise<void> {
  const questions = await readData<CATQuestion>(CAT_QUESTIONS_FILE);
  const index = questions.findIndex(q => q.id === id);
  if (index !== -1) {
    questions[index] = { ...questions[index], ...updates, updatedAt: new Date().toISOString() };
    await writeData(CAT_QUESTIONS_FILE, questions);
  }
}

export async function deleteCATQuestion(id: string): Promise<void> {
  const questions = await readData<CATQuestion>(CAT_QUESTIONS_FILE);
  const filteredQuestions = questions.filter(q => q.id !== id);
  await writeData(CAT_QUESTIONS_FILE, filteredQuestions);
}

export async function bulkCreateCATQuestions(questions: Omit<CATQuestion, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<CATQuestion[]> {
  const existingQuestions = await readData<CATQuestion>(CAT_QUESTIONS_FILE);
  const newQuestions: CATQuestion[] = questions.map(question => ({
    ...question,
    id: generateId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  
  const allQuestions = [...existingQuestions, ...newQuestions];
  await writeData(CAT_QUESTIONS_FILE, allQuestions);
  return newQuestions;
}

// Exam Configs
export async function getExamConfigs(): Promise<ExamConfig[]> {
  return readData<ExamConfig>(EXAM_CONFIGS_FILE);
}

export async function getExamConfigByExamAndSubcategory(examId: string, subcategoryId: string): Promise<ExamConfig | null> {
  const configs = await getExamConfigs();
  const config = configs.find(c => c.examId === examId && c.subcategoryId === subcategoryId && c.isActive);
  return config || null;
}

export async function createExamConfig(config: Omit<ExamConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<ExamConfig> {
  const configs = await getExamConfigs();
  const newConfig: ExamConfig = {
    ...config,
    id: generateId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  configs.push(newConfig);
  await writeData(EXAM_CONFIGS_FILE, configs);
  return newConfig;
}

export async function updateExamConfig(id: string, updates: Partial<ExamConfig>): Promise<void> {
  const configs = await getExamConfigs();
  const index = configs.findIndex(config => config.id === id);
  if (index !== -1) {
    configs[index] = { ...configs[index], ...updates, updatedAt: new Date().toISOString() };
    await writeData(EXAM_CONFIGS_FILE, configs);
  }
}

export async function deleteExamConfig(id: string): Promise<void> {
  const configs = await getExamConfigs();
  const filteredConfigs = configs.filter(config => config.id !== id);
  await writeData(EXAM_CONFIGS_FILE, filteredConfigs);
}
