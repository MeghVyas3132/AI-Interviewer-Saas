#!/usr/bin/env tsx

import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { Pool } from 'pg';

// Test different connection configurations
const connectionString = process.env.DATABASE_URL?.replace(/^['"]|['"]$/g, '') || '';

async function testConnection() {
  console.log('Testing database connection...');
  console.log(`Connection string: ${connectionString.substring(0, 50)}...`);

  // Test 1: Without SSL
  console.log('\n1. Testing WITHOUT SSL...');
  try {
    const pool1 = new Pool({
      connectionString,
      ssl: false,
      connectionTimeoutMillis: 10000
    });
    const client1 = await pool1.connect();
    const result1 = await client1.query('SELECT NOW()');
    console.log('✅ Connection successful WITHOUT SSL');
    console.log(`   Database time: ${result1.rows[0].now}`);
    client1.release();
    await pool1.end();
    process.exit(0);
  } catch (error) {
    console.log('❌ Connection failed WITHOUT SSL:', (error as Error).message);
  }

  // Test 2: With SSL (rejectUnauthorized: false)
  console.log('\n2. Testing WITH SSL (rejectUnauthorized: false)...');
  try {
    const pool2 = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false
      },
      connectionTimeoutMillis: 10000
    });
    const client2 = await pool2.connect();
    const result2 = await client2.query('SELECT NOW()');
    console.log('✅ Connection successful WITH SSL');
    console.log(`   Database time: ${result2.rows[0].now}`);
    client2.release();
    await pool2.end();
    process.exit(0);
  } catch (error) {
    console.log('❌ Connection failed WITH SSL:', (error as Error).message);
  }

  // Test 3: With SSL (require: true)
  console.log('\n3. Testing WITH SSL (require: true)...');
  try {
    const pool3 = new Pool({
      connectionString,
      ssl: {
        require: true,
        rejectUnauthorized: false
      },
      connectionTimeoutMillis: 10000
    });
    const client3 = await pool3.connect();
    const result3 = await client3.query('SELECT NOW()');
    console.log('✅ Connection successful WITH SSL (require: true)');
    console.log(`   Database time: ${result3.rows[0].now}`);
    client3.release();
    await pool3.end();
    process.exit(0);
  } catch (error) {
    console.log('❌ Connection failed WITH SSL (require: true):', (error as Error).message);
  }

  console.log('\n❌ All connection attempts failed. Please check:');
  console.log('   1. Database server is running and accessible');
  console.log('   2. Firewall allows connections from this IP');
  console.log('   3. Connection string is correct');
  console.log('   4. Database credentials are valid');
  process.exit(1);
}

testConnection();

