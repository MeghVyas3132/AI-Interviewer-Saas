/**
 * AssemblyAI API Key Manager (JavaScript version for Node.js)
 * 
 * This module provides intelligent API key rotation and fallback mechanisms
 * for AssemblyAI API keys to ensure high availability and load distribution.
 */

class AssemblyAIApiKeyManager {
  constructor(config) {
    this.config = config;
    this.currentIndex = 0;
    this.keyUsageStats = new Map();
    this.initializeKeyStats();
  }

  initializeKeyStats() {
    this.config.keys.forEach(keyConfig => {
      if (!this.keyUsageStats.has(keyConfig.key)) {
        this.keyUsageStats.set(keyConfig.key, {
          usageCount: 0,
          lastUsed: new Date(0)
        });
      }
    });
  }

  /**
   * Get the next available API key based on the rotation strategy
   */
  getNextApiKey() {
    const availableKeys = this.getAvailableKeys();

    if (availableKeys.length === 0) {
      console.error('No available AssemblyAI API keys found');
      return null;
    }

    let selectedKey;

    switch (this.config.rotationStrategy) {
      case 'round-robin':
        selectedKey = this.getRoundRobinKey(availableKeys);
        break;
      case 'least-used':
        selectedKey = this.getLeastUsedKey(availableKeys);
        break;
      case 'random':
        selectedKey = this.getRandomKey(availableKeys);
        break;
      default:
        selectedKey = this.getRoundRobinKey(availableKeys);
    }

    this.updateKeyUsage(selectedKey);
    return selectedKey;
  }

  /**
   * Mark an API key as failed and potentially put it in cooldown
   */
  markKeyFailed(key, error) {
    const keyConfig = this.config.keys.find(k => k.key === key);
    if (!keyConfig) return;

    keyConfig.errorCount++;
    keyConfig.lastUsed = new Date();

    // Check if key should be put in cooldown
    if (keyConfig.errorCount >= keyConfig.maxErrors) {
      keyConfig.cooldownUntil = new Date(Date.now() + this.config.cooldownDuration);
      console.warn(`AssemblyAI API key ${key.substring(0, 8)}... is in cooldown until ${keyConfig.cooldownUntil.toISOString()}`);
    }

    // Log the error for monitoring
    console.error(`AssemblyAI API key ${key.substring(0, 8)}... failed:`, error?.message || 'Unknown error');
  }

  /**
   * Mark an API key as successful (reset error count)
   */
  markKeySuccess(key) {
    const keyConfig = this.config.keys.find(k => k.key === key);
    if (!keyConfig) return;

    keyConfig.errorCount = 0;
    keyConfig.cooldownUntil = undefined;
    keyConfig.lastUsed = new Date();
  }

  /**
   * Get all available keys (active and not in cooldown)
   */
  getAvailableKeys() {
    const now = new Date();
    return this.config.keys
      .filter(keyConfig =>
        keyConfig.isActive &&
        (!keyConfig.cooldownUntil || keyConfig.cooldownUntil <= now)
      )
      .map(keyConfig => keyConfig.key);
  }

  /**
   * Get key using round-robin strategy
   */
  getRoundRobinKey(availableKeys) {
    const key = availableKeys[this.currentIndex % availableKeys.length];
    this.currentIndex = (this.currentIndex + 1) % availableKeys.length;
    return key;
  }

  /**
   * Get the least used key
   */
  getLeastUsedKey(availableKeys) {
    let leastUsedKey = availableKeys[0];
    let leastUsageCount = this.keyUsageStats.get(leastUsedKey)?.usageCount || 0;

    for (const key of availableKeys) {
      const usageCount = this.keyUsageStats.get(key)?.usageCount || 0;
      if (usageCount < leastUsageCount) {
        leastUsedKey = key;
        leastUsageCount = usageCount;
      }
    }

    return leastUsedKey;
  }

