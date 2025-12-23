'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader } from '@/components/Card';
import { Button } from '@/components/Button';
import {
  Loader2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Video,
  VideoOff,
  Send,
  MessageSquare,
  Bot,
  User,
  Clock,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  Play,
  Pause
} from 'lucide-react';

interface InterviewSession {
  id: number;
  candidate_id: string;
  token: string;
  status: string;
  questions_generated?: Question[];
  first_name?: string;
  last_name?: string;
  job_title?: string;
  interview_mode?: string;
  is_active: boolean;
}

interface Question {
  id?: string;
  text: string;
  category?: string;
  difficulty?: string;
}

interface ConversationEntry {
  role: 'ai' | 'candidate';
  content: string;
  timestamp: Date;
}

interface AIResponse {
  nextQuestion?: string;
  feedback?: string;
  isInterviewOver?: boolean;
  hint?: string;
  scoring?: {
    score: number;
    explanation: string;
  };
}

export default function InterviewRoomPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  // Session state
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Interview state
  const [isStarted, setIsStarted] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [conversationLog, setConversationLog] = useState<ConversationEntry[]>([]);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Input state
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Mode state
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('text');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);

  // Refs
  const recognitionRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Validate session on mount
  useEffect(() => {
    const validateSession = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/interview/validate/${token}`);
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || 'Invalid interview session');
          return;
        }

        if (data.success && data.session) {
          setSession(data.session);
          // Set first question if available
          if (data.session.questions_generated?.length > 0) {
            setCurrentQuestion(data.session.questions_generated[0].text);
          }
        }
      } catch (err) {
        setError('Failed to validate interview session');
      } finally {
        setLoading(false);
      }
    };

    validateSession();

    return () => {
      // Cleanup
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      window.speechSynthesis?.cancel();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [token]);

  // Scroll to bottom of conversation
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationLog]);

  // Timer
  useEffect(() => {
    if (isStarted && !interviewComplete) {
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isStarted, interviewComplete]);

  // Text-to-Speech
  const speakText = useCallback((text: string) => {
    if (isSpeakerMuted || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [isSpeakerMuted]);

  // Speech Recognition setup
  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition is not supported in your browser');
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        }
      }
      if (finalTranscript) {
        setTranscript(prev => prev + ' ' + finalTranscript);
      }
    };

    recognitionRef.current.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognitionRef.current.onend = () => {
      if (isListening) {
        recognitionRef.current?.start();
      }
    };

    recognitionRef.current.start();
    setIsListening(true);
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

  // Camera control
  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setIsCameraOn(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setIsCameraOn(true);
      } catch (err) {
        console.error('Error accessing camera:', err);
      }
    }
  }, [isCameraOn]);

  // Start interview
  const handleStartInterview = async () => {
    try {
      setIsProcessing(true);
      const response = await fetch(`/api/interview/start/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: inputMode }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to start interview');
        return;
      }

      setIsStarted(true);

      // Add welcome message
      const welcomeMessage = `Hello ${session?.first_name || 'there'}! Welcome to your interview for the ${session?.job_title || 'position'}. Let's begin with your first question.`;
      
      addToConversation('ai', welcomeMessage);
      speakText(welcomeMessage);

      // Add first question after a delay
      setTimeout(() => {
        if (currentQuestion) {
          addToConversation('ai', currentQuestion);
          speakText(currentQuestion);
        }
      }, 3000);

    } catch (err) {
      setError('Failed to start interview');
    } finally {
      setIsProcessing(false);
    }
  };

  // Add message to conversation
  const addToConversation = (role: 'ai' | 'candidate', content: string) => {
    setConversationLog(prev => [...prev, {
      role,
      content,
      timestamp: new Date(),
    }]);
  };

  // Submit answer
  const handleSubmitAnswer = async () => {
    if (!transcript.trim()) return;

    // Add candidate's answer to conversation
    addToConversation('candidate', transcript.trim());

    setIsProcessing(true);
    stopListening();

    try {
      // Map conversation history for AI agent
      const historyForAgent = conversationLog
        .filter(e => e.role === 'candidate' || e.role === 'ai')
        .reduce((acc: any[], entry, idx, arr) => {
          // Pair AI questions with candidate answers
          if (entry.role === 'ai' && arr[idx + 1]?.role === 'candidate') {
            acc.push({
              question: entry.content,
              answer: arr[idx + 1].content,
            });
          }
          return acc;
        }, []);

      // Call AI agent for response
      const response = await fetch('/api/ai/interview-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentQuestion: currentQuestion,
          answer: transcript.trim(),
          jobTitle: session?.job_title,
          company: '',
          resumeText: '',
          language: 'English',
          conversationHistory: historyForAgent,
          questionsAnswered: currentQuestionIndex,
          minimumQuestionsRequired: session?.questions_generated?.length || 10,
          isEmailInterview: true,
        }),
      });

      const data = await response.json();
      setTranscript('');

      if (!data.success) {
        throw new Error(data.error || 'Failed to get AI response');
      }

      if (data.isInterviewOver) {
        // Interview complete - build completion message
        let completionMessage = "Thank you for completing your interview! ";
        if (data.contentFeedback) {
          completionMessage += data.contentFeedback + " ";
        }
        completionMessage += "We will review your responses and get back to you soon.";
        
        addToConversation('ai', completionMessage);
        speakText(completionMessage);
        setInterviewComplete(true);

        // Complete the interview
        await fetch(`/api/interview/complete/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            interviewData: conversationLog,
            totalTime: elapsedTime,
            finalScore: data.overallScore,
          }),
        });
      } else {
        // Provide brief feedback if available
        if (data.contentFeedback && !data.shouldRetryQuestion) {
          // Only show feedback between questions, not when retrying
          const briefFeedback = data.contentFeedback.split('.')[0] + '.';
          addToConversation('ai', briefFeedback);
          speakText(briefFeedback);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // If hint provided and should retry, show hint
        if (data.shouldRetryQuestion && data.hint) {
          addToConversation('ai', `Hint: ${data.hint}`);
          speakText(`Here's a hint: ${data.hint}`);
          return; // Let them try again with the same question
        }

        // Move to next question
        if (data.nextQuestion) {
          setTimeout(() => {
            setCurrentQuestion(data.nextQuestion);
            setCurrentQuestionIndex(prev => prev + 1);
            addToConversation('ai', data.nextQuestion);
            speakText(data.nextQuestion);
          }, 1500);
        } else if (session?.questions_generated && currentQuestionIndex < session.questions_generated.length - 1) {
          const nextQ = session.questions_generated[currentQuestionIndex + 1];
          setTimeout(() => {
            setCurrentQuestion(nextQ.text);
            setCurrentQuestionIndex(prev => prev + 1);
            addToConversation('ai', nextQ.text);
            speakText(nextQ.text);
          }, 1500);
        }
      }

    } catch (err) {
      console.error('Error submitting answer:', err);
      addToConversation('ai', 'I apologize, but I encountered an error. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // End interview early
  const handleEndInterview = async () => {
    if (confirm('Are you sure you want to end the interview? This action cannot be undone.')) {
      try {
        await fetch(`/api/interview/abandon/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            interviewData: conversationLog,
            totalTime: elapsedTime,
          }),
        });
        router.push('/interview/thank-you');
      } catch (err) {
        console.error('Error ending interview:', err);
      }
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">Preparing your interview session...</p>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Interview Session Error</h2>
          <p className="text-gray-600">{error}</p>
          <Button
            className="mt-6"
            variant="outline"
            onClick={() => router.push('/')}
          >
            Return Home
          </Button>
        </Card>
      </div>
    );
  }

  // Interview complete state
  if (interviewComplete) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-lg w-full mx-4 text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Interview Complete!</h2>
          <p className="text-gray-600 mb-6">
            Thank you for completing your interview, {session?.first_name}!
            Your responses have been recorded and will be reviewed by our team.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex justify-center space-x-8">
              <div>
                <div className="text-2xl font-bold text-primary-600">{conversationLog.filter(e => e.role === 'candidate').length}</div>
                <div className="text-sm text-gray-500">Questions Answered</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary-600">{formatTime(elapsedTime)}</div>
                <div className="text-sm text-gray-500">Total Time</div>
              </div>
            </div>
          </div>
          <Button onClick={() => router.push('/')}>
            Return Home
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">AI Interview</h1>
              <p className="text-sm text-gray-500">{session?.job_title}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {isStarted && (
              <div className="flex items-center space-x-2 bg-gray-100 px-3 py-1.5 rounded-lg">
                <Clock className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium">{formatTime(elapsedTime)}</span>
              </div>
            )}
            {isStarted && (
              <Button variant="outline" size="sm" onClick={handleEndInterview}>
                End Interview
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Main Interview Area */}
        <div className="lg:col-span-3 space-y-4">
          {/* Video/Avatar Area */}
          <Card className="relative overflow-hidden">
            <div className="aspect-video bg-gradient-to-br from-primary-600 to-primary-800 rounded-lg flex items-center justify-center">
              {isCameraOn && videoRef.current ? (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover rounded-lg"
                />
              ) : (
                <div className="text-center">
                  <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Bot className="w-12 h-12 text-white" />
                  </div>
                  <h2 className="text-xl font-semibold text-white">AI Interviewer</h2>
                  {isSpeaking && (
                    <div className="flex items-center justify-center mt-2 space-x-1">
                      <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                      <span className="w-2 h-3 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></span>
                      <span className="w-2 h-4 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></span>
                      <span className="w-2 h-3 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '0.6s' }}></span>
                      <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '0.8s' }}></span>
                    </div>
                  )}
                </div>
              )}

              {/* Controls overlay */}
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-2">
                <button
                  onClick={() => setIsSpeakerMuted(!isSpeakerMuted)}
                  className={`p-3 rounded-full ${isSpeakerMuted ? 'bg-red-500' : 'bg-white/20'} text-white hover:bg-white/30 transition`}
                >
                  {isSpeakerMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <button
                  onClick={toggleCamera}
                  className={`p-3 rounded-full ${isCameraOn ? 'bg-white/20' : 'bg-red-500'} text-white hover:bg-white/30 transition`}
                >
                  {isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </Card>

          {/* Current Question */}
          {isStarted && currentQuestion && (
            <Card className="bg-primary-50 border-primary-100">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm text-primary-600 font-medium">Current Question ({currentQuestionIndex + 1}/{session?.questions_generated?.length || 0})</p>
                  <p className="text-gray-900 mt-1">{currentQuestion}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Answer Input */}
          {isStarted && (
            <Card>
              <div className="flex items-center space-x-2 mb-4">
                <button
                  onClick={() => setInputMode('text')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    inputMode === 'text' ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <MessageSquare className="w-4 h-4 inline mr-1" />
                  Text
                </button>
                <button
                  onClick={() => setInputMode('voice')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    inputMode === 'voice' ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <Mic className="w-4 h-4 inline mr-1" />
                  Voice
                </button>
              </div>

              <div className="relative">
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder={inputMode === 'voice' ? 'Click the mic button and speak your answer...' : 'Type your answer here...'}
                  className="w-full min-h-[120px] p-4 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  disabled={isProcessing}
                />
                
                <div className="absolute bottom-3 right-3 flex items-center space-x-2">
                  {inputMode === 'voice' && (
                    <button
                      onClick={isListening ? stopListening : startListening}
                      disabled={isProcessing}
                      className={`p-2 rounded-full transition ${
                        isListening 
                          ? 'bg-red-500 text-white animate-pulse' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
                  )}
                  <Button
                    onClick={handleSubmitAnswer}
                    disabled={!transcript.trim() || isProcessing}
                    size="sm"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Submit <ArrowRight className="w-4 h-4 ml-1" />
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {isListening && (
                <div className="mt-2 flex items-center text-sm text-green-600">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2"></span>
                  Listening...
                </div>
              )}
            </Card>
          )}

          {/* Pre-start state */}
          {!isStarted && (
            <Card className="text-center py-12">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Play className="w-8 h-8 text-primary-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Ready to Begin?</h2>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                You're about to start your AI interview for {session?.job_title}. 
                The interview will consist of {session?.questions_generated?.length || 'several'} questions.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button onClick={handleStartInterview} isLoading={isProcessing}>
                  Start Interview
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar - Conversation Log */}
        <div className="lg:col-span-1">
          <Card className="h-[calc(100vh-140px)] flex flex-col">
            <CardHeader title="Conversation" subtitle="Interview transcript" />
            
            <div className="flex-1 overflow-y-auto space-y-3">
              {conversationLog.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Conversation will appear here</p>
                </div>
              ) : (
                conversationLog.map((entry, index) => (
                  <div
                    key={index}
                    className={`flex ${entry.role === 'candidate' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] p-3 rounded-lg ${
                        entry.role === 'candidate'
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      <div className="flex items-center space-x-2 mb-1">
                        {entry.role === 'ai' ? (
                          <Bot className="w-3 h-3" />
                        ) : (
                          <User className="w-3 h-3" />
                        )}
                        <span className="text-xs opacity-75">
                          {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm">{entry.content}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={conversationEndRef} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
