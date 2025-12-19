'use client'

import React from 'react'
import { AuthProvider } from '@/contexts/AuthContext'
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
        {/* The title and icon links are now handled by the exported metadata object */}
        <meta name="theme-color" content="#2563eb" />
      </head>
      <body className="bg-gray-50">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
