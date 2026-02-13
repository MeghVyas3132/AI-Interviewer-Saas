import { NextRequest, NextResponse } from 'next/server';

// Proxy to the Python backend (not the AI coach service)
// For local development without Docker, use localhost:8000
// For Docker, use ai_interviewer_backend:8000
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const startTime = Date.now();
  let token: string = '';
  
  try {
    const resolvedParams = await params;
    token = resolvedParams.token;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));

    console.log(`[API Route] Proxying interview complete for token: ${token} to ${BACKEND_URL}`);
    console.log(`[API Route] Request body keys: ${Object.keys(body).join(', ')}`);

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    // Proxy the request to the Python backend
    const response = await fetch(`${BACKEND_URL}/api/v1/hr/interviews/ai-complete/${token}`, {
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
    console.log(`[API Route] Backend responded with status ${response.status} in ${duration}ms:`, 
      JSON.stringify(data).substring(0, 500));

    if (!response.ok) {
      // Pass through backend error with details
      return NextResponse.json({
        success: false,
        error: data.detail || data.error || `Backend returned ${response.status}`,
        backend_status: response.status,
        ...data
      }, { status: response.status });
    }

    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCause = error instanceof Error && 'cause' in error ? String((error as any).cause) : '';
    
    console.error(`[API Route] Error completing interview (${duration}ms):`, error);
    
    // Detect connection errors (e.g., wrong backend URL)
    if (errorMessage.includes('fetch failed') || errorCause.includes('ENOTFOUND') || errorCause.includes('ECONNREFUSED')) {
      console.error(`[API Route] BACKEND CONNECTION FAILED! Check BACKEND_URL env var. Current: ${BACKEND_URL}`);
      return NextResponse.json(
        { 
          success: false, 
          error: `Cannot connect to backend at ${BACKEND_URL}. Please check server configuration.`,
          debug: {
            backend_url: BACKEND_URL,
            error_type: 'CONNECTION_FAILED',
            token: token,
          }
        },
        { status: 503 } // Service Unavailable
      );
    }
    
    // Detect timeout
    if (errorMessage.includes('aborted') || errorMessage.includes('timeout')) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Backend request timed out after 30 seconds',
          debug: { token: token, duration_ms: duration }
        },
        { status: 504 } // Gateway Timeout
      );
    }
    
    // Generic error with details
    return NextResponse.json(
      { 
        success: false, 
        error: `Failed to complete interview: ${errorMessage}`,
        debug: { token: token, duration_ms: duration }
      },
      { status: 500 }
    );
  }
}