  /**
   * Get a random key
   */
  getRandomKey(availableKeys) {
    const randomIndex = Math.floor(Math.random() * availableKeys.length);
    return availableKeys[randomIndex];
  }

  /**
   * Update key usage statistics
   */
  updateKeyUsage(key) {
    const stats = this.keyUsageStats.get(key);
    if (stats) {
      stats.usageCount++;
      stats.lastUsed = new Date();
    }
  }
}

// Create singleton instance
let assemblyaiApiKeyManager = null;

/**
 * Initialize the AssemblyAI API key manager with environment variables
 */
function initializeAssemblyAIApiKeyManager() {
  if (assemblyaiApiKeyManager) {
    return assemblyaiApiKeyManager;
  }

  const keys = [];

  // Primary AssemblyAI API key
  if (process.env.ASSEMBLYAI_API_KEY) {
    keys.push({
      key: process.env.ASSEMBLYAI_API_KEY,
      isActive: true,
      errorCount: 0,
      maxErrors: 3
    });
  }

  // Secondary AssemblyAI API keys (up to 5 total for handling 20+ concurrent users)
  if (process.env.ASSEMBLYAI_API_KEY_2) {
    keys.push({
      key: process.env.ASSEMBLYAI_API_KEY_2,
      isActive: true,
      errorCount: 0,
      maxErrors: 3
    });
  }

  if (process.env.ASSEMBLYAI_API_KEY_3) {
    keys.push({
      key: process.env.ASSEMBLYAI_API_KEY_3,
      isActive: true,
      errorCount: 0,
      maxErrors: 3
    });
  }

  if (process.env.ASSEMBLYAI_API_KEY_4) {
    keys.push({
      key: process.env.ASSEMBLYAI_API_KEY_4,
      isActive: true,
      errorCount: 0,
      maxErrors: 3
    });
  }

  if (process.env.ASSEMBLYAI_API_KEY_5) {
    keys.push({
      key: process.env.ASSEMBLYAI_API_KEY_5,
      isActive: true,
      errorCount: 0,
      maxErrors: 3
    });
  }

  if (process.env.ASSEMBLYAI_API_KEY_6) {
    keys.push({
      key: process.env.ASSEMBLYAI_API_KEY_6,
      isActive: true,
      errorCount: 0,
      maxErrors: 3
    });
  }

  if (process.env.ASSEMBLYAI_API_KEY_7) {
    keys.push({
      key: process.env.ASSEMBLYAI_API_KEY_7,
      isActive: true,
      errorCount: 0,
      maxErrors: 3
    });
  }

  if (process.env.ASSEMBLYAI_API_KEY_8) {
    keys.push({
      key: process.env.ASSEMBLYAI_API_KEY_8,
      isActive: true,
      errorCount: 0,
      maxErrors: 3
    });
  }

  if (keys.length === 0) {
    throw new Error('No AssemblyAI API keys found in environment variables');
  }

  const config = {
    keys,
    rotationStrategy: process.env.ASSEMBLYAI_API_KEY_ROTATION_STRATEGY || 'round-robin',
    cooldownDuration: parseInt(process.env.ASSEMBLYAI_API_KEY_COOLDOWN_DURATION || '300000'), // 5 minutes default
    maxRetries: parseInt(process.env.ASSEMBLYAI_API_KEY_MAX_RETRIES || '3')
  };

  assemblyaiApiKeyManager = new AssemblyAIApiKeyManager(config);
  console.log(`AssemblyAI API Key Manager initialized with ${keys.length} keys using ${config.rotationStrategy} strategy`);

  return assemblyaiApiKeyManager;
}

/**
 * Get the AssemblyAI API key manager instance
 */
function getAssemblyAIApiKeyManager() {
  if (!assemblyaiApiKeyManager) {
    return initializeAssemblyAIApiKeyManager();
  }
  return assemblyaiApiKeyManager;
}

module.exports = {
  AssemblyAIApiKeyManager,
  initializeAssemblyAIApiKeyManager,
  getAssemblyAIApiKeyManager
};
