import type { NextApiRequest, NextApiResponse } from 'next';
import { Buffer } from 'buffer';
import { withOpenAIApiKeyRotation, initializeOpenAIApiKeyManager } from '@/lib/openai-api-key-manager';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, language } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    // Initialize OpenAI API key manager
    initializeOpenAIApiKeyManager();

    // Use OpenAI TTS for speech synthesis with key rotation
    const result = await withOpenAIApiKeyRotation(async (apiKey: string) => {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: 'nova', // Female voice for consistent experience
          ...(language ? { language } : {}),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI TTS API error: ${error.error?.message || 'Unknown error'}`);
      }

      return response;
    });

    const arrayBuffer = await result.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');
    const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
    res.status(200).json({ audioUrl });
  } catch (error: any) {
    console.error('OpenAI TTS error:', error);
    
    // Provide more specific error messages
    let errorMessage = error.message || 'OpenAI TTS failed';
    let statusCode = 500;
    
    // Check for specific error types
    if (error.message?.includes('Incorrect API key')) {
      statusCode = 401;
      errorMessage = 'TTS authentication failed. Please check API key configuration.';
    } else if (error.message?.includes('quota') || error.message?.includes('billing')) {
      statusCode = 429;
      errorMessage = 'TTS service quota exceeded. Please try again later.';
    } else if (error.message?.includes('No available')) {
      statusCode = 503;
      errorMessage = 'TTS service temporarily unavailable. Please try again later.';
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      retryable: statusCode >= 500 || statusCode === 429 // Indicate if client should retry
    });
  }
} 