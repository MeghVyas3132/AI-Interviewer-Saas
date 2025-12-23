/**
 * OpenAI API Key Manager
 * 
 * This module provides intelligent API key rotation and fallback mechanisms
 * for OpenAI API keys to ensure high availability and load distribution.
 */

export interface OpenAIApiKeyConfig {
  key: string;
  isActive: boolean;
  lastUsed?: Date;
  errorCount: number;
  maxErrors: number;
  cooldownUntil?: Date;
}

export interface OpenAIApiKeyManagerConfig {
  keys: OpenAIApiKeyConfig[];
  rotationStrategy: 'round-robin' | 'least-used' | 'random';
  cooldownDuration: number; // in milliseconds
  maxRetries: number;
}

class OpenAIApiKeyManager {
  private config: OpenAIApiKeyManagerConfig;
  private currentIndex: number = 0;
  private keyUsageStats: Map<string, { usageCount: number; lastUsed: Date }> = new Map();

  constructor(config: OpenAIApiKeyManagerConfig) {
    this.config = config;
    this.initializeKeyStats();
  }

  private initializeKeyStats() {
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
  public getNextApiKey(): string | null {
    const availableKeys = this.getAvailableKeys();
    
    if (availableKeys.length === 0) {
      console.error('No available OpenAI API keys found');
      return null;
    }

    let selectedKey: string;

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
  public markKeyFailed(key: string, error?: Error): void {
    const keyConfig = this.config.keys.find(k => k.key === key);
    if (!keyConfig) return;

    keyConfig.errorCount++;
    keyConfig.lastUsed = new Date();

    // Check if key should be put in cooldown
    if (keyConfig.errorCount >= keyConfig.maxErrors) {
      keyConfig.cooldownUntil = new Date(Date.now() + this.config.cooldownDuration);
      console.warn(`OpenAI API key ${key.substring(0, 8)}... is in cooldown until ${keyConfig.cooldownUntil.toISOString()}`);
    }

    // Log the error for monitoring
    console.error(`OpenAI API key ${key.substring(0, 8)}... failed:`, error?.message || 'Unknown error');
  }

  /**
   * Mark an API key as successful (reset error count)
   */
  public markKeySuccess(key: string): void {
    const keyConfig = this.config.keys.find(k => k.key === key);
    if (!keyConfig) return;

    keyConfig.errorCount = 0;
    keyConfig.cooldownUntil = undefined;
    keyConfig.lastUsed = new Date();
  }

  /**
   * Get all available keys (active and not in cooldown)
   */
  private getAvailableKeys(): string[] {
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
  private getRoundRobinKey(availableKeys: string[]): string {
    const key = availableKeys[this.currentIndex % availableKeys.length];
    this.currentIndex = (this.currentIndex + 1) % availableKeys.length;
    return key;
  }

  /**
   * Get the least used key
   */
  private getLeastUsedKey(availableKeys: string[]): string {
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
  private getRandomKey(availableKeys: string[]): string {
    const randomIndex = Math.floor(Math.random() * availableKeys.length);
    return availableKeys[randomIndex];
  }

  /**
   * Update key usage statistics
   */
  private updateKeyUsage(key: string): void {
    const stats = this.keyUsageStats.get(key);
    if (stats) {
      stats.usageCount++;
      stats.lastUsed = new Date();
    }
  }

  /**
   * Get current status of all keys
   */
  public getKeyStatus(): Array<{
    key: string;
    isActive: boolean;
    errorCount: number;
    cooldownUntil?: Date;
    usageCount: number;
    lastUsed: Date;
  }> {
    return this.config.keys.map(keyConfig => {
      const stats = this.keyUsageStats.get(keyConfig.key);
      return {
        key: keyConfig.key.substring(0, 8) + '...',
        isActive: keyConfig.isActive,
        errorCount: keyConfig.errorCount,
        cooldownUntil: keyConfig.cooldownUntil,
        usageCount: stats?.usageCount || 0,
        lastUsed: stats?.lastUsed || new Date(0)
      };
    });
  }

  /**
   * Reset all key error counts and cooldowns
   */
  public resetAllKeys(): void {
    this.config.keys.forEach(keyConfig => {
      keyConfig.errorCount = 0;
      keyConfig.cooldownUntil = undefined;
    });
    console.log('All OpenAI API keys have been reset');
  }
}

// Create singleton instance
let openaiApiKeyManager: OpenAIApiKeyManager | null = null;

/**
 * Initialize the OpenAI API key manager with environment variables
 */
export function initializeOpenAIApiKeyManager(): OpenAIApiKeyManager {
  if (openaiApiKeyManager) {
    return openaiApiKeyManager;
  }

  const keys: OpenAIApiKeyConfig[] = [];
  
  // Primary OpenAI API key
  if (process.env.OPENAI_API_KEY) {
    keys.push({
      key: process.env.OPENAI_API_KEY,
      isActive: true,
      errorCount: 0,
      maxErrors: 3
    });
  }

  // Secondary OpenAI API keys
  if (process.env.OPENAI_API_KEY_2) {
    keys.push({
      key: process.env.OPENAI_API_KEY_2,
      isActive: true,
      errorCount: 0,
      maxErrors: 3
    });
  }

  if (process.env.OPENAI_API_KEY_3) {
    keys.push({
      key: process.env.OPENAI_API_KEY_3,
      isActive: true,
      errorCount: 0,
      maxErrors: 3
    });
  }

  if (keys.length === 0) {
    throw new Error('No OpenAI API keys found in environment variables');
  }

  const config: OpenAIApiKeyManagerConfig = {
    keys,
    rotationStrategy: (process.env.OPENAI_API_KEY_ROTATION_STRATEGY as 'round-robin' | 'least-used' | 'random') || 'round-robin',
    cooldownDuration: parseInt(process.env.OPENAI_API_KEY_COOLDOWN_DURATION || '300000'), // 5 minutes default
    maxRetries: parseInt(process.env.OPENAI_API_KEY_MAX_RETRIES || '3')
  };

  openaiApiKeyManager = new OpenAIApiKeyManager(config);
  console.log(`OpenAI API Key Manager initialized with ${keys.length} keys using ${config.rotationStrategy} strategy`);
  
  return openaiApiKeyManager;
}

/**
 * Get the OpenAI API key manager instance
 */
export function getOpenAIApiKeyManager(): OpenAIApiKeyManager {
  if (!openaiApiKeyManager) {
    return initializeOpenAIApiKeyManager();
  }
  return openaiApiKeyManager;
}

/**
 * Execute a function with OpenAI API key rotation and fallback
 */
export async function withOpenAIApiKeyRotation<T>(
  operation: (apiKey: string) => Promise<T>,
  maxRetries?: number
): Promise<T> {
  const manager = getOpenAIApiKeyManager();
  const retries = maxRetries || manager['config'].maxRetries;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    const apiKey = manager.getNextApiKey();
    
    if (!apiKey) {
      throw new Error('No available OpenAI API keys');
    }

    try {
      const result = await operation(apiKey);
      manager.markKeySuccess(apiKey);
      return result;
    } catch (error) {
      lastError = error as Error;
      manager.markKeyFailed(apiKey, error as Error);
      
      console.warn(`OpenAI attempt ${attempt + 1} failed with key ${apiKey.substring(0, 8)}...:`, error);
      
      // If this is the last attempt, don't continue
      if (attempt === retries - 1) {
        break;
      }
      
      // Wait a bit before trying the next key
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw lastError || new Error('All OpenAI API key attempts failed');
}

export default OpenAIApiKeyManager;
