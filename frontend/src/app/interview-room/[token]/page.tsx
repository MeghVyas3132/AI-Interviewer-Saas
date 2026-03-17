'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { InterviewSession } from '@/components/ai-interview';
import ProctoringRulesModal from '@/components/ProctoringRulesModal';
import Cookies from 'js-cookie';

// Minimum gap between proctoring violation events to avoid flooding (ms)
const PROCTOR_EVENT_COOLDOWN_MS = 1500;

export default function InterviewRoomPage() {
  const params = useParams();
  const router = useRouter();
  const sessionToken = params.token as string;
  const [loading, setLoading] = useState(true);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [showProctoringModal, setShowProctoringModal] = useState(true);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [terminated, setTerminated] = useState(false);
  const [terminationReason, setTerminationReason] = useState<string | null>(null);

  // Terminate callback ref — set by InterviewSession when it mounts
  const terminateInterviewRef = useRef<((reason: string) => void) | null>(null);
  const lastViolationTimeRef = useRef<number>(0);

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

  // Terminate the interview with a recorded reason
  const handleViolation = useCallback((reason: string, displayMessage: string) => {
    const now = Date.now();
    if (now - lastViolationTimeRef.current < PROCTOR_EVENT_COOLDOWN_MS) return;
    lastViolationTimeRef.current = now;

    if (terminated) return;

    console.warn('Proctoring violation:', reason);
    setTerminated(true);
    setTerminationReason(displayMessage);

    // Notify the InterviewSession component to end the interview
    if (terminateInterviewRef.current) {
      terminateInterviewRef.current(reason);
    }
  }, [terminated]);

  // Proctoring: Terminate on tab switch or window blur
  useEffect(() => {
    if (!interviewStarted || terminated) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleViolation('tab_switch', 'Interview ended: tab switching is not allowed during a proctored interview.');
      }
    };

    const handleWindowBlur = () => {
      handleViolation('window_blur', 'Interview ended: switching windows is not allowed during a proctored interview.');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [interviewStarted, terminated, handleViolation]);

  const handleAcceptProctoring = useCallback(() => {
    setShowProctoringModal(false);
    setInterviewStarted(true);
  }, []);

  const handleDeclineProctoring = useCallback(() => {
    router.push('/candidate-portal');
  }, [router]);

  // Called by InterviewSession to register its termination handler
  const registerTerminateHandler = useCallback((fn: (reason: string) => void) => {
    terminateInterviewRef.current = fn;
  }, []);

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

      {/* Termination Banner */}
      {terminated && terminationReason && (
        <div className="fixed top-0 left-0 right-0 bg-red-700 text-white py-3 px-4 text-center text-sm font-semibold z-50 shadow-lg">
          🚫 {terminationReason}
        </div>
      )}

      <div className={`bg-white shadow-sm p-4 flex justify-between items-center z-10 border-b ${terminated ? 'mt-12' : ''}`}>
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
            onRegisterTerminate={registerTerminateHandler}
            onViolation={handleViolation}
          />
        )}
      </div>
    </div>
  );
}
