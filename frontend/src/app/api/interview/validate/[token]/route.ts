import { NextRequest, NextResponse } from 'next/server';

const AI_SERVICE_URL = process.env.AI_INTERVIEW_SERVICE_URL || 'http://localhost:3001';

export async function GET(
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

    // Proxy the request to AI service
    const response = await fetch(`${AI_SERVICE_URL}/api/interview/validate/${token}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error validating interview token:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to validate interview token' },
      { status: 500 }
    );
  }
}
