import { NextRequest, NextResponse } from 'next/server';

// Proxy to the Python backend
// For local development without Docker, use localhost:8000
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  let id: string = '';
  
  try {
    const resolvedParams = await params;
    id = resolvedParams.id;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Interview ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));

    console.log(`[API Route] Proxying transcript save for interview: ${id} to ${BACKEND_URL}`);

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${BACKEND_URL}/api/v1/hr/interviews/${id}/transcript`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    const duration = Date.now() - startTime;
    console.log(`[API Route] Backend transcript response status ${response.status} in ${duration}ms:`, data);

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: data.detail || data.error || `Backend returned ${response.status}`,
        ...data
      }, { status: response.status });
    }

    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCause = error instanceof Error && 'cause' in error ? String((error as any).cause) : '';
    
    console.error(`[API Route] Error saving transcript (${duration}ms):`, error);
    
    // Detect connection errors
    if (errorMessage.includes('fetch failed') || errorCause.includes('ENOTFOUND') || errorCause.includes('ECONNREFUSED')) {
      console.error(`[API Route] BACKEND CONNECTION FAILED! Check BACKEND_URL. Current: ${BACKEND_URL}`);
      return NextResponse.json(
        { 
          success: false, 
          error: `Cannot connect to backend at ${BACKEND_URL}`,
          debug: { backend_url: BACKEND_URL, interview_id: id }
        },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: `Failed to save transcript: ${errorMessage}` },
      { status: 500 }
    );
  }
}
