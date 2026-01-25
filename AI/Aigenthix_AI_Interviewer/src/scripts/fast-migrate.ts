/**
 * Fast data migration script using batch inserts for PostgreSQL
 */

import { query } from '../lib/postgres';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read JSON files
const interviewQuestions = JSON.parse(readFileSync(join(process.cwd(), 'src/ai/interview_questions.json'), 'utf8'));
const catQuestions = JSON.parse(readFileSync(join(process.cwd(), 'cat_interview_questions.json'), 'utf8'));

interface InterviewQuestion {
  id: number;
  category: string;
  subcategory: string;
  subsection: string;
  question: string;
}

interface CATQuestion {
  id: number;
  category: string;
  subcategory: string;
  subsection: string;
  question: string;
}

async function fastMigrate() {
  try {
    console.log('Starting fast data migration...');

    // 1. Create comprehensive exams
    console.log('Creating exams...');
    const exams = [
      { name: 'MBA Entrance Exams', description: 'Various MBA entrance examinations including CAT, XAT, CMAT, GMAT, MAT, and MAH-MBA/MMS-CET' },
      { name: 'Engineering and Science', description: 'Engineering entrance exams like JEE Main, JEE Advanced, GATE, and other science-related examinations' },
      { name: 'Government/Bank/SSC Exam', description: 'Government job examinations including Bank PO/Clerk, SSC CGL, and other civil service exams' },
      { name: 'Law and IPM', description: 'Law entrance exams like CLAT and IPM (IIM) examinations' },
      { name: 'Medical', description: 'Medical entrance examinations including NEET and other medical-related exams' },
      { name: 'International Exams', description: 'International examinations like GRE, GMAT (International), and other global tests' },
      { name: 'Foundation/School Level', description: 'Foundation and school-level examinations including IIT Foundation and other preparatory tests' }
    ];

    const examIds: { [key: string]: number } = {};
    
    for (const exam of exams) {
      // Check if exam already exists
      const existing = await query('SELECT id FROM exams WHERE name = $1', [exam.name]);
      
      if (existing.rows.length > 0) {
        examIds[exam.name] = existing.rows[0].id;
        console.log(`Found existing exam: ${exam.name} (ID: ${examIds[exam.name]})`);
      } else {
        const result = await query(
          'INSERT INTO exams (name, description, is_active) VALUES ($1, $2, $3) RETURNING id',
          [exam.name, exam.description, true]
        );
        examIds[exam.name] = result.rows[0].id;
        console.log(`Created exam: ${exam.name} (ID: ${examIds[exam.name]})`);
      }
    }

    // 2. Create subcategories for each exam
    console.log('Creating subcategories...');
    const subcategories = [
      // MBA Entrance Exams
      { exam: 'MBA Entrance Exams', name: 'CAT', description: 'Common Admission Test for IIMs and other top B-schools' },
      { exam: 'MBA Entrance Exams', name: 'XAT', description: 'Xavier Aptitude Test for XLRI and other institutes' },
      { exam: 'MBA Entrance Exams', name: 'CMAT', description: 'Common Management Admission Test' },
      { exam: 'MBA Entrance Exams', name: 'GMAT', description: 'Graduate Management Admission Test' },
      { exam: 'MBA Entrance Exams', name: 'MAT', description: 'Management Aptitude Test' },
      { exam: 'MBA Entrance Exams', name: 'MAH-MBA/MMS-CET', description: 'Maharashtra MBA/MMS Common Entrance Test' },
      
      // Engineering and Science
      { exam: 'Engineering and Science', name: 'JEE Main', description: 'Joint Entrance Examination Main' },
      { exam: 'Engineering and Science', name: 'JEE Advanced', description: 'Joint Entrance Examination Advanced' },
      { exam: 'Engineering and Science', name: 'GATE', description: 'Graduate Aptitude Test in Engineering' },
      
      // Government/Bank/SSC
      { exam: 'Government/Bank/SSC Exam', name: 'Bank PO/Clerk', description: 'Bank Probationary Officer and Clerk examinations' },
      { exam: 'Government/Bank/SSC Exam', name: 'SSC CGL', description: 'Staff Selection Commission Combined Graduate Level' },
      { exam: 'Government/Bank/SSC Exam', name: 'Campus Recruitment Training', description: 'Campus Recruitment Training programs' },
      
      // Law and IPM
      { exam: 'Law and IPM', name: 'CLAT', description: 'Common Law Admission Test' },
      { exam: 'Law and IPM', name: 'IPM (IIM)', description: 'Integrated Programme in Management at IIMs' },
      
      // Medical
      { exam: 'Medical', name: 'NEET', description: 'National Eligibility cum Entrance Test' },
      
      // International
      { exam: 'International Exams', name: 'GRE', description: 'Graduate Record Examinations' },
      { exam: 'International Exams', name: 'GMAT (International)', description: 'GMAT for international students' },
      
      // Foundation
      { exam: 'Foundation/School Level', name: 'IIT Foundation', description: 'IIT Foundation programs' }
    ];

    const subcategoryIds: { [key: string]: number } = {};
    
    for (const sub of subcategories) {
      const examId = examIds[sub.exam];
      if (examId) {
        // Check if subcategory already exists
        const existing = await query('SELECT id FROM subcategories WHERE exam_id = $1 AND name = $2', [examId, sub.name]);
        
        if (existing.rows.length > 0) {
          subcategoryIds[sub.name] = existing.rows[0].id;
          console.log(`Found existing subcategory: ${sub.name} (ID: ${subcategoryIds[sub.name]})`);
        } else {
          const result = await query(
            'INSERT INTO subcategories (exam_id, name, description, is_active) VALUES ($1, $2, $3, $4) RETURNING id',
            [examId, sub.name, sub.description, true]
          );
          subcategoryIds[sub.name] = result.rows[0].id;
          console.log(`Created subcategory: ${sub.name} (ID: ${subcategoryIds[sub.name]})`);
        }
      }
    }

    // 3. Clear existing questions to avoid duplicates
    console.log('Clearing existing questions...');
    await query('DELETE FROM questions');
    await query('DELETE FROM cat_questions');

    // 4. Batch insert interview questions
    console.log('Batch inserting interview questions...');
    const batchSize = 1000;
    const questionBatches = [];
    
    for (let i = 0; i < interviewQuestions.length; i += batchSize) {
      const batch = interviewQuestions.slice(i, i + batchSize);
      const values = batch.map((question: InterviewQuestion) => {
        // Map category to exam and subcategory
        let examId: number;
        let subcategoryId: number;
        
        if (question.category === 'MBA Entrance Exams') {
          examId = examIds['MBA Entrance Exams'];
          subcategoryId = subcategoryIds[question.subcategory] || subcategoryIds['CAT'];
        } else if (question.category === 'Engineering and Science') {
          examId = examIds['Engineering and Science'];
          subcategoryId = subcategoryIds['JEE Main'];
        } else if (question.category === 'Government/Bank/SSC Exam') {
          examId = examIds['Government/Bank/SSC Exam'];
          subcategoryId = subcategoryIds['Bank PO/Clerk'];
        } else if (question.category === 'Law and IPM') {
          examId = examIds['Law and IPM'];
          subcategoryId = subcategoryIds['CLAT'];
        } else if (question.category === 'Medical') {
          examId = examIds['Medical'];
          subcategoryId = subcategoryIds['NEET'];
        } else if (question.category === 'International Exams') {
          examId = examIds['International Exams'];
          subcategoryId = subcategoryIds['GRE'];
        } else if (question.category === 'Foundation/School Level') {
          examId = examIds['Foundation/School Level'];
          subcategoryId = subcategoryIds['IIT Foundation'];
        } else {
          examId = examIds['MBA Entrance Exams'];
          subcategoryId = subcategoryIds['CAT'];
        }

        return `(${examId}, ${subcategoryId}, '${question.category.replace(/'/g, "''")}', '${question.subcategory.replace(/'/g, "''")}', '${question.subsection.replace(/'/g, "''")}', '${question.question.replace(/'/g, "''")}', true)`;
      }).join(',');
      
      questionBatches.push(`INSERT INTO questions (exam_id, subcategory_id, category, subcategory, subsection, question, is_active) VALUES ${values}`);
    }

    // Execute all batches
    for (let i = 0; i < questionBatches.length; i++) {
      await query(questionBatches[i]);
      console.log(`Inserted batch ${i + 1}/${questionBatches.length} of interview questions`);
    }

    // 5. Batch insert CAT questions
    console.log('Batch inserting CAT questions...');
    const catBatches = [];
    
    for (let i = 0; i < catQuestions.length; i += batchSize) {
      const batch = catQuestions.slice(i, i + batchSize);
      const values = batch.map((question: CATQuestion) => {
        return `('${question.category.replace(/'/g, "''")}', '${question.subcategory.replace(/'/g, "''")}', '${question.subsection.replace(/'/g, "''")}', '${question.question.replace(/'/g, "''")}', true)`;
      }).join(',');
      
      catBatches.push(`INSERT INTO cat_questions (category, subcategory, subsection, question, is_active) VALUES ${values}`);
    }

    // Execute all CAT batches
    for (let i = 0; i < catBatches.length; i++) {
      await query(catBatches[i]);
      console.log(`Inserted batch ${i + 1}/${catBatches.length} of CAT questions`);
    }

    // 6. Display summary
    console.log('\n=== Migration Summary ===');
    
    const examCount = await query('SELECT COUNT(*) FROM exams WHERE is_active = true');
    const subcategoryCount = await query('SELECT COUNT(*) FROM subcategories WHERE is_active = true');
    const questionCountResult = await query('SELECT COUNT(*) FROM questions WHERE is_active = true');
    const catQuestionCountResult = await query('SELECT COUNT(*) FROM cat_questions WHERE is_active = true');
    
    console.log(`Exams: ${examCount.rows[0].count}`);
    console.log(`Subcategories: ${subcategoryCount.rows[0].count}`);
    console.log(`Questions: ${questionCountResult.rows[0].count}`);
    console.log(`CAT Questions: ${catQuestionCountResult.rows[0].count}`);
    
    console.log('\nFast migration completed successfully!');
    
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  fastMigrate()
    .then(() => {
      console.log('Fast migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fast migration failed:', error);
      process.exit(1);
    });
}

export { fastMigrate };
