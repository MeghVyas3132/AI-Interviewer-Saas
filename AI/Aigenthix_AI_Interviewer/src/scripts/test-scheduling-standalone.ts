#!/usr/bin/env tsx

/**
 * Standalone test for Interview Scheduling features
 * Bypasses auto-initialization issues
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { Pool } from 'pg';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message: string) { log(`✅ ${message}`, 'green'); }
function logError(message: string) { log(`❌ ${message}`, 'red'); }
function logInfo(message: string) { log(`ℹ️  ${message}`, 'blue'); }
function logWarning(message: string) { log(`⚠️  ${message}`, 'yellow'); }

// Clean connection string
let connectionString = process.env.DATABASE_URL || '';
if (connectionString.startsWith("'") || connectionString.startsWith('"')) {
  connectionString = connectionString.slice(1, -1);
}

// Create a fresh pool for testing
const testPool = new Pool({
  connectionString,
  ssl: false, // We know this works from previous test
});

async function testDatabaseOperations() {
  log('\n📊 Testing Database Operations...', 'cyan');
  
  let client;
  try {
    client = await testPool.connect();
    logSuccess('Database connection established');

    // Test 1: Check/Create tables
    logInfo('Checking/Creating tables...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS candidates (
        candidate_id SERIAL PRIMARY KEY,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20),
        exam_id INTEGER,
        subcategory_id INTEGER,
        resume_url TEXT,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS interview_sessions (
        id SERIAL PRIMARY KEY,
        candidate_id INTEGER REFERENCES candidates(candidate_id) ON DELETE CASCADE,
        exam_id INTEGER,
        subcategory_id INTEGER,
        token VARCHAR(255) UNIQUE NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        scheduled_time TIMESTAMP,
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
    
    logSuccess('Tables created/verified');

    // Test 2: Create a candidate
    logInfo('Creating test candidate...');
    const candidateResult = await client.query(`
      INSERT INTO candidates (first_name, last_name, email, phone, status, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, ['Test', 'Candidate', `test.${Date.now()}@example.com`, '+1234567890', 'active', true]);
    
    const candidate = candidateResult.rows[0];
    logSuccess(`Candidate created: ${candidate.first_name} ${candidate.last_name} (ID: ${candidate.candidate_id})`);

    // Test 3: Generate token
    const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), 
      byte => byte.toString(16).padStart(2, '0')).join('');
    logInfo(`Generated token: ${token.substring(0, 20)}...`);

    // Test 4: Create interview session
    logInfo('Creating interview session...');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    const sessionResult = await client.query(`
      INSERT INTO interview_sessions (candidate_id, token, status, expires_at, interview_mode, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [candidate.candidate_id, token, 'pending', expiresAt.toISOString(), 'Voice', true]);
    
    const session = sessionResult.rows[0];
    logSuccess(`Session created: ID ${session.id}, Status: ${session.status}`);

    // Test 5: Retrieve session by token
    logInfo('Retrieving session by token...');
    const retrievedSession = await client.query(
      'SELECT * FROM interview_sessions WHERE token = $1',
      [token]
    );
    
    if (retrievedSession.rows.length > 0) {
      logSuccess('Session retrieved successfully');
      logInfo(`  Status: ${retrievedSession.rows[0].status}`);
      logInfo(`  Expires: ${new Date(retrievedSession.rows[0].expires_at).toLocaleString()}`);
    }

    // Test 6: Update session status
    logInfo('Updating session status...');
    await client.query(
      `UPDATE interview_sessions 
       SET status = $1, started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      ['in_progress', session.id]
    );
    logSuccess('Session status updated to in_progress');

    // Test 7: Get all sessions
    logInfo('Getting all sessions...');
    const allSessions = await client.query('SELECT COUNT(*) as count FROM interview_sessions WHERE is_active = true');
    logSuccess(`Total active sessions: ${allSessions.rows[0].count}`);

    // Cleanup
    logInfo('Cleaning up test data...');
    await client.query('DELETE FROM interview_sessions WHERE id = $1', [session.id]);
    await client.query('DELETE FROM candidates WHERE candidate_id = $1', [candidate.candidate_id]);
    logSuccess('Test data cleaned up');

    client.release();
    return true;
  } catch (error) {
    if (client) client.release();
    logError(`Database operations failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error(error);
    return false;
  }
}

async function testEmailService() {
  log('\n📧 Testing Email Service...', 'cyan');
  
  try {
    const { emailService } = await import('../lib/email-service');
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';
    const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), 
      byte => byte.toString(16).padStart(2, '0')).join('');
    const interviewLink = `${baseUrl}/interview/${token}`;

    logInfo('Attempting to send test email...');
    const emailSent = await emailService.sendInterviewLink({
      candidateName: 'Test Candidate',
      candidateEmail: 'test@example.com',
      examName: 'Test Exam',
      subcategoryName: 'Test Subcategory',
      interviewLink,
      scheduledTime: new Date().toISOString(),
      interviewMode: 'Voice'
    });

    if (emailSent) {
      logSuccess('✅ Email sent successfully!');
      logInfo(`Interview link: ${interviewLink}`);
    } else {
      logWarning('⚠️  Email service returned false');
      logInfo('This might be expected if MAIL_* environment variables are not properly configured');
      logInfo('Check your .env file for MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM_ADDRESS, and MAIL_FROM_NAME');
    }
    
    return emailSent;
  } catch (error) {
    logWarning(`Email service error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

async function runTests() {
  log('\n🚀 Starting Standalone Test Suite...', 'cyan');
  log('='.repeat(60), 'cyan');
  
  const dbTest = await testDatabaseOperations();
  const emailTest = await testEmailService();
  
  log('\n' + '='.repeat(60), 'cyan');
  log('📊 Test Summary', 'cyan');
  log('='.repeat(60), 'cyan');
  
  if (dbTest) {
    logSuccess('Database Operations: PASSED');
  } else {
    logError('Database Operations: FAILED');
  }
  
  if (emailTest) {
    logSuccess('Email Service: PASSED');
  } else {
    logWarning('Email Service: FAILED (may be expected if not configured)');
  }
  
  log('='.repeat(60), 'cyan');
  
  await testPool.end();
  process.exit(dbTest ? 0 : 1);
}

runTests().catch(error => {
  logError(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  console.error(error);
  testPool.end();
  process.exit(1);
});

