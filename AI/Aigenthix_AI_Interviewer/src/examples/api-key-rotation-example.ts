/**
 * Example: Using API Key Rotation in AI Flows
 * 
 * This file demonstrates how to use the new API key rotation system
 * in your AI flows for better reliability and performance.
 */

import { aiWithRotation, apiKeyManager } from '@/ai/genkit';
import { z } from 'genkit';

// Example 1: Using the enhanced AI wrapper with automatic rotation
export async function generateTextWithRotation(prompt: string): Promise<string> {
  try {
    const result = await aiWithRotation.generateText(prompt);
    return result.text();
  } catch (error) {
    console.error('Failed to generate text with rotation:', error);
    throw error;
  }
}

// Example 2: Manual API key management for custom operations
export async function customApiCallWithRotation<T>(
  operation: (apiKey: string) => Promise<T>
): Promise<T> {
  const { withApiKeyRotation } = await import('@/lib/api-key-manager');
  
  return withApiKeyRotation(async (apiKey: string) => {
    // Your custom API call logic here
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: 'Your prompt here'
          }]
        }]
      })
    });
    
    if (!response.ok) {
      throw new Error(`API call failed: ${response.status}`);
    }
    
    return await response.json() as T;
  });
}

// Example 3: Monitoring API key status
export function getApiKeyStatus() {
  return apiKeyManager.getKeyStatus();
}

// Example 4: Resetting failed keys (useful for admin operations)
export function resetFailedKeys() {
  apiKeyManager.resetAllKeys();
}

// Example 5: Schema-based generation with rotation
const ExampleSchema = z.object({
  title: z.string().describe('A catchy title'),
  summary: z.string().describe('A brief summary'),
  tags: z.array(z.string()).describe('Relevant tags')
});

export async function generateStructuredContentWithRotation(
  prompt: string
): Promise<z.infer<typeof ExampleSchema>> {
  try {
    const result = await aiWithRotation.generate(prompt, {
      schema: ExampleSchema
    });
    return result.data();
  } catch (error) {
    console.error('Failed to generate structured content:', error);
    throw error;
  }
}

// Example 6: Error handling with detailed logging
export async function robustApiCall(prompt: string): Promise<string> {
  try {
    const result = await aiWithRotation.generateText(prompt);
    return result.text();
  } catch (error) {
    // Log the error and current key status
    console.error('API call failed:', error);
    console.log('Current API key status:', getApiKeyStatus());
    
    // You could implement additional fallback logic here
    // For example, switching to a different AI provider
    
    throw error;
  }
}
