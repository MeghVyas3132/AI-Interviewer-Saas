'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { aiServiceClient } from '@/services/ai-service-client';
import type { AIInterviewSession } from '@/types/ai';

// ─── Profanity list ───────────────────────────────────────────────────────────
const PROFANITY_TERMS = [
  'fuck', 'shit', 'bitch', 'asshole', 'dick', 'cunt', 'motherfucker',
  'bastard', 'slut', 'whore', 'fucker', 'fucking', 'bullshit',
];
const PROFANITY_REGEX = new RegExp(`\\b(${PROFANITY_TERMS.join('|')})\\b`, 'i');

const containsProfanity = (text: string): boolean => PROFANITY_REGEX.test(text || '');

// ─── Types ────────────────────────────────────────────────────────────────────
interface InterviewSessionProps {
  sessionId: string;
  candidateId: string;
  mode?: 'voice' | 'text';
  proctoringMode?: 'proctored' | 'unproctored';
  /** Parent registers a callback so it can imperatively terminate the session */
  onRegisterTerminate?: (fn: (reason: string) => void) => void;
  /** Called when a violation is detected inside the component (profanity, multiple faces) */
  onViolation?: (reason: string, displayMessage: string) => void;
}

interface Question {
  id: string;
  text: string;
  answered?: boolean;
}

interface Answer {
  questionId: string;
  text: string;
  timestamp: string;
}

interface Toast {
  id: number;
  message: string;
  type: 'warning' | 'error' | 'info';
}

// ─── Simple toast hook ────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, type: Toast['type'] = 'warning') => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  return { toasts, showToast };
}

/**
 * Enhanced AI Interview Session Component with TTS/STT,
 * profanity detection, and face detection.
 */
