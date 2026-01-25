import { pool } from '@/lib/postgres';

async function fixSubcategoriesTable() {
  try {
    console.log('Checking subcategories table structure...');
    
    // Check if exam_id column exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'subcategories' AND column_name = 'exam_id'
    `);
    
    if (columnCheck.rows.length === 0) {
      console.log('Adding exam_id column to subcategories table...');
      await pool.query(`
        ALTER TABLE subcategories 
        ADD COLUMN exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE
      `);
      console.log('Added exam_id column to subcategories table');
    } else {
      console.log('exam_id column already exists in subcategories table');
    }
    
    // Check if the index exists
    const indexCheck = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'subcategories' AND indexname = 'idx_subcategories_exam_id'
    `);
    
    if (indexCheck.rows.length === 0) {
      console.log('Creating index for subcategories exam_id...');
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_subcategories_exam_id ON subcategories(exam_id)
      `);
      console.log('Created index for subcategories exam_id');
    } else {
      console.log('Index for subcategories exam_id already exists');
    }
    
    console.log('Subcategories table fix completed successfully');
    
  } catch (error) {
    console.error('Failed to fix subcategories table:', error);
    throw error;
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  fixSubcategoriesTable()
    .then(() => {
      console.log('Subcategories table fix completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Subcategories table fix failed:', error);
      process.exit(1);
    });
}

export { fixSubcategoriesTable };

