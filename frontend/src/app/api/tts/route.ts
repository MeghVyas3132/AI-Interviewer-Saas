import { NextRequest, NextResponse } from 'next/server';

const AI_SERVICE_URL =
  process.env.AI_INTERVIEW_SERVICE_URL ||
  process.env.NEXT_PUBLIC_AI_SERVICE_URL ||
  'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${AI_SERVICE_URL}/api/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const contentType = response.headers.get('content-type') || 'application/json';
    const data = await response.arrayBuffer();

    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    console.error('Error calling AI TTS:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process TTS request' },
      { status: 500 }
    );
  }
}