export function InterviewSession({
  sessionId,
  candidateId,
  mode = 'voice',
  proctoringMode,
  onRegisterTerminate,
  onViolation,
}: InterviewSessionProps) {
  const router = useRouter();
  const { toasts, showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<AIInterviewSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [terminatedReason, setTerminatedReason] = useState<string | null>(null);

  // Proctoring notes logged into the transcript
  const proctoringNotesRef = useRef<string[]>([]);

  // Camera / face detection
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const lastFaceAlertRef = useRef<number>(0);
  const [cameraEnabled, setCameraEnabled] = useState(false);

  // Speech recognition
  const recognitionRef = useRef<any>(null);

  // ── Register terminate handler with parent ──────────────────────────────────
  useEffect(() => {
    if (!onRegisterTerminate) return;
    onRegisterTerminate((reason: string) => {
      terminateInterview(reason);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRegisterTerminate]);

  // ── Internal terminate ─────────────────────────────────────────────────────
  const terminateInterview = useCallback((reason: string) => {
    setTerminatedReason(reason);
    proctoringNotesRef.current.push(`[TERMINATED] ${reason} at ${new Date().toISOString()}`);
    // Stop camera / mic
    cameraStreamRef.current?.getTracks().forEach(t => t.stop());
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    // Auto-redirect after delay
    setTimeout(() => router.push('/candidate-portal'), 4000);
  }, [router]);

  // ── Fetch session ──────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const data = await aiServiceClient.getInterviewSession(sessionId);
        setSession(data);

        if (data?.questions && data.questions.length > 0) {
          setQuestions(data.questions.map((q: any, idx: number) => ({
            id: q.id || `q-${idx}`,
            text: q.text || q,
            answered: false,
          })));
        } else {
          setQuestions([
            { id: 'q-1', text: 'Tell me about yourself and your background.', answered: false },
            { id: 'q-2', text: 'What interests you about this position?', answered: false },
            { id: 'q-3', text: 'Describe a challenging project you worked on.', answered: false },
            { id: 'q-4', text: 'How do you handle tight deadlines and pressure?', answered: false },
            { id: 'q-5', text: 'Why do you feel you are the right fit for this role?', answered: false },
          ]);
        }

        setLoading(false);
      } catch (err) {
        setError('Failed to load interview session');
        setLoading(false);
      }
    };
    fetchSession();

    return () => {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
      cameraStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [sessionId]);

  // ── Tab/Window switching detection (proctored interviews) ─────────────────
  useEffect(() => {
    // Only enforce for proctored interviews
    if (proctoringMode !== 'proctored' || interviewComplete || terminatedReason) return;

    let violationFired = false;

    const handleVisibilityChange = () => {
      if (violationFired) return;
      if (document.visibilityState === 'hidden') {
        violationFired = true;
        const msg = 'Interview ended: tab switching is not allowed during a proctored interview.';
        proctoringNotesRef.current.push(`[TAB_SWITCH] ${new Date().toISOString()}`);
        onViolation?.('tab_switch', msg);
        terminateInterview('tab_switch');
      }
    };

    const handleWindowBlur = () => {
      if (violationFired) return;
      violationFired = true;
      const msg = 'Interview ended: switching windows is not allowed during a proctored interview.';
      proctoringNotesRef.current.push(`[WINDOW_SWITCH] ${new Date().toISOString()}`);
      onViolation?.('window_switch', msg);
      terminateInterview('window_switch');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [proctoringMode, interviewComplete, terminatedReason, terminateInterview, onViolation]);

  // ── Start camera + face detection ──────────────────────────────────────────
  useEffect(() => {
    if (interviewComplete || terminatedReason) return;

    let cancelled = false;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        cameraStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraEnabled(true);
      } catch {
        console.warn('Camera not available for face detection');
      }
    };

    startCamera();

    return () => {
      cancelled = true;
    };
  }, [interviewComplete, terminatedReason]);

  // ── Face detection loop (Chromium FaceDetector API) ───────────────────────
  useEffect(() => {
    if (!cameraEnabled || interviewComplete || terminatedReason) return;
    if (typeof window === 'undefined' || !(window as any).FaceDetector) return;

    const detector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
    let cancelled = false;

    const detect = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        if (!cancelled) setTimeout(detect, 2500);
        return;
      }
      try {
        const w = Math.max(160, Math.floor(video.videoWidth * 0.4));
        const h = Math.max(120, Math.floor(video.videoHeight * (w / video.videoWidth)));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const faces = await detector.detect(canvas);
          if (faces.length > 1) {
            const now = Date.now();
            if (now - lastFaceAlertRef.current > 15000) {
              lastFaceAlertRef.current = now;
              const msg = `Multiple faces detected (${faces.length}). This will be noted in your evaluation.`;
              showToast(msg, 'warning');
              proctoringNotesRef.current.push(`[FACE_DETECTION] ${msg} at ${new Date().toISOString()}`);
              onViolation?.('multiple_faces', msg);
            }
          }
        }
      } catch {
        // Face detection should never crash the interview
      }
      if (!cancelled) setTimeout(detect, 2500);
    };

    const timerId = setTimeout(detect, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [cameraEnabled, interviewComplete, terminatedReason, showToast, onViolation]);

  // ── TTS ────────────────────────────────────────────────────────────────────
  const speakQuestion = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v =>
      v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Google'))
    ) || voices.find(v => v.lang.startsWith('en'));
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, []);

  // ── STT ────────────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Speech recognition is not supported. Please use Chrome or Edge.');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        }
      }
      if (finalTranscript) {
        setCurrentAnswer(prev => prev + finalTranscript);
      }
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // ── Submit transcript ──────────────────────────────────────────────────────
  const submitTranscript = useCallback(async (allAnswers: Answer[], notes: string[]) => {
    try {
      const noteSuffix = notes.length > 0
        ? `\n\n--- PROCTORING NOTES ---\n${notes.join('\n')}`
        : '';

      const transcriptText =
        questions.map((q, idx) => {
          const answer = allAnswers.find(a => a.questionId === q.id);
          return `Q${idx + 1}: ${q.text}\nA: ${answer?.text || '[No answer provided]'}`;
        }).join('\n\n') + noteSuffix;

      await aiServiceClient.submitTranscript(sessionId, {
        candidate_id: candidateId,
        transcript_text: transcriptText,
        answers: allAnswers.map(a => ({
          question_id: a.questionId,
          answer_text: a.text,
          timestamp: a.timestamp,
        })),
      });
    } catch (err) {
      console.error('Failed to submit transcript:', err);
    }
  }, [sessionId, candidateId, questions]);

  // ── Submit answer (with profanity check) ──────────────────────────────────
  const submitAnswer = useCallback(() => {
    const trimmed = currentAnswer.trim();
    if (!trimmed) return;

    // Profanity check — terminate interview immediately
    if (containsProfanity(trimmed)) {
      const msg = 'Your interview has been ended due to use of inappropriate language.';
      proctoringNotesRef.current.push(`[PROFANITY] Detected in answer at ${new Date().toISOString()}`);
      onViolation?.('profanity_detected', msg);
      terminateInterview('profanity_detected');
      return;
    }

    const newAnswer: Answer = {
      questionId: questions[currentQuestionIndex].id,
      text: trimmed,
      timestamp: new Date().toISOString(),
    };

    const updatedAnswers = [...answers, newAnswer];
    setAnswers(updatedAnswers);
    setQuestions(prev => prev.map((q, idx) =>
      idx === currentQuestionIndex ? { ...q, answered: true } : q
    ));
    setCurrentAnswer('');

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      setInterviewComplete(true);
      submitTranscript(updatedAnswers, proctoringNotesRef.current);
    }
  }, [currentAnswer, currentQuestionIndex, questions, answers, submitTranscript, terminateInterview, onViolation]);

  const currentQuestion = questions[currentQuestionIndex];

  // ── Renders ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <Card className="p-8 text-center max-w-lg mx-auto mt-12">
        <div className="text-red-600 mb-4">{error || 'Session not found'}</div>
        <Button onClick={() => router.back()}>Go Back</Button>
      </Card>
    );
  }

  if (terminatedReason) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8">
        <Card className="p-8 w-full max-w-2xl text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Interview Ended</h2>
          <p className="text-gray-500 mb-6">
            Your interview was ended due to a proctoring violation. You will be redirected shortly.
          </p>
          <Button onClick={() => router.push('/candidate-portal')}>
            Return to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  if (interviewComplete) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8">
        <Card className="p-8 w-full max-w-2xl text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Interview Complete!</h2>
          <p className="text-gray-500 mb-6">
            Thank you for completing the interview. Your responses have been recorded.
          </p>
          <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
            <h3 className="font-medium text-gray-900 mb-2">Summary:</h3>
            <p className="text-sm text-gray-600">
              • Questions answered: {answers.length} / {questions.length}<br />
              • Time completed: {new Date().toLocaleString()}
            </p>
          </div>
          <Button onClick={() => router.push('/candidate-portal')}>
            Return to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col p-6">
      {/* Hidden camera / canvas for face detection */}
      <video ref={videoRef} autoPlay muted playsInline className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium max-w-sm pointer-events-auto transition-all ${
              t.type === 'error' ? 'bg-red-600' : t.type === 'warning' ? 'bg-amber-500' : 'bg-blue-600'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="w-full max-w-4xl mx-auto mb-6">
        <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
          <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
          <span>{Math.round((currentQuestionIndex / questions.length) * 100)}% Complete</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-primary-600 h-2 rounded-full transition-all"
            style={{ width: `${(currentQuestionIndex / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question Card */}
      <Card className="w-full max-w-4xl mx-auto p-8 mb-6">
        <div className="flex items-start justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 flex-1 pr-4">
            {currentQuestion?.text}
          </h2>
          <button
            onClick={() => speakQuestion(currentQuestion?.text || '')}
            disabled={isSpeaking}
            className={`p-3 rounded-xl transition ${
              isSpeaking
                ? 'bg-primary-100 text-primary-600'
                : 'bg-gray-100 text-gray-600 hover:bg-primary-50 hover:text-primary-600'
            }`}
            title="Speak question"
          >
            <svg className={`w-6 h-6 ${isSpeaking ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          </button>
        </div>

        {/* Answer Input */}
        <div className="space-y-4">
          <div className="relative">
            <textarea
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              placeholder="Type your answer or click the microphone to speak..."
              className="w-full h-40 p-4 pr-16 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <button
              onClick={isListening ? stopListening : startListening}
              className={`absolute bottom-4 right-4 p-3 rounded-full transition ${
                isListening
                  ? 'bg-red-100 text-red-600 animate-pulse'
                  : 'bg-gray-100 text-gray-600 hover:bg-primary-50 hover:text-primary-600'
              }`}
              title={isListening ? 'Stop recording' : 'Start recording'}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
          </div>

          {isListening && (
            <div className="flex items-center gap-2 text-sm text-primary-600">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              Listening… Speak clearly into your microphone
            </div>
          )}

          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-400">{currentAnswer.length} characters</p>
            <div className="flex gap-3">
              {currentQuestionIndex > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                >
                  Previous
                </Button>
              )}
              <Button
                onClick={submitAnswer}
                disabled={!currentAnswer.trim()}
              >
                {currentQuestionIndex === questions.length - 1 ? 'Finish Interview' : 'Next Question'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Question navigation dots */}
      <div className="w-full max-w-4xl mx-auto">
        <div className="flex gap-2 flex-wrap justify-center">
          {questions.map((q, idx) => (
            <button
              key={q.id}
              onClick={() => setCurrentQuestionIndex(idx)}
              className={`w-10 h-10 rounded-lg font-medium transition ${
                idx === currentQuestionIndex
                  ? 'bg-primary-600 text-white'
                  : q.answered
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {idx + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
