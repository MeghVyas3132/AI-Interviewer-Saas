'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { InterviewSession } from '@/components/ai-interview';
import ProctoringRulesModal from '@/components/ProctoringRulesModal';
import Cookies from 'js-cookie';

export default function InterviewRoomPage() {
  const params = useParams();
  const router = useRouter();
  const sessionToken = params.token as string;
  const [loading, setLoading] = useState(true);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [showProctoringModal, setShowProctoringModal] = useState(true);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [windowBlurCount, setWindowBlurCount] = useState(0);

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

  // Proctoring: Track visibility changes (tab switches)
  useEffect(() => {
    if (!interviewStarted) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitchCount(prev => prev + 1);
        console.warn('🚨 Proctoring: Tab switch detected!');
      }
    };

    const handleWindowBlur = () => {
      setWindowBlurCount(prev => prev + 1);
      console.warn('🚨 Proctoring: Window blur detected!');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [interviewStarted]);

  const handleAcceptProctoring = useCallback(() => {
    setShowProctoringModal(false);
    setInterviewStarted(true);
  }, []);

  const handleDeclineProctoring = useCallback(() => {
    router.push('/candidate-portal');
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
      {/* Proctoring Rules Modal */}
      <ProctoringRulesModal
        isOpen={showProctoringModal}
        onAccept={handleAcceptProctoring}
        onDecline={handleDeclineProctoring}
      />

      {/* Proctoring Warning Banner */}
      {interviewStarted && (tabSwitchCount > 0 || windowBlurCount > 0) && (
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white py-2 px-4 text-center text-sm font-medium z-40">
          ⚠️ Warning: {tabSwitchCount > 0 && `${tabSwitchCount} tab switch(es) detected`}
          {tabSwitchCount > 0 && windowBlurCount > 0 && ', '}
          {windowBlurCount > 0 && `${windowBlurCount} window focus loss(es) detected`}
        </div>
      )}

      <div className={`bg-white shadow-sm p-4 flex justify-between items-center z-10 border-b ${(tabSwitchCount > 0 || windowBlurCount > 0) ? 'mt-10' : ''}`}>
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
        {interviewStarted && (
          <InterviewSession
            sessionId={sessionToken}
            candidateId={candidateId}
            mode="voice"
          />
        )}
      </div>
    </div>
  );
}
