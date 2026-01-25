import { pool } from '@/lib/postgres';

async function migrateCATQuestionsTable() {
  try {
    console.log('Starting CAT questions table migration...');
    
    // Add new columns if they don't exist
    await pool.query(`
      ALTER TABLE cat_questions 
      ADD COLUMN IF NOT EXISTS exam_id INTEGER REFERENCES exams(id),
      ADD COLUMN IF NOT EXISTS subcategory_id INTEGER REFERENCES subcategories(id)
    `);
    
    console.log('Added exam_id and subcategory_id columns to cat_questions table');
    
    // Create indexes for the new columns
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cat_questions_exam_id ON cat_questions(exam_id);
      CREATE INDEX IF NOT EXISTS idx_cat_questions_subcategory_id ON cat_questions(subcategory_id);
    `);
    
    console.log('Created indexes for new columns');
    
    // Update existing records with default values (you may want to customize this)
    // For now, we'll set them to NULL to allow the upload to work
    console.log('Migration completed successfully');
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateCATQuestionsTable()
    .then(() => {
      console.log('CAT questions migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('CAT questions migration failed:', error);
      process.exit(1);
    });
}

export { migrateCATQuestionsTable };
