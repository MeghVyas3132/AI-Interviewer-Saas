"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";

import { getQuestions, getResumeAnalysis, saveResumeAnalysis, saveInterviewSummary, getInterviewSummary, clearData, startInterviewSession, endInterviewSession, isInterviewActive, isSessionFromReload, markSessionAsStarted, type InterviewData, getVideoPreference, getInterviewMode, type InterviewMode, pauseInterview, resumeInterview, getInterviewPauseState, clearInterviewPauseState, type InterviewPauseState, type ConversationEntry, getExamConfig, setProctoringMode, getProctoringMode, clearProctoringMode, type ProctoringMode } from "@/lib/data-store";
import { interviewAgent, type InterviewAgentOutput } from "@/ai/flows/interview-agent";
import { generateIceBreakerQuestion } from "@/ai/flows/ice-breaker-generator";
import { useToast } from "@/hooks/use-toast";
import { useIdleDetection } from "@/hooks/use-idle-detection";
import { useAssemblyAIRealtime } from "@/hooks/use-assemblyai-realtime";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Loader, Mic, ArrowRight, Volume2, ThumbsUp, BarChart, Smile, Video, Sparkles, MicOff, PhoneOff, VolumeX, VideoOff, AlertCircle, Pause, Play } from "lucide-react";
import Link from "next/link";
import { Textarea } from "./ui/textarea";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { ScrollArea } from "./ui/scroll-area";
import { VoiceFeedback } from "./voice-feedback";
import ProctorExitConfirmModal from "./ProctorExitConfirmModal";
import { useProctorGuard } from "@/hooks/useProctorGuard";

// Debug flag for speech recognition logging
const DEBUG_SPEECH = process.env.NODE_ENV === 'development';

import type { Scoring } from '@/lib/data-store';
type Feedback = Omit<InterviewAgentOutput, 'nextQuestion' | 'isInterviewOver'> & { scoring: Scoring };
type ConversationState = 'loading' | 'speaking' | 'listening' | 'thinking' | 'finished' | 'idle' | 'paused';

const languageCodeMap: Record<string, string> = {
  "English": "en-US",
  "Hindi": "hi-IN",
};

const getLanguageCode = (languageName: string) => {
  return languageCodeMap[languageName] || "en-US";
}


// Helper function to get minimum questions based on exam type
const getMinQuestionsForExam = (jobRole: string, company?: string, subcategoryName?: string): number => {
  const role = jobRole.toLowerCase();
  // HR interviews require 10 questions (1 resume-based + 1 technical resume + 8 general HR)
  if (role === 'hr' || (role === 'interview' && (company?.toLowerCase() === 'hr' || subcategoryName?.toLowerCase() === 'hr'))) {
    return 10;
  }
  if (role.includes('neet')) return 8;
  if (role.includes('jee')) return 9;
  if (role.includes('cat') || role.includes('mba')) return 7;
  return 8; // Default for other exams
}

// TypeScript: Add types for SpeechRecognition and manual editing tracking for browser compatibility
declare global {
  interface Window {
    lastManualEdit?: number;
    currentAudioLevel?: number;
    audioContext?: AudioContext;
    audioMonitorInterval?: NodeJS.Timeout;
  }
}

interface InterviewSessionProps {
  proctoringMode?: "proctored" | "unproctored" | null;
  sessionToken?: string;
  sessionData?: any;
}

