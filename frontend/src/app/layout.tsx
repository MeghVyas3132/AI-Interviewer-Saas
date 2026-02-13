'use client'

import React from 'react'
import { AuthProvider } from '@/contexts/AuthContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { BorderFrame } from '@/components/BorderFrame'
import ErrorBoundary from '@/components/ErrorBoundary'
import '@/app/globals.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#06b6d4" />
      </head>
      <body className="bg-gray-50 text-gray-900 font-sans">
        <ErrorBoundary>
          <ToastProvider>
            <AuthProvider>
              <BorderFrame>
                {children}
              </BorderFrame>
            </AuthProvider>
          </ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
