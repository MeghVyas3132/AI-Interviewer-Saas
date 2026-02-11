'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Message {
  role: 'ai' | 'user';
  content: string;
  timestamp: Date;
}

interface InterviewSession {
  id: number;
  candidate_name: string;
  position: string;
  company_name: string;
  questions_generated: string[];
  duration_minutes: number;
}

// AI feedback responses after each answer
const AI_FEEDBACK_RESPONSES = [
  "Thank you for that answer. Let's continue.",
  "Great response. Moving on to the next question.",
  "I appreciate your detailed answer. Next question.",
  "Well explained. Let's proceed.",
  "Good answer. Here's the next question.",
  "Thank you for sharing that. Let's move forward.",
  "Noted. Moving to the next question.",
  "Interesting perspective. Next question coming up.",
];

export default function InterviewRoomPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Interview state
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [interviewEnded, setInterviewEnded] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [hasTranscriptContent, setHasTranscriptContent] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Pause detection state
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [savedTranscript, setSavedTranscript] = useState('');
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSpeechTimeRef = useRef<number>(Date.now());

  // Save status
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [saveError, setSaveError] = useState('');

  // Media device state
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'checking'>('checking');

  // Media refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);

  // Refs to hold current values for stable callbacks
  const sessionRef = useRef<InterviewSession | null>(null);
  const elapsedTimeRef = useRef(0);

  // Resume from localStorage
  const [resumeText, setResumeText] = useState('');
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

  // Load session and resume
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/interviews/by-token/${token}`);
        if (!response.ok) {
          setError('Interview session not found.');
          return;
        }
        const data = await response.json();
        setSession(data);
        sessionRef.current = data;
        
        // Get resume from localStorage
        const savedResume = localStorage.getItem(`resume_${token}`);
        if (savedResume) {
          setResumeText(savedResume);
        }
      } catch {
        setError('Failed to load interview session.');
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [token]);

  // Timer
  useEffect(() => {
    if (!interviewStarted || interviewEnded) return;
    const interval = setInterval(() => {
      setElapsedTime(prev => {
        elapsedTimeRef.current = prev + 1;
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [interviewStarted, interviewEnded]);

  // Request media permissions and start camera/mic
  const requestMediaAccess = useCallback(async () => {
    setMediaError(null);
    setPermissionState('checking');
    console.log('[Media] Requesting getUserMedia({ video: true, audio: true })');

    // 1. Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = 'Your browser does not support camera/microphone access. Please use a modern browser on HTTPS or localhost.';
      console.error('[Media]', msg);
      setMediaError(msg);
      setPermissionState('denied');
      return;
    }

    // 2. Check available devices first
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasCamera = devices.some(d => d.kind === 'videoinput');
      const hasMic = devices.some(d => d.kind === 'audioinput');
      console.log('[Media] Devices found — camera:', hasCamera, 'mic:', hasMic, 'all:', devices.map(d => `${d.kind}: ${d.label || '(unlabeled)'}`));

      if (!hasCamera && !hasMic) {
        setMediaError('No camera or microphone detected. Please connect a device and try again.');
        setPermissionState('denied');
        return;
      }
    } catch (enumErr) {
      console.warn('[Media] enumerateDevices failed, proceeding anyway:', enumErr);
    }

    // 3. Request permissions via getUserMedia
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      console.log('[Media] getUserMedia success — tracks:', stream.getTracks().map(t => `${t.kind}:${t.label}`));

      // Stop any previous stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setIsCameraOn(true);
      setIsMicOn(true);
      setPermissionState('granted');
      setMediaError(null);
    } catch (err: any) {
      console.error('[Media] getUserMedia failed:', err.name, err.message);
      let msg = 'Could not access camera/microphone.';

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera/microphone permission was denied. Please allow access in your browser settings and click "Retry".';
        setPermissionState('denied');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No camera or microphone found. Please connect a device and click "Retry".';
        setPermissionState('denied');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Camera or microphone is already in use by another application. Close other apps and click "Retry".';
        setPermissionState('denied');
      } else if (err.name === 'OverconstrainedError') {
        msg = 'Camera does not meet requirements. Trying with lower settings...';
        // Fallback: try with relaxed constraints
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
          streamRef.current = fallbackStream;
          if (videoRef.current) videoRef.current.srcObject = fallbackStream;
          setIsCameraOn(true);
          setIsMicOn(true);
          setPermissionState('granted');
          setMediaError(null);
          return;
        } catch {
          msg = 'Could not start camera even with fallback settings.';
          setPermissionState('denied');
        }
      } else {
        setPermissionState('denied');
      }

      setMediaError(msg);
    }
  }, []);

  // Toggle camera on/off
  const toggleCamera = useCallback(() => {
    if (!streamRef.current) {
      // No stream yet — request permission
      requestMediaAccess();
      return;
    }
    const videoTracks = streamRef.current.getVideoTracks();
    if (videoTracks.length === 0) return;

    const newState = !isCameraOn;
    videoTracks.forEach(track => { track.enabled = newState; });
    setIsCameraOn(newState);
    console.log('[Media] Camera toggled:', newState ? 'ON' : 'OFF');
  }, [isCameraOn, requestMediaAccess]);

  // Toggle mic on/off
  const toggleMic = useCallback(() => {
    if (!streamRef.current) {
      requestMediaAccess();
      return;
    }
    const audioTracks = streamRef.current.getAudioTracks();
    if (audioTracks.length === 0) return;

    const newState = !isMicOn;
    audioTracks.forEach(track => { track.enabled = newState; });
    setIsMicOn(newState);
    console.log('[Media] Mic toggled:', newState ? 'ON' : 'OFF');
  }, [isMicOn, requestMediaAccess]);

  // Setup camera on mount
  useEffect(() => {
    requestMediaAccess();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [requestMediaAccess]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Select female voice
  const getFemaleVoice = useCallback(() => {
    const voices = speechSynthesis.getVoices();
    // Prefer female voices
    const femaleVoice = voices.find(v => 
      v.name.toLowerCase().includes('female') ||
      v.name.toLowerCase().includes('samantha') ||
      v.name.toLowerCase().includes('victoria') ||
      v.name.toLowerCase().includes('karen') ||
      v.name.toLowerCase().includes('moira') ||
      v.name.toLowerCase().includes('tessa') ||
      v.name.toLowerCase().includes('fiona') ||
      v.name.includes('Google UK English Female') ||
      v.name.includes('Microsoft Zira')
    );
    return femaleVoice || voices[0];
  }, []);

  // Speak text
  const speakText = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      setIsAISpeaking(true);
      const utterance = new SpeechSynthesisUtterance(text);
      synthRef.current = utterance;
      
      // Get female voice
      const voice = getFemaleVoice();
      if (voice) {
        utterance.voice = voice;
      }
      
      utterance.rate = 0.9;
      utterance.pitch = 1.1;
      
      utterance.onend = () => {
        setIsAISpeaking(false);
        resolve();
      };
      
      utterance.onerror = () => {
        setIsAISpeaking(false);
        resolve();
      };
      
      speechSynthesis.speak(utterance);
    });
  }, [getFemaleVoice]);

  // Add message
  const addMessage = useCallback((role: 'ai' | 'user', content: string) => {
    const msg = { role, content, timestamp: new Date() };
    setMessages(prev => {
      const updated = [...prev, msg];
      messagesRef.current = updated;
      return updated;
    });
  }, []);

  // Ref to track finalized transcript (separate from display)
  const finalizedTranscriptRef = useRef<string>('');

  // Setup speech recognition
  const setupRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('Speech recognition not supported');
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let currentInterim = '';

      // Process all results from the beginning to build accurate transcript
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const transcriptText = result[0].transcript;
        
        if (result.isFinal) {
          // Only add to finalized if this is a new final result
          if (i >= event.resultIndex) {
            finalizedTranscriptRef.current += transcriptText + ' ';
          }
        } else {
          // Interim result - just show it, don't accumulate
          currentInterim = transcriptText;
        }
      }

      // Update last speech time
      lastSpeechTimeRef.current = Date.now();
      
      // Clear any existing silence timeout
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }

      // Display: finalized text + current interim (not accumulated interim)
      const displayText = finalizedTranscriptRef.current + currentInterim;
      setTranscript(displayText);
      
      // Track if we have any content to submit
      setHasTranscriptContent(displayText.trim().length > 0);

      // Set silence timeout - if no speech for 5 seconds and we have content, show pause modal
      silenceTimeoutRef.current = setTimeout(() => {
        const timeSinceLastSpeech = Date.now() - lastSpeechTimeRef.current;
        if (timeSinceLastSpeech >= 5000 && finalizedTranscriptRef.current.trim().length > 0) {
          setSavedTranscript(finalizedTranscriptRef.current);
          setShowPauseModal(true);
        }
      }, 5000);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      
      // Handle specific errors
      if (event.error === 'no-speech') {
        // Don't reset transcript, just restart recognition silently
        console.log('No speech detected, continuing to listen...');
        // Restart recognition after a brief delay
        setTimeout(() => {
          if (isListening && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {
              // Already started, ignore
            }
          }
        }, 100);
      } else if (event.error === 'aborted') {
        // User or system aborted, don't restart
        console.log('Speech recognition aborted');
      } else if (event.error === 'network') {
        console.log('Network error in speech recognition');
      }
    };

    recognition.onend = () => {
      // Auto-restart if we're still supposed to be listening
      if (isListening && !showPauseModal && !interviewEnded) {
        try {
          recognition.start();
        } catch (e) {
          // Already started, ignore
        }
      }
    };

    return recognition;
  }, [isListening, showPauseModal, interviewEnded, transcript]);

  // Start listening
  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      recognitionRef.current = setupRecognition();
    }
    if (recognitionRef.current) {
      setTranscript('');
      setSavedTranscript('');
      setHasTranscriptContent(false);
      finalizedTranscriptRef.current = ''; // Reset finalized transcript
      lastSpeechTimeRef.current = Date.now();
      try {
        recognitionRef.current.start();
      } catch (e) {
        // Already started
      }
      setIsListening(true);
    }
  }, [setupRecognition]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  // Handle pause modal - continue with current transcript
  const handleContinueAnswer = useCallback(() => {
    setShowPauseModal(false);
    lastSpeechTimeRef.current = Date.now();
    // Recognition should auto-restart
  }, []);

  // Handle pause modal - reset and start over
  const handleResetAnswer = useCallback(() => {
    setShowPauseModal(false);
    setTranscript('');
    setSavedTranscript('');
    setHasTranscriptContent(false);
    finalizedTranscriptRef.current = ''; // Reset finalized transcript
    lastSpeechTimeRef.current = Date.now();
    // Recognition should auto-restart
  }, []);

  // Complete interview and save results to backend (robust with retry)
  // MUST be defined BEFORE askQuestion so the useCallback closure captures it
  const completeAndSave = useCallback(async (retryCount = 0): Promise<boolean> => {
    const MAX_RETRIES = 3;
    setSaveStatus('saving');
    setSaveError('');
    
    // Use refs for latest values (avoids stale closure)
    const currentToken = token;
    const currentSession = sessionRef.current;
    const currentElapsed = elapsedTimeRef.current;
    
    try {
      const allMessages = messagesRef.current;
      const transcriptData = allMessages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString()
      }));
      
      const savedResume = localStorage.getItem(`resume_${currentToken}`) || '';
      const resumeFilename = localStorage.getItem(`resume_filename_${currentToken}`) || '';
      
      console.log(`[Interview Complete] Saving results for token: ${currentToken}, messages: ${allMessages.length}, elapsed: ${currentElapsed}s, attempt: ${retryCount + 1}`);
      
      const response = await fetch(`${API_BASE_URL}/hr/interviews/ai-complete/${currentToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          transcript: transcriptData,
          duration_seconds: currentElapsed,
          resume_text: savedResume,
          resume_filename: resumeFilename,
          pre_calculated_scores: null
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server returned ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      console.log('[Interview Complete] Backend response:', result);
      setSaveStatus('saved');
      return true;
    } catch (err) {
      console.error(`[Interview Complete] Save failed (attempt ${retryCount + 1}):`, err);
      
      if (retryCount < MAX_RETRIES - 1) {
        const delay = 1000 * Math.pow(2, retryCount);
        console.log(`[Interview Complete] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return completeAndSave(retryCount + 1);
      }
      
      // All retries failed - try the transcript endpoint as fallback
      console.log('[Interview Complete] Trying transcript endpoint as fallback...');
      try {
        const allMessages = messagesRef.current;
        const transcriptData = allMessages.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString()
        }));
        const savedResume = localStorage.getItem(`resume_${currentToken}`) || '';
        
        const fallbackResp = await fetch(`${API_BASE_URL}/hr/interviews/${currentSession?.id}/transcript`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            transcript: transcriptData,
            duration_seconds: currentElapsed,
            resume_text: savedResume
          })
        });
        
        if (fallbackResp.ok) {
          console.log('[Interview Complete] Fallback transcript save succeeded');
          setSaveStatus('saved');
          return true;
        }
      } catch (fallbackErr) {
        console.error('[Interview Complete] Fallback also failed:', fallbackErr);
      }
      
      setSaveStatus('failed');
      setSaveError(err instanceof Error ? err.message : 'Failed to save interview results');
      return false;
    }
  }, [token, API_BASE_URL]);

  // Legacy wrapper for backward compatibility
  const saveTranscript = completeAndSave;

  // Ask question
  const askQuestion = useCallback(async (questionIndex: number) => {
    if (!session?.questions_generated || questionIndex >= session.questions_generated.length) {
      // End interview
      const closingMessage = "Thank you for completing the interview. We appreciate your time and will be in touch soon with the results. Have a great day!";
      addMessage('ai', closingMessage);
      await speakText(closingMessage);
      setInterviewEnded(true);
      
      // Save interview results to backend (awaited for reliability)
      await completeAndSave();
      return;
    }

    const question = session.questions_generated[questionIndex];
    addMessage('ai', question);
    await speakText(question);
    
    // Start listening for answer
    startListening();
  }, [session, addMessage, speakText, startListening, completeAndSave]);

  // Submit answer
  const submitAnswer = useCallback(async () => {
    // Use finalizedTranscriptRef as the source of truth, fall back to transcript state
    const answerText = finalizedTranscriptRef.current.trim() || transcript.trim();
    if (!answerText) {
      console.log('No answer to submit');
      return;
    }
    
    stopListening();
    
    // Clear silence timeout
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
    }
    
    addMessage('user', answerText);
    setTranscript('');
    setSavedTranscript('');
    setHasTranscriptContent(false);
    finalizedTranscriptRef.current = ''; // Reset finalized transcript
    
    // Move to next question
    const nextIndex = currentQuestionIndex + 1;
    setCurrentQuestionIndex(nextIndex);
    
    // Check if there are more questions
    if (session?.questions_generated && nextIndex < session.questions_generated.length) {
      // Give AI feedback before next question
      const feedback = AI_FEEDBACK_RESPONSES[Math.floor(Math.random() * AI_FEEDBACK_RESPONSES.length)];
      addMessage('ai', feedback);
      await speakText(feedback);
      
      // Small delay before next question
      setTimeout(() => {
        askQuestion(nextIndex);
      }, 500);
    } else {
      // Last question answered, end interview
      askQuestion(nextIndex);
    }
  }, [transcript, stopListening, addMessage, currentQuestionIndex, askQuestion, session, speakText]);

  // Start interview
  const startInterview = async () => {
    setInterviewStarted(true);
    
    // Welcome message
    const welcomeMessage = `Hello ${session?.candidate_name}! Welcome to your interview for the ${session?.position} position at ${session?.company_name}. I'll be asking you a series of questions. Please take your time to answer each one thoroughly. Let's begin with the first question.`;
    
    addMessage('ai', welcomeMessage);
    await speakText(welcomeMessage);
    
    // Ask first question
    await askQuestion(0);
  };

  // End interview early
  const endInterview = async () => {
    stopListening();
    speechSynthesis.cancel();
    
    const endMessage = "The interview has been ended. Thank you for your time.";
    addMessage('ai', endMessage);
    setInterviewEnded(true);
    
    await completeAndSave();
  };

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <h2 className="text-2xl font-bold mb-4">Error</h2>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{session?.company_name} - {session?.position}</h1>
            <p className="text-sm text-gray-400">{session?.candidate_name}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-xs text-gray-400">Duration</p>
              <p className="text-lg font-mono">{formatTime(elapsedTime)}</p>
            </div>
            {session?.questions_generated && (
              <div className="text-center">
                <p className="text-xs text-gray-400">Question</p>
                <p className="text-lg">{Math.min(currentQuestionIndex + 1, session.questions_generated.length)}/{session.questions_generated.length}</p>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Save Status Banner */}
      {interviewEnded && saveStatus !== 'idle' && (
        <div className={`px-6 py-3 text-center text-sm font-medium ${
          saveStatus === 'saving' ? 'bg-yellow-600' :
          saveStatus === 'saved' ? 'bg-green-600' :
          saveStatus === 'failed' ? 'bg-red-600' : ''
        }`}>
          {saveStatus === 'saving' && (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Saving interview results...
            </span>
          )}
          {saveStatus === 'saved' && 'Interview results saved successfully! You may close this page.'}
          {saveStatus === 'failed' && (
            <span className="flex items-center justify-center gap-3">
              Failed to save results: {saveError}
              <button
                onClick={() => completeAndSave()}
                className="px-3 py-1 bg-white text-red-600 rounded font-semibold hover:bg-gray-100 transition"
              >
                Retry Save
              </button>
            </span>
          )}
        </div>
      )}

      <div className="flex h-[calc(100vh-64px)]">
        {/* Video Section */}
        <div className="flex-1 p-4">
          <div className="relative h-full rounded-xl overflow-hidden bg-gray-800 flex flex-col">
            {/* Video area */}
            <div className="relative flex-1 min-h-0">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover ${!isCameraOn ? 'hidden' : ''}`}
              />
              
              {/* Camera off placeholder */}
              {!isCameraOn && (
                <div className="w-full h-full flex items-center justify-center bg-gray-900">
                  <div className="text-center">
                    <svg className="w-20 h-20 mx-auto text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                    <p className="text-gray-500 text-sm">Camera is off</p>
                  </div>
                </div>
              )}
              
              {/* Media permission error banner */}
              {mediaError && (
                <div className="absolute top-4 left-4 right-4 bg-red-600/90 backdrop-blur-sm px-4 py-3 rounded-xl text-sm">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      <p>{mediaError}</p>
                      <button
                        onClick={requestMediaAccess}
                        className="mt-2 px-4 py-1.5 bg-white text-red-700 rounded-lg text-xs font-semibold hover:bg-red-50 transition"
                      >
                        Retry Permissions
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Speaking Indicator */}
              {isAISpeaking && (
                <div className="absolute top-4 left-4 bg-blue-600 px-4 py-2 rounded-full flex items-center gap-2">
                  <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                  <span className="text-sm">AI Speaking...</span>
                </div>
              )}
              
              {/* Recording Indicator */}
              {isListening && (
                <div className="absolute top-4 right-4 bg-red-600 px-4 py-2 rounded-full flex items-center gap-2">
                  <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                  <span className="text-sm">Recording...</span>
                </div>
              )}
              
              {/* Not Started Overlay */}
              {!interviewStarted && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                  <div className="text-center">
                    <h2 className="text-3xl font-bold mb-4">Ready to Begin?</h2>
                    <p className="text-gray-300 mb-6 max-w-md">
                      Make sure your camera and microphone are working, then click Start.
                    </p>
                    {/* Permission status indicator */}
                    <div className="flex items-center justify-center gap-4 mb-6">
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${permissionState === 'granted' ? 'bg-green-600/30 text-green-300' : permissionState === 'denied' ? 'bg-red-600/30 text-red-300' : 'bg-yellow-600/30 text-yellow-300'}`}>
                        <div className={`w-2 h-2 rounded-full ${permissionState === 'granted' ? 'bg-green-400' : permissionState === 'denied' ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'}`}></div>
                        {permissionState === 'granted' ? 'Camera & Mic Ready' : permissionState === 'denied' ? 'Permission Needed' : 'Checking...'}
                      </div>
                    </div>
                    {permissionState === 'denied' && (
                      <button
                        onClick={requestMediaAccess}
                        className="mb-4 px-6 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-xl font-medium transition text-sm"
                      >
                        Allow Camera & Microphone
                      </button>
                    )}
                    <div>
                      <button
                        onClick={startInterview}
                        className="px-8 py-4 bg-green-600 hover:bg-green-700 rounded-xl font-semibold text-lg transition"
                      >
                        Start Interview
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Media Controls Bar */}
            <div className="flex items-center justify-center gap-4 px-4 py-3 bg-gray-900/80 border-t border-gray-700">
              {/* Mic Toggle */}
              <button
                onClick={toggleMic}
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition ${
                  isMicOn
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
                title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
              >
                {isMicOn ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                  </svg>
                )}
                {isMicOn ? 'Mic On' : 'Mic Off'}
              </button>

              {/* Camera Toggle */}
              <button
                onClick={toggleCamera}
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition ${
                  isCameraOn
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
                title={isCameraOn ? 'Stop Camera' : 'Start Camera'}
              >
                {isCameraOn ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                  </svg>
                )}
                {isCameraOn ? 'Camera On' : 'Camera Off'}
              </button>
            </div>
            
              {/* Interview Ended Overlay */}
              {interviewEnded && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h2 className="text-3xl font-bold mb-4">Interview Complete</h2>
                    <p className="text-gray-300 mb-8">
                      Thank you for completing the interview. Results will be sent to you soon.
                    </p>
                    <button
                      onClick={() => router.push('/')}
                      className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-xl font-semibold transition"
                    >
                      Return Home
                    </button>
                  </div>
                </div>
              )}
            </div>
        </div>

        {/* Chat Section */}
        <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-700">
            <h2 className="font-semibold">Interview Transcript</h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-xl ${
                  msg.role === 'ai' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-600 text-white'
                }`}>
                  <p className="text-sm">{msg.content}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Input Area */}
          {interviewStarted && !interviewEnded && (
            <div className="p-4 border-t border-gray-700">
              {isListening && transcript && (
                <div className="mb-3 p-3 bg-gray-700 rounded-lg text-sm">
                  <p className="text-gray-300 italic">{transcript}</p>
                </div>
              )}
              
              <div className="flex gap-2">
                <button
                  onClick={submitAnswer}
                  disabled={!hasTranscriptContent || isAISpeaking}
                  className={`flex-1 py-3 rounded-xl font-semibold transition ${
                    hasTranscriptContent && !isAISpeaking
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-gray-600 cursor-not-allowed'
                  }`}
                >
                  Submit Answer
                </button>
                <button
                  onClick={endInterview}
                  className="px-4 py-3 bg-red-600 hover:bg-red-700 rounded-xl transition"
                  title="End Interview"
                >
                  End
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pause Detection Modal */}
      {showPauseModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 text-center">
            <div className="w-16 h-16 mx-auto mb-6 bg-yellow-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Pause Detected</h3>
            <p className="text-gray-400 mb-6">
              It looks like you've paused. Would you like to continue with your current answer or start over?
            </p>
            {savedTranscript && (
              <div className="bg-gray-700 rounded-lg p-3 mb-6 text-left">
                <p className="text-xs text-gray-400 mb-1">Your answer so far:</p>
                <p className="text-sm text-gray-200 line-clamp-3">{savedTranscript}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleResetAnswer}
                className="flex-1 px-4 py-3 bg-gray-600 hover:bg-gray-500 rounded-xl font-medium transition"
              >
                Start Over
              </button>
              <button
                onClick={handleContinueAnswer}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 rounded-xl font-medium transition"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Type declarations for speech recognition
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}
