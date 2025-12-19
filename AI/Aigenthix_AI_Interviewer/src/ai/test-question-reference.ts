/**
 * @fileOverview Test module for the question reference functionality.
 * This module tests that the interview questions data is loaded correctly.
 */

import { getAllInterviewQuestions, getQuestionsByCategory, getRandomQuestions } from './question-reference';

// Test the question reference module
export function testQuestionReference() {
  console.log('Testing question reference module...');
  
  // Get all questions
  const allQuestions = getAllInterviewQuestions();
  console.log(`Total questions: ${allQuestions.length}`);
  
  // Get questions by category
  const mbaQuestions = getQuestionsByCategory('MBA Entrance Exams');
  console.log(`MBA Entrance Exams questions: ${mbaQuestions.length}`);
  
  // Get random questions
  const randomQuestions = getRandomQuestions(5);
  console.log(`Random questions sample: ${randomQuestions.length}`);
  
  // Log a few sample questions
  console.log('Sample questions:');
  allQuestions.slice(0, 3).forEach((q, index) => {
    console.log(`${index + 1}. ${q.question} (Category: ${q.category}, Subcategory: ${q.subcategory})`);
  });
  
  return {
    totalQuestions: allQuestions.length,
    mbaQuestions: mbaQuestions.length,
    randomQuestions: randomQuestions.length
  };
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testQuestionReference();
}
