'use client'

import React from 'react'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/contexts/AuthContext'
import { BorderFrame } from '@/components/BorderFrame'
import '@/app/globals.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#06b6d4" />
      </head>
      <body className="bg-gray-50 text-gray-900 font-sans">
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 5000,
            style: {
              background: '#1e293b',
              color: '#f1f5f9',
              borderRadius: '12px',
              padding: '14px 20px',
              fontSize: '14px',
              maxWidth: '480px',
            },
          }}
        />
        <AuthProvider>
          <BorderFrame>
            {children}
          </BorderFrame>
        </AuthProvider>
      </body>
    </html>
  )
}
