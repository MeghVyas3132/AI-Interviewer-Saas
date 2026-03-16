import type { NextApiRequest, NextApiResponse } from 'next';
import { Buffer } from 'buffer';

type TtsErrorSummary = {
  status: number;
  message: string;
  keyIndex: number;
};

async function readUpstreamError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    return payload?.error?.message || payload?.detail || payload?.error || 'OpenAI TTS request failed';
  } catch {
    try {
      const text = await response.text();
      return text || 'OpenAI TTS request failed';
    } catch {
      return 'OpenAI TTS request failed';
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    text,
    voice,
    modelId,
    outputFormat,
    languageCode,
    voiceSettings,
    instructions,
    speed,
  } = req.body || {};
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    const apiKeys = [
      process.env.OPENAI_API_KEY,
      process.env.OPENAI_API_KEY_2,
      process.env.OPENAI_API_KEY_3,
    ]
      .map((value) => (value || '').trim())
      .filter(Boolean);

    if (!apiKeys.length) {
      return res.status(500).json({ error: 'Missing OPENAI_API_KEY environment variable' });
    }

    const resolvedVoiceId =
      (voice === 'male' ? process.env.OPENAI_TTS_VOICE_MALE : process.env.OPENAI_TTS_VOICE_FEMALE) ||
      process.env.OPENAI_TTS_VOICE ||
      'alloy';

    const payload: Record<string, unknown> = {
      model: modelId || process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      input: text,
      voice: resolvedVoiceId,
      response_format: outputFormat || process.env.OPENAI_TTS_RESPONSE_FORMAT || 'mp3',
    };

    if (instructions) {
      payload.instructions = instructions;
    }
    if (typeof speed === 'number') {
      payload.speed = speed;
    }
    if (languageCode) {
      payload.language = languageCode;
    }
    if (voiceSettings) {
      payload.voice_settings = voiceSettings;
    }

    const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
    let lastError: TtsErrorSummary | null = null;

    for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex += 1) {
      const apiKey = apiKeys[keyIndex];
      const response = await fetch(`${baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'audio/mpeg';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(Buffer.from(arrayBuffer));
      }

      const message = await readUpstreamError(response);
      lastError = {
        status: response.status,
        message,
        keyIndex: keyIndex + 1,
      };
      const shouldTryNextKey = (response.status === 429 || response.status >= 500) && keyIndex < apiKeys.length - 1;
      if (shouldTryNextKey) {
        console.warn(`[TTS] key ${keyIndex + 1} failed (${response.status}); trying next key.`);
        continue;
      }
      break;
    }

    const statusCode = lastError?.status || 500;
    if (statusCode === 429) {
      console.warn(`[TTS] OpenAI rate-limited after ${apiKeys.length} key attempt(s).`);
    }
    return res.status(statusCode).json({
      error: lastError?.message || 'OpenAI TTS request failed',
      retryable: statusCode >= 500,
      code: statusCode === 429 ? 'rate_limited' : 'upstream_error',
      keyAttempts: apiKeys.length,
      failedOnKeyIndex: lastError?.keyIndex || 1,
    });
  } catch (error: any) {
    console.error('OpenAI TTS error:', error);

    let errorMessage = error.message || 'OpenAI TTS failed';
    let statusCode = 500;

    if (errorMessage?.toLowerCase().includes('api key')) {
      statusCode = 401;
      errorMessage = 'TTS authentication failed. Please check OPENAI_API_KEY.';
    }

    res.status(statusCode).json({
      error: errorMessage,
      retryable: statusCode >= 500,
      code: statusCode === 429 ? 'rate_limited' : 'internal_error',
    });
  }
}
