'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { InterviewSession } from '@/components/ai-interview';
import Cookies from 'js-cookie';

export default function InterviewRoomPage() {
  const params = useParams();
  const router = useRouter();
  const sessionToken = params.token as string;
  const [loading, setLoading] = useState(true);
  const [candidateId, setCandidateId] = useState<string | null>(null);

  useEffect(() => {
    // Verify authentication
    const token = Cookies.get('access_token');
    if (!token) {
      router.push('/auth/login');
      return;
    }

    // Get candidate ID from localStorage
    const userData = localStorage.getItem('user');
    if (userData) {
      const user = JSON.parse(userData);
      if (user.role !== 'CANDIDATE') {
        router.push('/dashboard');
        return;
      }
      setCandidateId(user.id);
      setLoading(false);
    } else {
      router.push('/auth/login');
    }
  }, [router]);

  if (loading || !candidateId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm p-4 flex justify-between items-center z-10 border-b">
        <div className="flex items-center">
          <img src="/images/logo.png" alt="Logo" className="h-8 mr-4" />
          <h1 className="text-xl font-semibold text-gray-800">AI Interview Session</h1>
        </div>
        <button
          onClick={() => router.push('/candidate-portal')}
          className="text-gray-600 hover:text-gray-900 px-4 py-2 rounded hover:bg-gray-100 transition-colors"
        >
          Exit to Dashboard
        </button>
      </div>
      <div className="h-[calc(100vh-73px)]">
        <InterviewSession
          sessionId={sessionToken}
          candidateId={candidateId}
          mode="voice"
        />
      </div>
    </div>
  );
}
