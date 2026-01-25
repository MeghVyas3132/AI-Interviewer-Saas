import React from 'react'

export default function Footer() {
  return (
    <footer className="w-full bg-white border-t border-gray-200 mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-sm text-gray-600">
        <div className="flex items-center justify-between">
          <div>© {new Date().getFullYear()} AI Interviewer</div>
          <div>
            <a className="text-gray-600 hover:text-brand-600" href="/privacy">Privacy</a>
            <span className="mx-2">•</span>
            <a className="text-gray-600 hover:text-brand-600" href="/terms">Terms</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
