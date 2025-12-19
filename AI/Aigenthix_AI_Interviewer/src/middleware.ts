import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // CORS configuration
  const origin = request.headers.get('origin');
  const allowedOrigins = ['http://localhost:3000', 'http://localhost:3001'];
  const isAllowedOrigin = origin && allowedOrigins.includes(origin);

  // Handle preflight OPTIONS requests
  if (request.method === 'OPTIONS') {
    const preflightHeaders = {
      ...(isAllowedOrigin && { 'Access-Control-Allow-Origin': origin }),
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    };
    return new NextResponse(null, { status: 204, headers: preflightHeaders });
  }

  const response = NextResponse.next();

  // Add CORS headers to all responses
  if (isAllowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  response.headers.set('Access-Control-Allow-Credentials', 'true');

  // Security Headers - OWASP Best Practices
  // Content Security Policy
  const connectSources = [
    "'self'",
    'https://api.assemblyai.com',
    'wss://api.assemblyai.com',
    'wss://localhost:*',
    'ws://localhost:*',
  ];

  const wsProxyEnv = process.env.NEXT_PUBLIC_WS_PROXY_URL;
  if (wsProxyEnv) {
    try {
      const parsed = new URL(wsProxyEnv);
      connectSources.push(`${parsed.protocol}//${parsed.host}`);
    } catch (err) {
      console.warn('Invalid NEXT_PUBLIC_WS_PROXY_URL for CSP:', wsProxyEnv, err);
    }
  }

  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    `connect-src ${connectSources.join(' ')}`,
    "media-src 'self' blob: data:",
    "object-src 'none'",
    "worker-src 'self' https://cdnjs.cloudflare.com blob:",
    "base-uri 'self'",
    "form-action 'self'",
    // Allow embedding from the main frontend and from the AI service itself.
    // This lets http://localhost:3000 (and the AI app at 3001) iframe the AI UI.
    "frame-ancestors 'self' http://localhost:3000 http://localhost:3001",
    "upgrade-insecure-requests",
  ];
  response.headers.set('Content-Security-Policy', cspDirectives.join('; '));

  // Anti-clickjacking
  // Rely primarily on CSP's frame-ancestors; allow same-origin iframes.
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // XSS Protection (legacy but still useful)
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Referrer Policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy (formerly Feature-Policy)
  response.headers.set(
    'Permissions-Policy',
    "geolocation=(), microphone=(self), camera=(self), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
  );

  // Strict Transport Security (HSTS) - only in production with HTTPS
  if (process.env.NODE_ENV === 'production' && request.nextUrl.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Prevent caching of sensitive data
  const sensitivePaths = ['/admin', '/api/admin', '/api/interview', '/reports'];
  const isSensitivePath = sensitivePaths.some(path => request.nextUrl.pathname.startsWith(path));

  if (isSensitivePath) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  // Check if the request is for admin routes
  if (request.nextUrl.pathname.startsWith('/admin') &&
    !request.nextUrl.pathname.startsWith('/admin/login') &&
    !request.nextUrl.pathname.startsWith('/api/admin/auth')) {

    // Check for admin session cookie
    const sessionCookie = request.cookies.get('admin_session');

    if (!sessionCookie) {
      // Redirect to login if no session
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/:path*',
  ],
};
