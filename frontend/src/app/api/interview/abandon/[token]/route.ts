import { NextRequest, NextResponse } from 'next/server';

const AI_SERVICE_URL = process.env.AI_INTERVIEW_SERVICE_URL || 'http://localhost:3001';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));

    // Proxy the request to AI service
    const response = await fetch(`${AI_SERVICE_URL}/api/interview/abandon/${token}`, {
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
    console.error('Error abandoning interview:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to abandon interview' },
      { status: 500 }
    );
  }
}
