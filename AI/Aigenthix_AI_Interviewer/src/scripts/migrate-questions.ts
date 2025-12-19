#!/usr/bin/env tsx

/**
 * Migration script to transfer questions from JSON files to Firebase
 */

import { db, COLLECTIONS } from '../lib/firebase-admin';
import rawData from '../ai/interview_questions.json';
import catRawData from '../../cat_interview_questions.json';

async function migrateInterviewQuestions() {
  console.log('Starting migration of interview questions...');
  
  try {
    // Normalize the data to handle entries with "id." instead of "id"
    const interviewQuestionsData = rawData.map((item: any) => {
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

    // Create a default exam for general questions
    const examRef = await db.collection(COLLECTIONS.EXAMS).add({
      name: 'General Interview',
      description: 'General interview questions for various roles',
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true
    });

    // Create a default subcategory
    const subcategoryRef = await db.collection(COLLECTIONS.SUBCATEGORIES).add({
      examId: examRef.id,
      name: 'General',
      description: 'General interview questions',
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true
    });

    // Batch upload questions
    const batch = db.batch();
    let count = 0;

    for (const question of interviewQuestionsData) {
      const questionRef = db.collection(COLLECTIONS.QUESTIONS).doc();
      batch.set(questionRef, {
        examId: examRef.id,
        subcategoryId: subcategoryRef.id,
        category: question.category || 'General',
        subcategory: question.subcategory || 'General',
        subsection: question.subsection || 'General',
        question: question.question,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      });
      count++;
    }

    await batch.commit();
    console.log(`Successfully migrated ${count} interview questions`);
  } catch (error) {
    console.error('Error migrating interview questions:', error);
    throw error;
  }
}

async function migrateCATQuestions() {
  console.log('Starting migration of CAT questions...');
  
  try {
    // Batch upload CAT questions
    const batch = db.batch();
    let count = 0;

    for (const question of catRawData) {
      const questionRef = db.collection(COLLECTIONS.CAT_QUESTIONS).doc();
      batch.set(questionRef, {
        category: question.category || 'CAT',
        subcategory: question.subcategory || 'CAT',
        subsection: question.subsection || 'General',
        question: question.question,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      });
      count++;
    }

    await batch.commit();
    console.log(`Successfully migrated ${count} CAT questions`);
  } catch (error) {
    console.error('Error migrating CAT questions:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('Starting data migration...');
    
    await migrateInterviewQuestions();
    await migrateCATQuestions();
    
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
main();
