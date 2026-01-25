import { NextRequest, NextResponse } from 'next/server';

const AI_SERVICE_URL = process.env.AI_INTERVIEW_SERVICE_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Proxy the request to AI service's interview agent
    const response = await fetch(`${AI_SERVICE_URL}/api/ai/interview-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error calling AI interview agent:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process AI response' },
      { status: 500 }
    );
  }
}
