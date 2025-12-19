import mongoose from 'mongoose';

const MONGODB_URL = "mongodb://admin:bBgd1nWdaWrvO14zLsMHx1RL6zgDbjU4@36.50.3.165:27017/times_ai_interviewer";

async function testConnection() {
  console.log('🔍 Testing MongoDB connection...');
  console.log('Connection URL:', MONGODB_URL.replace(/:[^:@]+@/, ':****@')); // Hide password

  try {
    // Connect with timeout
    await mongoose.connect(MONGODB_URL, {
      serverSelectionTimeoutMS: 10000, // 10 second timeout
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    });

    console.log('✅ MongoDB connection successful!');
    
    // Test database operations
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log('📊 Available collections:', collections.map(c => c.name));
    
    // Test writing a document
    const testCollection = db.collection('test_connection');
    await testCollection.insertOne({
      test: true,
      timestamp: new Date(),
    });
    console.log('✅ Write operation successful!');
    
    // Test reading
    const result = await testCollection.findOne({ test: true });
    console.log('✅ Read operation successful!', result);
    
    // Cleanup
    await testCollection.deleteOne({ test: true });
    console.log('✅ Cleanup successful!');
    
    // Close connection
    await mongoose.connection.close();
    console.log('✅ Connection closed successfully');
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ MongoDB connection failed!');
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      reason: error.reason?.message || error.reason,
    });
    
    if (error.name === 'MongooseServerSelectionError') {
      console.error('\n🔧 Possible issues:');
      console.error('  1. MongoDB server is not running');
      console.error('  2. Firewall blocking connection to 36.50.3.165:27017');
      console.error('  3. IP address is not whitelisted in MongoDB settings');
      console.error('  4. Network connectivity issues');
    }
    
    if (error.name === 'MongoAuthenticationError') {
      console.error('\n🔧 Possible issues:');
      console.error('  1. Invalid username or password');
      console.error('  2. Database user does not have required permissions');
    }
    
    process.exit(1);
  }
}

testConnection();