export function InterviewSession({ proctoringMode, sessionToken, sessionData }: InterviewSessionProps) {
  const [interviewMode, setInterviewMode] = useState<InterviewMode | null>(null);
  const [currentProctoringMode, setCurrentProctoringMode] = useState<ProctoringMode | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<string>("");
  const [transcript, setTranscript] = useState("");
  const [interviewData, setInterviewData] = useState<InterviewData[]>([]);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [hasActiveVideoStream, setHasActiveVideoStream] = useState(false);
  const [conversationState, setConversationState] = useState<ConversationState>('loading');
  const cameraPermissionGrantedTimeRef = useRef<number | null>(null);
  const [gracePeriodPassed, setGracePeriodPassed] = useState(false);
  
  const [conversationLog, setConversationLog] = useState<ConversationEntry[]>([]);
  const [time, setTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  
  // Enhanced guidance tracking
  const [currentQuestionAttempts, setCurrentQuestionAttempts] = useState(0);
  const [currentQuestionHints, setCurrentQuestionHints] = useState<string[]>([]);
  const [shouldRetryQuestion, setShouldRetryQuestion] = useState(false);
  
  // Current affairs tracking
  const [currentAffairsMetadata, setCurrentAffairsMetadata] = useState<{topic: string, category: string} | null>(null);
  
  // Minimum question requirements for each exam type
  const [minQuestionsRequired, setMinQuestionsRequired] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  
  // Exam configuration for question limit
  const [configuredQuestionLimit, setConfiguredQuestionLimit] = useState<number>(0); // 0 means no limit configured

  // Pause/Resume state
  const [isPaused, setIsPaused] = useState(false);
  const [pauseState, setPauseState] = useState<InterviewPauseState | null>(null);
  const [speechRecognitionIssue, setSpeechRecognitionIssue] = useState(false);

  const conversationStateRef = useRef(conversationState);
  
  const transcriptRef = useRef("");
  const interviewDataRef = useRef<InterviewData[]>([]);
  
  // Keep ref in sync with state
  useEffect(() => {
    interviewDataRef.current = interviewData;
  }, [interviewData]);
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Save proctoring mode when provided
  useEffect(() => {
    if (proctoringMode) {
      setProctoringMode(proctoringMode);
      setCurrentProctoringMode(proctoringMode);
    } else {
      // Load from localStorage if not provided
      const savedMode = getProctoringMode();
      setCurrentProctoringMode(savedMode);
    }
  }, [proctoringMode]);

  // Performance monitoring and cleanup
  const performanceRef = useRef({
    lastCleanup: Date.now(),
    timeoutCount: 0,
    intervalCount: 0
  });

  // Periodic cleanup to prevent memory leaks
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastCleanup = now - performanceRef.current.lastCleanup;
      
      // Force cleanup every 2 minutes to prevent accumulation
      if (timeSinceLastCleanup > 120000) { // 2 minutes
        console.log('Performing periodic cleanup to prevent memory leaks');
        performanceRef.current.lastCleanup = now;
        
        // Force garbage collection if available
        if (window.gc) {
          window.gc();
        }
        
        // Clear any lingering timeouts
        performanceRef.current.timeoutCount = 0;
        performanceRef.current.intervalCount = 0;
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(cleanupInterval);
  }, []);

  // Data for the AI agent
  const [language, setLanguage] = useState("en-US");
  const [languageName, setLanguageName] = useState("");
  const [jobRole, setJobRole] = useState("");
  const [company, setCompany] = useState("");
  const [college, setCollege] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [candidateName, setCandidateName] = useState("");
  
  // Voice feedback state
  const [volume, setVolume] = useState(0);
  const [isVoiceActive, setIsVoiceActive] = useState(false);

  // Voice warning state
  const [lastVoiceActivity, setLastVoiceActivity] = useState<number>(Date.now());
  const [hasShownWarning, setHasShownWarning] = useState(false);
  const [showVisualWarning, setShowVisualWarning] = useState(false);

  // Navigation warning state
  const [showNavigationWarning, setShowNavigationWarning] = useState(false);
  const [isNavigatingAway, setIsNavigatingAway] = useState(false);

  const router = useRouter();
  const { toast } = useToast();
  
  // Idle detection - end interview after 180 seconds of inactivity
  useIdleDetection({
    timeout: 180000, // 180 seconds in milliseconds
    onIdle: () => {
      console.log('User idle for 180 seconds, ending interview');
      endInterviewAndRedirectToEnded();
    },
    enabled: conversationState !== 'finished' && conversationState !== 'idle', // Only enable during active interview
  });
  
  // Determine if session is proctored
  // Priority: sessionData.isProctored > currentProctoringMode > proctoringMode
  const isProctored = 
    sessionData?.isProctored !== undefined 
      ? sessionData.isProctored 
      : currentProctoringMode === 'proctored' || proctoringMode === 'proctored';
  
  // Proctor guard - intercept Escape key, tab switches, and page close
  // Only active when isProctored is true
  const { isModalOpen, isBusy, closeModal, confirmEnd } = useProctorGuard({
    isProctored,
    token: sessionToken,
    onConfirmEnd: async () => {
      await endInterview();
    },
    anyKeyTriggersConfirmation: false, // Admin toggle - set to true if any key should trigger
    triggerKeys: ["Escape"],
    visibilityGraceSeconds: 8,
  });
  
  const lastTranscriptFromNative = useRef("");
  const lastTranscriptUpdate = useRef<number>(0); // Track when transcript was last updated
  const speechUpdateCount = useRef<number>(0); // Track number of speech recognition updates
  const manualEditCount = useRef<number>(0); // Track number of manual edits
  const lastSpeechUpdateTime = useRef<number>(0); // Track last time speech recognition updated transcript
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const {
    start: startAssemblyRealtime,
    stop: stopAssemblyRealtime,
    resetTranscripts: resetAssemblyTranscripts,
    status: assemblyStatus,
    error: assemblyError,
    partialTranscript: assemblyPartialTranscript,
    segments: assemblySegments,
  } = useAssemblyAIRealtime();

  const assemblyFinalTranscript = useMemo(
    () => assemblySegments.map(segment => segment.text).join(' ').trim(),
    [assemblySegments],
  );

  
  useEffect(() => {
    conversationStateRef.current = conversationState;
  }, [conversationState]);
  const lastResultIndex = useRef(0);
  const shouldBeListening = useRef(false); // Ref to manage intentional listening state
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null); // Ref to track current TTS audio
  const lastSpokenQuestion = useRef<string | null>(null); // Ref to track last spoken question
  const isTTSPlaying = useRef(false); // Ref to track if TTS is currently playing

  // Navigation warning handlers
  const handleStayInInterview = () => {
    setShowNavigationWarning(false);
    setIsNavigatingAway(false);
  };

  const handleLeaveInterview = () => {
    // Clean up resources before allowing navigation
    stopCamera();
    stopMicrophone();
    
    // End the interview session
    endInterviewSession();
    
    // Clear interview data to prevent restart
    clearData();
    
    // Clear pause state
    clearInterviewPauseState();
    
    // Clear proctoring mode so user can choose again
    clearProctoringMode();
    
    // Reset states
    setShowNavigationWarning(false);
    setIsNavigatingAway(false);
    
    // Navigate to prepare page instead of going back
    router.push('/prepare');
  };

  // Immediate termination helper used for policy violations (fullscreen/tab focus)
  const endInterviewAndRedirectToEnded = async () => {
    try {
      setConversationState('finished');
      stopCamera();
      stopMicrophone();
      endInterviewSession();
      clearInterviewPauseState();
      clearProctoringMode(); // Clear proctoring mode so user can choose again
      
      // For token-based sessions, save data and redirect to thank-you
      // Save even if interviewData is empty (to mark session as abandoned)
      if (sessionToken) {
        // Use ref to get the latest interviewData value (avoids closure issues)
        const latestInterviewData = interviewDataRef.current;
        
        console.log('💾 Saving interview data on termination:', {
          interviewDataCount: latestInterviewData?.length || 0,
          hasData: latestInterviewData && latestInterviewData.length > 0
        });
        
        try {
          const response = await fetch(`/api/interview/abandon/${sessionToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              interviewData: latestInterviewData || []
            })
          });
          const data = await response.json();
          if (data.success && data.redirectUrl) {
            // Clear data after saving
            clearData();
            // Redirect to thank-you for token-based sessions
            setTimeout(() => {
              router.push(data.redirectUrl);
            }, 50);
            return;
          }
        } catch (error) {
          console.error('Error saving abandoned interview:', error);
        }
      }
      
      // Clear data before redirecting
      clearData();
    } finally {
      // Small timeout to allow media tracks to stop cleanly before navigation
      setTimeout(() => {
        // For token sessions, redirect to thank-you; otherwise interview-ended
        const redirectPath = sessionToken ? '/thank-you' : '/interview-ended';
        router.push(redirectPath);
      }, 50);
    }
  };

  const handlePauseInterview = () => {
    // Stop any active TTS
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
      isTTSPlaying.current = false;
    }
    
    
    // Mute microphone
    muteMicrophoneForTTS();
    
    // Save current state
    pauseInterview({
      pausedQuestion: currentQuestion,
      pausedTranscript: transcript,
      pausedConversationLog: conversationLog,
      pausedInterviewData: interviewData,
      pausedTime: time
    });
    
    setIsPaused(true);
    setConversationState('paused');
    
    toast({
      title: "Interview Paused",
      description: "Your interview has been paused. You can resume when your network improves.",
    });
  };

  const handleResumeInterview = () => {
    // Get the paused state before clearing it
    const pausedState = getInterviewPauseState();
    
    // Resume the interview
    resumeInterview();
    
    setIsPaused(false);
    
    // Restore the paused state if it exists
    if (pausedState) {
      if (pausedState.pausedQuestion) setCurrentQuestion(pausedState.pausedQuestion);
      if (pausedState.pausedTranscript) setTranscript(pausedState.pausedTranscript);
      if (pausedState.pausedConversationLog) setConversationLog(pausedState.pausedConversationLog);
      if (pausedState.pausedInterviewData) setInterviewData(pausedState.pausedInterviewData);
      if (pausedState.pausedTime) setTime(pausedState.pausedTime);
    }
    
    // Clear the pause state after restoration
    clearInterviewPauseState();
    
    // Restore conversation state based on interview mode
    const nextState = interviewMode === 'voice' ? 'listening' : 'idle';
    setConversationState(nextState);
    
    
    // Unmute microphone
    unmuteMicrophoneAfterTTS();
    
    toast({
      title: "Interview Resumed",
      description: "Welcome back! Your interview has been resumed.",
    });
  };

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    // Fallback: also scroll the viewport directly for robustness
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [conversationLog]);

  // Check for stale data on component mount
  useEffect(() => {
    const checkDataFreshness = () => {
      const storedQuestionsData = getQuestions();
      const storedResumeAnalysis = getResumeAnalysis();
      
      // If no data exists, redirect to prepare (except for token-based sessions)
      if ((!storedQuestionsData || !storedResumeAnalysis) && !sessionToken) {
        // Block error toast - log to console only
        // toast({ 
        //   variant: "destructive", 
        //   title: "No Interview Data", 
        //   description: "Please prepare for your interview first." 
        // });
        console.error("No Interview Data: Please prepare for your interview first.");
        router.push("/prepare");
        return;
      }
      
      // Check if there's an active interview session (prevents restart on reload)
      if (isInterviewActive()) {
        // Check if this is from a page reload
        if (isSessionFromReload()) {
          // End the existing session and redirect to prepare
          endInterviewSession();
          clearData();
          // Block error toast - log to console only
          // toast({ 
          //   variant: "destructive", 
          //   title: "Interview Session Interrupted", 
          //   description: "Your interview session was interrupted by a page reload. Please start fresh from the prepare page." 
          // });
          console.error("Interview Session Interrupted: Your interview session was interrupted by a page reload. Please start fresh from the prepare page.");
          router.push("/prepare");
          return;
        } else {
          // This is a legitimate new session, continue
          console.log("Starting new interview session");
          // Mark session as started to prevent reload detection
          markSessionAsStarted();
        }
      }
      
      // Check if data is from a completed interview (has summary)
      const interviewSummary = getInterviewSummary();
      if (interviewSummary && interviewSummary.length > 0) {
        // Ensure cleanup before redirecting
        stopCamera();
        stopMicrophone();
        
        toast({ 
          title: "Interview Already Completed", 
          description: "Please start a new interview from the prepare page." 
        });
        
        // Small delay to ensure cleanup completes
        setTimeout(() => {
          router.push("/prepare");
        }, 100);
        return;
      }
    };

    checkDataFreshness();
  }, [router, toast]);

  // Check for paused state on component mount
  useEffect(() => {
    const checkPausedState = () => {
      const pausedState = getInterviewPauseState();
      if (pausedState && pausedState.isPaused) {
        setPauseState(pausedState);
        setIsPaused(true);
        setConversationState('paused');
        
        // Restore paused state
        if (pausedState.pausedQuestion) setCurrentQuestion(pausedState.pausedQuestion);
        if (pausedState.pausedTranscript) setTranscript(pausedState.pausedTranscript);
        if (pausedState.pausedConversationLog) setConversationLog(pausedState.pausedConversationLog);
        if (pausedState.pausedInterviewData) setInterviewData(pausedState.pausedInterviewData);
        if (pausedState.pausedTime !== undefined) setTime(pausedState.pausedTime);
        
        toast({
          title: "Interview Paused",
          description: "Your interview was paused. Click Resume to continue when your network improves.",
        });
      }
    };

    checkPausedState();
  }, []);

  // Volume monitoring for voice feedback
  useEffect(() => {
    if (interviewMode === 'voice' && hasCameraPermission) {
      const monitorVolume = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const analyser = audioContext.createAnalyser();
          const microphone = audioContext.createMediaStreamSource(stream);
          
          // Store references for cleanup
          audioContextRef.current = audioContext;
          analyserRef.current = analyser;
          
          analyser.fftSize = 256;
          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          
          microphone.connect(analyser);
          
          const updateVolume = () => {
            if (!isMuted && conversationState === 'listening') {
              analyser.getByteFrequencyData(dataArray);
              const average = dataArray.reduce((a, b) => a + b) / bufferLength;
              setVolume(average / 255);
              
        // Update voice activity if there's significant volume
        if (average > 10) { // Threshold for voice activity
          setLastVoiceActivity(Date.now());
          setHasShownWarning(false);
          setShowVisualWarning(false);
        }
            } else {
              setVolume(0);
            }
            requestAnimationFrame(updateVolume);
          };
          
          updateVolume();
          
          return () => {
            stream.getTracks().forEach(track => track.stop());
            if (audioContext.state !== 'closed') {
              try {
                audioContext.close();
              } catch (error) {
                console.log('AudioContext already closed or closing');
              }
            }
          };
        } catch (error) {
          console.error('Failed to monitor volume:', error);
        }
      };
      
      const cleanup = monitorVolume();
      return () => {
        cleanup.then(cleanupFn => cleanupFn?.());
      };
    }
  }, [interviewMode, hasCameraPermission, isMuted, conversationState]);


  useEffect(() => {
      if (conversationState !== 'loading' && conversationState !== 'finished' && conversationState !== 'paused') {
          const timerId = setInterval(() => {
              setTime(t => t + 1);
          }, 1000);
          return () => clearInterval(timerId);
      }
  }, [conversationState]);

  useEffect(() => {
    if (interviewMode !== 'voice') {
      if (shouldBeListening.current) {
        shouldBeListening.current = false;
        lastTranscriptFromNative.current = '';
        resetAssemblyTranscripts();
        stopAssemblyRealtime();
      }
      return;
    }

    const shouldListen =
      conversationState === 'listening' &&
      !isMuted &&
      conversationStateRef.current !== 'speaking' &&
      !isTTSPlaying.current &&
      !isPaused;

    const wasListening = shouldBeListening.current;

    if (shouldListen) {
      if (!wasListening) {
        if (DEBUG_SPEECH) console.log('Starting AssemblyAI listening session');
        resetAssemblyTranscripts();
        lastTranscriptFromNative.current = '';
      }
      shouldBeListening.current = true;
      void startAssemblyRealtime();
      setSpeechRecognitionIssue(false);
    } else {
      if (wasListening) {
        if (DEBUG_SPEECH) console.log('Stopping AssemblyAI listening session');
        resetAssemblyTranscripts();
        lastTranscriptFromNative.current = '';
      }
      shouldBeListening.current = false;
      stopAssemblyRealtime();
    }
  }, [
    conversationState,
    isMuted,
    interviewMode,
    isPaused,
    startAssemblyRealtime,
    stopAssemblyRealtime,
    resetAssemblyTranscripts,
  ]);

  // AssemblyAI status tracking for issue indicator
  useEffect(() => {
    if (assemblyStatus === 'error') {
      setSpeechRecognitionIssue(true);
    } else if (assemblyStatus === 'listening') {
      setSpeechRecognitionIssue(false);
    }
  }, [assemblyStatus]);

  useEffect(() => {
    if (assemblyError) {
      console.error('AssemblyAI streaming error:', assemblyError);
    }
  }, [assemblyError]);

  useEffect(() => {
    if (interviewMode !== 'voice') {
      return;
    }

    const segmentsText = assemblyFinalTranscript;
    const partialText = assemblyPartialTranscript?.trim() || '';
    const combined = [segmentsText, partialText].filter(Boolean).join(' ').trim();

    if (!combined) {
      return;
    }

    const now = Date.now();
    const isRecentlyEditing =
      typeof window !== 'undefined' &&
      window.lastManualEdit &&
      now - window.lastManualEdit < 1000;

    if (isRecentlyEditing) {
      if (DEBUG_SPEECH) {
        console.log('Skipping AssemblyAI update - user manually editing');
      }
      return;
    }

    if (combined.length <= lastTranscriptFromNative.current.length) {
      // Keep reference in sync when AssemblyAI clears partial text
      if (!partialText && segmentsText.length < lastTranscriptFromNative.current.length) {
        lastTranscriptFromNative.current = segmentsText;
      }
      return;
    }

    const delta = combined.substring(lastTranscriptFromNative.current.length);
    if (!delta) {
      return;
    }

    if (DEBUG_SPEECH) {
      console.log('AssemblyAI delta:', delta);
    }

    setTranscript(prev => prev + delta);
    lastTranscriptFromNative.current = combined;
    lastTranscriptUpdate.current = now;
    speechUpdateCount.current += 1;
    lastSpeechUpdateTime.current = now;

    setIsVoiceActive(true);
    setLastVoiceActivity(now);
    setHasShownWarning(false);
    setShowVisualWarning(false);
    setTimeout(() => setIsVoiceActive(false), 1000);
  }, [
    assemblyFinalTranscript,
    assemblyPartialTranscript,
    interviewMode,
  ]);

  // Automatically disable camera and microphone when interview is finished
  useEffect(() => {
    if (conversationState === 'finished') {
      // Stop camera and microphone
      stopCamera();
      stopMicrophone();
      
      // Additional cleanup to ensure all resources are released
      setTimeout(() => {
        stopCamera();
        stopMicrophone();
      }, 200);
    }
  }, [conversationState]);
  
  // Cleanup effect when component unmounts
  useEffect(() => {
    return () => {
      stopCamera();
      stopMicrophone();
      // End interview session on unmount
      endInterviewSession();
      // Reset spoken question tracking
      lastSpokenQuestion.current = null;
    };
  }, []);

  // Navigation warning and cleanup
  useEffect(() => {
    const savePartialInterviewData = async () => {
      // Save partial interview data if session is token-based
      if (sessionToken) {
        // Use ref to get the latest interviewData value (avoids closure issues)
        const latestInterviewData = interviewDataRef.current;
        
        // Log interview data state before saving with detailed info
        console.log('💾 Attempting to save partial interview data:', {
          interviewDataCount: latestInterviewData?.length || 0,
          hasQuestions: latestInterviewData?.some((qa: any) => qa.question) || false,
          hasAnswers: latestInterviewData?.some((qa: any) => qa.answer) || false,
          conversationState: conversationState,
          interviewDataItems: latestInterviewData?.map((qa: any, idx: number) => ({
            index: idx,
            hasQuestion: !!qa.question,
            hasAnswer: !!qa.answer,
            questionPreview: qa.question?.substring(0, 30),
            answerPreview: qa.answer?.substring(0, 30)
          })) || []
        });
        
        // Save even if interviewData is empty (might save session state)
        try {
          const data = JSON.stringify({
            interviewData: latestInterviewData || [] // Include all Q&A data with feedback, or empty array
          });
          
          console.log('📤 Sending to abandon endpoint:', {
            dataLength: data.length,
            interviewDataArray: latestInterviewData?.length || 0,
            firstItem: latestInterviewData?.[0] ? {
              hasQuestion: !!latestInterviewData[0].question,
              hasAnswer: !!latestInterviewData[0].answer
            } : null
          });
          
          // Use fetch with keepalive for reliable data transmission on page close
          const response = await fetch(`/api/interview/abandon/${sessionToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: data,
            keepalive: true // Ensures request continues even if page closes
          });
          
          // If response is available, try to get redirect URL
          if (response.ok) {
            try {
              const result = await response.json();
              if (result.success && result.redirectUrl) {
                // Store redirect URL for when page unloads
                if (typeof window !== 'undefined') {
                  sessionStorage.setItem('abandonRedirectUrl', result.redirectUrl);
                }
              }
            } catch (e) {
              // Ignore JSON parsing errors for keepalive requests
            }
          }
        } catch (error) {
          console.error('Error saving partial interview data:', error);
        }
      }
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Save partial data before page unloads using sendBeacon for reliability
      if (sessionToken) {
        const latestInterviewData = interviewDataRef.current;
        const data = JSON.stringify({
          interviewData: latestInterviewData || []
        });
        
        // Use sendBeacon for reliable transmission even if page closes
        if (navigator.sendBeacon) {
          const blob = new Blob([data], { type: 'application/json' });
          navigator.sendBeacon(`/api/interview/abandon/${sessionToken}`, blob);
        } else {
          // Fallback to fetch with keepalive
          fetch(`/api/interview/abandon/${sessionToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: data,
            keepalive: true
          }).catch(() => {});
        }
      }
      
      if (conversationState !== 'finished' && conversationState !== 'idle') {
        // End the interview session when leaving
        endInterviewSession();
        // Show warning when trying to close/refresh the page
        event.preventDefault();
        event.returnValue = 'Are you sure you want to leave? Your interview progress will be lost and camera/microphone will remain active.';
        return 'Are you sure you want to leave? Your interview progress will be lost and camera/microphone will remain active.';
      }
    };

    const handleUnload = () => {
      // Save data one more time on unload
      if (sessionToken) {
        const latestInterviewData = interviewDataRef.current;
        const data = JSON.stringify({
          interviewData: latestInterviewData || []
        });
        
        if (navigator.sendBeacon) {
          const blob = new Blob([data], { type: 'application/json' });
          navigator.sendBeacon(`/api/interview/abandon/${sessionToken}`, blob);
        }
      }
      
      // Always end session on unload (including reload)
      if (conversationState !== 'finished' && conversationState !== 'idle') {
        endInterviewSession();
      }
    };
    
    // Handle visibility change (tab switching) - save data immediately
    // Only save data if not in proctored mode (proctored mode handled by proctor guard)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && sessionToken && !isProctored && conversationState !== 'finished') {
        // Save interview data when tab becomes hidden (only for non-proctored sessions)
        // Proctored sessions are handled by the proctor guard which shows a modal
        const latestInterviewData = interviewDataRef.current;
        const data = JSON.stringify({
          interviewData: latestInterviewData || []
        });
        
        // Use sendBeacon for reliable transmission
        if (navigator.sendBeacon) {
          const blob = new Blob([data], { type: 'application/json' });
          navigator.sendBeacon(`/api/interview/abandon/${sessionToken}`, blob);
        } else {
          fetch(`/api/interview/abandon/${sessionToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: data,
            keepalive: true
          }).catch(() => {});
        }
      }
    };

    const handlePopState = (event: PopStateEvent) => {
      if (conversationState !== 'finished' && conversationState !== 'idle') {
        // Show warning when trying to go back/forward
        event.preventDefault();
        // setShowNavigationWarning(true); // DISABLED
        setIsNavigatingAway(true);
        
        // Prevent the navigation
        window.history.pushState(null, '', window.location.href);
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);
    window.addEventListener('popstate', handlePopState);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup event listeners
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [conversationState, sessionToken, isProctored]);

  // Enforce fullscreen on interview start and end if user exits fullscreen (for proctored mode or token-based interviews)
  useEffect(() => {
    // Enforce fullscreen in proctored mode OR for token-based interviews (email links)
    const shouldEnforceFullscreen = currentProctoringMode === 'proctored' || sessionToken;
    if (!shouldEnforceFullscreen) {
      return;
    }

    // Try to enter fullscreen when the interview page mounts
    const requestFs = async () => {
      try {
        const el: any = document.documentElement;
        if (el && el.requestFullscreen) {
          await el.requestFullscreen();
        }
      } catch (e) {
        // Ignore failures (some browsers block without user gesture)
        console.log('Fullscreen request failed or was blocked');
      }
    };
    requestFs();

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        // User exited fullscreen - terminate interview immediately
        endInterviewAndRedirectToEnded();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [currentProctoringMode, sessionToken]);

  // Terminate interview immediately on tab switch/minimize/blur (for token-based interviews ONLY when NOT proctored)
  // When proctored, the proctor guard handles this with a confirmation modal
  useEffect(() => {
    // Only enforce immediate termination for non-proctored token-based interviews
    // Proctored interviews are handled by the proctor guard which shows a confirmation modal
    const shouldEnforceTabSwitching = (currentProctoringMode !== 'proctored' && sessionToken) || 
                                      (!isProctored && sessionToken);
    if (!shouldEnforceTabSwitching) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' && conversationState !== 'finished') {
        endInterviewAndRedirectToEnded();
      }
    };

    const handleWindowBlur = () => {
      if (conversationState !== 'finished') {
        endInterviewAndRedirectToEnded();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [currentProctoringMode, sessionToken, isProctored, conversationState]);

  // Emergency keyboard shortcut for ending interview (Ctrl+Shift+E)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'E') {
        event.preventDefault();
        console.log('Emergency end Interview triggered via keyboard shortcut');
        endInterview();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Router navigation warning
  useEffect(() => {
    const handleRouteChangeStart = (url: string) => {
      if (conversationState !== 'finished' && conversationState !== 'idle') {
        // setShowNavigationWarning(true); // DISABLED
        setIsNavigatingAway(true);
        // Prevent navigation for now
        return false;
      }
    };

    // Note: Next.js App Router doesn't have a direct route change event
    // We'll rely on beforeunload and popstate for now
  }, [conversationState]);


  const captureVideoFrame = (): string | undefined => {
      if (!videoRef.current || !canvasRef.current || !videoRef.current.srcObject) {
          console.error("Video or canvas ref not available for frame capture.");
          return undefined;
      }
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (video.videoWidth === 0 || video.videoHeight === 0) {
          console.error("Video has no dimensions, cannot capture frame.");
          return undefined;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Check if the captured frame is essentially black/empty
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          let totalBrightness = 0;
          let pixelCount = 0;
          
          // Sample every 10th pixel to check brightness
          for (let i = 0; i < data.length; i += 40) { // 40 = 10 pixels * 4 (RGBA)
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              totalBrightness += (r + g + b) / 3;
              pixelCount++;
          }
          
          const averageBrightness = totalBrightness / pixelCount;
          
          // If the frame is too dark (average brightness < 20), consider it invalid
          if (averageBrightness < 20) {
              console.warn("Captured video frame is too dark/black, skipping video analysis.");
              return undefined;
          }
          
          return canvas.toDataURL('image/jpeg');
      }
      return undefined;
  }
  
  const stopCamera = () => {
    if (videoRef.current) {
      // Clean up event listeners if they exist
      if ((videoRef.current as any)._videoCleanup) {
        (videoRef.current as any)._videoCleanup();
        delete (videoRef.current as any)._videoCleanup;
      }
      
      if (videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
          track.stop();
          console.log('Camera track stopped:', track.kind);
        });
        videoRef.current.srcObject = null;
      }
    }
    setIsVideoPlaying(false);
    setHasActiveVideoStream(false);
  };

  const stopMicrophone = () => {
    // Stop any active audio streams from the volume monitoring
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (error) {
        console.log('AudioContext already closed or closing');
      }
      audioContextRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current = null;
    }
    
    // Clean up distance speech audio monitoring
    if (window.audioMonitorInterval) {
      clearInterval(window.audioMonitorInterval);
      window.audioMonitorInterval = undefined;
    }
    if (window.audioContext && window.audioContext.state !== 'closed') {
      window.audioContext.close();
      window.audioContext = undefined;
    }
    window.currentAudioLevel = undefined;
    
    // Reset voice states
    setVolume(0);
    setIsVoiceActive(false);
    
    shouldBeListening.current = false;
    lastTranscriptFromNative.current = '';
    resetAssemblyTranscripts();
    stopAssemblyRealtime();
  };

  const endInterview = async () => {
    // Always allow ending the interview regardless of state
    console.log('Ending interview...', { conversationState, interviewMode });
    
    setConversationState('finished');
    
    // Stop all TTS (audio and browser)
    stopAllTTS();
    
    // Stop streaming speech-to-text
    shouldBeListening.current = false;
    lastTranscriptFromNative.current = '';
    resetAssemblyTranscripts();
    stopAssemblyRealtime();
    
    // End the interview session
    endInterviewSession();
    
    // Ensure immediate cleanup
    setTimeout(() => {
      stopCamera();
      stopMicrophone();
    }, 100);
    
    // Use ref to get the latest interviewData value (avoids closure issues)
    const latestInterviewData = interviewDataRef.current;
    
    // Prepare results data for token-based session
    const resultsData = {
      interviewData: latestInterviewData,
      summary: getInterviewSummary(),
      timestamp: new Date().toISOString()
    };
    
    console.log('📤 Sending interview data to complete endpoint:', {
      interviewDataCount: latestInterviewData?.length || 0,
      hasQuestions: latestInterviewData?.some((qa: any) => qa.question) || false,
      hasAnswers: latestInterviewData?.some((qa: any) => qa.answer) || false,
      sessionToken: sessionToken
    });
    
    // Complete token-based session if applicable
    let redirectUrl = '/summary'; // Default redirect for non-token sessions
    if (sessionToken) {
      try {
        const response = await fetch(`/api/interview/complete/${sessionToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resultsJson: resultsData,
            interviewData: latestInterviewData // Send all Q&A data
          })
        });
        
        const data = await response.json();
        if (data.success) {
          console.log('Token-based session completed successfully');
          // Use redirectUrl from API response if provided (for email-based interviews)
          if (data.redirectUrl) {
            redirectUrl = data.redirectUrl;
          }
        } else {
          console.error('Failed to complete token session:', data.error);
        }
      } catch (error) {
        console.error('Error completing token session:', error);
      }
    }
    
    // Save interview summary
    try {
      saveInterviewSummary(interviewData);
    } catch (error) {
      console.error('Error saving interview summary:', error);
    }
    
    // Navigate to appropriate page (summary for regular sessions, thank-you for email-based)
    router.push(redirectUrl);
  }

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
  }

  const processTextForSpeech = (text: string): string => {
    if (!text) return text;
    
    let processedText = text;
    
    // Handle technical labels and acronyms - spell them out letter by letter
    const technicalLabels = [
      'cat', 'gmat', 'gre', 'toefl', 'ielts', 'sat', 'act', 'lsat', 'mcat', 'pcat',
      'swat', 'mba', 'phd', 'ms', 'ba', 'bs', 'ma', 'mfa', 'jd', 'md', 'dds', 'dvm'
    ];
    
    technicalLabels.forEach(label => {
      const regex = new RegExp(`\\b${label}\\b`, 'gi');
      processedText = processedText.replace(regex, label.split('').join('-').toUpperCase());
    });
    
    // Handle punctuation for better speech flow using natural pauses
    processedText = processedText
      // Add natural pauses for commas
      .replace(/,/g, ', ... ')
      // Add natural pauses for semicolons
      .replace(/;/g, '; ... ')
      // Add natural pauses for periods
      .replace(/\./g, '. ... ')
      // Add natural pauses for question marks
      .replace(/\?/g, '? ... ')
      // Add natural pauses for exclamation marks
      .replace(/!/g, '! ... ')
      // Add natural pauses for colons
      .replace(/:/g, ': ... ')
      // Add natural pauses for dashes
      .replace(/--/g, ' ... ')
      .replace(/-/g, ' ... ')
      // Add natural pauses for parentheses
      .replace(/\(/g, ' ... (')
      .replace(/\)/g, ') ... ')
      // Add natural pauses for quotes
      .replace(/"/g, ' ... "')
      .replace(/'/g, ' ... \'');
    
    // Handle numbers for better pronunciation
    processedText = processedText
      // Spell out single digits in technical contexts
      .replace(/\\b(\\d)\\b/g, (match, digit) => {
        const digitWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
        return digitWords[parseInt(digit)];
      })
      // Handle percentages
      .replace(/(\\d+)%/g, '$1 percent')
      // Handle common abbreviations
      .replace(/\\bvs\\./gi, 'versus')
      .replace(/\\betc\\./gi, 'et cetera')
      .replace(/\\bi\\.e\\./gi, 'that is')
      .replace(/\\be\\.g\\./gi, 'for example');
    
    // Handle common technical terms
    processedText = processedText
      .replace(/\\bapi\\b/gi, 'A-P-I')
      .replace(/\\bcss\\b/gi, 'C-S-S')
      .replace(/\\bhtml\\b/gi, 'H-T-M-L')
      .replace(/\\bjs\\b/gi, 'JavaScript')
      .replace(/\\bts\\b/gi, 'TypeScript')
      .replace(/\\bui\\b/gi, 'U-I')
      .replace(/\\bux\\b/gi, 'U-X')
      .replace(/\\bdb\\b/gi, 'database')
      .replace(/\\bsql\\b/gi, 'S-Q-L')
      .replace(/\\baws\\b/gi, 'A-W-S')
      .replace(/\\bjson\\b/gi, 'J-S-O-N')
      .replace(/\\bxml\\b/gi, 'X-M-L')
      .replace(/\\bhttp\\b/gi, 'H-T-T-P')
      .replace(/\\bhttps\\b/gi, 'H-T-T-P-S')
      .replace(/\\burl\\b/gi, 'U-R-L')
      .replace(/\\bdom\\b/gi, 'D-O-M')
      .replace(/\\bapi\\b/gi, 'A-P-I')
      .replace(/\\bcrud\\b/gi, 'C-R-U-D')
      .replace(/\\bgit\\b/gi, 'Git')
      .replace(/\\bgithub\\b/gi, 'Git-Hub')
      .replace(/\\bnode\\b/gi, 'Node')
      .replace(/\\breact\\b/gi, 'React')
      .replace(/\\bvue\\b/gi, 'Vue')
      .replace(/\\bangular\\b/gi, 'Angular')
      .replace(/\\bpython\\b/gi, 'Python')
      .replace(/\\bjava\\b/gi, 'Java')
      .replace(/\\bc\+\+/gi, 'C plus plus')
      .replace(/\\bc#/gi, 'C sharp');
    
    // Clean up multiple consecutive pauses
    processedText = processedText
      .replace(/\s*\.\.\.\s*\.\.\./g, ' ... ')
      .replace(/\s*\.\.\.\s*\.\.\./g, ' ... ')
      .trim();
    
    return processedText;
  };

  // Helper function to stop all TTS (audio and browser)
  const stopAllTTS = () => {
    // Stop any playing audio TTS
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    
    // Stop browser TTS if active
    if ('speechSynthesis' in window && speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }
    
    isTTSPlaying.current = false;
  };

  // Function to temporarily pause AssemblyAI streaming during TTS
  const muteMicrophoneForTTS = () => {
    if (interviewMode !== 'voice') return;
    shouldBeListening.current = false;
    lastTranscriptFromNative.current = '';
    stopAssemblyRealtime();
  };

  // Function to resume AssemblyAI streaming after TTS
  const unmuteMicrophoneAfterTTS = () => {
    if (interviewMode !== 'voice') return;
    shouldBeListening.current = true;
    if (conversationStateRef.current === 'listening' && !isMuted && !isPaused) {
      resetAssemblyTranscripts();
      lastTranscriptFromNative.current = '';
      void startAssemblyRealtime();
    }
  };

  // Helper function to clear all transcript-related state
  const clearTranscript = () => {
    setTranscript("");
    transcriptRef.current = "";
    lastTranscriptFromNative.current = "";
    resetAssemblyTranscripts();
    // Reset response type tracking counters
    speechUpdateCount.current = 0;
    manualEditCount.current = 0;
    lastSpeechUpdateTime.current = 0;
    console.log('Transcript cleared');
  };

  // Function to validate answer quality and detect gibberish
  const validateAnswerQuality = (answer: string): { isValid: boolean; reason?: string } => {
    const trimmedAnswer = answer.trim();
    
    // Allow very short answers for mathematical questions and simple responses
    if (trimmedAnswer.length < 2) {
      return { isValid: false, reason: "Please provide an answer." };
    }
    
    // Allow single numbers and simple mathematical answers
    if (/^\d+[.,]?\d*$/.test(trimmedAnswer)) {
      return { isValid: true };
    }
    
    // Allow common single-word responses
    const commonSingleWords = [
      'yes', 'no', 'aptitude', 'technical', 'behavioral', 'hr', 'personality', 
      'math', 'english', 'science', 'history', 'geography', 'physics', 'chemistry',
      'biology', 'economics', 'politics', 'current', 'affairs', 'programming',
      'coding', 'software', 'hardware', 'database', 'network', 'security',
      'management', 'marketing', 'finance', 'accounting', 'sales', 'operations'
    ];
    
    if (commonSingleWords.includes(trimmedAnswer.toLowerCase())) {
      return { isValid: true };
    }
    
    // Check for meaningful symbols and currency indicators
    const meaningfulSymbols = /[$₹€£¥%°C°F]/;
    const hasMeaningfulSymbols = meaningfulSymbols.test(trimmedAnswer);
    
    // Check for repeated characters (like "aaaa" or "1111") - but allow if it contains meaningful symbols
    const hasRepeatedChars = /(.)\1{4,}/.test(trimmedAnswer);
    if (hasRepeatedChars && !hasMeaningfulSymbols && trimmedAnswer.length > 5) {
      return { isValid: false, reason: "Please avoid repeating the same character multiple times." };
    }
    
    // Check for keyboard mashing patterns (consecutive characters that don't form words)
    // But allow if it contains meaningful symbols or appears to be a legitimate response
    const keyboardMashPattern = /[qwertyuiopasdfghjklzxcvbnm]{10,}/i;
    if (
      keyboardMashPattern.test(trimmedAnswer) &&
      trimmedAnswer.length < 15 &&
      !hasMeaningfulSymbols &&
      !/\d/.test(trimmedAnswer)
    ) {
      return { isValid: false, reason: "Please provide a thoughtful answer instead of random keyboard input." };
    }
    
    // If answer contains meaningful symbols, be more lenient with validation
    if (hasMeaningfulSymbols) {
      // Allow answers with symbols even if they have some special characters
      return { isValid: true };
    }
    
    // Check for excessive random characters (more than 60% non-alphabetic) - made more lenient
    // But exclude common meaningful characters like numbers, currency symbols, percentages
    const meaningfulChars = trimmedAnswer.replace(/[^a-zA-Z0-9\s$₹€£¥%°C°F.,!?()-]/g, '').length;
    const totalChars = trimmedAnswer.replace(/\s/g, '').length;
    if (totalChars > 0 && (meaningfulChars / totalChars) < 0.4) {
      return { isValid: false, reason: "Please provide a meaningful answer with proper words." };
    }
    
    // Check for excessive numbers mixed with letters (like "hjcdsv,1453wdsrx6")
    // But allow if it seems like a legitimate numerical answer
    const numberLetterRatio = (trimmedAnswer.match(/[0-9]/g) || []).length / trimmedAnswer.length;
    if (numberLetterRatio > 0.5 && trimmedAnswer.length < 15 && !hasMeaningfulSymbols) {
      // Check if it looks like a legitimate numerical answer (contains common patterns)
      const hasLegitimatePattern = /^\d+[.,]?\d*[%$₹€£¥]?$/.test(trimmedAnswer) || 
                                   /^\d+[.,]?\d*\s*(percent|%|dollars?|rupees?|euros?|pounds?|yen)/i.test(trimmedAnswer) ||
                                   /^\d+\s*(km|miles|hours?|minutes?|seconds?|years?|days?|months?)/i.test(trimmedAnswer);
      if (!hasLegitimatePattern) {
        return { isValid: false, reason: "Please provide a proper answer using words instead of random characters and numbers." };
      }
    }
    
    // Check for excessive special characters, but be more lenient with common symbols
    const excessiveSpecialChars = trimmedAnswer.match(/[^a-zA-Z0-9\s$₹€£¥%°C°F.,!?()-]/g) || [];
    const specialCharRatio = excessiveSpecialChars.length / trimmedAnswer.length;
    if (specialCharRatio > 0.5) {
      return { isValid: false, reason: "Please use proper words and avoid excessive special characters." };
    }
    
    return { isValid: true };
  };

  const handleSubmit = async () => {
    const currentAnswer = transcriptRef.current.trim();
    console.log('=== SUBMIT DEBUG ===');
   console.log('Current answer length:', currentAnswer.length);
    console.log('Answer length:', currentAnswer.length);
    console.log('Conversation state:', conversationStateRef.current);

    if (!currentAnswer || conversationStateRef.current === 'thinking' || conversationStateRef.current === 'speaking' || conversationStateRef.current === 'paused') {
        console.log('Submit blocked - no answer or wrong state');
        return;
    }

    // Validate answer quality before processing
    const validation = validateAnswerQuality(currentAnswer);
    console.log('Validation result:', validation);

    if (!validation.isValid) {
      console.log('Answer validation failed:', validation.reason);
     console.log('Answer validation failed - length:', currentAnswer.length);
      
      // Add validation message to conversation log without hints
      setConversationLog(prev => [...prev, { 
        speaker: 'ai', 
        text: `${validation.reason} Moving to the next question.`
      }]);
      
      // Clear transcript
      clearTranscript();
      
      // Speak the validation message
      if (interviewMode === 'voice') {
        speak(`${validation.reason} Moving to the next question.`);
      }
      
      // Actually move to the next question by calling the interview agent
      setConversationState('thinking');
      
      try {
        const videoFrameDataUri = (interviewMode === 'voice' && hasCameraPermission) ? captureVideoFrame() : undefined;
        
        // Call interview agent to get the next question
        const result = await interviewAgent({
          conversationLog: conversationLog,
          transcript: currentAnswer,
          resumeAnalysis: resumeAnalysis,
          questionsData: questionsData,
          videoFrameDataUri: videoFrameDataUri,
          jobRole: jobRole,
          company: company,
          college: college,
          languageName: languageName,
          interviewData: interviewData,
          currentQuestionAttempts: currentQuestionAttempts,
          currentQuestionHints: currentQuestionHints,
          shouldRetryQuestion: shouldRetryQuestion,
          isCurrentAffairs: currentAffairsMetadata !== null,
          currentAffairsTopic: currentAffairsMetadata?.topic,
          currentAffairsCategory: currentAffairsMetadata?.category,
          realQuestionCount: realQuestionCount,
          recentScores: recentScores,
          isCurrentQuestionReal: !isGeneralQuestion,
          minQuestionsRequired: minQuestionsRequired
        });
        
        // Process the result and move to next question
        if (result.nextQuestion) {
          setCurrentQuestion(result.nextQuestion);
          setConversationState('listening');
        }
        
      } catch (error) {
        console.error('Error getting next question after validation failure:', error);
        setConversationState('listening');
      }
      
      return;
    }
    
    setConversationState('thinking');
    
    const videoFrameDataUri = (interviewMode === 'voice' && hasCameraPermission) ? captureVideoFrame() : undefined;

    try {
      setConversationLog(prev => [...prev, { speaker: 'user', text: currentAnswer }]);
      
      // Determine if current question is real
      const isGeneralQuestion = 
        currentQuestion.toLowerCase().includes('area would you like to focus') ||
        currentQuestion.toLowerCase().includes('what area would you like to focus') ||
        currentQuestion.toLowerCase().includes('let\'s start') ||
        currentQuestion.toLowerCase().includes('let\'s begin') ||
        currentQuestion.toLowerCase().includes('how do you want to proceed') ||
        currentQuestion.toLowerCase().includes('welcome to') ||
        currentQuestion.toLowerCase().includes('hello') ||
        currentQuestion.toLowerCase().includes('hi there') ||
        currentQuestion.toLowerCase().includes('to make this session as helpful as possible');
      
      // Count real questions in the conversation history
      const realQuestionCount = interviewData.filter(d => d.isRealQuestion).length;
      
      // Get recent scores for real questions only
      const recentScores = interviewData
        .filter(d => d.isRealQuestion && d.feedback.overallScore > 0)
        .map(d => d.feedback.overallScore)
        .slice(-3); // Last 3 real question scores
      
      // Get exam configuration for filtering
      const examConfig = getExamConfig();
      
      // Add timeout to prevent hanging
      // Determine if resume data is available (for email-based interviews without resume)
      const hasResumeData = resumeText && resumeText.trim().length > 50;
      
      // Check if this is an email-based interview (accessed via email link)
      const isEmailInterview = typeof window !== 'undefined' && 
        (localStorage.getItem('isEmailInterviewSession') === 'true' || !!sessionToken);
      
      const interviewPromise = interviewAgent({
        jobRole,
        company,
        college,
        resumeText: resumeText || '',
        language: languageName,
        hasResumeData,
        isEmailInterview,
        conversationHistory: [
          ...interviewData.map(d => ({
            question: d.question, 
            answer: d.answer, 
            attempts: d.attempts, 
            hintsGiven: d.hintsGiven, 
            isCorrect: d.isCorrect,
            isCurrentAffairs: d.isCurrentAffairs,
            currentAffairsTopic: d.currentAffairsTopic,
            currentAffairsCategory: d.currentAffairsCategory,
          })),
          { 
            question: currentQuestion, 
            answer: currentAnswer, 
            attempts: currentQuestionAttempts, 
            hintsGiven: currentQuestionHints, 
            isCorrect: undefined,
            isCurrentAffairs: currentAffairsMetadata !== null,
            currentAffairsTopic: currentAffairsMetadata?.topic,
            currentAffairsCategory: currentAffairsMetadata?.category,
          }
        ],
        currentTranscript: currentAnswer,
        videoFrameDataUri,
        realQuestionCount: realQuestionCount,
        recentScores: recentScores,
        isCurrentQuestionReal: !isGeneralQuestion,
        currentQuestionAttempts: currentQuestionAttempts,
        currentQuestionHints: currentQuestionHints,
        minQuestionsRequired: minQuestionsRequired,
        // Pass exam and subcategory information for filtering
        examId: examConfig?.examId ? parseInt(examConfig.examId.toString()) : undefined,
        subcategoryId: examConfig?.subcategoryId ? parseInt(examConfig.subcategoryId.toString()) : undefined
      });
      
      // Add timeout handling - increased to 120 seconds to accommodate slow AI responses
      // The interviewAgent flow performs multiple operations: DB queries, current affairs generation, and AI model calls
      // For email interviews, we need more time as they may have more complex question generation
      const timeoutDuration = isEmailInterview ? 120000 : 90000;
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout - please try again')), timeoutDuration)
      );
      
      const result = await Promise.race([interviewPromise, timeoutPromise]) as any;
      
      // Debug: Check if referenceQuestionIds are in the result
      console.log('Interview agent result received');
      console.log('  Has referenceQuestionIds?', 'referenceQuestionIds' in result);
      if (result.referenceQuestionIds) {
        console.log('  Reference Question IDs:', result.referenceQuestionIds);
      } else {
        console.log('  ⚠️ No referenceQuestionIds in result');
      }
      
      const newFeedback = {
        contentFeedback: result.contentFeedback,
        toneFeedback: result.toneFeedback,
        clarityFeedback: result.clarityFeedback,
        visualFeedback: result.visualFeedback,
        
        // Presentation scoring (1-5 scale)
        physicalAppearanceScore: result.physicalAppearanceScore,
        physicalAppearanceJustification: result.physicalAppearanceJustification,
        bodyLanguageScore: result.bodyLanguageScore,
        bodyLanguageJustification: result.bodyLanguageJustification,
        confidenceScore: result.confidenceScore,
        confidenceJustification: result.confidenceJustification,
        
        // Response scoring (1-10 scale)
        ideasScore: result.ideasScore,
        ideasJustification: result.ideasJustification,
        organizationScore: result.organizationScore,
        organizationJustification: result.organizationJustification,
        accuracyScore: result.accuracyScore,
        accuracyJustification: result.accuracyJustification,
        voiceScore: result.voiceScore,
        voiceJustification: result.voiceJustification,
        grammarScore: result.grammarScore,
        grammarJustification: result.grammarJustification,
        stopWordsScore: result.stopWordsScore,
        stopWordsJustification: result.stopWordsJustification,
        overallScore: result.overallScore,
      };
      
      // Determine if this is a real interview question or a general question
      // General questions include greetings, area selection, and procedural questions
      // A question is real if it's not a general question AND the interview agent provided scoring
      const isRealQuestion = !isGeneralQuestion && (result as any).overallScore !== undefined;
      
      // If this is a general question, we should not show scores for it
      const feedbackWithScores = isRealQuestion ? {
        ...newFeedback,
        isDisqualified: (result as any).isDisqualified
      } : {
        ...newFeedback,
        ideasScore: 0,
        ideasJustification: "",
        organizationScore: 0,
        organizationJustification: "",
        accuracyScore: 0,
        accuracyJustification: "",
        voiceScore: 0,
        voiceJustification: "",
        grammarScore: 0,
        grammarJustification: "",
        stopWordsScore: 0,
        stopWordsJustification: "",
        overallScore: 0,
        isDisqualified: (result as any).isDisqualified
      };
      
      // Simplified flow - no retries, hints, or explanations
      const isCorrect = (result as any).isCorrectAnswer;
      
      // Always move to next question - no retries
      setCurrentQuestionAttempts(0);
      setCurrentQuestionHints([]);
      
      // Check if the next question is a current affairs question and store metadata
      if ((result as any).isNextQuestionCurrentAffairs) {
        setCurrentAffairsMetadata({
          topic: (result as any).nextQuestionCurrentAffairsTopic || '',
          category: (result as any).nextQuestionCurrentAffairsCategory || '',
        });
        console.log(`Next question is current affairs: Topic="${(result as any).nextQuestionCurrentAffairsTopic}", Category="${(result as any).nextQuestionCurrentAffairsCategory}"`);
      }
      
      // Log reference question IDs for debugging
      if ((result as any).referenceQuestionIds && (result as any).referenceQuestionIds.length > 0) {
        console.log('📚 Reference Question IDs received from AI:', (result as any).referenceQuestionIds);
      }
      
      // Determine response type based on speech vs manual edits
      let responseType: 'spoken' | 'typed' | 'mixed' = 'typed'; // Default to typed
      if (interviewMode === 'voice') {
        // In voice mode, check if response was primarily spoken or typed
        const totalUpdates = speechUpdateCount.current + manualEditCount.current;
        if (totalUpdates === 0) {
          // No updates tracked, default based on mode
          responseType = 'typed';
        } else if (speechUpdateCount.current > 0 && manualEditCount.current === 0) {
          responseType = 'spoken';
        } else if (speechUpdateCount.current === 0 && manualEditCount.current > 0) {
          responseType = 'typed';
        } else {
          // Both speech and manual edits occurred
          responseType = 'mixed';
        }
      } else {
        // In text mode, always typed
        responseType = 'typed';
      }
      
      console.log('Response type determined:', {
        responseType,
        speechUpdates: speechUpdateCount.current,
        manualEdits: manualEditCount.current,
        interviewMode
      });
      
      const newInterviewData = [...interviewData, {
        question: currentQuestion!,
        answer: currentAnswer,
        isRealQuestion: isRealQuestion,
        responseType: responseType, // Store response type
        attempts: currentQuestionAttempts + 1,
        hintsGiven: currentQuestionHints,
        isCorrect: isCorrect,
        questionCategory: result.questionCategory,
        isCurrentAffairs: currentAffairsMetadata !== null,
        currentAffairsTopic: currentAffairsMetadata?.topic,
        currentAffairsCategory: currentAffairsMetadata?.category,
        referenceQuestionIds: (result as any).referenceQuestionIds || [], // Store reference question IDs
        feedback: feedbackWithScores
      }];
      console.log('💾 Storing interview data with reference IDs:', newInterviewData[newInterviewData.length - 1].referenceQuestionIds);
      console.log('Interview data state update:', {
        previousCount: interviewData.length,
        newCount: newInterviewData.length,
        newItem: {
          question: newInterviewData[newInterviewData.length - 1].question?.substring(0, 50) + '...',
          answer: newInterviewData[newInterviewData.length - 1].answer?.substring(0, 50) + '...',
          hasFeedback: !!newInterviewData[newInterviewData.length - 1].feedback,
          overallScore: newInterviewData[newInterviewData.length - 1].feedback?.overallScore
        }
      });
      setInterviewData(newInterviewData);
      
      // Save interview data to localStorage for reliable retrieval on page unload
      if (typeof window !== 'undefined' && sessionToken) {
        try {
          localStorage.setItem('interviewData', JSON.stringify(newInterviewData));
        } catch (e) {
          console.warn('Failed to save interview data to localStorage:', e);
        }
      }
      
      // Clear current affairs metadata after storing
      if (currentAffairsMetadata) {
        setCurrentAffairsMetadata(null);
      }

      // Increment questions answered counter for real questions
      let updatedQuestionsAnswered = questionsAnswered;
      if (isRealQuestion) {
        updatedQuestionsAnswered = questionsAnswered + 1;
        setQuestionsAnswered(updatedQuestionsAnswered);
      }

      // Check if we've reached the configured question limit BEFORE adding next question to conversation log
      const shouldAutoEndInterview = configuredQuestionLimit > 0 && updatedQuestionsAnswered >= configuredQuestionLimit;
      
      if (shouldAutoEndInterview) {
        console.log(`Configured question limit reached: ${updatedQuestionsAnswered}/${configuredQuestionLimit}. Ending interview automatically.`);
        
        // Save the interview summary
        saveInterviewSummary(newInterviewData);
        
        // Complete token-based session if applicable
        let redirectUrl = '/summary'; // Default redirect for non-token sessions
        if (sessionToken) {
          const resultsData = {
            interviewData: newInterviewData,
            summary: getInterviewSummary(),
            timestamp: new Date().toISOString()
          };
          try {
            const response = await fetch(`/api/interview/complete/${sessionToken}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                resultsJson: resultsData,
                interviewData: newInterviewData // Include interview data for transcripts
              })
            });
            const data = await response.json();
            if (data.success) {
              console.log('Token-based session completed successfully');
              // Use redirectUrl from API response if provided (for email-based interviews)
              if (data.redirectUrl) {
                redirectUrl = data.redirectUrl;
              }
            } else {
              console.error('Failed to complete token session:', data.error);
            }
          } catch (error) {
            console.error('Error completing token session:', error);
          }
        }
        
        // Set final message and add it to conversation log (don't add the next question)
        const finalMessage = `Thank you for completing the interview! You've answered all ${configuredQuestionLimit} questions. Your performance summary is being prepared.`;
        setCurrentQuestion(finalMessage);
        setConversationLog(prev => [...prev, { speaker: 'ai', text: finalMessage }]);
        setConversationState('finished');
        
        // Stop any playing TTS audio
        if (currentAudioRef.current) {
          currentAudioRef.current.pause();
          currentAudioRef.current.currentTime = 0;
          currentAudioRef.current = null;
          isTTSPlaying.current = false;
        }
        
        stopCamera();
        // Give the user a moment to see the final message before redirecting
        setTimeout(() => {
            router.push(redirectUrl);
        }, 4000);
        
        return; // Exit early to prevent further processing
      }

      // Only add the next question to conversation log if interview is not ending
      // Simply add the next question to conversation log without explanations
      // Prevent duplicate greetings - check if the next question is already in conversationLog
      setConversationLog(prev => {
        const nextQuestion = (result as any).nextQuestion;
        
        // Check if this question already exists in the conversation log (prevent duplicate greetings)
        const isExactDuplicate = prev.some(entry => 
          entry.speaker === 'ai' && 
          entry.text === nextQuestion
        );
        if (isExactDuplicate) {
          console.log('Skipping exact duplicate question in conversation log:', nextQuestion.substring(0, 50));
          return prev;
        }
        
        // Also check if this is a greeting and we already have a greeting in the conversation
        // This prevents duplicate greetings even if the wording is slightly different
        const nextQuestionLower = nextQuestion.toLowerCase();
        const isGreeting = nextQuestionLower.includes('welcome to') || 
                          (nextQuestionLower.includes('hello') && nextQuestionLower.includes('tina')) ||
                          (nextQuestionLower.includes('are you ready') && nextQuestionLower.includes('begin'));
        
        if (isGreeting) {
          const hasExistingGreeting = prev.some(entry => {
            if (entry.speaker !== 'ai') return false;
            const entryText = entry.text.toLowerCase();
            return entryText.includes('welcome to') || 
                   (entryText.includes('hello') && entryText.includes('tina')) ||
                   (entryText.includes('are you ready') && entryText.includes('begin'));
          });
          
          if (hasExistingGreeting) {
            console.log('Skipping duplicate greeting in conversation log:', nextQuestion.substring(0, 50));
            return prev;
          }
        }
        
        return [...prev, { speaker: 'ai', text: nextQuestion }];
      });

      if ((result as any).isInterviewOver) {
        // Check if minimum questions were answered before saving summary
        let redirectUrl = '/summary'; // Default redirect for non-token sessions
        if (questionsAnswered >= minQuestionsRequired || (result as any).isDisqualified) {
          saveInterviewSummary(newInterviewData);
          
          // Complete token-based session if applicable
          if (sessionToken) {
            const resultsData = {
              interviewData: newInterviewData,
              summary: getInterviewSummary(),
              timestamp: new Date().toISOString()
            };
            try {
              const response = await fetch(`/api/interview/complete/${sessionToken}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  resultsJson: resultsData
                })
              });
              const data = await response.json();
              if (data.success) {
                console.log('Token-based session completed successfully');
                // Use redirectUrl from API response if provided (for email-based interviews)
                if (data.redirectUrl) {
                  redirectUrl = data.redirectUrl;
                }
              } else {
                console.error('Failed to complete token session:', data.error);
              }
            } catch (error) {
              console.error('Error completing token session:', error);
            }
          }
        }
        setCurrentQuestion((result as any).nextQuestion);
        setConversationState('finished');
        
        // Clear proctoring mode so user can choose again for next interview
        clearProctoringMode();
        
        // Stop any playing TTS audio
        if (currentAudioRef.current) {
          currentAudioRef.current.pause();
          currentAudioRef.current.currentTime = 0;
          currentAudioRef.current = null;
          isTTSPlaying.current = false; // Mark TTS as no longer playing
        }
        
        stopCamera();
        // Give the user a moment to see the final message before redirecting
        setTimeout(() => {
            router.push(redirectUrl);
        }, 4000);
      } else {
        // Clear transcript immediately after successful processing
        clearTranscript();
        
        setCurrentQuestion((result as any).nextQuestion);
      }

    } catch (error) {
      console.error('Error processing interview response:', error);
      
      // Show user-friendly error message
      const errorMessage = error instanceof Error && error.message.includes('timeout') 
        ? 'The AI is taking longer than expected. Please try again.'
        : 'There was an issue generating the response. Please try again.';
      
      // Don't show toast for response generation errors to avoid frontend popups
      // Errors are still logged to console for debugging
      // toast({
      //   variant: "destructive",
      //   title: "Response Generation Issue",
      //   description: errorMessage,
      // });
      
      // Add error message to conversation log
      setConversationLog(prev => [...prev, { 
        speaker: 'ai', 
        text: `I apologize, but ${errorMessage.toLowerCase()}. Let's continue with the interview. ${currentQuestion || 'Please provide your answer to proceed.'}` 
      }]);
      
      // Don't clear transcript on error - allow user to retry with same answer
      // Instead, keep the current question and allow resubmission
      // This prevents getting stuck when there's a temporary error
      
      // Reset conversation state to allow retry
      setConversationState(interviewMode === 'voice' ? 'listening' : 'idle');
      
      // If we have a current question, keep it so user can retry
      // If we don't have a current question, set a fallback question
      if (!currentQuestion) {
        // Generate a fallback question based on interview type
        const fallbackQuestion = isEmailInterview 
          ? "Let's continue. Can you tell me more about yourself?"
          : "Let's continue with the interview. Please share your thoughts.";
        setCurrentQuestion(fallbackQuestion);
      }
    } finally {
      lastResultIndex.current = 0;
    }
  };

  // Debug conversation state changes
  useEffect(() => {
    console.log('Conversation state changed to:', conversationState);
  }, [conversationState]);

  // Debug interview mode changes
  useEffect(() => {
    console.log('Interview mode changed to:', interviewMode);
  }, [interviewMode]);


  useEffect(() => {
    // This effect runs once to set up the whole session.
    const setupInterview = async () => {
        console.log('Setting up interview...');
        
        // Initialize manual editing tracking
        window.lastManualEdit = undefined;
        
        // Initialize transcript for new interview
        setTranscript("");
        transcriptRef.current = "";
        
        // Start interview session to prevent reload restart
        startInterviewSession();
        
        // 1. Get core data. For token-based sessions, use sessionData if available
        const mode = getInterviewMode();
        const storedQuestionsData = getQuestions();
        let storedResumeAnalysis = getResumeAnalysis();
        const videoIsEnabled = getVideoPreference();

        // For token-based interviews, use resume analysis from sessionData if available
        if (sessionToken && sessionData?.resumeAnalysis) {
          console.log('Using resume analysis from session data');
          storedResumeAnalysis = sessionData.resumeAnalysis;
          // Save to localStorage for consistency with interview flow
          saveResumeAnalysis(sessionData.resumeAnalysis);
        }

        console.log('=== INTERVIEW SETUP DEBUG ===');
        console.log('Interview data:', { mode, storedQuestionsData, storedResumeAnalysis, videoIsEnabled, hasSessionData: !!sessionData });
        
        // Detailed debug
        if (typeof window !== 'undefined') {
            console.log('LocalStorage contents:');
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const value = localStorage.getItem(key!);
                console.log(`${key}: ${value?.substring(0, 100)}${value && value.length > 100 ? '...' : ''}`);
            }
        }

        if ((!mode || !storedQuestionsData || !storedResumeAnalysis) && !sessionToken) {
            console.log('Missing preparation data');
            console.log('Missing data details:', { 
                mode: mode ? 'present' : 'missing',
                storedQuestionsData: storedQuestionsData ? 'present' : 'missing',
                storedResumeAnalysis: storedResumeAnalysis ? 'present' : 'missing'
            });
            
            // TEMPORARY: For debugging, let's create mock data if not found
            console.log('Creating mock data for testing...');
            setInterviewMode('voice');
            setCandidateName('Test User');
            setResumeText('Test resume content');
            setLanguage('en-US');
            setLanguageName('English');
            setJobRole('neet');
            setCompany('NEET');
            setCollege('Medical College');
            
            // Set minimum questions for mock data
            const minQuestions = getMinQuestionsForExam('neet');
            setMinQuestionsRequired(minQuestions);
            
            // Load exam configuration if available (though unlikely with mock data)
            const examConfig = getExamConfig();
            if (examConfig && examConfig.numQuestions > 0) {
                console.log(`Exam configuration loaded: ${examConfig.numQuestions} questions`);
                setConfiguredQuestionLimit(examConfig.numQuestions);
            } else {
                setConfiguredQuestionLimit(0); // No limit
            }
            
            // Set default greeting and continue with interview
            const defaultGreeting = `Hello Test User, I am Tina, welcome to the Aigenthix AI Powered Coach interview prep. Let\'s start with a NEET preparation question.`;
            setCurrentQuestion(defaultGreeting);
            setConversationState('listening');
            
            // Mark session as started now that interview is fully initialized
            markSessionAsStarted();
            
            console.log('Mock data created, starting interview...');
            return;
        }

        // 2. Set up component state from stored data or session token data.
        if (sessionToken && storedResumeAnalysis) {
          // Minimal bootstrap for token flow
          setInterviewMode('voice');
          const { candidateName, skills, experienceSummary, comprehensiveResumeText } = storedResumeAnalysis;
          // Prioritize sessionData name (used in email) over resume analysis name
          const sessionCandidateName = sessionData?.first_name && sessionData?.last_name 
            ? `${sessionData.first_name} ${sessionData.last_name}`.trim()
            : null;
          setCandidateName(sessionCandidateName || candidateName || 'Candidate');
          // Use comprehensive resume text if available (from DB analysis), otherwise fallback to basic
          setResumeText(comprehensiveResumeText || `${skills.join(', ')}\n\n${experienceSummary}`);
          setLanguage('en-US');
          setLanguageName('English');
          // Derive job role from sessionData if present, else fallback
          const derivedJob = sessionData?.exam_name || 'General Interview';
          setJobRole(derivedJob.toLowerCase());
          setCompany(sessionData?.subcategory_name || '');
          setCollege('');
        } else if (storedResumeAnalysis && storedQuestionsData) {
          setInterviewMode(mode);
          const { candidateName, skills, experienceSummary, comprehensiveResumeText } = storedResumeAnalysis;
          const { language, jobRole, company, college } = storedQuestionsData;
          const langCode = getLanguageCode(language);
          setCandidateName(candidateName);
          // Use comprehensive resume text if available (from DB analysis), otherwise fallback to basic
          setResumeText(comprehensiveResumeText || `${skills.join(', ')}\n\n${experienceSummary}`);
          setLanguage(langCode);
          setLanguageName(language);
          setJobRole(jobRole);
          setCompany(company);
          setCollege(college || '');
        }

        // Set minimum questions based on exam type
        // For email interviews with session tokens, use sessionData directly as state hasn't updated yet
        let derivedJobRole = '';
        let derivedCompany = '';
        
        if (sessionToken && sessionData) {
          // Email interview: use sessionData values
          derivedJobRole = sessionData?.exam_name?.toLowerCase() || 'interview';
          derivedCompany = sessionData?.subcategory_name || '';
        } else if (storedQuestionsData) {
          // Regular interview: use stored questions data
          derivedJobRole = storedQuestionsData.jobRole;
          derivedCompany = storedQuestionsData.company;
        }
        
        const minQuestions = getMinQuestionsForExam(derivedJobRole, derivedCompany, sessionData?.subcategory_name);
        console.log(`Setting minQuestionsRequired: ${minQuestions} for jobRole: ${derivedJobRole}, company: ${derivedCompany}, subcategory: ${sessionData?.subcategory_name}`);
        setMinQuestionsRequired(minQuestions);
        
        // For email interviews without exam config, set configuredQuestionLimit based on interview type
        // This ensures HR interviews always have 10 questions even when exam-config API is disabled
        const examConfig = getExamConfig();
        if (examConfig && examConfig.numQuestions > 0) {
            console.log(`Exam configuration loaded: ${examConfig.numQuestions} questions for ${examConfig.examName} - ${examConfig.subcategoryName}`);
            setConfiguredQuestionLimit(examConfig.numQuestions);
        } else if (sessionToken && minQuestions > 0) {
            // For email interviews, use minQuestions as the configured limit
            console.log(`No exam config, using minQuestionsRequired as limit: ${minQuestions}`);
            setConfiguredQuestionLimit(minQuestions);
        } else {
            console.log('No exam configuration found or no limit set');
            setConfiguredQuestionLimit(0); // No limit
        }

        // 3. Get the initial question.
        // Ensure candidateName is set before generating greeting
        // Prioritize sessionData name (used in email) over resume analysis name
        const sessionCandidateName = sessionData?.first_name && sessionData?.last_name 
          ? `${sessionData.first_name} ${sessionData.last_name}`.trim()
          : null;
        let finalCandidateName = candidateName || sessionCandidateName;
        if (!finalCandidateName && storedResumeAnalysis) {
          finalCandidateName = storedResumeAnalysis.candidateName || 'Candidate';
        }
        if (!finalCandidateName && sessionData?.resumeAnalysis) {
          finalCandidateName = sessionData.resumeAnalysis.candidateName || 'Candidate';
        }
        if (!finalCandidateName) {
          finalCandidateName = 'Candidate';
        }
        
        const defaultGreeting = `Hello ${finalCandidateName}, I am Tina, welcome to the Aigenthix AI Powered Coach interview prep. You look ready and focused for our session today. Are you ready to begin?`;

        if (mode !== 'voice' || !videoIsEnabled) {
            console.log('Using fallback greeting (no voice or video)');
            setHasCameraPermission(false);
            setCurrentQuestion(defaultGreeting);
            
            // Set conversation state to 'speaking' first (will be set to 'listening' after TTS completes)
            // This prevents listening from starting before the greeting is spoken
            if (mode === 'voice') {
                setConversationState('speaking');
                console.log('Interview setup complete (fallback), conversation state set to: speaking (will switch to listening after greeting)');
                
                // Explicitly trigger speak for the greeting after state is set
                // Use setTimeout to ensure state updates are processed and refs are synced
                setTimeout(() => {
                    console.log('Triggering speak for fallback greeting, current state:', conversationState, 'ref:', conversationStateRef.current);
                    // Ensure we're not blocked by ref check - force speak for initial greeting
                    if (!lastSpokenQuestion.current || lastSpokenQuestion.current === '') {
                        speak(defaultGreeting);
                    } else {
                        console.log('Greeting already spoken, skipping');
                    }
                }, 200);
            } else {
                setConversationState('idle');
                console.log('Interview setup complete (fallback), conversation state set to: idle');
            }
            
            // Mark session as started now that interview is fully initialized
            markSessionAsStarted();
            return;
        }

        // We are in voice mode with video enabled. Try to get camera permissions.
        // SEPARATE camera access from icebreaker generation to avoid false camera errors
        let cameraStream: MediaStream | null = null;
        let videoFrameDataUri: string | undefined = undefined;
        let cameraAccessSuccessful = false;

        // Step 1: Try to get camera access (separate try-catch)
        try {
            // Check if getUserMedia is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera API not supported in this browser');
            }

            console.log('Attempting to access camera...');
            cameraStream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            });
            
            console.log('Camera access successful, stream obtained');
            cameraAccessSuccessful = true;
            setHasCameraPermission(true);
            cameraPermissionGrantedTimeRef.current = Date.now();
            setGracePeriodPassed(false);
            
            // Set grace period timeout
            setTimeout(() => {
                setGracePeriodPassed(true);
            }, 2000);
            
            if (videoRef.current && cameraStream) {
                videoRef.current.srcObject = cameraStream;
                
                // Check if video tracks are active - this is the most reliable indicator
                const videoTracks = cameraStream.getVideoTracks();
                const hasActiveVideoTrack = videoTracks.length > 0 && videoTracks.some(track => track.readyState === 'live' && track.enabled);
                
                // If we have active tracks, the camera is working regardless of video element state
                if (hasActiveVideoTrack) {
                    console.log('Video stream has active tracks - camera is working');
                    setHasActiveVideoStream(true);
                }
                
                // Set up event listeners to track video playing state
                const video = videoRef.current;
                
                // Force play the video to ensure it starts
                video.play().catch((error) => {
                    console.warn('Video autoplay prevented or failed:', error);
                    // Even if play() fails, if tracks are active, camera is working
                    if (hasActiveVideoTrack) {
                        setHasActiveVideoStream(true);
                    }
                });
                
                // Initial check after a short delay to see if video starts playing automatically
                setTimeout(() => {
                    if (videoRef.current) {
                        const isPlaying = videoRef.current.readyState >= 2 && !videoRef.current.paused && videoRef.current.currentTime > 0;
                        if (isPlaying) {
                            console.log('Video is playing automatically');
                            setIsVideoPlaying(true);
                        }
                        // Also check stream tracks as fallback
                        const tracks = cameraStream?.getVideoTracks() || [];
                        const tracksActive = tracks.length > 0 && tracks.some(track => track.readyState === 'live' && track.enabled);
                        if (tracksActive) {
                            setHasActiveVideoStream(true);
                        }
                    }
                }, 500);
                
                const handlePlaying = () => {
                    console.log('Video started playing');
                    setIsVideoPlaying(true);
                };
                
                const handlePause = () => {
                    console.log('Video paused');
                    setIsVideoPlaying(false);
                };
                
                const handleEnded = () => {
                    console.log('Video ended');
                    setIsVideoPlaying(false);
                };
                
                // Monitor stream track state changes
                const checkTrackState = () => {
                    if (!videoRef.current || !cameraStream) return;
                    const tracks = cameraStream.getVideoTracks();
                    const isActive = tracks.length > 0 && tracks.some(track => track.readyState === 'live' && track.enabled);
                    const video = videoRef.current;
                    const isCurrentlyPlaying = !video.paused && video.readyState >= 2 && video.currentTime > 0;
                    
                    // Update stream state based on track status (most reliable)
                    setHasActiveVideoStream(isActive);
                    
                    if (!isActive) {
                        console.log('Video track became inactive');
                        setIsVideoPlaying(false);
                    } else if (isActive && !isCurrentlyPlaying && video.readyState >= 2) {
                        console.log('Video track is active but not playing, attempting to play');
                        video.play().then(() => {
                            setIsVideoPlaying(true);
                        }).catch((error) => {
                            console.error('Error playing video in checkTrackState:', error);
                            // Even if play fails, if tracks are active, camera is working
                            if (isActive) {
                                setHasActiveVideoStream(true);
                            }
                        });
                    } else if (isActive && isCurrentlyPlaying) {
                        setIsVideoPlaying(true);
                        setHasActiveVideoStream(true);
                    }
                };
                
                const handleLoadedMetadata = () => {
                    console.log('Video metadata loaded');
                    // Check if video tracks are still active
                    const tracks = cameraStream?.getVideoTracks() || [];
                    const hasActiveTrack = tracks.length > 0 && tracks.some(track => track.readyState === 'live' && track.enabled);
                    
                    // Update stream state - if tracks are active, camera is working
                    setHasActiveVideoStream(hasActiveTrack);
                    
                    // Check if video is actually playing
                    if (video.readyState >= 2 && hasActiveTrack) {
                        // Try to play the video
                        video.play().then(() => {
                            console.log('Video play() succeeded');
                            // Double-check that video is actually playing
                            setTimeout(() => {
                                if (videoRef.current && !videoRef.current.paused && videoRef.current.readyState >= 2) {
                                    setIsVideoPlaying(true);
                                    setHasActiveVideoStream(true);
                                } else {
                                    console.log('Video play() succeeded but video is not actually playing');
                                    // Even if video element isn't playing, if tracks are active, camera is working
                                    if (hasActiveTrack) {
                                        setHasActiveVideoStream(true);
                                    }
                                    checkTrackState();
                                }
                            }, 100);
                        }).catch((error) => {
                            console.error('Error playing video:', error);
                            // Even if play fails, if tracks are active, camera is working
                            if (hasActiveTrack) {
                                setHasActiveVideoStream(true);
                            }
                        });
                    } else {
                        console.log('Video metadata loaded but tracks are not active or readyState < 2');
                        checkTrackState();
                    }
                };
                
                video.addEventListener('playing', handlePlaying);
                video.addEventListener('pause', handlePause);
                video.addEventListener('ended', handleEnded);
                video.addEventListener('loadedmetadata', handleLoadedMetadata);
                
                // Define named track event listener functions for proper cleanup
                const onTrackEnded = () => {
                    console.log('Video track ended');
                    setIsVideoPlaying(false);
                    setHasActiveVideoStream(false);
                };
                
                const onTrackMuted = () => {
                    console.log('Video track muted');
                    // Muted tracks are still active, just not sending video
                    checkTrackState();
                };
                
                const onTrackUnmuted = () => {
                    console.log('Video track unmuted');
                    checkTrackState();
                };
                
                // Store track references for cleanup
                const tracksWithListeners = [...videoTracks];
                
                // Monitor track state changes
                tracksWithListeners.forEach(track => {
                    track.addEventListener('ended', onTrackEnded);
                    track.addEventListener('mute', onTrackMuted);
                    track.addEventListener('unmute', onTrackUnmuted);
                });
                
                // Periodic check for track state (fallback)
                const trackCheckInterval = setInterval(() => {
                    checkTrackState();
                }, 1000);
                
                // Cleanup interval on component unmount
                const originalCleanup = () => {
                    // Clear interval
                    if (trackCheckInterval) {
                        clearInterval(trackCheckInterval);
                    }
                    
                    // Remove video element event listeners
                    video.removeEventListener('playing', handlePlaying);
                    video.removeEventListener('pause', handlePause);
                    video.removeEventListener('ended', handleEnded);
                    video.removeEventListener('loadedmetadata', handleLoadedMetadata);
                    
                    // Remove track event listeners from all tracks
                    tracksWithListeners.forEach(track => {
                        if (track) {
                            track.removeEventListener('ended', onTrackEnded);
                            track.removeEventListener('mute', onTrackMuted);
                            track.removeEventListener('unmute', onTrackUnmuted);
                        }
                    });
                    
                    // Clear track references to avoid retained closures
                    tracksWithListeners.splice(0);
                };
                
                // Store cleanup function for later use
                (videoRef.current as any)._videoCleanup = originalCleanup;

                // Wait for video metadata to load
                await new Promise(resolve => {
                    if (videoRef.current) {
                        videoRef.current.onloadedmetadata = () => resolve(true);
                        // Add timeout to prevent hanging
                        setTimeout(() => resolve(true), 5000);
                    } else {
                        resolve(true);
                    }
                });
                await new Promise(resolve => setTimeout(resolve, 1500));

                // Capture video frame if camera is working (wrap in try-catch to prevent errors from affecting camera status)
                if (cameraAccessSuccessful && cameraStream) {
                    try {
                        videoFrameDataUri = captureVideoFrame();
                        console.log('Video frame captured successfully');
                    } catch (frameError) {
                        // Frame capture failed, but camera is still working
                        console.warn('Failed to capture video frame (camera is still working):', frameError);
                        videoFrameDataUri = undefined;
                        // Don't throw - camera stream is still active
                    }
                }
            } else {
                // Video ref is null but stream was obtained - camera is still working
                console.warn('Video ref is null, but camera stream was obtained successfully');
                setHasActiveVideoStream(true);
            }
        } catch (cameraError: any) {
            // Camera access failed - handle separately
            // Only log as warning, not error, since we handle this gracefully
            cameraAccessSuccessful = false;
            setHasCameraPermission(false);
            setIsVideoPlaying(false);
            setHasActiveVideoStream(false);
            setGracePeriodPassed(true);
            
            // Provide more specific error information for camera errors only
            let errorMessage = 'Could not access camera. Video analysis is disabled.';
            if (cameraError?.name === 'NotAllowedError' || cameraError?.name === 'PermissionDeniedError') {
                errorMessage = 'Camera permission denied. Video analysis is disabled. You can continue the interview without video.';
            } else if (cameraError?.name === 'NotFoundError' || cameraError?.name === 'DevicesNotFoundError') {
                errorMessage = 'No camera found. Video analysis is disabled. You can continue the interview without video.';
            } else if (cameraError?.name === 'NotReadableError' || cameraError?.name === 'TrackStartError') {
                errorMessage = 'Camera is already in use by another application. Video analysis is disabled.';
            } else if (cameraError?.name === 'OverconstrainedError') {
                errorMessage = 'Camera does not support required settings. Video analysis is disabled.';
            } else if (cameraError?.message?.includes('not supported')) {
                errorMessage = 'Camera API not supported in this browser. Video analysis is disabled.';
            }
            
            // Log as warning, not error, to avoid showing error overlay
            console.warn(`Camera access failed (interview will continue without video): ${errorMessage}`);
            console.warn('Camera error details:', {
                name: cameraError?.name,
                message: cameraError?.message,
            });
            // Continue with interview without video - this is expected behavior
        }

        // Step 2: Generate icebreaker question (separate try-catch, independent of camera status)
        // Ensure candidateName is set before generating greeting
        // Reuse sessionCandidateName from above (line 2574)
        finalCandidateName = candidateName || sessionCandidateName;
        if (!finalCandidateName && storedResumeAnalysis) {
          finalCandidateName = storedResumeAnalysis.candidateName || 'Candidate';
        }
        if (!finalCandidateName && sessionData?.resumeAnalysis) {
          finalCandidateName = sessionData.resumeAnalysis.candidateName || 'Candidate';
        }
        if (!finalCandidateName) {
          finalCandidateName = 'Candidate';
        }

        let greetingText = defaultGreeting;
        try {
            console.log('Generating icebreaker question...');
            const result = await generateIceBreakerQuestion({
                candidateName: finalCandidateName,
                videoFrameDataUri: cameraAccessSuccessful ? videoFrameDataUri : undefined,
                language,
            });
            console.log('Icebreaker result:', result);
            greetingText = result.question;
            setCurrentQuestion(result.question);
        } catch (icebreakerError: any) {
            // Icebreaker generation failed - this is NOT a camera error
            // Log as warning, not error, since we have a fallback
            console.warn('Error generating icebreaker question (using fallback greeting - this is NOT a camera error):', icebreakerError);
            // Use fallback greeting
            greetingText = defaultGreeting;
            setCurrentQuestion(defaultGreeting);
            // Do NOT set camera permission to false - camera might be working fine
            // The camera stream was obtained successfully, so camera is working
        }
        
        // Set conversation state to 'speaking' first (will be set to 'listening' after TTS completes)
        // This prevents listening from starting before the greeting is spoken
        if (mode === 'voice') {
            setConversationState('speaking');
            console.log('Interview setup complete, conversation state set to: speaking (will switch to listening after greeting)');
            
            // Explicitly trigger speak for the greeting after state is set
            // Use setTimeout to ensure state updates are processed and refs are synced
            setTimeout(() => {
                console.log('Triggering speak for greeting:', greetingText.substring(0, 50), 'current state:', conversationState, 'ref:', conversationStateRef.current);
                // Ensure we're not blocked by ref check - force speak for initial greeting
                if (!lastSpokenQuestion.current || lastSpokenQuestion.current === '') {
                    speak(greetingText);
                } else {
                    console.log('Greeting already spoken, skipping');
                }
            }, 200);
        } else {
            setConversationState('idle');
            console.log('Interview setup complete, conversation state set to: idle');
        }
        
        // Mark session as started now that interview is fully initialized
        markSessionAsStarted();
    };

    setupInterview().catch(error => {
        console.error('Error in setupInterview:', error);
        // Don't show toast for setup errors to avoid frontend popups
        // Errors are still logged to console for debugging
        // toast({ variant: "destructive", title: "Setup Error", description: "Failed to set up interview. Please try again." });
    });

    return () => {
      shouldBeListening.current = false;
      stopCamera();
      stopAssemblyRealtime();
      resetAssemblyTranscripts();
      lastTranscriptFromNative.current = '';
      
      // Stop any playing TTS audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current = null;
        isTTSPlaying.current = false; // Mark TTS as no longer playing
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const speak = async (text: string) => {
    console.log('Speak function called with text:', text);
    console.log('Current conversation state:', conversationState);
    console.log('Interview mode:', interviewMode);
    console.log('Is speaker muted:', isSpeakerMuted);
    
    if (!text) return;

    // Prevent multiple simultaneous TTS calls
    // BUT: Allow if this is the initial greeting (lastSpokenQuestion is null or empty)
    // This ensures the greeting can be spoken even if ref is already 'speaking' from state update
    const hasNoSpokenQuestion = !lastSpokenQuestion.current || lastSpokenQuestion.current === '';
    const isInitialGreeting = hasNoSpokenQuestion;
    
    // Also check if we're in loading or speaking state and this is the first question
    const isFirstQuestion = (conversationState === 'loading' || conversationState === 'speaking') && hasNoSpokenQuestion;
    
    if (conversationStateRef.current === 'speaking' && !isInitialGreeting && !isFirstQuestion) {
      console.log('Already speaking, skipping duplicate TTS call. isInitialGreeting:', isInitialGreeting, 'isFirstQuestion:', isFirstQuestion, 'lastSpoken:', lastSpokenQuestion.current);
      return;
    }

    // Prevent speaking the same question multiple times
    if (lastSpokenQuestion.current === text) {
      console.log('Already spoke this question, skipping duplicate');
      return;
    }

    // Additional check to prevent overlapping TTS calls
    if (currentAudioRef.current && !currentAudioRef.current.paused) {
      console.log('Audio is still playing, skipping new TTS call');
      return;
    }

    // Stop any currently playing audio to prevent overlap
    stopAllTTS();

    // Add to conversation log only if not already there
    // Check entire conversation log, not just the last entry, to prevent duplicates
    setConversationLog((prev: ConversationEntry[]) => {
        // Check for exact duplicate
        const isExactDuplicate = prev.some(entry => 
            entry.speaker === 'ai' && entry.text === text
        );
        if (isExactDuplicate) {
            console.log('Skipping exact duplicate in speak():', text.substring(0, 50));
            return prev;
        }
        
        // Also check for greeting duplicates (even if wording is slightly different)
        const isGreeting = text.toLowerCase().includes('welcome to') || 
                          (text.toLowerCase().includes('hello') && text.toLowerCase().includes('tina')) ||
                          (text.toLowerCase().includes('are you ready') && text.toLowerCase().includes('begin'));
        
        if (isGreeting) {
            const hasExistingGreeting = prev.some(entry => {
                if (entry.speaker !== 'ai') return false;
                const entryText = entry.text.toLowerCase();
                return entryText.includes('welcome to') || 
                       (entryText.includes('hello') && entryText.includes('tina')) ||
                       (entryText.includes('are you ready') && entryText.includes('begin'));
            });
            
            if (hasExistingGreeting) {
                console.log('Skipping duplicate greeting in speak():', text.substring(0, 50));
                return prev;
            }
        }
        
        return [...prev, { speaker: 'ai', text }];
    });

    const isVoiceMode = getInterviewMode() === 'voice';
    if (!isVoiceMode || isSpeakerMuted) {
        const nextState = conversationStateRef.current === 'finished' ? 'finished' : (isVoiceMode ? 'listening' : 'idle');
        setConversationState(nextState);
        return;
    }

    setConversationState('speaking');
    isTTSPlaying.current = true; // Mark TTS as playing
    lastSpokenQuestion.current = text; // Track this question as spoken
    
    // Pause AssemblyAI streaming while TTS plays
    console.log('Pausing AssemblyAI streaming for TTS');
    muteMicrophoneForTTS();
    
    try {
      // Process text for better speech pronunciation
      const processedText = processTextForSpeech(text);
      console.log('Making TTS API call for processed text:', processedText);
      
      // Retry logic for TTS API calls
      let response: Response | null = null;
      let audioUrl: string | null = null;
      const maxRetries = 3;
      let lastError: Error | null = null;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          response = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: processedText, language }),
          });
          
          if (response.ok) {
            const data = await response.json();
            audioUrl = data.audioUrl;
            console.log(`TTS API call succeeded on attempt ${attempt + 1}`);
            break;
          } else {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error', retryable: false }));
            lastError = new Error(`TTS request failed: ${errorData.error || response.statusText}`);
            console.warn(`TTS API call failed on attempt ${attempt + 1}:`, lastError.message);
            
            // If it's a client error (4xx) and not retryable, don't retry
            if (response.status >= 400 && response.status < 500 && !errorData.retryable) {
              break;
            }
            
            // If explicitly marked as non-retryable, don't retry
            if (errorData.retryable === false) {
              break;
            }
            
            // Wait before retrying (exponential backoff)
            if (attempt < maxRetries - 1) {
              const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
              console.log(`Retrying TTS in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        } catch (fetchError: any) {
          lastError = fetchError;
          console.warn(`TTS API call error on attempt ${attempt + 1}:`, fetchError.message);
          
          // Wait before retrying (exponential backoff)
          if (attempt < maxRetries - 1) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
            console.log(`Retrying TTS in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // If all retries failed, try browser fallback
      if (!audioUrl) {
        console.warn('All TTS API retries failed, attempting browser fallback');
        try {
          // Use browser's Web Speech API as fallback
          if ('speechSynthesis' in window) {
            // Cancel any existing speech first
            if (speechSynthesis.speaking) {
              speechSynthesis.cancel();
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const utterance = new SpeechSynthesisUtterance(processedText);
            utterance.lang = language || 'en-US';
            utterance.rate = 1;
            utterance.pitch = 1;
            utterance.volume = 1;
            
            // Play using Web Speech API
            speechSynthesis.speak(utterance);
            
            // Wait for speech to complete
            await new Promise<void>((resolve, reject) => {
              utterance.onend = () => {
                console.log('Browser TTS completed');
                resolve();
              };
              utterance.onerror = (error) => {
                console.error('Browser TTS error:', error);
                reject(error);
              };
              
              // Timeout after 30 seconds
              setTimeout(() => {
                speechSynthesis.cancel();
                reject(new Error('Browser TTS timeout'));
              }, 30000);
            });
            
            // Successfully used browser fallback
            isTTSPlaying.current = false;
            unmuteMicrophoneAfterTTS();
            if (conversationStateRef.current !== 'finished') {
              setConversationState(interviewMode === 'voice' ? 'listening' : 'idle');
              if (interviewMode === 'voice' && !isMuted) {
                clearTranscript();
                unmuteMicrophoneAfterTTS();
              }
            }
            return;
          }
        } catch (fallbackError) {
          console.error('Browser TTS fallback also failed:', fallbackError);
        }
        
        // If both API and browser fallback failed, throw error
        throw lastError || new Error('TTS failed after all retries and fallback');
      }
      
      console.log('TTS API response received, audioUrl:', audioUrl);
      const audio = new Audio(audioUrl);
      
      // Store reference to current audio
      currentAudioRef.current = audio;
      
      // Set up event handlers with proper cleanup
      const handleAudioEnd = () => {
        console.log('Audio ended, switching to listening');
        currentAudioRef.current = null;
        isTTSPlaying.current = false; // Mark TTS as no longer playing
        
        // Unmute microphone after TTS ends
        unmuteMicrophoneAfterTTS();
        
        if (conversationStateRef.current !== 'finished') {
          // Set conversation state to listening first
          setConversationState('listening');
          
          // Restart AssemblyAI after TTS ends
          if (interviewMode === 'voice' && !isMuted) {
            clearTranscript();
            unmuteMicrophoneAfterTTS();
          }
        }
      };
      
      const handleAudioError = () => {
        console.log('Audio error, switching to listening');
        currentAudioRef.current = null;
        isTTSPlaying.current = false; // Mark TTS as no longer playing
        
        // Unmute microphone after TTS error
        unmuteMicrophoneAfterTTS();
        
        if (conversationStateRef.current !== 'finished') {
          setConversationState(interviewMode === 'voice' ? 'listening' : 'idle');
          if (interviewMode === 'voice' && !isMuted) {
            clearTranscript();
            unmuteMicrophoneAfterTTS();
          }
        }
      };
      
      audio.onended = handleAudioEnd;
      audio.onerror = handleAudioError;
      
      // Play the audio
      await audio.play();
      console.log('Audio playback started');
      
    } catch (error) {
      console.error('TTS error:', error);
      currentAudioRef.current = null;
      isTTSPlaying.current = false; // Mark TTS as no longer playing
      setConversationState(interviewMode === 'voice' ? 'listening' : 'idle');
      if (interviewMode === 'voice' && !isMuted) {
        clearTranscript();
        unmuteMicrophoneAfterTTS();
      }
    }
  }

  useEffect(() => {
    // Only speak when:
    // 1. We have a current question
    // 2. We're in a state that allows speaking
    // 3. We're not already speaking (check both state and ref to prevent race conditions)
    // 4. This is a new question (not already spoken)
    // Special handling: Include 'speaking' state to handle initial greeting
    if (currentQuestion && (
      conversationState === 'speaking' || 
      conversationState === 'loading' || 
      conversationState === 'thinking' || 
      conversationState === 'finished' || 
      conversationState === 'listening'
    )) {
      // Check if this is the initial greeting (state is 'speaking' and no question has been spoken yet)
      // lastSpokenQuestion can be null or empty string, so check both
      const hasNoSpokenQuestion = !lastSpokenQuestion.current || lastSpokenQuestion.current === '';
      const isInitialGreeting = (conversationState === 'speaking' || conversationState === 'loading') && hasNoSpokenQuestion;
      
      // For initial greeting, we need to speak it even if ref is 'speaking' (because we just set it)
      // For other cases, check that we're not already speaking
      const shouldSpeak = isInitialGreeting 
        ? lastSpokenQuestion.current !== currentQuestion  // For initial greeting, just check if it's a new question
        : conversationStateRef.current !== 'speaking' && lastSpokenQuestion.current !== currentQuestion;  // For others, check both ref and question
      
      if (shouldSpeak) {
        console.log('Triggering speak for question:', currentQuestion.substring(0, 50), 'isInitialGreeting:', isInitialGreeting, 'state:', conversationState, 'ref:', conversationStateRef.current);
        speak(currentQuestion);
        // Reset voice activity timer when a new question is asked
        setLastVoiceActivity(Date.now());
        setHasShownWarning(false);
        setShowVisualWarning(false);
      } else {
        console.log('Skipping speak - shouldSpeak:', shouldSpeak, 'isInitialGreeting:', isInitialGreeting, 'ref state:', conversationStateRef.current, 'lastSpoken:', lastSpokenQuestion.current, 'currentState:', conversationState);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion, conversationState]);

  // Voice warning timer - check every 10 seconds if candidate hasn't spoken for over 30 seconds
  useEffect(() => {
    if (interviewMode !== 'voice' || conversationState === 'finished' || conversationState === 'idle' || conversationState === 'paused') {
      return;
    }

    let warningTimeout: NodeJS.Timeout | null = null;
    let resetTimeout: NodeJS.Timeout | null = null;

    const scheduleVoiceCheck = () => {
      warningTimeout = setTimeout(() => {
        const now = Date.now();
        const timeSinceLastVoice = now - lastVoiceActivity;
        const thirtySeconds = 30 * 1000; // 30 seconds in milliseconds

        if (timeSinceLastVoice > thirtySeconds && !hasShownWarning && conversationState === 'listening') {
          setHasShownWarning(true);
          // setShowVisualWarning(true); // DISABLED
          
          // Speak the warning with emphasis
          const warningMessage = "Please answer the question. I'm waiting for your response.";
          speak(warningMessage);
          
          // Reset the warning after 25 seconds to allow for another warning if needed
          resetTimeout = setTimeout(() => {
            setHasShownWarning(false);
            setShowVisualWarning(false);
          }, 25000); // Increased from 20 seconds
        }
        
        // Schedule next check
        scheduleVoiceCheck();
      }, 10000); // Increased from 5 seconds to reduce frequency
    };

    // Start the check
    scheduleVoiceCheck();

    return () => {
      if (warningTimeout) clearTimeout(warningTimeout);
      if (resetTimeout) clearTimeout(resetTimeout);
    };
  }, [interviewMode, conversationState, lastVoiceActivity, hasShownWarning, speak]);

  // Stop camera when interview is finished
  useEffect(() => {
    if (conversationState === 'finished') {
      stopCamera();
    }
  }, [conversationState]);


  const handleManualSubmit = () => {
    handleSubmit();
  }

  return (
    <div className="w-full max-w-screen overflow-x-hidden">
      <div className="relative grid grid-cols-1 md:grid-cols-4 h-screen max-w-full overflow-hidden p-2 md:p-4 gap-2 md:gap-4">
       {conversationState === 'loading' && (
        <div className="fixed inset-0 bg-background/90 backdrop-blur-sm flex justify-center items-center z-[100]">
          <div className="flex items-center text-lg font-semibold text-primary">
            <Loader className="animate-spin mr-3 h-6 w-6" /> 
            Preparing your interview...
          </div>
        </div>
      )}

      {/* Question Progress Display - Redesigned for clarity */}
      {conversationState !== 'loading' && conversationState !== 'finished' && (minQuestionsRequired > 0 || configuredQuestionLimit > 0) && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[80] pointer-events-none">
          <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200/60 px-5 py-3 pointer-events-auto">
            <div className="flex items-center gap-4">
              {/* Progress Circle - Larger and more prominent */}
              <div className="relative flex items-center justify-center flex-shrink-0">
                <svg className="w-10 h-10 transform -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    fill="none"
                    className="text-slate-200"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 15.5}`}
                    strokeDashoffset={`${2 * Math.PI * 15.5 * (1 - (questionsAnswered / (configuredQuestionLimit > 0 ? configuredQuestionLimit : minQuestionsRequired)))}`}
                    className={cn(
                      "transition-all duration-700 ease-out",
                      questionsAnswered >= (configuredQuestionLimit > 0 ? configuredQuestionLimit : minQuestionsRequired)
                        ? "text-green-500" 
                        : "text-blue-500"
                    )}
                    strokeLinecap="round"
                  />
                </svg>
                <span className={cn(
                  "absolute inset-0 flex items-center justify-center text-sm font-bold",
                  questionsAnswered >= (configuredQuestionLimit > 0 ? configuredQuestionLimit : minQuestionsRequired)
                    ? "text-green-600" 
                    : "text-blue-600"
                )}>
                  {questionsAnswered}
                </span>
              </div>

              {/* Progress Info - Cleaner layout */}
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className={cn(
                    "text-base font-semibold",
                    questionsAnswered >= (configuredQuestionLimit > 0 ? configuredQuestionLimit : minQuestionsRequired)
                      ? "text-green-600" 
                      : "text-slate-800"
                  )}>
                    {questionsAnswered}/{(configuredQuestionLimit > 0 ? configuredQuestionLimit : minQuestionsRequired)}
                  </span>
                  <span className="text-sm text-slate-500 font-medium">questions</span>
                </div>
                {questionsAnswered < (configuredQuestionLimit > 0 ? configuredQuestionLimit : minQuestionsRequired) && (
                  <div className="text-xs text-slate-600 font-medium">
                    {(configuredQuestionLimit > 0 ? configuredQuestionLimit : minQuestionsRequired) - questionsAnswered} more to complete
                  </div>
                )}
                {questionsAnswered >= (configuredQuestionLimit > 0 ? configuredQuestionLimit : minQuestionsRequired) && (
                  <div className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <span>✓</span>
                    <span>Ready for analysis</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Proctoring Mode Indicator - Moved to transcript header to prevent overlap */}

      {/* Voice Activity Warning Banner - DISABLED */}
      {false && showVisualWarning && conversationState === 'listening' && (
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white p-4 text-center font-bold z-[90] animate-pulse shadow-lg border-b-4 border-red-800 ring-4 ring-red-300 ring-opacity-50">
          <div className="flex items-center justify-center gap-3">
            <AlertCircle className="w-6 h-6 animate-bounce text-red-200" />
            <span className="text-lg font-extrabold tracking-wide">⚠️ Please answer the question. I'm waiting for your response. ⚠️</span>
            <AlertCircle className="w-6 h-6 animate-bounce text-red-200" />
          </div>
        </div>
      )}

      {/* Navigation Warning Modal - DISABLED */}
      {false && showNavigationWarning && (
        <div className="fixed inset-0 bg-background/90 backdrop-blur-sm flex justify-center items-center z-[100]">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4 border border-red-200">
            <div className="flex items-center mb-4">
              <AlertCircle className="w-8 h-8 text-red-500 mr-3" />
              <h3 className="text-lg font-semibold text-red-700">Navigation Warning</h3>
            </div>
            <p className="text-gray-700 mb-6">
              You're about to leave the interview. This will:
            </p>
            <ul className="text-sm text-gray-600 mb-6 space-y-2">
              <li>• Stop your camera and microphone</li>
              <li>• Lose all interview progress</li>
              <li>• End the current session</li>
            </ul>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={handleStayInInterview}
                className="flex-1"
              >
                Stay in Interview
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleLeaveInterview}
                className="flex-1"
              >
                Leave Interview
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Left Panel */}
      <div className="md:col-span-2 bg-white/70 rounded-2xl shadow-lg p-4 flex flex-col text-center min-w-0 overflow-hidden">
        <div className="flex-1 flex flex-col justify-start pt-1">
                        {interviewMode === 'voice' && getVideoPreference() ? (
            <div className="w-full max-w-full h-80 bg-muted rounded-lg overflow-hidden shadow-inner flex items-center justify-center relative mb-3">
                <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                {hasCameraPermission === null && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/80">
                    <Loader className="w-6 h-6 mx-auto mb-1 animate-spin" />
                    <p className="text-xs font-semibold">Starting camera...</p>
                </div>
                )}
                {/* Only show "Camera off" if permission is explicitly denied OR if we have permission but no active stream after grace period */}
                {(() => {
                    // If permission is explicitly denied, show "Camera off"
                    if (hasCameraPermission === false) {
                        return (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/80">
                                <VideoOff className="w-8 h-8 mx-auto mb-1" />
                                <p className="text-xs font-semibold">Camera off</p>
                                <p className="text-xs">Video disabled.</p>
                            </div>
                    );
                    }
                    
                    // If permission is granted but no active stream/video playing
                    if (hasCameraPermission === true && !hasActiveVideoStream && !isVideoPlaying) {
                        // Only show "Camera off" if grace period has passed (2 seconds)
                        if (gracePeriodPassed) {
                            return (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/80">
                                    <VideoOff className="w-8 h-8 mx-auto mb-1" />
                                    <p className="text-xs font-semibold">Camera off</p>
                                    <p className="text-xs">Video disabled.</p>
                                </div>
                            );
                        }
                    }
                    
                    return null;
                })()}
            </div>
            
            ) : (
            <Avatar className="w-24 h-24 mx-auto border-4 border-gray-100 mb-3">
                <AvatarImage src={`https://logo.clearbit.com/${company.toLowerCase().replace(/\s/g, '')}.com`} alt={company} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                    <Sparkles className="w-12 h-12" />
                </AvatarFallback>
            </Avatar>
            )}
            <h1 className="text-lg font-bold font-headline mb-1">{jobRole}</h1>
            <div className="flex items-center justify-center gap-2 mb-1 text-muted-foreground">
                <Avatar className="w-4 h-4">
                    <AvatarImage src={`https://logo.clearbit.com/${company.toLowerCase().replace(/\s/g, '')}.com`} alt={company} />
                    <AvatarFallback className="text-xs">{company.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-xs">{company}</span>
            </div>
        </div>
        
        <div className="my-1">
          <p className="text-2xl font-bold font-mono text-primary text-center">{formatTime(time)}</p>
        </div>

        {/* Navigation Warning Banner */}
        {conversationState !== 'finished' && conversationState !== 'idle' && (
          <div className="mb-2 p-1.5 bg-amber-50 border border-amber-200 rounded text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-amber-700">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              <span className="font-medium">Don't navigate away</span>
              <span className="text-amber-600">•</span>
              <span className="text-amber-600">Use "End Interview" button</span>
            </div>
          </div>
        )}

        {/* Voice Feedback Component */}
        {interviewMode === 'voice' && (
          <div className="mb-4">
            <VoiceFeedback
              isListening={conversationState === 'listening'}
              isMuted={isMuted}
              volume={volume}
              transcript={transcript}
              className="mb-2"
            />
            

          </div>
        )}

        <div className="flex justify-center items-center gap-2">
            {/* Always show Pause/Resume buttons */}
            {isPaused ? (
                <Button size="default" variant="default" className="rounded-full h-12 px-6 bg-green-600 hover:bg-green-700" onClick={handleResumeInterview}>
                    <Play className="w-4 h-4 mr-1"/> Resume
                </Button>
            ) : (
                <Button size="default" variant="outline" className="rounded-full h-12 px-6 border-orange-300 text-orange-700 hover:bg-orange-50" onClick={handlePauseInterview} disabled={conversationState === 'finished' || conversationState === 'thinking'}>
                    <Pause className="w-4 h-4 mr-1"/> Pause
                </Button>
            )}
            
            {/* Always show End Interview button - NEVER disabled */}
            <Button 
                size="default" 
                className={interviewMode === 'voice' ? "rounded-full h-12 px-6" : "w-full"}
                variant={interviewMode === 'voice' ? "destructive" : "default"}
                onClick={endInterview}
            >
                {interviewMode === 'voice' ? (
                    <>
                        <PhoneOff className="w-4 h-4 mr-1"/> End Interview
                    </>
                ) : (
                    "End Interview"
                )}
            </Button>
            
            {/* Show voice-specific controls only in voice mode */}
            {interviewMode === 'voice' && (
                <>
                    <Button size="icon" variant="ghost" className="rounded-full w-12 h-12 bg-gray-100 hover:bg-gray-200" onClick={() => setIsMuted(prev => !prev)}>
                        {isMuted ? <MicOff className="w-4 h-4"/> : <Mic className="w-4 h-4"/>}
                        <span className="sr-only">Mute</span>
                    </Button>
                    <Button size="icon" variant="ghost" className="rounded-full w-12 h-12 bg-gray-100 hover:bg-gray-200" onClick={() => setIsSpeakerMuted(prev => !prev)}>
                        {isSpeakerMuted ? <VolumeX className="w-4 h-4"/> : <Volume2 className="w-4 h-4"/>}
                        <span className="sr-only">Speaker</span>
                    </Button>
                </>
            )}
        </div>
      </div>

      {/* Right Panel */}
      <div className="md:col-span-2 bg-white/70 rounded-2xl shadow-lg p-4 flex flex-col overflow-hidden min-w-0">
        {/* Header with better spacing and layout - Proctored Mode integrated to prevent overlap */}
        <div className="flex flex-col gap-2 mb-3 border-b pb-3 flex-shrink-0">
          {/* Top row: Title and Proctored Mode */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-headline">Interview Transcript</h2>
            {/* Proctoring Mode Indicator - Integrated into header */}
            {conversationState !== 'loading' && currentProctoringMode && (
              <div className="bg-white/95 backdrop-blur-md rounded-lg shadow-sm border border-slate-200/60 px-3 py-1.5">
                <div className={`flex items-center gap-2 text-xs font-semibold ${
                  currentProctoringMode === 'proctored' 
                    ? 'text-red-700' 
                    : 'text-green-700'
                }`}>
                  <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                    currentProctoringMode === 'proctored' ? 'bg-red-500' : 'bg-green-500'
                  }`}></div>
                  <span>{currentProctoringMode === 'proctored' ? 'Proctored Mode Active' : 'Unproctored Mode Active'}</span>
                </div>
              </div>
            )}
          </div>
          {/* Bottom row: Status Indicators (AI Speaking, Listening, Paused) */}
          <div className="flex items-center justify-end">
            <div className="flex items-center gap-2">
              {interviewMode === 'voice' && conversationState === 'listening' && !isMuted && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg shadow-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs font-semibold text-green-700">Listening</span>
                </div>
              )}
              {conversationState === 'speaking' && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg shadow-sm">
                  <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                  <span className="text-xs font-semibold text-orange-700">AI Speaking</span>
                </div>
              )}
              {conversationState === 'paused' && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg shadow-sm">
                  <Pause className="w-3 h-3 text-orange-600"/>
                  <span className="text-xs font-semibold text-orange-700">Paused</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <ScrollArea className="flex-grow pr-2 -mr-2 min-w-0" viewportRef={viewportRef}>
            <div className="space-y-6" ref={scrollAreaRef}>
                {conversationLog.map((entry, index) => (
                    <div key={index} className={cn("flex items-start gap-3", entry.speaker === 'user' ? 'justify-end' : '')}>
                        {entry.speaker === 'ai' && (
                             <Avatar className="w-8 h-8 border">
                                 <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">AI</AvatarFallback>
                            </Avatar>
                        )}
                        <div className={cn(
                            "rounded-lg px-4 py-3 max-w-[80%] text-sm md:text-base break-words overflow-wrap-anywhere",
                             entry.speaker === 'ai' ? 'bg-white/60 text-gray-800 rounded-tl-none' : 'bg-primary text-primary-foreground rounded-tr-none'
                        )}>
                            <div className="whitespace-pre-wrap">{entry.text}</div>
                        </div>
                                                  {entry.speaker === 'user' && (
                             <Avatar className="w-8 h-8 border">
                                <AvatarFallback className="bg-primary text-primary-foreground">U</AvatarFallback>
                            </Avatar>
                         )}
                    </div>
                ))}
                 {conversationState === 'thinking' && (
                    <div className="flex items-start gap-3">
                        <Avatar className="w-8 h-8 border">
                             <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">AI</AvatarFallback>
                        </Avatar>
                         <div className="rounded-lg px-4 py-3 bg-white/60">
                            <div className="flex items-center gap-2">
                                <Loader className="w-4 h-4 animate-spin"/>
                                <span className="text-sm text-muted-foreground">Generating response...</span>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Paused State Indicator */}
                {conversationState === 'paused' && (
                    <div className="flex items-start gap-3">
                        <Avatar className="w-8 h-8 border">
                             <AvatarFallback className="bg-orange-500 text-white text-xs font-bold">⏸</AvatarFallback>
                        </Avatar>
                         <div className="rounded-lg px-4 py-3 bg-orange-50 border border-orange-200">
                            <div className="flex items-center gap-2">
                                <Pause className="w-4 h-4 text-orange-600"/>
                                <span className="text-sm text-orange-700 font-medium">Interview Paused</span>
                            </div>
                            <p className="text-xs text-orange-600 mt-1">Click Resume when your network improves</p>
                        </div>
                    </div>
                )}
                
                {/* Voice Activity Indicator */}
                {/* Speaking indicator - DISABLED */}
                {false && interviewMode === 'voice' && conversationState === 'listening' && !isMuted && isVoiceActive && (
                  <div className="flex items-start gap-3 justify-end">
                    <div className="rounded-lg px-4 py-3 bg-blue-100 border border-blue-200 max-w-[80%]">
                      <div className="flex items-center gap-2">
                        <div className="flex space-x-1">
                          <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"></div>
                          <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                        <span className="text-sm text-blue-700 font-medium">Speaking...</span>
                      </div>
                    </div>
                    <Avatar className="w-8 h-8 border">
                      <AvatarFallback className="bg-primary text-primary-foreground">U</AvatarFallback>
                    </Avatar>
                  </div>
                )}

                {/* Speech Recognition Issue Indicator - DISABLED */}
                {false && interviewMode === 'voice' && conversationState === 'listening' && !isMuted && speechRecognitionIssue && (
                  <div className="flex items-start gap-3 justify-end">
                    <div className="rounded-lg px-4 py-3 bg-yellow-100 border border-yellow-200 max-w-[80%]">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-yellow-600" />
                        <span className="text-sm text-yellow-700 font-medium">Speech recognition issue detected. Trying to fix...</span>
                      </div>
                    </div>
                    <Avatar className="w-8 h-8 border">
                      <AvatarFallback className="bg-primary text-primary-foreground">AI</AvatarFallback>
                    </Avatar>
                  </div>
                )}
                <div ref={bottomRef} />
            </div>
        </ScrollArea>
        {(interviewMode === 'text' || interviewMode === 'voice') && conversationState !== 'finished' && (
            <div className="mt-4 pt-3 border-t border-slate-200 flex-shrink-0">
                <div className="flex items-start gap-3 flex-shrink-0">
                    <Textarea 
                        placeholder={interviewMode === 'voice' 
                            ? (isMuted ? "Mic muted. Type here. Press Enter to submit." : "🎤 Listening... Speak or type. Press Enter to submit.") 
                            : "Type your answer... Press Enter to submit"}
                        value={transcript}
                        onChange={(e) => {
                          // Manual editing - update transcript directly
                          const typedValue = e.target.value;
                          setTranscript(typedValue);
                          lastTranscriptUpdate.current = Date.now(); // Track manual updates too
                          
                          // Track manual edits for response type detection
                          manualEditCount.current += 1;
                          
                          // Mark the time when user manually edited
                          window.lastManualEdit = Date.now();
                          console.log('User manually edited at:', window.lastManualEdit);
                          
                          // If user clears the text completely, log it
                          if (typedValue.trim() === '') {
                            console.log('User cleared text completely');
                          }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleManualSubmit();
                            }
                        }}
                        onFocus={() => {
                          // Update manual edit time when focused
                          window.lastManualEdit = Date.now();
                          console.log('Textarea focused - manual edit time updated');
                        }}
                        onBlur={() => {
                          console.log('Textarea blurred - speech can resume after 1 second of no typing');
                        }}
                        className={cn(
                            "flex-grow transition-all duration-300 min-h-[120px] max-h-[200px] resize-y text-sm",
                            "px-4 py-3",
                            interviewMode === 'voice' && conversationState === 'thinking'
                                ? "border-blue-300 bg-blue-50/50 focus:border-blue-400 focus:ring-2 focus:ring-blue-200" 
                                : interviewMode === 'voice' && conversationState === 'speaking'
                                ? "border-orange-300 bg-orange-50/50 focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
                                : interviewMode === 'voice' && conversationState === 'listening' && !isMuted
                                ? "border-green-300 bg-green-50/50 focus:border-green-400 focus:ring-2 focus:ring-green-200" 
                                : "border-gray-300 focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                        )}
                        disabled={conversationState === 'thinking' || conversationState === 'speaking' || conversationState === 'paused'}
                        // Disable autocorrect, autocomplete, and spell check for voice input
                        autoCorrect="off"
                        autoComplete="off"
                        spellCheck="false"
                        autoCapitalize="off"
                    />
                    <Button 
                        onClick={handleManualSubmit} 
                        disabled={!transcript.trim() || conversationState === 'thinking' || conversationState === 'speaking' || conversationState === 'paused'}
                        className={cn(
                            "group min-h-[120px] px-5 py-4 rounded-lg shadow-md transition-all duration-300",
                            "flex flex-col items-center justify-center gap-2",
                            "hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100",
                            "border-2",
                            !transcript.trim() || conversationState === 'thinking' || conversationState === 'speaking' || conversationState === 'paused'
                                ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed hover:shadow-md"
                                : interviewMode === 'voice' && conversationState === 'listening' && !isMuted
                                ? "bg-green-500 hover:bg-green-600 border-green-600 text-white shadow-green-200/50"
                                : "bg-primary hover:bg-primary/90 border-primary/20 text-primary-foreground"
                        )}
                        aria-label="Submit answer"
                    >
                        {conversationState === 'thinking' ? (
                            <>
                                <Loader className="w-6 h-6 animate-spin text-current"/>
                                <span className="text-xs font-semibold">Processing...</span>
                            </>
                        ) : (
                            <>
                                <div className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                                    !transcript.trim() || conversationState === 'thinking' || conversationState === 'speaking' || conversationState === 'paused'
                                        ? "bg-slate-200"
                                        : interviewMode === 'voice' && conversationState === 'listening' && !isMuted
                                        ? "bg-white/25"
                                        : "bg-white/20"
                                )}>
                                    <ArrowRight className={cn(
                                        "w-5 h-5 transition-transform group-hover:translate-x-0.5",
                                        !transcript.trim() || conversationState === 'thinking' || conversationState === 'speaking' || conversationState === 'paused'
                                            ? "text-slate-400"
                                            : "text-white"
                                    )}/>
                                </div>
                                <span className="text-xs font-semibold">Submit</span>
                            </>
                        )}
                    </Button>
                </div>
                <div className="text-xs text-muted-foreground text-center mt-2">
                    {conversationState === 'speaking' 
                        ? "⏸️ Please wait for AI to finish speaking before submitting"
                        : "Press Enter to submit your answer"
                    }
                </div>
            </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      </div>
      
      {/* Proctor Exit Confirmation Modal - only shown in proctored mode */}
      <ProctorExitConfirmModal
        open={isModalOpen}
        onClose={closeModal}
        onConfirmEnd={confirmEnd}
        busy={isBusy}
      />
    </div>
  );
}