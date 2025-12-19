#!/usr/bin/env tsx

/**
 * Initialize PostgreSQL database with sample data
 */

import { initializeDatabase } from '../lib/postgres';
import { createExam, createSubcategory, createQuestion, createCATQuestion } from '../lib/postgres-data-store';

async function initializePostgreSQL() {
  console.log('Initializing PostgreSQL database...');
  
  try {
    // Initialize database schema
    await initializeDatabase();
    console.log('Database schema created successfully');
    
    // Create a default exam
    const exam = await createExam({
      name: 'General Interview',
      description: 'General interview questions for various roles',
      is_active: true
    });
    
    console.log('Created exam:', exam.id);
    
    // Create a default subcategory
    const subcategory = await createSubcategory({
      exam_id: exam.id,
      name: 'General',
      description: 'General interview questions',
      is_active: true
    });
    
    console.log('Created subcategory:', subcategory.id);
    
    // Create some sample questions
    const sampleQuestions = [
      {
        exam_id: exam.id,
        subcategory_id: subcategory.id,
        category: 'General',
        subcategory: 'Introduction',
        subsection: 'Personal',
        question: 'Tell me about yourself and your background.',
        is_active: true
      },
      {
        exam_id: exam.id,
        subcategory_id: subcategory.id,
        category: 'General',
        subcategory: 'Experience',
        subsection: 'Professional',
        question: 'What are your strengths and weaknesses?',
        is_active: true
      },
      {
        exam_id: exam.id,
        subcategory_id: subcategory.id,
        category: 'General',
        subcategory: 'Behavioral',
        subsection: 'Leadership',
        question: 'Describe a time when you had to lead a team.',
        is_active: true
      },
      {
        exam_id: exam.id,
        subcategory_id: subcategory.id,
        category: 'General',
        subcategory: 'Technical',
        subsection: 'Problem Solving',
        question: 'How do you approach solving complex problems?',
        is_active: true
      },
      {
        exam_id: exam.id,
        subcategory_id: subcategory.id,
        category: 'General',
        subcategory: 'Behavioral',
        subsection: 'Conflict Resolution',
        question: 'Tell me about a time you had to resolve a conflict at work.',
        is_active: true
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
        is_active: true
      },
      {
        category: 'CAT',
        subcategory: 'General',
        subsection: 'Goals',
        question: 'What are your short-term and long-term career goals?',
        is_active: true
      },
      {
        category: 'CAT',
        subcategory: 'General',
        subsection: 'Experience',
        question: 'Tell me about a challenging situation you faced and how you handled it.',
        is_active: true
      },
      {
        category: 'CAT',
        subcategory: 'General',
        subsection: 'Leadership',
        question: 'Describe a time when you demonstrated leadership skills.',
        is_active: true
      },
      {
        category: 'CAT',
        subcategory: 'General',
        subsection: 'Current Affairs',
        question: 'What are your thoughts on the current economic situation?',
        is_active: true
      }
    ];
    
    for (const questionData of sampleCATQuestions) {
      const question = await createCATQuestion(questionData);
      console.log('Created CAT question:', question.id);
    }
    
    console.log('PostgreSQL database initialization completed successfully!');
    console.log('You can now use the admin panel to add more data.');
    
  } catch (error) {
    console.error('Error initializing PostgreSQL database:', error);
    throw error;
  }
}

// Run the initialization
initializePostgreSQL()
  .then(() => {
    console.log('Initialization complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Initialization failed:', error);
    process.exit(1);
  });
