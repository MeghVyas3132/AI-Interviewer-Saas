import Link from 'next/link'
import React from 'react'

export default function Header() {
  return (
    <header className="w-full bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <Link href="/">
              <span className="text-brand-600 font-semibold text-lg cursor-pointer">AI Interviewer</span>
            </Link>
          </div>

          <div className="flex items-center">
            <Link href="/auth/login">
              <span className="btn-primary cursor-pointer">Sign in</span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}
