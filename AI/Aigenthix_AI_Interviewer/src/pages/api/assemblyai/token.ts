import type { NextApiRequest, NextApiResponse } from 'next';

type TokenResponse = {
  token: string;
  expiresAt: string;
};

type ErrorResponse = {
  error: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TokenResponse | ErrorResponse>,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  if (!apiKey) {
    return res
      .status(500)
      .json({ error: 'Missing ASSEMBLYAI_API_KEY environment variable' });
  }

  try {
    // Try without the speech_model parameter in URL
    const upstreamResponse = await fetch(
      'https://api.assemblyai.com/v2/realtime/token',
      {
        method: 'POST',
        headers: {
          authorization: apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          expires_in: 3600,
        }),
      },
    );

    if (!upstreamResponse.ok) {
      const body = await upstreamResponse.text();
      console.error(
        'AssemblyAI token request failed',
        upstreamResponse.status,
        body,
      );

      return res.status(502).json({
        error: 'Unable to create AssemblyAI streaming token',
      });
    }

    const payload = await upstreamResponse.json();

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      token: payload.token,
      expiresAt: payload.expires_at,
    });
  } catch (error) {
    console.error('AssemblyAI token route error', error);
    return res
      .status(500)
      .json({ error: 'Unexpected error requesting AssemblyAI token' });
  }
}

