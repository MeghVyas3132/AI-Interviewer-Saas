'use server';

/**
 * Test file for CAT question reference system
 * Run this to verify that the CAT question integration is working correctly
 */

import { 
  getCATQuestionsByCollege, 
  getCATQuestionsByBackground,
  getCATQuestionInsights,
  getSampleCATQuestions,
  detectAcademicBackground 
} from './cat-question-reference';

export async function testCATQuestionSystem() {
  console.log('=== Testing CAT Question Reference System ===\n');

  // Test 1: Background detection
  console.log('1. Testing Background Detection:');
  const sampleResumes = [
    'B.Tech in Computer Science Engineering from IIT Delhi with 2 years experience in software development',
    'B.Com (Hons) from DU with experience in finance and accounting',
    'B.A. in Political Science from JNU with focus on public policy',
    'B.Sc. in Physics from St. Stephen\'s College with research experience'
  ];

  sampleResumes.forEach((resume, index) => {
    const background = detectAcademicBackground(resume);
    console.log(`  Resume ${index + 1}: ${background || 'Not detected'}`);
  });

  // Test 2: Get questions by college
  console.log('\n2. Testing College-Specific Questions:');
  try {
    const iimAQuestions = await getCATQuestionsByCollege('iim-ahmedabad');
    console.log(`  IIM Ahmedabad: ${iimAQuestions.length} questions found`);
    
    const iimCQuestions = await getCATQuestionsByCollege('iim-calcutta');
    console.log(`  IIM Calcutta: ${iimCQuestions.length} questions found`);
    
    const capQuestions = await getCATQuestionsByCollege('iim-cap');
    console.log(`  CAP: ${capQuestions.length} questions found`);
  } catch (error) {
    console.error('  Error testing college questions:', error);
  }

  // Test 3: Get questions by background
  console.log('\n3. Testing Background-Specific Questions:');
  try {
    const engQuestions = await getCATQuestionsByBackground('engineering');
    console.log(`  Engineering: ${engQuestions.length} questions found`);
    
    const comQuestions = await getCATQuestionsByBackground('commerce');
    console.log(`  Commerce: ${comQuestions.length} questions found`);
  } catch (error) {
    console.error('  Error testing background questions:', error);
  }

  // Test 4: Sample questions
  console.log('\n4. Testing Sample Questions:');
  try {
    const samples = await getSampleCATQuestions('iim-ahmedabad', 'engineering', 5);
    console.log(`  Sample questions for IIM Ahmedabad + Engineering: ${samples.length}`);
    if (samples.length > 0) {
      console.log(`  First sample: "${samples[0].question.substring(0, 100)}..."`);
    }
  } catch (error) {
    console.error('  Error testing sample questions:', error);
  }

  // Test 5: CAT insights
  console.log('\n5. Testing CAT Insights Generation:');
  try {
    const insights = await getCATQuestionInsights(
      'iim-ahmedabad', 
      undefined, 
      'B.Tech in Computer Science from IIT Delhi with software development experience'
    );
    console.log('  Generated insights:');
    console.log(insights.substring(0, 500) + '...');
  } catch (error) {
    console.error('  Error testing insights:', error);
  }

  console.log('\n=== CAT Question System Test Complete ===');
}

// Uncomment to run the test
// testCATQuestionSystem().catch(console.error);
