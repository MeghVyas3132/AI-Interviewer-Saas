'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { aiServiceClient } from '@/services/ai-service-client';
import type { AIInterviewSession } from '@/types/ai';

interface InterviewSessionProps {
    sessionId: string;
    candidateId: string;
    mode?: 'voice' | 'text';
    proctoringMode?: 'proctored' | 'unproctored';
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

/**
 * Enhanced AI Interview Session Component with TTS/STT
 * 
 * Features:
 * - Text-to-Speech for questions
 * - Speech-to-Text for answers
 * - Real-time transcription
 */
export function InterviewSession({
    sessionId,
    candidateId,
    mode = 'voice',
    proctoringMode,
}: InterviewSessionProps) {
    const router = useRouter();
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

    // Speech recognition ref
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        const fetchSession = async () => {
            try {
                const data = await aiServiceClient.getInterviewSession(sessionId);
                setSession(data);

                // If session has questions, use them
                if (data?.questions && data.questions.length > 0) {
                    setQuestions(data.questions.map((q: any, idx: number) => ({
                        id: q.id || `q-${idx}`,
                        text: q.text || q,
                        answered: false,
                    })));
                } else {
                    // Default questions if none provided
                    setQuestions([
                        { id: 'q-1', text: 'Tell me about yourself and your background.', answered: false },
                        { id: 'q-2', text: 'What interests you about this position?', answered: false },
                        { id: 'q-3', text: 'Describe a challenging project you worked on.', answered: false },
                        { id: 'q-4', text: 'How do you handle tight deadlines and pressure?', answered: false },
                        { id: 'q-5', text: 'Do you have any questions for us?', answered: false },
                    ]);
                }

                setLoading(false);
            } catch (err) {
                setError('Failed to load interview session');
                setLoading(false);
            }
        };

        fetchSession();

        // Cleanup speech recognition on unmount
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            window.speechSynthesis?.cancel();
        };
    }, [sessionId]);

    // Text-to-Speech function
    const speakQuestion = useCallback((text: string) => {
        if (!window.speechSynthesis) {
            console.warn('Speech synthesis not supported');
            return;
        }

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;

        // Try to use a natural voice
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => 
            v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Google'))
        ) || voices.find(v => v.lang.startsWith('en'));
        
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);

        window.speechSynthesis.speak(utterance);
    }, []);

    // Speech-to-Text function
    const startListening = useCallback(() => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
            return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            setIsListening(true);
        };

        recognition.onresult = (event: any) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript;
                }
            }

            if (finalTranscript) {
                setCurrentAnswer(prev => prev + finalTranscript);
            }
        };

        recognition.onerror = (event: any) => {
            console.error('Speech recognition error:', event.error);
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
    }, []);

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
        setIsListening(false);
    }, []);

    // Submit transcript to backend
    const submitTranscript = useCallback(async (allAnswers: Answer[]) => {
        try {
            // Build transcript text
            const transcriptText = questions.map((q, idx) => {
                const answer = allAnswers.find(a => a.questionId === q.id);
                return `Q${idx + 1}: ${q.text}\nA: ${answer?.text || '[No answer provided]'}`;
            }).join('\n\n');

            // Submit to backend
            await aiServiceClient.submitTranscript(sessionId, {
                candidate_id: candidateId,
                transcript_text: transcriptText,
                answers: allAnswers.map(a => ({
                    question_id: a.questionId,
                    answer_text: a.text,
                    timestamp: a.timestamp,
                })),
            });

            console.log('Transcript submitted successfully');
        } catch (err) {
            console.error('Failed to submit transcript:', err);
            // Don't block the user even if submission fails
        }
    }, [sessionId, candidateId, questions]);

    const submitAnswer = useCallback(() => {
        if (!currentAnswer.trim()) return;

        const newAnswer: Answer = {
            questionId: questions[currentQuestionIndex].id,
            text: currentAnswer.trim(),
            timestamp: new Date().toISOString(),
        };

        const updatedAnswers = [...answers, newAnswer];
        setAnswers(updatedAnswers);

        // Mark question as answered
        setQuestions(prev => prev.map((q, idx) => 
            idx === currentQuestionIndex ? { ...q, answered: true } : q
        ));

        setCurrentAnswer('');

        // Move to next question or complete
        if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        } else {
            setInterviewComplete(true);
            // Submit transcript to backend
            submitTranscript(updatedAnswers);
        }
    }, [currentAnswer, currentQuestionIndex, questions, answers, submitTranscript]);

    const currentQuestion = questions[currentQuestionIndex];

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
                        {isSpeaking ? (
                            <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            </svg>
                        ) : (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            </svg>
                        )}
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
                            Listening... Speak clearly into your microphone
                        </div>
                    )}

                    <div className="flex justify-between items-center">
                        <p className="text-sm text-gray-400">
                            {currentAnswer.length} characters
                        </p>
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

            {/* Quick Navigation */}
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
