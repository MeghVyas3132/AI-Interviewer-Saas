import mongoose from 'mongoose';

const MONGODB_URL = process.env.MONGODB_URL!;

if (!MONGODB_URL) {
  console.warn('⚠️  MONGODB_URL not set. Reports functionality will be limited.');
}

export const connectMongo = async (): Promise<boolean> => {
  if (!MONGODB_URL) {
    return false;
  }

  if (mongoose.connection.readyState >= 1) {
    return true;
  }

  try {
    // Parse connection string and ensure authSource is set
    let connectionUrl = MONGODB_URL;
    
    // If connection string doesn't have authSource, add it (defaults to 'admin' for admin users)
    if (connectionUrl.includes('@') && !connectionUrl.includes('authSource')) {
      const authSource = process.env.MONGODB_AUTH_SOURCE || 'admin';
      // Check if URL already has query parameters
      if (connectionUrl.includes('?')) {
        connectionUrl += `&authSource=${authSource}`;
      } else {
        connectionUrl += `?authSource=${authSource}`;
      }
    }

    // Set connection options for high-scale deployment
    // These values can be overridden via environment variables
    const connectionOptions: mongoose.ConnectOptions = {
      serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT || '10000', 10),
      socketTimeoutMS: parseInt(process.env.MONGODB_SOCKET_TIMEOUT || '45000', 10),
      connectTimeoutMS: parseInt(process.env.MONGODB_CONNECT_TIMEOUT || '10000', 10),
      // Connection pool settings for handling concurrent requests
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '50', 10), // Maximum number of connections
      minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '5', 10),  // Minimum number of connections
      maxIdleTimeMS: parseInt(process.env.MONGODB_MAX_IDLE_TIME || '30000', 10), // Close idle connections after 30s
      // Retry settings
      retryWrites: true,
      retryReads: true,
    };

    // Add authSource to options if not in URL (alternative method)
    if (!connectionUrl.includes('authSource') && process.env.MONGODB_AUTH_SOURCE) {
      connectionOptions.authSource = process.env.MONGODB_AUTH_SOURCE;
    }

    await mongoose.connect(connectionUrl, connectionOptions);
    
    // Disable mongoose buffering at the global level (not connection level)
    mongoose.set('bufferCommands', false);
    mongoose.set('bufferMaxEntries', 0);
    console.log('✅ MongoDB connected successfully');
    console.log('MongoDB Pool Configuration:', {
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '50', 10),
      minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '5', 10),
    });
    return true;
  } catch (error: any) {
    console.error('❌ MongoDB connection error:', error);
    
    // Provide helpful error messages
    if (error.code === 18 || error.codeName === 'AuthenticationFailed') {
      console.error('🔐 Authentication failed. Possible issues:');
      console.error('   1. Invalid username or password');
      console.error('   2. User does not exist in the specified authSource database');
      console.error('   3. Missing authSource parameter (try adding ?authSource=admin to connection string)');
      console.error('   4. User does not have permissions to access the database');
      
      // Log connection string (with password hidden) for debugging
      const hiddenUrl = MONGODB_URL.replace(/:[^:@]+@/, ':****@');
      console.error(`   Connection URL (password hidden): ${hiddenUrl}`);
    } else if (error.name === 'MongooseServerSelectionError') {
      console.error('🌐 Server selection failed. Possible issues:');
      console.error('   1. MongoDB server is not running or unreachable');
      console.error('   2. Firewall blocking connection');
      console.error('   3. IP address is not whitelisted in MongoDB settings');
      console.error('   4. Network connectivity issues');
    }
    
    // Don't throw - allow app to continue without MongoDB
    return false;
  }
};

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from MongoDB');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed through app termination');
  process.exit(0);
});

