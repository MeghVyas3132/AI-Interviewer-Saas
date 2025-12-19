/**
 * Script to initialize the exam_configs table in PostgreSQL
 * Run this script to create the table if it doesn't exist
 */

import { initializeDatabase } from '../lib/postgres';

async function main() {
  try {
    console.log('Initializing exam_configs table...');
    await initializeDatabase();
    console.log('✅ Exam configs table initialized successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing exam configs table:', error);
    process.exit(1);
  }
}

main();

