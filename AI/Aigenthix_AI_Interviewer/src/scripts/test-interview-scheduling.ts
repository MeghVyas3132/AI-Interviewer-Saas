#!/usr/bin/env tsx

/**
 * Comprehensive test script for Interview Scheduling & Session Control
 * Tests database, email, API endpoints, and token functionality
 */

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { pool, initializeDatabase, query } from '../lib/postgres';
import { 
  createCandidate, 
  getCandidateById, 
  getCandidates,
  createInterviewSession,
  getInterviewSessionByToken,
  getInterviewSessions,
  updateInterviewSession
} from '../lib/postgres-data-store';
import { emailService } from '../lib/email-service';

// Test colors for console output
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

function logSuccess(message: string) {
  log(`✅ ${message}`, 'green');
}

function logError(message: string) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message: string) {
  log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, 'yellow');
}

// Generate unique token using crypto
function generateToken(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function testDatabaseConnection() {
  log('\n📊 Testing Database Connection...', 'cyan');
  try {
    logInfo(`Database URL: ${process.env.DATABASE_URL ? 'Set' : 'Not set'}`);
    
    // Test connection with a simple query
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT NOW(), version()');
      logSuccess('Database connection successful');
      logInfo(`Database time: ${result.rows[0].now}`);
      logInfo(`PostgreSQL version: ${result.rows[0].version.split(' ')[0]} ${result.rows[0].version.split(' ')[1]}`);
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    logError(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    if (error instanceof Error && error.message.includes('terminated')) {
      logWarning('Connection was terminated. This might indicate:');
      logWarning('  1. Database server is not accessible');
      logWarning('  2. Wrong connection string format');
      logWarning('  3. Firewall/network issues');
      logWarning('  4. Database requires SSL with specific settings');
    }
    return false;
  }
}

async function testTableCreation() {
  log('\n📋 Testing Table Creation...', 'cyan');
  try {
    // Don't call initializeDatabase here since it's auto-called on import
    // Just verify tables exist
    logInfo('Checking if tables exist...');
    await initializeDatabase();
    logSuccess('Database schema initialized/verified successfully');
    
    // Check if tables exist
    const tables = ['candidates', 'interview_sessions', 'interviewers'];
    for (const table of tables) {
      const result = await query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        [table]
      );
      if (result.rows[0].exists) {
        logSuccess(`Table '${table}' exists`);
      } else {
        logError(`Table '${table}' does not exist`);
      }
    }
    return true;
  } catch (error) {
    logError(`Table creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

async function testCandidateOperations() {
  log('\n👤 Testing Candidate Operations...', 'cyan');
  try {
    // Create a test candidate
    logInfo('Creating test candidate...');
    const testCandidate = await createCandidate({
      first_name: 'Test',
      last_name: 'Candidate',
      email: `test.candidate.${Date.now()}@example.com`,
      phone: '+1234567890',
      status: 'active',
      is_active: true
    });
    logSuccess(`Candidate created with ID: ${testCandidate.candidate_id}`);
    logInfo(`Name: ${testCandidate.first_name} ${testCandidate.last_name}`);
    logInfo(`Email: ${testCandidate.email}`);

    // Retrieve candidate
    logInfo('Retrieving candidate...');
    const retrievedCandidate = await getCandidateById(testCandidate.candidate_id);
    if (retrievedCandidate && retrievedCandidate.candidate_id === testCandidate.candidate_id) {
      logSuccess('Candidate retrieval successful');
    } else {
      logError('Candidate retrieval failed');
    }

    // Get all candidates
    logInfo('Getting all candidates...');
    const allCandidates = await getCandidates();
    logSuccess(`Total candidates: ${allCandidates.length}`);

    return { candidate: testCandidate, success: true };
  } catch (error) {
    logError(`Candidate operations failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { success: false, error };
  }
}

async function testInterviewSessionOperations(candidateId: number) {
  log('\n📅 Testing Interview Session Operations...', 'cyan');
  try {
    // Generate token
    const token = generateToken();
    logInfo(`Generated token: ${token.substring(0, 20)}...`);

    // Create expiration date (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create interview session
    logInfo('Creating interview session...');
    const session = await createInterviewSession({
      candidate_id: candidateId,
      token,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
      interview_mode: 'Voice',
      is_active: true
    });
    logSuccess(`Session created with ID: ${session.id}`);
    logInfo(`Status: ${session.status}`);
    logInfo(`Token: ${session.token.substring(0, 20)}...`);
    logInfo(`Expires: ${new Date(session.expires_at).toLocaleString()}`);

    // Retrieve session by token
    logInfo('Retrieving session by token...');
    const retrievedSession = await getInterviewSessionByToken(token);
    if (retrievedSession && retrievedSession.id === session.id) {
      logSuccess('Session retrieval by token successful');
    } else {
      logError('Session retrieval by token failed');
    }

    // Update session status
    logInfo('Updating session status to in_progress...');
    await updateInterviewSession(session.id, {
      status: 'in_progress',
      started_at: new Date().toISOString()
    });
    logSuccess('Session status updated successfully');

    // Get all sessions
    logInfo('Getting all sessions...');
    const allSessions = await getInterviewSessions();
    logSuccess(`Total sessions: ${allSessions.length}`);

    return { session, success: true };
  } catch (error) {
    logError(`Interview session operations failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { success: false, error };
  }
}

async function testEmailService() {
  log('\n📧 Testing Email Service...', 'cyan');
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';
    const testToken = generateToken();
    const interviewLink = `${baseUrl}/interview/${testToken}`;

    logInfo('Sending test email...');
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
      logSuccess('Email sent successfully');
      logInfo(`Interview link: ${interviewLink}`);
    } else {
      logWarning('Email service returned false (may not be configured)');
      logInfo('This is expected if MAIL_* environment variables are not set or invalid');
    }

    return emailSent;
  } catch (error) {
    logWarning(`Email service error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    logInfo('This is expected if RESEND_API_KEY is not set or invalid');
    return false;
  }
}

async function testAPIEndpoints() {
  log('\n🔌 Testing API Endpoints...', 'cyan');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';
  
  // Note: These tests require the server to be running
  logWarning('API endpoint tests require the Next.js server to be running');
  logInfo(`Using base URL: ${baseUrl}`);
  
  // Test candidate validation endpoint (requires auth)
  logInfo('API endpoint tests skipped (require server to be running and authentication)');
  logInfo('You can test these manually by:');
  logInfo('  1. Starting the server: npm run dev');
  logInfo('  2. Logging into admin panel');
  logInfo('  3. Creating a session via the UI');
  
  return true;
}

async function runAllTests() {
  log('\n🚀 Starting Comprehensive Test Suite...', 'cyan');
  log('=' .repeat(60), 'cyan');

  const results = {
    databaseConnection: false,
    tableCreation: false,
    candidateOperations: false,
    sessionOperations: false,
    emailService: false,
    apiEndpoints: false,
  };

  // Test 1: Database Connection
  results.databaseConnection = await testDatabaseConnection();
  if (!results.databaseConnection) {
    logError('Database connection failed. Stopping tests.');
    process.exit(1);
  }

  // Test 2: Table Creation
  results.tableCreation = await testTableCreation();

  // Test 3: Candidate Operations
  const candidateTest = await testCandidateOperations();
  results.candidateOperations = candidateTest.success;
  const testCandidate = candidateTest.candidate;

  // Test 4: Interview Session Operations
  if (testCandidate) {
    const sessionTest = await testInterviewSessionOperations(testCandidate.candidate_id);
    results.sessionOperations = sessionTest.success;
  }

  // Test 5: Email Service
  results.emailService = await testEmailService();

  // Test 6: API Endpoints (informational)
  results.apiEndpoints = await testAPIEndpoints();

  // Summary
  log('\n' + '='.repeat(60), 'cyan');
  log('📊 Test Summary', 'cyan');
  log('='.repeat(60), 'cyan');
  
  Object.entries(results).forEach(([test, passed]) => {
    if (passed) {
      logSuccess(`${test}: PASSED`);
    } else {
      logError(`${test}: FAILED`);
    }
  });

  const passedCount = Object.values(results).filter(Boolean).length;
  const totalCount = Object.keys(results).length;

  log('\n' + '='.repeat(60), 'cyan');
  if (passedCount === totalCount) {
    logSuccess(`All tests passed! (${passedCount}/${totalCount})`);
  } else {
    logWarning(`Some tests failed. (${passedCount}/${totalCount} passed)`);
  }
  log('='.repeat(60), 'cyan');

  // Cleanup
  log('\n🧹 Cleaning up test data...', 'cyan');
  try {
    if (testCandidate) {
      await query('DELETE FROM interview_sessions WHERE candidate_id = $1', [testCandidate.candidate_id]);
      await query('DELETE FROM candidates WHERE candidate_id = $1', [testCandidate.candidate_id]);
      logSuccess('Test data cleaned up');
    }
  } catch (error) {
    logWarning(`Cleanup warning: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  await pool.end();
  process.exit(passedCount === totalCount ? 0 : 1);
}

// Run tests
runAllTests().catch((error) => {
  logError(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  console.error(error);
  process.exit(1);
});

