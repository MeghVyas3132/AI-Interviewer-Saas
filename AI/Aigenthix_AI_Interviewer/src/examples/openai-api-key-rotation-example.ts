#!/usr/bin/env tsx

/**
 * OpenAI API Key Rotation Example
 * 
 * This example demonstrates how to use the OpenAI API key rotation
 * system for making API calls with automatic fallback.
 */

import { withOpenAIApiKeyRotation, initializeOpenAIApiKeyManager } from '../src/lib/openai-api-key-manager';

// Load environment variables
require('dotenv').config();

async function exampleOpenAIApiCall() {
  try {
    // Initialize the OpenAI API key manager
    initializeOpenAIApiKeyManager();

    console.log('Testing OpenAI API Key Rotation...\n');

    // Example 1: Text-to-Speech API call
    console.log('Testing Text-to-Speech API...');
    const ttsResult = await withOpenAIApiKeyRotation(async (apiKey: string) => {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: 'Hello, this is a test of the OpenAI API key rotation system.',
          voice: 'alloy',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`TTS API error: ${error.error?.message || 'Unknown error'}`);
      }

      return response;
    });

    console.log('TTS API call successful!');
    console.log(`   Response status: ${ttsResult.status}`);

    // Example 2: Models API call
    console.log('\nTesting Models API...');
    const modelsResult = await withOpenAIApiKeyRotation(async (apiKey: string) => {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Models API error: ${error.error?.message || 'Unknown error'}`);
      }

      return response;
    });

    const modelsData = await modelsResult.json();
    console.log('Models API call successful!');
    console.log(`   Available models: ${modelsData.data.length}`);

    console.log('\nAll OpenAI API calls completed successfully with key rotation!');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  exampleOpenAIApiCall();
}
