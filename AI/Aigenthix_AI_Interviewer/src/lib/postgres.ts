import { Pool } from 'pg';

// Database configuration
// Clean connection string (remove quotes if present)
let connectionString = process.env.DATABASE_URL || 'postgresql://admin:bBgd1nWdaWrvO14zLsMHx1RL6zgDbjU4@dpg-d2vgbsjipnbc73cl21gg-a.oregon-postgres.render.com/time_ai_interviewer';
if (connectionString.startsWith("'") || connectionString.startsWith('"')) {
  connectionString = connectionString.slice(1, -1);
}

// Connection pool configuration for high-scale deployment
// These values can be overridden via environment variables
const poolConfig: any = {
  connectionString: connectionString,
  // Connection pool settings (defaults stay within common managed Postgres limits ~20)
  max: Math.min(parseInt(process.env.DB_POOL_MAX || '10', 10), 20), // avoid exhausting shared DB plans
  min: Math.max(parseInt(process.env.DB_POOL_MIN || '2', 10), 0),
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000', 10), // Close idle clients after 30s
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '10000', 10), // Wait 10s for connection
  // Statement timeout - prevent long-running queries from blocking the pool
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10), // 30s max per query
  // Query timeout
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000', 10),
  // Allow pool to wait for connections when max is reached
  allowExitOnIdle: false,
};

// Add SSL config for remote/hosted databases
// For IP-based direct connections, don't require SSL by default
// Check for explicit SSL disable in environment variable or connection string
const dbSslEnv = process.env.DB_SSL?.toLowerCase();
const connectionStringLower = connectionString?.toLowerCase() || '';

// Check if this is a local/Docker database connection
const isLocalConnection =
  connectionStringLower.includes('localhost') ||
  connectionStringLower.includes('127.0.0.1') ||
  connectionStringLower.includes('172.') || // Docker network
  connectionStringLower.includes('192.168.') || // Private network
  connectionStringLower.includes('10.') || // Private network
  connectionStringLower.includes('postgres:5432') || // Docker service name
  connectionStringLower.includes('db:5432'); // Common Docker db service name

// Explicitly disable SSL if requested or for local connections
if (dbSslEnv === 'false' || dbSslEnv === 'disable' || connectionStringLower.includes('sslmode=disable') || isLocalConnection) {
  poolConfig.ssl = false;
} else if (connectionStringLower.includes('sslmode=require') || connectionStringLower.includes('sslmode=prefer')) {
  // If explicitly required in connection string
  poolConfig.ssl = {
    rejectUnauthorized: false
  };
} else if (connectionString && (
  connectionString.includes('render.com') ||
  connectionString.includes('amazonaws.com') ||
  connectionString.includes('neon.tech') ||
  connectionString.includes('supabase.co')
)) {
  // For known hosted providers, try SSL but allow fallback
  poolConfig.ssl = {
    rejectUnauthorized: false
  };
} else {
  // For IP-based or local connections, don't use SSL
  poolConfig.ssl = false;
}

const pool = new Pool(poolConfig);

// Log pool configuration on startup
console.log('PostgreSQL Pool Configuration:', {
  max: poolConfig.max,
  min: poolConfig.min,
  idleTimeout: poolConfig.idleTimeoutMillis,
  connectionTimeout: poolConfig.connectionTimeoutMillis,
});

// Test the connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('PostgreSQL connection error:', err);
});

export { pool };

