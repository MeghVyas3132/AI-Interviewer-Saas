/**
 * Test file for enhanced guidance system
 * This simulates how the interview agent should handle wrong answers and "I don't know" responses
 */

import { interviewAgent } from './flows/interview-agent';

async function testEnhancedGuidance() {
  console.log('Testing Enhanced Guidance System...\n');

  // Test 1: Candidate gives wrong answer to aptitude question
  console.log('Test 1: Wrong answer to aptitude question');
  const result1 = await interviewAgent({
    jobRole: 'Software Engineer',
    company: 'Tech Corp',
    resumeText: 'Experienced software engineer with 5 years of experience in JavaScript and React.',
    language: 'English',
    conversationHistory: [
      {
        question: 'If a train travels at a speed of 60 km/h and covers a distance of 240 km, how long does it take for the train to complete its journey?',
        answer: '3 hours',
        attempts: 0,
        hintsGiven: [],
        isCorrect: false
      }
    ],
    currentTranscript: '3 hours',
    realQuestionCount: 1,
    recentScores: [5],
    isCurrentQuestionReal: true,
    currentQuestionAttempts: 0,
    currentQuestionHints: []
  });

  console.log('Is Correct Answer:', result1.isCorrectAnswer);
  console.log('Hint:', result1.hint);
  console.log('Should Retry Question:', result1.shouldRetryQuestion);
  console.log('Next Question:', result1.nextQuestion);
  console.log('---\n');

  // Test 2: Candidate says "I don't know"
  console.log('Test 2: "I don\'t know" response');
  const result2 = await interviewAgent({
    jobRole: 'Software Engineer',
    company: 'Tech Corp',
    resumeText: 'Experienced software engineer with 5 years of experience in JavaScript and React.',
    language: 'English',
    conversationHistory: [
      {
        question: 'A shopkeeper sells a product for ₹500, making a profit of 25%. What was the cost price of the product?',
        answer: 'I don\'t know',
        attempts: 0,
        hintsGiven: [],
        isCorrect: false
      }
    ],
    currentTranscript: 'I don\'t know',
    realQuestionCount: 1,
    recentScores: [3],
    isCurrentQuestionReal: true,
    currentQuestionAttempts: 0,
    currentQuestionHints: []
  });

  console.log('Is Correct Answer:', result2.isCorrectAnswer);
  console.log('Hint:', result2.hint);
  console.log('Should Retry Question:', result2.shouldRetryQuestion);
  console.log('Next Question:', result2.nextQuestion);
  console.log('---\n');

  // Test 3: Candidate gives correct answer
  console.log('Test 3: Correct answer');
  const result3 = await interviewAgent({
    jobRole: 'Software Engineer',
    company: 'Tech Corp',
    resumeText: 'Experienced software engineer with 5 years of experience in JavaScript and React.',
    language: 'English',
    conversationHistory: [
      {
        question: 'If a pen costs ₹10, and you buy 5 pens, how much do you pay in total?',
        answer: '₹50',
        attempts: 0,
        hintsGiven: [],
        isCorrect: true
      }
    ],
    currentTranscript: '₹50',
    realQuestionCount: 1,
    recentScores: [8],
    isCurrentQuestionReal: true,
    currentQuestionAttempts: 0,
    currentQuestionHints: []
  });

  console.log('Is Correct Answer:', result3.isCorrectAnswer);
  console.log('Explanation:', result3.explanation);
  console.log('Should Retry Question:', result3.shouldRetryQuestion);
  console.log('Next Question:', result3.nextQuestion);
  console.log('---\n');

  console.log('Enhanced Guidance System Test Complete!');
}

// Run the test if this file is executed directly
if (require.main === module) {
  testEnhancedGuidance().catch(console.error);
}

export { testEnhancedGuidance }; 