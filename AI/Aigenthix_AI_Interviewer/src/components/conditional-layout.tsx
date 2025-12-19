'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, Suspense } from 'react';
import { AppLayout } from '@/components/app-layout';
import { Toaster } from '@/components/ui/toaster';

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <ConditionalLayoutContent>{children}</ConditionalLayoutContent>
    </Suspense>
  );
}

function ConditionalLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEmbedded = searchParams.get('embedded') === 'true';

  // Token-based interview URLs follow the pattern: /interview/[token] or /interview/[token]/start
  // Regular /interview page should still show sidebar, so we check for /interview/[token] pattern
  // Tokens are typically long alphanumeric strings (e.g., 5c6219357f6a1afaa247e669bfc9a303)
  // Also include thank-you, restricted-access, and invalid-session pages (no sidebar for these)
  const isTokenBasedInterview = pathname?.match(/^\/interview\/[a-zA-Z0-9]+(\/.*)?$/) ||
    pathname === '/thank-you' ||
    pathname === '/restricted-access' ||
    pathname === '/invalid-session' ||
    pathname === '/interview-ended';

  // Extract token from URL if present
  const tokenMatch = pathname?.match(/^\/interview\/([a-zA-Z0-9]+)/);
  const token = tokenMatch ? tokenMatch[1] : null;

  // Route guard: Block access to restricted routes for token-based sessions
  useEffect(() => {
    // Mark email-based session in localStorage when token is present
    if (token && typeof window !== 'undefined') {
      localStorage.setItem('isEmailInterviewSession', 'true');
      localStorage.setItem('emailInterviewToken', token);
    }

    // Check if user is in an email-based interview session
    const isEmailSession = token || (typeof window !== 'undefined' && localStorage.getItem('isEmailInterviewSession') === 'true');

    if (isEmailSession) {
      // Define restricted routes that token-based sessions cannot access
      const restrictedRoutes = [
        '/prepare',
        '/admin',
        '/reports',
        '/summary',
        '/home',
        '/dashboard',
        '/'
      ];

      // Check if current path is a restricted route
      const isRestrictedRoute = restrictedRoutes.some(route => {
        // Exact match or starts with the route (for nested routes)
        return pathname === route || pathname?.startsWith(route + '/');
      });

      // Allowed routes for token-based sessions
      const storedToken = token || (typeof window !== 'undefined' ? localStorage.getItem('emailInterviewToken') : null);
      const allowedRoutes = [
        storedToken ? `/interview/${storedToken}` : null,
        storedToken ? `/interview/${storedToken}/start` : null,
        '/interview-ended',
        '/thank-you',
        '/restricted-access',
        '/invalid-session'
      ].filter(Boolean) as string[];

      const isAllowedRoute = allowedRoutes.some(route => pathname === route || (route && pathname?.startsWith(route)));

      // If accessing a restricted route, redirect to thank-you page (session has ended)
      // This ensures candidates always see thank-you page after completing or exiting interview
      if (isRestrictedRoute && !isAllowedRoute) {
        // Check if session might be completed/abandoned - redirect to thank-you
        router.replace('/thank-you');
      }
    }

  }, [pathname, token, router]);

  // If embedded, just show children
  if (isEmbedded) {
    return (
      <div className="embedded-view bg-white min-h-screen">
        {children}
        <Toaster />
      </div>
    );
  }

  // If it's a token-based interview page, don't show the sidebar
  if (isTokenBasedInterview) {
    return (
      <>
        {children}
        <Toaster />
      </>
    );
  }

  // For all other pages, show the normal layout with sidebar
  return (
    <>
      <AppLayout>
        {children}
      </AppLayout>
      <Toaster />
    </>
  );
}

