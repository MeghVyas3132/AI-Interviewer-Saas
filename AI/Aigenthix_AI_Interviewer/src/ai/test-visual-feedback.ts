/**
 * Test file for enhanced visual feedback system
 * This simulates how the interview agent should handle different visual scenarios
 */

import { interviewAgent } from './flows/interview-agent';

async function testVisualFeedback() {
  console.log('Testing Enhanced Visual Feedback System...\n');

  // Test 1: Multiple people detected (should lower score significantly)
  console.log('Test 1: Multiple people detected');
  const result1 = await interviewAgent({
    jobRole: 'Software Engineer',
    company: 'Tech Corp',
    resumeText: 'Experienced software engineer with 5 years of experience in JavaScript and React.',
    language: 'English',
    conversationHistory: [
      {
        question: 'Tell me about your experience with React.',
        answer: 'I have 3 years of experience with React, working on large-scale applications.',
        attempts: 0,
        hintsGiven: [],
        isCorrect: true
      }
    ],
    currentTranscript: 'I have 3 years of experience with React, working on large-scale applications.',
    videoFrameDataUri: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=', // Mock image with multiple people
    realQuestionCount: 1,
    recentScores: [7],
    isCurrentQuestionReal: true,
    currentQuestionAttempts: 0,
    currentQuestionHints: []
  });

  console.log('Visual Feedback:', result1.visualFeedback);
  console.log('Overall Score:', result1.overallScore);
  console.log('---\n');

  // Test 2: Professional appearance (should maintain or improve score)
  console.log('Test 2: Professional appearance');
  const result2 = await interviewAgent({
    jobRole: 'Software Engineer',
    company: 'Tech Corp',
    resumeText: 'Experienced software engineer with 5 years of experience in JavaScript and React.',
    language: 'English',
    conversationHistory: [
      {
        question: 'What are your strengths as a developer?',
        answer: 'I am detail-oriented, collaborative, and always eager to learn new technologies.',
        attempts: 0,
        hintsGiven: [],
        isCorrect: true
      }
    ],
    currentTranscript: 'I am detail-oriented, collaborative, and always eager to learn new technologies.',
    videoFrameDataUri: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=', // Mock professional image
    realQuestionCount: 1,
    recentScores: [8],
    isCurrentQuestionReal: true,
    currentQuestionAttempts: 0,
    currentQuestionHints: []
  });

  console.log('Visual Feedback:', result2.visualFeedback);
  console.log('Overall Score:', result2.overallScore);
  console.log('---\n');

  // Test 3: No video provided
  console.log('Test 3: No video provided');
  const result3 = await interviewAgent({
    jobRole: 'Software Engineer',
    company: 'Tech Corp',
    resumeText: 'Experienced software engineer with 5 years of experience in JavaScript and React.',
    language: 'English',
    conversationHistory: [
      {
        question: 'How do you handle debugging?',
        answer: 'I use systematic approaches like console logging, debugging tools, and step-by-step analysis.',
        attempts: 0,
        hintsGiven: [],
        isCorrect: true
      }
    ],
    currentTranscript: 'I use systematic approaches like console logging, debugging tools, and step-by-step analysis.',
    realQuestionCount: 1,
    recentScores: [7],
    isCurrentQuestionReal: true,
    currentQuestionAttempts: 0,
    currentQuestionHints: []
  });

  console.log('Visual Feedback:', result3.visualFeedback);
  console.log('Overall Score:', result3.overallScore);
  console.log('---\n');

  console.log('Enhanced Visual Feedback System Test Complete!');
}

// Run the test if this file is executed directly
if (require.main === module) {
  testVisualFeedback().catch(console.error);
}

export { testVisualFeedback }; 