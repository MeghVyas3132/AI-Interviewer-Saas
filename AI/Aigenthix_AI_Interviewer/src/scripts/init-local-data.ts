#!/usr/bin/env tsx

/**
 * Initialize local data store with sample data
 */

import { createExam, createSubcategory, createQuestion, createCATQuestion } from '../lib/local-data-store';

async function initializeLocalData() {
  console.log('Initializing local data store with sample data...');
  
  try {
    // Create a default exam
    const exam = await createExam({
      name: 'General Interview',
      description: 'General interview questions for various roles',
      isActive: true
    });
    
    console.log('Created exam:', exam.id);
    
    // Create a default subcategory
    const subcategory = await createSubcategory({
      examId: exam.id,
      name: 'General',
      description: 'General interview questions',
      isActive: true
    });
    
    console.log('Created subcategory:', subcategory.id);
    
    // Create some sample questions
    const sampleQuestions = [
      {
        examId: exam.id,
        subcategoryId: subcategory.id,
        category: 'General',
        subcategory: 'Introduction',
        subsection: 'Personal',
        question: 'Tell me about yourself and your background.',
        isActive: true
      },
      {
        examId: exam.id,
        subcategoryId: subcategory.id,
        category: 'General',
        subcategory: 'Experience',
        subsection: 'Professional',
        question: 'What are your strengths and weaknesses?',
        isActive: true
      },
      {
        examId: exam.id,
        subcategoryId: subcategory.id,
        category: 'General',
        subcategory: 'Behavioral',
        subsection: 'Leadership',
        question: 'Describe a time when you had to lead a team.',
        isActive: true
      }
    ];
    
    for (const questionData of sampleQuestions) {
      const question = await createQuestion(questionData);
      console.log('Created question:', question.id);
    }
    
    // Create some sample CAT questions
    const sampleCATQuestions = [
      {
        category: 'CAT',
        subcategory: 'General',
        subsection: 'Introduction',
        question: 'Why do you want to pursue an MBA?',
        isActive: true
      },
      {
        category: 'CAT',
        subcategory: 'General',
        subsection: 'Goals',
        question: 'What are your short-term and long-term career goals?',
        isActive: true
      },
      {
        category: 'CAT',
        subcategory: 'General',
        subsection: 'Experience',
        question: 'Tell me about a challenging situation you faced and how you handled it.',
        isActive: true
      }
    ];
    
    for (const questionData of sampleCATQuestions) {
      const question = await createCATQuestion(questionData);
      console.log('Created CAT question:', question.id);
    }
    
    console.log('Local data initialization completed successfully!');
    console.log('You can now use the admin panel to add more data.');
    
  } catch (error) {
    console.error('Error initializing local data:', error);
    throw error;
  }
}

// Run the initialization
initializeLocalData()
  .then(() => {
    console.log('Initialization complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Initialization failed:', error);
    process.exit(1);
  });
