'use client';

import { useCallback, useRef, useState, useEffect } from 'react';

/**
 * Native browser Speech Recognition hook
 * Uses Web Speech API (available in Chrome, Edge, Safari)
 * Falls back gracefully when not supported
 */

type TranscriptSegment = {
  id: string;
  text: string;
  turnOrder: number;
  timestamp: number;
};

type SpeechRecognitionState = 'idle' | 'connecting' | 'listening' | 'error';

// TypeScript declarations for Web Speech API
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

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export function useNativeSpeechRecognition() {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isListeningRef = useRef<boolean>(false);
  const turnOrderRef = useRef<number>(0);

  const [status, setStatus] = useState<SpeechRecognitionState>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState<boolean>(true);

  // Initialize speech recognition on mount
  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsSupported(false);
      return;
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognitionAPI) {
      console.warn('[NativeSpeech] Web Speech API not supported in this browser');
      setIsSupported(false);
      setError('Speech recognition not supported. Please use Chrome, Edge, or Safari.');
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;

        if (result.isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      // Update partial transcript for real-time display
      setPartialTranscript(interimTranscript);

      // Add final transcript as a segment
      if (finalTranscript.trim()) {
        const turnOrder = turnOrderRef.current++;
        setSegments(prev => [
          ...prev,
          {
            id: `native-${turnOrder}`,
            text: finalTranscript.trim(),
            turnOrder,
            timestamp: Date.now(),
          },
        ]);
        console.log('[NativeSpeech] Final transcript:', finalTranscript.trim());
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[NativeSpeech] Error:', event.error, event.message);
      
      // Don't treat 'no-speech' or 'aborted' as real errors
      if (event.error === 'no-speech') {
        // Just means silence - restart listening
        return;
      }
      
      if (event.error === 'aborted') {
        // User or system aborted - not an error
        return;
      }

      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone access and try again.');
        setStatus('error');
        isListeningRef.current = false;
        return;
      }

      setError(`Speech recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      console.log('[NativeSpeech] Recognition ended, isListening:', isListeningRef.current);
      
      // Auto-restart if we should still be listening
      if (isListeningRef.current && recognitionRef.current) {
        try {
          setTimeout(() => {
            if (isListeningRef.current && recognitionRef.current) {
              recognitionRef.current.start();
              console.log('[NativeSpeech] Auto-restarted');
            }
          }, 100);
        } catch (e) {
          console.warn('[NativeSpeech] Could not auto-restart:', e);
        }
      } else {
        setStatus('idle');
      }
    };

    recognition.onstart = () => {
      console.log('[NativeSpeech] Started listening');
      setStatus('listening');
      setError(null);
    };

    recognitionRef.current = recognition;
    console.log('[NativeSpeech] Initialized successfully');

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // Ignore
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  const start = useCallback(async () => {
    if (!recognitionRef.current) {
      setError('Speech recognition not initialized');
      return;
    }

    if (isListeningRef.current) {
      console.log('[NativeSpeech] Already listening');
      return;
    }

    try {
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      setStatus('connecting');
      setError(null);
      isListeningRef.current = true;
      
      recognitionRef.current.start();
      console.log('[NativeSpeech] Starting...');
    } catch (err) {
      console.error('[NativeSpeech] Failed to start:', err);
      setError(err instanceof Error ? err.message : 'Failed to start speech recognition');
      setStatus('error');
      isListeningRef.current = false;
    }
  }, []);

  const stop = useCallback(() => {
    isListeningRef.current = false;
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        console.log('[NativeSpeech] Stopped');
      } catch (e) {
        // Ignore - may already be stopped
      }
    }
    
    setStatus('idle');
    setPartialTranscript('');
  }, []);

  const resetTranscripts = useCallback(() => {
    setSegments([]);
    setPartialTranscript('');
    turnOrderRef.current = 0;
  }, []);

  return {
    start,
    stop,
    resetTranscripts,
    status,
    error,
    partialTranscript,
    segments,
    isSupported,
  };
}
