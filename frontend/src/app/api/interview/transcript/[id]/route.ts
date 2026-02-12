import { NextRequest, NextResponse } from 'next/server';

// Proxy to the Python backend
const BACKEND_URL = process.env.BACKEND_URL || 'http://ai_interviewer_backend:8000';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Interview ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));

    console.log(`[API Route] Proxying transcript save for interview: ${id} to ${BACKEND_URL}`);

    const response = await fetch(`${BACKEND_URL}/api/v1/hr/interviews/${id}/transcript`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    console.log(`[API Route] Backend transcript response status ${response.status}:`, data);

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[API Route] Error saving transcript:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save transcript' },
      { status: 500 }
    );
  }
}
