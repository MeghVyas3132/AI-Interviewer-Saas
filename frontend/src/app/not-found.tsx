'use client'

import { useRouter } from 'next/navigation'

export default function NotFound() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="text-8xl font-bold text-white mb-4">404</div>
        <h1 className="text-4xl font-bold text-white mb-2">Page Not Found</h1>
        <p className="text-xl text-primary-100 mb-8">
          The page you're looking for doesn't exist.
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="px-8 py-3 bg-white text-primary-600 rounded-lg font-semibold hover:bg-gray-100 transition"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  )
}
