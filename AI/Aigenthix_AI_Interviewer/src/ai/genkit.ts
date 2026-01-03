import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import { getApiKeyManager, withApiKeyRotation } from '@/lib/api-key-manager';

// Initialize API key manager
const apiKeyManager = getApiKeyManager();

// Get the first available API key for initial setup (fallback)
const getInitialApiKey = (): string => {
  const key = apiKeyManager.getNextApiKey();
  return key || process.env.GOOGLE_API_KEY || '';
};

// Create Google AI plugin with rotated API key
const googleAIPlugin = googleAI({
  apiKey: getInitialApiKey(),
});

export const ai = genkit({
  plugins: [googleAIPlugin],
  model: 'googleai/gemini-1.5-flash',
  config: {
    temperature: 0.7, // Balanced creativity and consistency
    topP: 0.9, // Good balance for diverse responses
    maxOutputTokens: 2048, // Limit response length for faster generation
  },
});

/**
 * Creates a genkit instance with a specific API key
 * Used for dynamic flow creation with rotation
 */
function createGenkitInstance(apiKey: string) {
  return genkit({
    plugins: [googleAI({ apiKey })],
    model: 'googleai/gemini-1.5-flash',
    config: {
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 2048,
    },
  });
}

/**
 * Wrapper function to execute a flow with API key rotation
 * This ensures all LLM calls use round-robin API key rotation
 * 
 * Note: This works by creating a new genkit instance with the rotated key
 * and re-executing the flow logic. The flow function should be the actual
 * flow implementation, not the bound flow.
 */
export async function executeFlowWithRotation<T>(
  flowLogic: (aiInstance: any, input: any) => Promise<T>,
  input: any
): Promise<T> {
  return withApiKeyRotation(async (apiKey: string) => {
    // Create a temporary genkit instance with the rotated API key
    const tempAI = createGenkitInstance(apiKey);
    
    // Execute the flow logic with the new instance
    return await flowLogic(tempAI, input);
  });
}

// Enhanced AI wrapper with API key rotation
export const aiWithRotation = {
  generate: async (prompt: string, options?: any) => {
    return withApiKeyRotation(async (apiKey: string) => {
      // Create a temporary genkit instance with the current API key
      const tempAI = genkit({
        plugins: [googleAI({ apiKey })],
        model: 'googleai/gemini-1.5-flash',
        config: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 2048,
        },
      });
      
      return await tempAI.generate(prompt, options);
    });
  },
  
  generateText: async (prompt: string, options?: any) => {
    return withApiKeyRotation(async (apiKey: string) => {
      const tempAI = genkit({
        plugins: [googleAI({ apiKey })],
        model: 'googleai/gemini-1.5-flash',
        config: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 2048,
        },
      });
      
      return await tempAI.generateText(prompt, options);
    });
  }
};

// Export the API key manager for use in other parts of the application
export { apiKeyManager };
