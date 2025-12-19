#!/usr/bin/env tsx

/**
 * Simple initialization script to create basic data in Firebase
 */

import { db, COLLECTIONS } from '../lib/firebase-admin';

async function initializeFirebase() {
  console.log('Initializing Firebase with basic data...');
  
  try {
    // Create a default exam
    const examRef = await db.collection(COLLECTIONS.EXAMS).add({
      name: 'General Interview',
      description: 'General interview questions for various roles',
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true
    });
    
    console.log('Created exam:', examRef.id);
    
    // Create a default subcategory
    const subcategoryRef = await db.collection(COLLECTIONS.SUBCATEGORIES).add({
      examId: examRef.id,
      name: 'General',
      description: 'General interview questions',
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true
    });
    
    console.log('Created subcategory:', subcategoryRef.id);
    
    // Create a sample question
    const questionRef = await db.collection(COLLECTIONS.QUESTIONS).add({
      examId: examRef.id,
      subcategoryId: subcategoryRef.id,
      category: 'General',
      subcategory: 'General',
      subsection: 'Introduction',
      question: 'Tell me about yourself and your background.',
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true
    });
    
    console.log('Created sample question:', questionRef.id);
    
    // Create a sample CAT question
    const catQuestionRef = await db.collection(COLLECTIONS.CAT_QUESTIONS).add({
      category: 'CAT',
      subcategory: 'General',
      subsection: 'Introduction',
      question: 'Why do you want to pursue an MBA?',
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true
    });
    
    console.log('Created sample CAT question:', catQuestionRef.id);
    
    console.log('Firebase initialization completed successfully!');
    console.log('You can now use the admin panel to add more data.');
    
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    console.error('Please check your Firebase configuration and ensure Firestore is enabled.');
    throw error;
  }
}

// Run the initialization
initializeFirebase()
  .then(() => {
    console.log('Initialization complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Initialization failed:', error);
    process.exit(1);
  });