// Database schema creation
export async function initializeDatabase() {
  try {
    // Create exams table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS exams (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      )
    `);

    // Create subcategories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subcategories (
        id SERIAL PRIMARY KEY,
        exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      )
    `);

    // Create questions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
        subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE CASCADE,
        category VARCHAR(255) NOT NULL,
        subcategory VARCHAR(255) NOT NULL,
        subsection VARCHAR(255) NOT NULL,
        question TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      )
    `);

    // Create cat_questions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cat_questions (
        id SERIAL PRIMARY KEY,
        exam_id INTEGER REFERENCES exams(id),
        subcategory_id INTEGER REFERENCES subcategories(id),
        category VARCHAR(255) NOT NULL,
        subcategory VARCHAR(255) NOT NULL,
        subsection VARCHAR(255) NOT NULL,
        question TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      )
    `);

    // Create exam_configs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS exam_configs (
        id SERIAL PRIMARY KEY,
        exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
        subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE CASCADE,
        num_questions INTEGER NOT NULL CHECK (num_questions > 0),
        randomize_questions BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        UNIQUE(exam_id, subcategory_id)
      )
    `);

    // Create candidates table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS candidates (
        candidate_id SERIAL PRIMARY KEY,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20),
        exam_id INTEGER REFERENCES exams(id),
        subcategory_id INTEGER REFERENCES subcategories(id),
        resume_url TEXT,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      )
    `);

    // Ensure new columns exist on existing databases
    await pool.query(`
      ALTER TABLE candidates
      ADD COLUMN IF NOT EXISTS resume_file_path TEXT,
      ADD COLUMN IF NOT EXISTS resume_analysis_json JSONB
    `);

    // Check candidates table for column name
    const candidateColCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'candidates' AND column_name = 'candidate_id'
    `);
    const candidateIdCol = candidateColCheck.rows.length > 0 ? 'candidate_id' : 'id';
    const candidateIdType = candidateColCheck.rows.length > 0 ? 'INTEGER' : 'UUID';

    // Create interview_sessions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_sessions (
        id SERIAL PRIMARY KEY,
        candidate_id ${candidateIdType} REFERENCES candidates(${candidateIdCol}) ON DELETE CASCADE,
        exam_id INTEGER REFERENCES exams(id),
        subcategory_id INTEGER REFERENCES subcategories(id),
        token VARCHAR(255) UNIQUE NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        scheduled_time TIMESTAMP,
        scheduled_end_time TIMESTAMP,
        link_sent_at TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        results_json JSONB,
        questions_generated JSONB,
        interview_mode VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      )
    `);

    // Add scheduled_end_time column if it doesn't exist (for existing databases)
    await pool.query(`
      ALTER TABLE interview_sessions
      ADD COLUMN IF NOT EXISTS scheduled_end_time TIMESTAMP
    `);

    // Create job_positions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_positions (
        position_id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        department VARCHAR(255),
        description TEXT,
        requirements TEXT,
        experience_level VARCHAR(100),
        salary_range_min INTEGER,
        salary_range_max INTEGER,
        location VARCHAR(255),
        employment_type VARCHAR(100),
        status VARCHAR(50) DEFAULT 'active',
        exam_id INTEGER REFERENCES exams(id),
        subcategory_id INTEGER REFERENCES subcategories(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      )
    `);

    // Create resumes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS resumes (
        resume_id SERIAL PRIMARY KEY,
        candidate_id INTEGER REFERENCES candidates(candidate_id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size INTEGER,
        file_type VARCHAR(100),
        extracted_text TEXT,
        parsed_data JSONB,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      )
    `);

    // Update interview_sessions table to add job_role_id and resume_id (optional for backward compatibility)
    await pool.query(`
      ALTER TABLE interview_sessions
      ADD COLUMN IF NOT EXISTS job_role_id INTEGER REFERENCES job_positions(position_id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS resume_id INTEGER REFERENCES resumes(resume_id) ON DELETE CASCADE
    `);

    // Create interviewers table (optional for future use)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS interviewers (
        interviewer_id SERIAL PRIMARY KEY,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        email VARCHAR(255) UNIQUE NOT NULL,
        department VARCHAR(255),
        position VARCHAR(255),
        specialization VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      )
    `);

    // Create indexes for better performance
    // Wrap each index creation in try-catch to handle missing columns gracefully
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_exams_active ON exams(is_active)`);
    } catch (error: any) {
      console.warn('Could not create index idx_exams_active:', error.message);
    }

    try {
      // Check if exam_id column exists in subcategories table before creating index
      const subcategoryCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'subcategories' AND column_name = 'exam_id'
      `);
      if (subcategoryCheck.rows.length > 0) {
        try {
          await pool.query(`CREATE INDEX IF NOT EXISTS idx_subcategories_exam_id ON subcategories(exam_id)`);
          console.log('✅ Created index idx_subcategories_exam_id');
        } catch (indexError: any) {
          // Even if check passed, index creation might fail (e.g., column doesn't actually exist)
          console.warn('⚠️ Could not create index idx_subcategories_exam_id (column may not exist):', indexError.message);
        }
      } else {
        console.warn('⚠️ subcategories.exam_id column does not exist, skipping index creation');
      }
    } catch (error: any) {
      // Error in checking for column existence
      console.warn('⚠️ Could not check/create index idx_subcategories_exam_id:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_subcategories_active ON subcategories(is_active)`);
    } catch (error: any) {
      console.warn('Could not create index idx_subcategories_active:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_questions_exam_id ON questions(exam_id)`);
    } catch (error: any) {
      console.warn('Could not create index idx_questions_exam_id:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_questions_subcategory_id ON questions(subcategory_id)`);
    } catch (error: any) {
      console.warn('Could not create index idx_questions_subcategory_id:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_questions_active ON questions(is_active)`);
    } catch (error: any) {
      console.warn('Could not create index idx_questions_active:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_cat_questions_active ON cat_questions(is_active)`);
    } catch (error: any) {
      console.warn('Could not create index idx_cat_questions_active:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_exam_configs_exam_subcategory ON exam_configs(exam_id, subcategory_id)`);
    } catch (error: any) {
      console.warn('Could not create index idx_exam_configs_exam_subcategory:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_exam_configs_active ON exam_configs(is_active)`);
    } catch (error: any) {
      console.warn('Could not create index idx_exam_configs_active:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email)`);
    } catch (error: any) {
      console.warn('Could not create index idx_candidates_email:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_candidates_active ON candidates(is_active)`);
    } catch (error: any) {
      console.warn('Could not create index idx_candidates_active:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_interview_sessions_token ON interview_sessions(token)`);
    } catch (error: any) {
      console.warn('Could not create index idx_interview_sessions_token:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_interview_sessions_status ON interview_sessions(status)`);
    } catch (error: any) {
      console.warn('Could not create index idx_interview_sessions_status:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_interview_sessions_candidate_id ON interview_sessions(candidate_id)`);
    } catch (error: any) {
      console.warn('Could not create index idx_interview_sessions_candidate_id:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_interview_sessions_expires_at ON interview_sessions(expires_at)`);
    } catch (error: any) {
      console.warn('Could not create index idx_interview_sessions_expires_at:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_interview_sessions_job_role_id ON interview_sessions(job_role_id)`);
    } catch (error: any) {
      console.warn('Could not create index idx_interview_sessions_job_role_id:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_interview_sessions_resume_id ON interview_sessions(resume_id)`);
    } catch (error: any) {
      console.warn('Could not create index idx_interview_sessions_resume_id:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_positions_active ON job_positions(is_active)`);
    } catch (error: any) {
      console.warn('Could not create index idx_job_positions_active:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_positions_exam_id ON job_positions(exam_id)`);
    } catch (error: any) {
      console.warn('Could not create index idx_job_positions_exam_id:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_positions_subcategory_id ON job_positions(subcategory_id)`);
    } catch (error: any) {
      console.warn('Could not create index idx_job_positions_subcategory_id:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_resumes_candidate_id ON resumes(candidate_id)`);
    } catch (error: any) {
      console.warn('Could not create index idx_resumes_candidate_id:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_resumes_active ON resumes(is_active)`);
    } catch (error: any) {
      console.warn('Could not create index idx_resumes_active:', error.message);
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_interviewers_email ON interviewers(email)`);
    } catch (error: any) {
      console.warn('Could not create index idx_interviewers_email:', error.message);
    }

    console.log('Database schema initialized successfully');
  } catch (error: any) {
    // If tables already exist, that's fine
    if (error.code === '23505' || error.message.includes('already exists')) {
      console.log('Database tables already exist, continuing...');
    } else if (error.code === '42703' && error.message.includes('does not exist')) {
      // Column doesn't exist - this is expected for schema mismatches
      // The individual index creation try-catch blocks should have handled this
      console.warn('⚠️ Some database columns may not exist (schema mismatch):', error.message);
      // Don't throw - allow initialization to continue
    } else {
      console.error('Error initializing database schema:', error);
      throw error;
    }
  }
}

// Helper function to execute queries
export async function query(text: string, params?: any[]) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    // Only log slow queries in production (threshold: 1 second)
    if (process.env.NODE_ENV === 'production' && duration > 1000) {
      console.warn('Slow query detected', { duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}
