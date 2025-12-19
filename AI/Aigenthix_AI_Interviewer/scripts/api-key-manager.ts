#!/usr/bin/env tsx

/**
 * API Key Management Utility
 * 
 * This script helps manage Google AI API keys for the AI Interviewer application.
 * It provides commands to test keys, view status, and manage rotation.
 */

import { initializeApiKeyManager, getApiKeyManager } from '../src/lib/api-key-manager';
import { initializeOpenAIApiKeyManager, getOpenAIApiKeyManager } from '../src/lib/openai-api-key-manager';

// Load environment variables
require('dotenv').config();

interface Command {
  name: string;
  description: string;
  action: () => Promise<void>;
}

const commands: Command[] = [
  {
    name: 'status',
    description: 'Show the status of all configured API keys (Google AI and OpenAI)',
    action: async () => {
      try {
        console.log('\n🔑 API Key Status Report');
        console.log('=' .repeat(60));
        
        // Google AI Keys
        try {
          const googleManager = getApiKeyManager();
          const googleStatus = googleManager.getKeyStatus();
          
          console.log('\n📊 Google AI API Keys');
          console.log('-'.repeat(30));
          
          googleStatus.forEach((keyStatus, index) => {
            console.log(`\nKey ${index + 1}: ${keyStatus.key}`);
            console.log(`  Status: ${keyStatus.isActive ? '✅ Active' : '❌ Inactive'}`);
            console.log(`  Usage Count: ${keyStatus.usageCount}`);
            console.log(`  Error Count: ${keyStatus.errorCount}`);
            console.log(`  Last Used: ${keyStatus.lastUsed.toISOString()}`);
            
            if (keyStatus.cooldownUntil) {
              const cooldownTime = new Date(keyStatus.cooldownUntil);
              const now = new Date();
              if (cooldownTime > now) {
                console.log(`  Cooldown Until: ${cooldownTime.toISOString()}`);
              } else {
                console.log(`  Cooldown: ✅ Expired`);
              }
            }
          });
          
          const activeGoogleKeys = googleStatus.filter(s => s.isActive && !s.cooldownUntil);
          console.log(`\n📊 Google AI Summary: ${activeGoogleKeys.length}/${googleStatus.length} keys available`);
        } catch (error) {
          console.log('\n❌ Google AI API keys not configured or error:', error);
        }
        
        // OpenAI Keys
        try {
          const openaiManager = getOpenAIApiKeyManager();
          const openaiStatus = openaiManager.getKeyStatus();
          
          console.log('\n🤖 OpenAI API Keys');
          console.log('-'.repeat(30));
          
          openaiStatus.forEach((keyStatus, index) => {
            console.log(`\nKey ${index + 1}: ${keyStatus.key}`);
            console.log(`  Status: ${keyStatus.isActive ? '✅ Active' : '❌ Inactive'}`);
            console.log(`  Usage Count: ${keyStatus.usageCount}`);
            console.log(`  Error Count: ${keyStatus.errorCount}`);
            console.log(`  Last Used: ${keyStatus.lastUsed.toISOString()}`);
            
            if (keyStatus.cooldownUntil) {
              const cooldownTime = new Date(keyStatus.cooldownUntil);
              const now = new Date();
              if (cooldownTime > now) {
                console.log(`  Cooldown Until: ${cooldownTime.toISOString()}`);
              } else {
                console.log(`  Cooldown: ✅ Expired`);
              }
            }
          });
          
          const activeOpenAIKeys = openaiStatus.filter(s => s.isActive && !s.cooldownUntil);
          console.log(`\n📊 OpenAI Summary: ${activeOpenAIKeys.length}/${openaiStatus.length} keys available`);
        } catch (error) {
          console.log('\n❌ OpenAI API keys not configured or error:', error);
        }
        
      } catch (error) {
        console.error('❌ Error getting key status:', error);
      }
    }
  },
  
  {
    name: 'test',
    description: 'Test all configured API keys (Google AI and OpenAI)',
    action: async () => {
      try {
        console.log('\n🧪 Testing API Keys');
        console.log('=' .repeat(40));
        
        // Test Google AI Keys
        try {
          const googleManager = getApiKeyManager();
          const googleStatus = googleManager.getKeyStatus();
          
          console.log('\n📊 Testing Google AI API Keys');
          console.log('-'.repeat(35));
          
          for (let i = 0; i < googleStatus.length; i++) {
            const keyStatus = googleStatus[i];
            const fullKey = process.env[`GOOGLE_API_KEY${i === 0 ? '' : `_${i + 1}`}`];
            
            if (!fullKey) continue;
            
            console.log(`\nTesting Google AI Key ${i + 1}: ${keyStatus.key}`);
            
            try {
              // Test the key with a simple request
              const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + fullKey, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  contents: [{
                    parts: [{
                      text: 'Hello, this is a test message.'
                    }]
                  }]
                })
              });
              
              if (response.ok) {
                console.log('  ✅ Key is working correctly');
                googleManager.markKeySuccess(fullKey);
              } else {
                const error = await response.text();
                console.log(`  ❌ Key failed: ${response.status} - ${error}`);
                googleManager.markKeyFailed(fullKey, new Error(`HTTP ${response.status}: ${error}`));
              }
            } catch (error) {
              console.log(`  ❌ Key failed: ${error}`);
              googleManager.markKeyFailed(fullKey, error as Error);
            }
          }
        } catch (error) {
          console.log('\n❌ Google AI API keys not configured or error:', error);
        }
        
        // Test OpenAI Keys
        try {
          const openaiManager = getOpenAIApiKeyManager();
          const openaiStatus = openaiManager.getKeyStatus();
          
          console.log('\n🤖 Testing OpenAI API Keys');
          console.log('-'.repeat(35));
          
          for (let i = 0; i < openaiStatus.length; i++) {
            const keyStatus = openaiStatus[i];
            const fullKey = process.env[`OPENAI_API_KEY${i === 0 ? '' : `_${i + 1}`}`];
            
            if (!fullKey) continue;
            
            console.log(`\nTesting OpenAI Key ${i + 1}: ${keyStatus.key}`);
            
            try {
              // Test the key with a simple request
              const response = await fetch('https://api.openai.com/v1/models', {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${fullKey}`,
                  'Content-Type': 'application/json',
                }
              });
              
              if (response.ok) {
                console.log('  ✅ Key is working correctly');
                openaiManager.markKeySuccess(fullKey);
              } else {
                const error = await response.text();
                console.log(`  ❌ Key failed: ${response.status} - ${error}`);
                openaiManager.markKeyFailed(fullKey, new Error(`HTTP ${response.status}: ${error}`));
              }
            } catch (error) {
              console.log(`  ❌ Key failed: ${error}`);
              openaiManager.markKeyFailed(fullKey, error as Error);
            }
          }
        } catch (error) {
          console.log('\n❌ OpenAI API keys not configured or error:', error);
        }
        
      } catch (error) {
        console.error('❌ Error testing keys:', error);
      }
    }
  },
  
  {
    name: 'reset',
    description: 'Reset all API key error counts and cooldowns (Google AI and OpenAI)',
    action: async () => {
      try {
        // Reset Google AI keys
        try {
          const googleManager = getApiKeyManager();
          googleManager.resetAllKeys();
          console.log('✅ All Google AI API keys have been reset');
        } catch (error) {
          console.log('❌ Google AI API keys not configured or error:', error);
        }
        
        // Reset OpenAI keys
        try {
          const openaiManager = getOpenAIApiKeyManager();
          openaiManager.resetAllKeys();
          console.log('✅ All OpenAI API keys have been reset');
        } catch (error) {
          console.log('❌ OpenAI API keys not configured or error:', error);
        }
      } catch (error) {
        console.error('❌ Error resetting keys:', error);
      }
    }
  },
  
  {
    name: 'next',
    description: 'Show which API key would be used next (Google AI and OpenAI)',
    action: async () => {
      try {
        // Google AI next key
        try {
          const googleManager = getApiKeyManager();
          const nextGoogleKey = googleManager.getNextApiKey();
          
          if (nextGoogleKey) {
            console.log(`\n🔄 Next Google AI API Key: ${nextGoogleKey.substring(0, 8)}...`);
          } else {
            console.log('\n❌ No available Google AI API keys');
          }
        } catch (error) {
          console.log('\n❌ Google AI API keys not configured or error:', error);
        }
        
        // OpenAI next key
        try {
          const openaiManager = getOpenAIApiKeyManager();
          const nextOpenAIKey = openaiManager.getNextApiKey();
          
          if (nextOpenAIKey) {
            console.log(`\n🔄 Next OpenAI API Key: ${nextOpenAIKey.substring(0, 8)}...`);
          } else {
            console.log('\n❌ No available OpenAI API keys');
          }
        } catch (error) {
          console.log('\n❌ OpenAI API keys not configured or error:', error);
        }
      } catch (error) {
        console.error('❌ Error getting next key:', error);
      }
    }
  }
];

async function main() {
  const args = process.argv.slice(2);
  const commandName = args[0];
  
  if (!commandName) {
    console.log('\n🔑 API Key Management Utility');
    console.log('=' .repeat(40));
    console.log('\nAvailable commands:');
    commands.forEach(cmd => {
      console.log(`  ${cmd.name.padEnd(10)} - ${cmd.description}`);
    });
    console.log('\nUsage: tsx scripts/api-key-manager.ts <command>');
    return;
  }
  
  const command = commands.find(cmd => cmd.name === commandName);
  if (!command) {
    console.error(`❌ Unknown command: ${commandName}`);
    console.log('\nAvailable commands:');
    commands.forEach(cmd => {
      console.log(`  ${cmd.name.padEnd(10)} - ${cmd.description}`);
    });
    return;
  }
  
  try {
    // Initialize both API key managers
    initializeApiKeyManager();
    initializeOpenAIApiKeyManager();
    await command.action();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
