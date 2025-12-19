/**
 * @fileOverview Module for managing interview question references.
 * This module loads and provides access to the interview questions data
 * for use as reference during interview generation.
 */

import rawData from './interview_questions.json';

// Normalize the data to handle entries with "id." instead of "id"
const interviewQuestionsData = rawData.map((item: any) => {
  // Handle the case where id might be stored as "id." instead of "id"
  if (item["id."] !== undefined && item.id === undefined) {
    return {
      id: item["id."],
      category: item.category,
      subcategory: item.subcategory,
      subsection: item.subsection,
      question: item.question
    };
  }
  return item;
});

export interface InterviewQuestion {
  id: number;
  category: string;
  subcategory: string;
  subsection: string;
  question: string;
}

/**
 * Gets all interview questions from the reference data
 * @returns Array of interview questions
 */
export function getAllInterviewQuestions(): InterviewQuestion[] {
  return interviewQuestionsData as InterviewQuestion[];
}

/**
 * Gets interview questions filtered by category
 * @param category The category to filter by
 * @returns Array of interview questions in the specified category
 */
export function getQuestionsByCategory(category: string): InterviewQuestion[] {
  return interviewQuestionsData.filter(
    (q: InterviewQuestion) => q.category === category
  ) as InterviewQuestion[];
}

/**
 * Gets interview questions filtered by subcategory
 * @param subcategory The subcategory to filter by
 * @returns Array of interview questions in the specified subcategory
 */
export function getQuestionsBySubcategory(subcategory: string): InterviewQuestion[] {
  return interviewQuestionsData.filter(
    (q: InterviewQuestion) => q.subcategory === subcategory
  ) as InterviewQuestion[];
}

/**
 * Gets interview questions filtered by subsection
 * @param subsection The subsection to filter by
 * @returns Array of interview questions in the specified subsection
 */
export function getQuestionsBySubsection(subsection: string): InterviewQuestion[] {
  return interviewQuestionsData.filter(
    (q: InterviewQuestion) => q.subsection === subsection
  ) as InterviewQuestion[];
}

/**
 * Gets a random sample of interview questions
 * @param count Number of questions to return
 * @returns Array of random interview questions
 */
export function getRandomQuestions(count: number): InterviewQuestion[] {
  const questions = [...interviewQuestionsData] as InterviewQuestion[];
  const result: InterviewQuestion[] = [];
  
  // Fisher-Yates shuffle
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
  
  return questions.slice(0, Math.min(count, questions.length));
}

/**
 * Searches for interview questions containing specific keywords
 * @param keywords Keywords to search for
 * @returns Array of matching interview questions
 */
export function searchQuestionsByKeywords(keywords: string[]): InterviewQuestion[] {
  return interviewQuestionsData.filter((q: InterviewQuestion) => {
    const questionText = q.question.toLowerCase();
    return keywords.some(keyword => questionText.includes(keyword.toLowerCase()));
  }) as InterviewQuestion[];
}
