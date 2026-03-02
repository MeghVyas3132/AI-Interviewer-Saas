'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface TranscriptMeta {
  segment_id?: string;
  confidence?: number | null;
  is_final?: boolean;
  transcript_source?: 'asr' | 'ai' | 'candidate' | 'system';
  start_ms?: number;
  end_ms?: number;
  flags?: string[];
}

interface Message {
  role: 'ai' | 'user';
  content: string;
  timestamp: Date;
  meta?: TranscriptMeta;
}

interface InterviewSession {
  id: number;
  candidate_name: string;
  position: string;
  company_name: string;
  questions_generated: string[];
  duration_minutes: number;
}

interface ASRSegment {
  segmentId: string;
  text: string;
  confidence: number | null;
  isFinal: boolean;
  receivedAtMs: number;
}

interface AdaptiveFeedbackResult {
  feedback: string;
  nextQuestion?: string;
  shouldRetryCurrentQuestion: boolean;
}

interface ReadinessStatus {
  status: 'idle' | 'running' | 'passed' | 'failed';
  message: string;
  micGainScore: number;
  noiseScore: number;
  sampleSentence: string;
  sampleConfidence: number;
}

const AUTO_SUBMIT_BASE_DELAY_MS = 4200;
const AUTO_SUBMIT_MAX_DELAY_MS = 6500;
const AUTO_SUBMIT_MIN_WORDS = 12;
const AUTO_SUBMIT_RECENT_SPEECH_GUARD_MS = 1200;
const AUTO_SUBMIT_ENABLED = false;
const LONG_SILENCE_PROMPT_MS = 12000;
const LOW_CONFIDENCE_THRESHOLD = 0.55;
const HEARTBEAT_INTERVAL_MS = 15000;
const MAX_RESUME_PAYLOAD_LENGTH = 50000;
const WS_RECONNECT_BACKOFF_MS = [400, 900, 1600, 2500, 4000, 6000];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function waitMs(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

function normalizeTextForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(value: string): number {
  const cleaned = (value || '').trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

function looksLikeNoIdeaAnswer(value: string): boolean {
  const text = value.toLowerCase();
  return /(i don't know|i do not know|not sure|no idea|can't recall|cannot recall|skip this)/.test(text);
}

function getWsProxyBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_PROXY_URL) {
    return process.env.NEXT_PUBLIC_WS_PROXY_URL;
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.hostname}:9003`;
  }
  return 'ws://localhost:9003';
}

function buildPhraseHints(session: InterviewSession | null): string[] {
  if (!session) return [];

  const hints = new Set<string>();
  const commonStopWords = new Set([
    'about', 'after', 'again', 'before', 'being', 'between', 'could', 'describe', 'design',
    'experience', 'explain', 'first', 'from', 'have', 'into', 'just', 'like', 'please',
    'project', 'question', 'role', 'should', 'their', 'there', 'these', 'they', 'this',
    'through', 'using', 'what', 'when', 'where', 'which', 'with', 'would', 'your',
  ]);

  const addHint = (value: string) => {
    const cleaned = value.trim();
    if (!cleaned) return;
    hints.add(cleaned);
  };

  addHint(session.candidate_name || '');
  addHint(session.position || '');
  addHint(session.company_name || '');

  [session.candidate_name, session.position, session.company_name]
    .join(' ')
    .split(/[^A-Za-z0-9+#.]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .forEach(addHint);

  const questionTokens = (session.questions_generated || [])
    .join(' ')
    .split(/[^A-Za-z0-9+#/.-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !commonStopWords.has(token.toLowerCase()))
    .filter((token) =>
      /[0-9+#/.]/.test(token) ||
      /^(ci\/cd|devops|docker|kubernetes|terraform|ansible|jenkins|github|aws|gcp|azure|linux|python|react|node|api|sql|nosql)$/i.test(token),
    );

  questionTokens.slice(0, 40).forEach(addHint);

  return Array.from(hints).slice(0, 80);
}

export default function InterviewRoomPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [interviewStarted, setInterviewStarted] = useState(false);
  const [interviewEnded, setInterviewEnded] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [hasTranscriptContent, setHasTranscriptContent] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [endpointState, setEndpointState] = useState<'idle' | 'speech' | 'silence_grace' | 'finalize'>('idle');
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [readinessStatus, setReadinessStatus] = useState<ReadinessStatus>({
    status: 'idle',
    message: 'Readiness checks have not run yet.',
    micGainScore: 0,
    noiseScore: 0,
    sampleSentence: '',
    sampleConfidence: 0,
  });

  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNextQuestionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastSpeechTimeRef = useRef<number>(Date.now());
  const lastLongSilencePromptRef = useRef<number>(0);
  const autoSubmitInProgressRef = useRef<boolean>(false);
  const submitAnswerRef = useRef<(() => Promise<void>) | null>(null);
  const askedQuestionKeysRef = useRef<Set<string>>(new Set());
  const isListeningRef = useRef<boolean>(false);
  const interviewEndedRef = useRef<boolean>(false);
  const isAISpeakingRef = useRef<boolean>(false);
  const transcriptSaveInFlightRef = useRef<boolean>(false);
  const transcriptSavedRef = useRef<boolean>(false);
  const reconnectAttemptRef = useRef<number>(0);
  const adaptiveSilenceMsRef = useRef<number>(AUTO_SUBMIT_BASE_DELAY_MS);
  const currentQuestionTextRef = useRef<string>('');
  const hasTranscriptContentRef = useRef<boolean>(false);
  const answerWindowStartMsRef = useRef<number>(0);
  const acceptAsrTurnsRef = useRef<boolean>(false);

  const asrWantedRef = useRef<boolean>(false);
  const asrConnectedRef = useRef<boolean>(false);
  const shouldStreamAudioRef = useRef<boolean>(false);
  const asrSegmentCounterRef = useRef<number>(0);
  const interimTranscriptRef = useRef<string>('');
  const finalSegmentsRef = useRef<ASRSegment[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const audioSilentGainRef = useRef<GainNode | null>(null);
  const asrMediaStreamRef = useRef<MediaStream | null>(null);

  const audioStatsRef = useRef({
    sampleCount: 0,
    rmsSum: 0,
    peak: 0,
    lastRms: 0,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);

  const [resumeText, setResumeText] = useState('');
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1`
    : 'http://localhost:8000/api/v1';

  const clearSilenceTimeout = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  }, []);

  const clearPendingNextQuestion = useCallback(() => {
    if (pendingNextQuestionTimeoutRef.current) {
      clearTimeout(pendingNextQuestionTimeoutRef.current);
      pendingNextQuestionTimeoutRef.current = null;
    }
  }, []);

  const normalizeQuestionKey = useCallback((value: string) => normalizeTextForMatch(value), []);

  const tokenSet = useCallback((value: string) => {
    return new Set(normalizeQuestionKey(value).split(' ').filter(Boolean));
  }, [normalizeQuestionKey]);

  const questionSimilarity = useCallback((a: string, b: string) => {
    const aTokens = tokenSet(a);
    const bTokens = tokenSet(b);
    if (aTokens.size === 0 || bTokens.size === 0) return 0;
    let intersection = 0;
    for (const token of aTokens) {
      if (bTokens.has(token)) intersection += 1;
    }
    const union = new Set([...aTokens, ...bTokens]).size;
    return union === 0 ? 0 : intersection / union;
  }, [tokenSet]);

  const sanitizeResumeForPayload = useCallback((value: string) => {
    const sanitized = (value || '').replace(/\u0000/g, '').trim().slice(0, MAX_RESUME_PAYLOAD_LENGTH);
    const looksBinary =
      sanitized.startsWith('%PDF-') ||
      ((sanitized.match(/\uFFFD/g) || []).length / Math.max(sanitized.length, 1)) > 0.01;
    return looksBinary ? '' : sanitized;
  }, []);

  const syncTranscriptDisplay = useCallback(() => {
    const finalText = finalSegmentsRef.current
      .map((segment) => segment.text)
      .join(' ')
      .trim();

    const interimText = interimTranscriptRef.current.trim();
    const combined = [finalText, interimText].filter(Boolean).join(' ');

    setTranscript(combined);
    const hasContent = combined.length > 0;
    hasTranscriptContentRef.current = hasContent;
    setHasTranscriptContent(hasContent);
  }, []);

  const getBufferedAnswerText = useCallback(() => {
    const finalText = finalSegmentsRef.current
      .map((segment) => segment.text)
      .join(' ')
      .trim();
    const interimText = interimTranscriptRef.current.trim();
    return [finalText, interimText].filter(Boolean).join(' ').trim();
  }, []);

  const resetCurrentAnswerBuffers = useCallback(() => {
    interimTranscriptRef.current = '';
    finalSegmentsRef.current = [];
    hasTranscriptContentRef.current = false;
    setTranscript('');
    setHasTranscriptContent(false);
  }, []);

  const updateAudioStats = useCallback((rms: number, peak: number) => {
    const stats = audioStatsRef.current;
    stats.sampleCount += 1;
    stats.rmsSum += rms;
    stats.peak = Math.max(stats.peak, peak);
    stats.lastRms = rms;
  }, []);

  const resetAudioStats = useCallback(() => {
    audioStatsRef.current = {
      sampleCount: 0,
      rmsSum: 0,
      peak: 0,
      lastRms: 0,
    };
  }, []);

  const averageAudioRms = useCallback(() => {
    const stats = audioStatsRef.current;
    if (stats.sampleCount === 0) return 0;
    return stats.rmsSum / stats.sampleCount;
  }, []);

  const addMessage = useCallback((role: 'ai' | 'user', content: string, meta?: TranscriptMeta) => {
    setMessages((prev) => {
      const nextMessages = [...prev, { role, content, timestamp: new Date(), meta }];
      messagesRef.current = nextMessages;
      return nextMessages;
    });
  }, []);

  const pauseAudioStreaming = useCallback((paused: boolean) => {
    shouldStreamAudioRef.current = !paused;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'speech_state', state: paused ? 'paused' : 'listening' }));
    }
  }, []);

  const pickVoiceByGender = useCallback((gender: 'male' | 'female') => {
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return null;

    const femaleMatchers = [
      'female',
      'zira',
      'samantha',
      'victoria',
      'karen',
      'moira',
      'tessa',
      'fiona',
      'google uk english female',
      'google us english',
    ];

    const maleMatchers = [
      'male',
      'david',
      'alex',
      'daniel',
      'fred',
      'google uk english male',
      'microsoft mark',
    ];

    const normalized = voices.map((voice) => ({
      voice,
      name: `${voice.name} ${voice.lang}`.toLowerCase(),
    }));

    const preferredMatchers = gender === 'male' ? maleMatchers : femaleMatchers;
    const preferred = normalized.find(({ name }) => preferredMatchers.some((matcher) => name.includes(matcher)));
    if (preferred) return preferred.voice;

    // For female, try any English voice that doesn't match male matchers
    if (gender === 'female') {
      const nonMale = normalized.find(({ name }) => name.includes('en') && !maleMatchers.some((m) => name.includes(m)));
      if (nonMale) return nonMale.voice;
    }

    const fallbackMatchers = gender === 'male' ? femaleMatchers : maleMatchers;
    const fallback = normalized.find(({ name }) => fallbackMatchers.some((matcher) => name.includes(matcher)));
    return fallback?.voice || voices[0];
  }, []);

  const speakText = useCallback(async (text: string, options?: { gender?: 'male' | 'female' }) => {
    const desiredGender = options?.gender || 'female';

    // Ensure voices are loaded before speaking (Chrome loads them asynchronously)
    if ('speechSynthesis' in window && speechSynthesis.getVoices().length === 0) {
      await new Promise<void>((resolve) => {
        const onVoicesChanged = () => {
          speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
          resolve();
        };
        speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
        // Timeout fallback in case event never fires
        setTimeout(resolve, 1500);
      });
    }

    await new Promise<void>((resolve) => {
      setIsAISpeaking(true);
      isAISpeakingRef.current = true;
      pauseAudioStreaming(true);

      if ('speechSynthesis' in window && speechSynthesis.speaking) {
        speechSynthesis.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      synthRef.current = utterance;

      const selectedVoice = pickVoiceByGender(desiredGender);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      utterance.rate = desiredGender === 'male' ? 0.95 : 0.92;
      utterance.pitch = desiredGender === 'male' ? 0.95 : 1.05;

      utterance.onend = () => {
        setIsAISpeaking(false);
        isAISpeakingRef.current = false;
        if (isListeningRef.current && !interviewEndedRef.current) {
          pauseAudioStreaming(false);
        }
        resolve();
      };

      utterance.onerror = () => {
        setIsAISpeaking(false);
        isAISpeakingRef.current = false;
        if (isListeningRef.current && !interviewEndedRef.current) {
          pauseAudioStreaming(false);
        }
        resolve();
      };

      speechSynthesis.speak(utterance);
    });
  }, [pauseAudioStreaming, pickVoiceByGender]);

  const ensureHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) return;

    heartbeatTimerRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'heartbeat', client_ts: Date.now() }));
    }, HEARTBEAT_INTERVAL_MS);
  }, []);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const teardownASRSession = useCallback(() => {
    asrWantedRef.current = false;
    clearHeartbeat();

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }

    asrConnectedRef.current = false;
    pauseAudioStreaming(true);

    if (audioWorkletNodeRef.current) {
      try {
        audioWorkletNodeRef.current.port.onmessage = null;
        audioWorkletNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      audioWorkletNodeRef.current = null;
    }

    if (audioSourceNodeRef.current) {
      try {
        audioSourceNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      audioSourceNodeRef.current = null;
    }

    if (audioSilentGainRef.current) {
      try {
        audioSilentGainRef.current.disconnect();
      } catch {
        // ignore
      }
      audioSilentGainRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          void audioContextRef.current.close();
        }
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }

    if (asrMediaStreamRef.current) {
      asrMediaStreamRef.current.getTracks().forEach((track) => track.stop());
      asrMediaStreamRef.current = null;
    }
  }, [clearHeartbeat, pauseAudioStreaming]);

  const scheduleAutoSubmit = useCallback((forceOnEndpoint = false) => {
    if (!AUTO_SUBMIT_ENABLED) {
      clearSilenceTimeout();
      return;
    }
    clearSilenceTimeout();
    if (!hasTranscriptContentRef.current) return;

    const timeoutMs = clamp(adaptiveSilenceMsRef.current + 2800, AUTO_SUBMIT_BASE_DELAY_MS, AUTO_SUBMIT_MAX_DELAY_MS);
    silenceTimeoutRef.current = setTimeout(() => {
      const bufferedText = getBufferedAnswerText();
      const words = wordCount(bufferedText);
      const minimumWords = forceOnEndpoint ? 8 : AUTO_SUBMIT_MIN_WORDS;
      const idleForMs = Date.now() - lastSpeechTimeRef.current;

      if (
        !autoSubmitInProgressRef.current &&
        hasTranscriptContentRef.current &&
        isListeningRef.current &&
        !isAISpeakingRef.current &&
        !interviewEndedRef.current &&
        idleForMs >= AUTO_SUBMIT_RECENT_SPEECH_GUARD_MS &&
        words >= minimumWords
      ) {
        autoSubmitInProgressRef.current = true;
        void (submitAnswerRef.current?.() || Promise.resolve()).finally(() => {
          autoSubmitInProgressRef.current = false;
        });
      }
    }, timeoutMs);
  }, [clearSilenceTimeout, getBufferedAnswerText]);

  const appendFinalSegment = useCallback((segment: ASRSegment) => {
    const cleanText = segment.text.trim();
    if (!cleanText) return;

    const existing = finalSegmentsRef.current.find((item) => item.segmentId === segment.segmentId);
    if (existing) {
      existing.text = cleanText;
      existing.confidence = segment.confidence;
      existing.receivedAtMs = segment.receivedAtMs;
      existing.isFinal = true;
    } else {
      finalSegmentsRef.current.push({ ...segment, text: cleanText, isFinal: true });
    }

    lastSpeechTimeRef.current = Date.now();
    syncTranscriptDisplay();
    scheduleAutoSubmit(false);
  }, [scheduleAutoSubmit, syncTranscriptDisplay]);

  const handleAsrMessage = useCallback((payload: any) => {
    if (!payload || typeof payload !== 'object') return;

    if (payload.type === 'heartbeat' || payload.type === 'heartbeat_request') {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'heartbeat', client_ts: Date.now() }));
      }
      return;
    }

    if (payload.type === 'proxy_vad') {
      const nextState = payload.state;
      if (nextState === 'idle' || nextState === 'speech' || nextState === 'silence_grace' || nextState === 'finalize') {
        setEndpointState(nextState);
      }
      if (typeof payload.adaptive_silence_ms === 'number') {
        adaptiveSilenceMsRef.current = clamp(payload.adaptive_silence_ms, 600, 1800);
      }
      return;
    }

    if (payload.type === 'proxy_endpoint' && payload.action === 'finalize') {
      if (!AUTO_SUBMIT_ENABLED) {
        return;
      }
      if (
        isListeningRef.current &&
        !isAISpeakingRef.current &&
        !interviewEndedRef.current &&
        (finalSegmentsRef.current.length > 0 || interimTranscriptRef.current.trim().length > 0)
      ) {
        scheduleAutoSubmit(true);
      }
      return;
    }

    if (payload.type === 'Begin') {
      asrConnectedRef.current = true;
      reconnectAttemptRef.current = 0;
      return;
    }

    if (payload.type === 'Turn') {
      if (!isListeningRef.current || !acceptAsrTurnsRef.current || interviewEndedRef.current) {
        return;
      }

      const receivedAtMs =
        typeof payload.proxy_received_at_ms === 'number'
          ? payload.proxy_received_at_ms
          : Date.now();
      if (receivedAtMs + 150 < answerWindowStartMsRef.current) {
        return;
      }

      const transcriptText = String(payload.transcript || '').trim();
      const confidenceValue =
        typeof payload.proxy_confidence === 'number'
          ? clamp(payload.proxy_confidence, 0, 1)
          : typeof payload.confidence === 'number'
            ? clamp(payload.confidence, 0, 1)
            : null;

      if (payload.end_of_turn === true) {
        interimTranscriptRef.current = '';
        if (transcriptText) {
          const segmentId =
            (typeof payload.segment_id === 'string' && payload.segment_id) ||
            (typeof payload.turn_order === 'number' ? `turn-${payload.turn_order}` : `segment-${++asrSegmentCounterRef.current}`);

          appendFinalSegment({
            segmentId,
            text: transcriptText,
            confidence: confidenceValue,
            isFinal: true,
            receivedAtMs: Date.now(),
          });
        } else {
          syncTranscriptDisplay();
        }
      } else {
        interimTranscriptRef.current = transcriptText;
        if (transcriptText) {
          lastSpeechTimeRef.current = Date.now();
          scheduleAutoSubmit(false);
        }
        syncTranscriptDisplay();
      }
      return;
    }

    if (payload.type === 'error') {
      console.error('ASR proxy error:', payload.message || payload);
    }
  }, [appendFinalSegment, scheduleAutoSubmit, syncTranscriptDisplay]);

  const connectAsrSocket = useCallback(async () => {
    const wsBaseUrl = getWsProxyBaseUrl();
    const wsUrl = `${wsBaseUrl}?sample_rate=16000`;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        wsRef.current = ws;
        asrConnectedRef.current = true;

        const phraseHints = buildPhraseHints(session);
        ws.send(
          JSON.stringify({
            type: 'session_config',
            phrase_hints: phraseHints,
            energy_threshold: 0.0085,
          }),
        );

        ensureHeartbeat();
        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data || '{}'));
          handleAsrMessage(parsed);
        } catch {
          // Ignore unparsable messages
        }
      };

      ws.onerror = () => {
        asrConnectedRef.current = false;
      };

      ws.onclose = () => {
        asrConnectedRef.current = false;
        wsRef.current = null;

        if (!asrWantedRef.current || interviewEndedRef.current) {
          return;
        }

        const attempt = reconnectAttemptRef.current;
        const backoff = WS_RECONNECT_BACKOFF_MS[Math.min(attempt, WS_RECONNECT_BACKOFF_MS.length - 1)];
        reconnectAttemptRef.current = attempt + 1;

        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
        }

        reconnectTimerRef.current = setTimeout(() => {
          void connectAsrSocket();
        }, backoff);
      };

      window.setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          try {
            ws.close();
          } catch {
            // ignore
          }
          reject(new Error('ASR websocket connection timeout'));
        }
      }, 6000);
    });
  }, [ensureHeartbeat, handleAsrMessage, session]);

  const setupAudioPipeline = useCallback(async () => {
    if (audioContextRef.current && audioWorkletNodeRef.current) {
      return;
    }

    let sourceStream = streamRef.current;
    if (!sourceStream || sourceStream.getAudioTracks().length === 0) {
      sourceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    const audioTrack = sourceStream.getAudioTracks()[0];
    if (!audioTrack) {
      throw new Error('Microphone is not available');
    }

    const audioStream = new MediaStream([audioTrack]);
    asrMediaStreamRef.current = audioStream;

    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;

    await audioContext.audioWorklet.addModule('/audio/pcm16-worklet.js');

    const sourceNode = audioContext.createMediaStreamSource(audioStream);
    audioSourceNodeRef.current = sourceNode;

    const workletNode = new AudioWorkletNode(audioContext, 'pcm16-worklet-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
    });
    audioWorkletNodeRef.current = workletNode;

    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    audioSilentGainRef.current = silentGain;

    workletNode.port.onmessage = (event) => {
      const data = event.data;
      if (!data || data.type !== 'pcm_chunk') return;

      const rms = Number(data.rms || 0);
      const peak = Number(data.peak || 0);
      updateAudioStats(rms, peak);

      if (rms > 0.01) {
        lastSpeechTimeRef.current = Date.now();
      }

      if (!shouldStreamAudioRef.current) {
        return;
      }

      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }

      const pcm = data.pcm as ArrayBuffer;
      if (pcm && pcm.byteLength > 0) {
        ws.send(pcm);
      }
    };

    sourceNode.connect(workletNode);
    workletNode.connect(silentGain);
    silentGain.connect(audioContext.destination);
  }, [updateAudioStats]);

  const ensureASRSession = useCallback(async () => {
    asrWantedRef.current = true;
    await setupAudioPipeline();
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await connectAsrSocket();
    }
  }, [connectAsrSocket, setupAudioPipeline]);

  const startListening = useCallback(async () => {
    await ensureASRSession();
    resetCurrentAnswerBuffers();
    answerWindowStartMsRef.current = Date.now();
    acceptAsrTurnsRef.current = true;
    lastSpeechTimeRef.current = Date.now();
    setIsListening(true);
    isListeningRef.current = true;
    pauseAudioStreaming(false);
  }, [ensureASRSession, pauseAudioStreaming, resetCurrentAnswerBuffers]);

  const stopListening = useCallback(() => {
    clearSilenceTimeout();
    acceptAsrTurnsRef.current = false;
    setIsListening(false);
    isListeningRef.current = false;
    pauseAudioStreaming(true);
  }, [clearSilenceTimeout, pauseAudioStreaming]);

  const runReadinessChecks = useCallback(async (): Promise<boolean> => {
    setReadinessStatus({
      status: 'running',
      message: 'Checking microphone gain and background noise. Please stay silent for a moment.',
      micGainScore: 0,
      noiseScore: 0,
      sampleSentence: '',
      sampleConfidence: 0,
    });

    try {
      await ensureASRSession();
      pauseAudioStreaming(true);
      resetAudioStats();

      await waitMs(1800);
      const backgroundNoise = averageAudioRms();

      setReadinessStatus((prev) => ({
        ...prev,
        message: 'Sample sentence test: Please say "I am ready for this interview" now.',
      }));

      resetCurrentAnswerBuffers();
      resetAudioStats();
      answerWindowStartMsRef.current = Date.now();
      acceptAsrTurnsRef.current = true;
      setIsListening(true);
      isListeningRef.current = true;
      pauseAudioStreaming(false);

      const sampleStart = Date.now();
      while (Date.now() - sampleStart < 8500) {
        await waitMs(200);
        const transcriptLength = [
          finalSegmentsRef.current.map((segment) => segment.text).join(' ').trim(),
          interimTranscriptRef.current.trim(),
        ]
          .filter(Boolean)
          .join(' ')
          .trim().length;

        if (transcriptLength >= 8) {
          break;
        }
      }

      stopListening();

      const sampleSentence = [
        finalSegmentsRef.current.map((segment) => segment.text).join(' ').trim(),
        interimTranscriptRef.current.trim(),
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

      const confidences = finalSegmentsRef.current
        .map((segment) => segment.confidence)
        .filter((value): value is number => typeof value === 'number');
      const sampleConfidence = confidences.length
        ? confidences.reduce((acc, cur) => acc + cur, 0) / confidences.length
        : 0;

      const micPeak = audioStatsRef.current.peak;
      const micGainScore = clamp(Math.round((micPeak / 0.07) * 100), 0, 100);
      const noiseScore = clamp(Math.round((1 - backgroundNoise / 0.03) * 100), 0, 100);

      const sampleWords = wordCount(sampleSentence);
      const micOk = micPeak >= 0.006;
      const sampleOk = sampleWords >= 3;
      const confidenceOk = sampleConfidence >= 0.35 || confidences.length === 0;
      const speechDetected = micPeak >= Math.max(backgroundNoise * 2.2, 0.012);
      const ready = micOk && ((sampleOk && confidenceOk) || speechDetected);

      setReadinessStatus({
        status: ready ? 'passed' : 'failed',
        message: ready
          ? sampleOk
            ? 'Readiness check passed. You can start the interview.'
            : 'Readiness check passed with partial transcript capture. You can start the interview.'
          : 'Readiness check failed. Check microphone level and speak the sample sentence clearly, then retry.',
        micGainScore,
        noiseScore,
        sampleSentence,
        sampleConfidence,
      });

      resetCurrentAnswerBuffers();
      return ready;
    } catch (readinessError) {
      stopListening();
      setReadinessStatus({
        status: 'failed',
        message: 'Could not complete readiness check. Please allow microphone access and retry.',
        micGainScore: 0,
        noiseScore: 0,
        sampleSentence: '',
        sampleConfidence: 0,
      });
      return false;
    }
  }, [
    averageAudioRms,
    ensureASRSession,
    pauseAudioStreaming,
    resetAudioStats,
    resetCurrentAnswerBuffers,
    stopListening,
  ]);

  const saveTranscript = useCallback(async () => {
    if (!session?.id || transcriptSaveInFlightRef.current || transcriptSavedRef.current) return;

    transcriptSaveInFlightRef.current = true;
    try {
      const transcriptData = messagesRef.current.map((message) => ({
        role: message.role,
        content: message.content,
        timestamp: message.timestamp.toISOString(),
        meta: message.meta || null,
      }));

      const storedResume = localStorage.getItem(`resume_${token}`) || '';
      const resumeFilename = localStorage.getItem(`resume_filename_${token}`) || '';
      const safeResumeText = sanitizeResumeForPayload(storedResume);

      const response = await fetch(`${API_BASE_URL}/hr/interviews/${session.id}/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcriptData,
          duration_seconds: elapsedTime,
          resume_text: safeResumeText,
          resume_filename: resumeFilename,
        }),
      });

      if (response.ok) {
        transcriptSavedRef.current = true;
      } else {
        console.error('Failed to save transcript. Status:', response.status);
      }
    } catch {
      console.error('Failed to save transcript');
    } finally {
      transcriptSaveInFlightRef.current = false;
    }
  }, [API_BASE_URL, elapsedTime, sanitizeResumeForPayload, session?.id, token]);

  const askExplicitQuestion = useCallback(async (question: string, nextIndex: number) => {
    const normalized = normalizeQuestionKey(question);
    if (!normalized) return;

    let duplicate = askedQuestionKeysRef.current.has(normalized);
    if (!duplicate) {
      for (const askedKey of askedQuestionKeysRef.current) {
        if (questionSimilarity(askedKey, normalized) >= 0.84) {
          duplicate = true;
          break;
        }
      }
    }

    if (duplicate) {
      return;
    }

    askedQuestionKeysRef.current.add(normalized);
    currentQuestionTextRef.current = question;

    setCurrentQuestionIndex(nextIndex);
    addMessage('ai', question, {
      transcript_source: 'ai',
      is_final: true,
    });

    await speakText(question, { gender: 'female' });
    await startListening();
  }, [addMessage, normalizeQuestionKey, questionSimilarity, speakText, startListening]);

  const askQuestion = useCallback(async (questionIndex: number) => {
    const questions = session?.questions_generated || [];
    if (questions.length === 0) {
      return;
    }

    let selectedIndex = -1;
    for (let i = questionIndex; i < questions.length; i += 1) {
      const candidateQuestion = questions[i];
      const candidateKey = normalizeQuestionKey(candidateQuestion);
      if (!candidateKey) continue;

      let duplicate = askedQuestionKeysRef.current.has(candidateKey);
      if (!duplicate) {
        for (const askedKey of askedQuestionKeysRef.current) {
          if (questionSimilarity(candidateKey, askedKey) >= 0.84) {
            duplicate = true;
            break;
          }
        }
      }

      if (!duplicate) {
        selectedIndex = i;
        break;
      }
    }

    if (selectedIndex === -1) {
      const closingMessage = 'Thank you for completing the interview. We appreciate your time and will share the outcome soon.';
      addMessage('ai', closingMessage, {
        transcript_source: 'ai',
        is_final: true,
      });
      await speakText(closingMessage, { gender: 'female' });
      setInterviewEnded(true);
      interviewEndedRef.current = true;
      await saveTranscript();
      return;
    }

    const question = questions[selectedIndex];
    askedQuestionKeysRef.current.add(normalizeQuestionKey(question));
    currentQuestionTextRef.current = question;

    if (selectedIndex !== currentQuestionIndex) {
      setCurrentQuestionIndex(selectedIndex);
    }

    addMessage('ai', question, {
      transcript_source: 'ai',
      is_final: true,
    });
    await speakText(question, { gender: 'female' });
    await startListening();
  }, [
    addMessage,
    currentQuestionIndex,
    normalizeQuestionKey,
    questionSimilarity,
    saveTranscript,
    session?.questions_generated,
    speakText,
    startListening,
  ]);

  const sanitizeAdaptiveFeedback = useCallback((rawFeedback: string, isLastQuestion: boolean): string => {
    let cleaned = String(rawFeedback || '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return '';

    // Remove question echo snippets such as: for "...."
    cleaned = cleaned.replace(/\s*for\s*["“][^"”]+["”]\.?\s*/gi, ' ');

    // Remove transitional phrase at source to avoid repetitive narration.
    cleaned = cleaned.replace(/\s*moving to the next question\.?\s*/gi, ' ');

    cleaned = cleaned
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([.,!?])/g, '$1')
      .trim();

    if (!cleaned) {
      return isLastQuestion ? '' : 'Thanks, I captured your response.';
    }

    return cleaned;
  }, []);

  const getAdaptiveFeedback = useCallback(async (answerText: string): Promise<AdaptiveFeedbackResult> => {
    const fallbackForNoIdea = looksLikeNoIdeaAnswer(answerText);

    const fallback: AdaptiveFeedbackResult = fallbackForNoIdea
      ? {
          feedback: 'Thanks for being honest. Share what you would try first, even if you are not fully sure.',
          shouldRetryCurrentQuestion: true,
        }
      : answerText.trim().length < 35
        ? {
            feedback: 'I captured a short answer. Please add one concrete example or detail before we move ahead.',
            shouldRetryCurrentQuestion: true,
          }
        : {
            feedback: 'Thanks, I captured your response.',
            shouldRetryCurrentQuestion: false,
          };

    try {
      const conversationHistory = messagesRef.current
        .filter((item) => item.role === 'ai' || item.role === 'user')
        .map((item) => ({
          question: item.role === 'ai' ? item.content : '',
          answer: item.role === 'user' ? item.content : '',
        }));

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 9000);

      const response = await fetch('/api/ai/interview-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentQuestion: currentQuestionTextRef.current || (session?.questions_generated?.[currentQuestionIndex] || ''),
          answer: answerText,
          jobTitle: session?.position || '',
          company: session?.company_name || '',
          resumeText: resumeText || '',
          conversationHistory,
          questionsAnswered: currentQuestionIndex + 1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return fallback;
      }

      const payload = await response.json();
      const feedback = String(payload.contentFeedback || '').trim();
      const nextQuestion = String(payload.nextQuestion || '').trim();
      const shouldRetryCurrentQuestion = Boolean(payload.shouldRetryQuestion);

      if (!feedback) {
        return {
          ...fallback,
          nextQuestion: nextQuestion || undefined,
          shouldRetryCurrentQuestion,
        };
      }

      return {
        feedback,
        nextQuestion: nextQuestion || undefined,
        shouldRetryCurrentQuestion,
      };
    } catch {
      return fallback;
    }
  }, [currentQuestionIndex, resumeText, session?.company_name, session?.position, session?.questions_generated]);

  const submitAnswer = useCallback(async () => {
    if (interviewEndedRef.current || isAISpeakingRef.current) return;

    const finalText = finalSegmentsRef.current.map((segment) => segment.text).join(' ').trim();
    const interimText = interimTranscriptRef.current.trim();
    const answerText = [finalText, interimText].filter(Boolean).join(' ').trim();

    if (!answerText) return;

    const confidences = finalSegmentsRef.current
      .map((segment) => segment.confidence)
      .filter((value): value is number => typeof value === 'number');
    const avgConfidence = confidences.length
      ? confidences.reduce((acc, cur) => acc + cur, 0) / confidences.length
      : null;

    stopListening();
    clearSilenceTimeout();

    if (avgConfidence !== null && avgConfidence < LOW_CONFIDENCE_THRESHOLD && answerText.length < 20) {
      const lowConfidencePrompt = 'I did not catch that clearly. Please repeat your answer in one or two complete sentences.';
      addMessage('ai', lowConfidencePrompt, {
        transcript_source: 'system',
        is_final: true,
        confidence: avgConfidence,
        flags: ['low_confidence_reprompt'],
      });
      await speakText(lowConfidencePrompt, { gender: 'female' });
      await startListening();
      return;
    }

    addMessage('user', answerText, {
      transcript_source: 'asr',
      is_final: true,
      confidence: avgConfidence,
      segment_id: finalSegmentsRef.current.map((segment) => segment.segmentId).join(','),
      start_ms: finalSegmentsRef.current.length
        ? finalSegmentsRef.current[0].receivedAtMs
        : Date.now(),
      end_ms: finalSegmentsRef.current.length
        ? finalSegmentsRef.current[finalSegmentsRef.current.length - 1].receivedAtMs
        : Date.now(),
      flags: [`segment_count:${finalSegmentsRef.current.length}`],
    });

    resetCurrentAnswerBuffers();

    const adaptiveFeedback = await getAdaptiveFeedback(answerText);
    const totalQuestions = session?.questions_generated?.length || 0;
    const isLastQuestion = totalQuestions > 0 && currentQuestionIndex >= totalQuestions - 1;
    const sanitizedFeedback = sanitizeAdaptiveFeedback(adaptiveFeedback.feedback || '', isLastQuestion);

    if (sanitizedFeedback) {
      addMessage('ai', sanitizedFeedback, {
        transcript_source: 'ai',
        is_final: true,
      });
      await speakText(sanitizedFeedback, { gender: 'female' });
    }

    if (adaptiveFeedback.shouldRetryCurrentQuestion) {
      await startListening();
      return;
    }

    const nextIndex = currentQuestionIndex + 1;
    setCurrentQuestionIndex(nextIndex);

    const adaptiveNextQuestion = adaptiveFeedback.nextQuestion;
    if (adaptiveNextQuestion) {
      const normalizedAdaptive = normalizeQuestionKey(adaptiveNextQuestion);
      let duplicate = false;
      if (normalizedAdaptive) {
        duplicate = askedQuestionKeysRef.current.has(normalizedAdaptive);
        if (!duplicate) {
          for (const askedKey of askedQuestionKeysRef.current) {
            if (questionSimilarity(normalizedAdaptive, askedKey) >= 0.84) {
              duplicate = true;
              break;
            }
          }
        }
      }

      if (!duplicate && normalizedAdaptive) {
        await askExplicitQuestion(adaptiveNextQuestion, nextIndex);
        return;
      }
    }

    clearPendingNextQuestion();
    pendingNextQuestionTimeoutRef.current = setTimeout(() => {
      void askQuestion(nextIndex);
    }, 400);
  }, [
    addMessage,
    askExplicitQuestion,
    askQuestion,
    clearPendingNextQuestion,
    clearSilenceTimeout,
    currentQuestionIndex,
    getAdaptiveFeedback,
    normalizeQuestionKey,
    questionSimilarity,
    resetCurrentAnswerBuffers,
    sanitizeAdaptiveFeedback,
    session?.questions_generated?.length,
    speakText,
    startListening,
    stopListening,
  ]);

  useEffect(() => {
    submitAnswerRef.current = submitAnswer;
  }, [submitAnswer]);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/interviews/by-token/${token}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        });
        if (!response.ok) {
          setError('Interview session not found.');
          return;
        }
        const data = await response.json();
        setSession(data);

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
  }, [API_BASE_URL, token]);

  useEffect(() => {
    if (!interviewStarted || interviewEnded) return;
    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [interviewEnded, interviewStarted]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    interviewEndedRef.current = interviewEnded;
  }, [interviewEnded]);

  useEffect(() => {
    isAISpeakingRef.current = isAISpeaking;
  }, [isAISpeaking]);

  // Pre-load speech synthesis voices on mount
  useEffect(() => {
    if ('speechSynthesis' in window) {
      speechSynthesis.getVoices();
      const onVoicesChanged = () => {
        speechSynthesis.getVoices();
      };
      speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
      return () => speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
    }
  }, []);

  useEffect(() => {
    const setupCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
          },
          audio: false,
        });
        streamRef.current = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.onloadedmetadata = () => {
            void videoRef.current?.play().catch(() => {
              // ignore autoplay rejection
            });
          };
        }
        setCameraUnavailable(false);
      } catch {
        console.error('Failed to access camera preview.');
        setCameraUnavailable(true);
      }
    };

    setupCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!interviewStarted || interviewEnded) return;

    const interval = setInterval(() => {
      if (!isListeningRef.current || isAISpeakingRef.current || interviewEndedRef.current) return;

      const idleForMs = Date.now() - lastSpeechTimeRef.current;
      if (idleForMs < LONG_SILENCE_PROMPT_MS) {
        return;
      }

      if (Date.now() - lastLongSilencePromptRef.current < LONG_SILENCE_PROMPT_MS) {
        return;
      }

      lastLongSilencePromptRef.current = Date.now();
      const prompt = 'Take your time. I am listening when you are ready to continue.';
      addMessage('ai', prompt, {
        transcript_source: 'system',
        is_final: true,
        flags: ['long_silence_prompt'],
      });

      void speakText(prompt, { gender: 'female' });
    }, 1000);

    return () => clearInterval(interval);
  }, [addMessage, interviewEnded, interviewStarted, speakText]);

  useEffect(() => {
    return () => {
      clearSilenceTimeout();
      clearPendingNextQuestion();
      teardownASRSession();
    };
  }, [clearPendingNextQuestion, clearSilenceTimeout, teardownASRSession]);

  const startInterview = async () => {
    const readinessPassed = await runReadinessChecks();
    if (!readinessPassed) {
      return;
    }

    setInterviewStarted(true);
    transcriptSavedRef.current = false;
    interviewEndedRef.current = false;
    askedQuestionKeysRef.current.clear();
    asrWantedRef.current = true;

    const welcomeMessage = `Hello ${session?.candidate_name}. Welcome to your interview for the ${session?.position} position at ${session?.company_name}. I will ask a series of questions. Please answer clearly and with practical examples.`;

    addMessage('ai', welcomeMessage, {
      transcript_source: 'ai',
      is_final: true,
      flags: ['welcome_message'],
    });
    await speakText(welcomeMessage, { gender: 'female' });

    await askQuestion(0);
  };

  const endInterview = async () => {
    stopListening();
    clearPendingNextQuestion();
    speechSynthesis.cancel();

    const endMessage = 'The interview has ended. Thank you for your time.';
    addMessage('ai', endMessage, {
      transcript_source: 'ai',
      is_final: true,
    });

    setInterviewEnded(true);
    interviewEndedRef.current = true;
    asrWantedRef.current = false;

    await saveTranscript();
    teardownASRSession();
  };

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
            <div className="text-center">
              <p className="text-xs text-gray-400">Speech State</p>
              <p className="text-sm uppercase tracking-wide">{endpointState.replace('_', ' ')}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-64px)]">
        <div className="flex-1 p-4">
          <div className="relative h-full rounded-xl overflow-hidden bg-gray-800">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />

            {cameraUnavailable && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-6 text-center">
                <div>
                  <p className="text-sm text-red-300">Camera preview unavailable.</p>
                  <p className="text-xs text-gray-300 mt-2">Allow camera permission in browser settings and reload this page.</p>
                </div>
              </div>
            )}

            {isAISpeaking && (
              <div className="absolute top-4 left-4 bg-blue-600 px-4 py-2 rounded-full flex items-center gap-2">
                <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                <span className="text-sm">AI Speaking...</span>
              </div>
            )}

            {isListening && (
              <div className="absolute top-4 right-4 bg-red-600 px-4 py-2 rounded-full flex items-center gap-2">
                <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                <span className="text-sm">Listening...</span>
              </div>
            )}

            {!interviewStarted && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-6">
                <div className="text-center max-w-xl">
                  <h2 className="text-3xl font-bold mb-4">Ready to Begin?</h2>
                  <p className="text-gray-300 mb-6">
                    We will run live speech checks before the interview starts: mic gain, noise level, and a sample sentence test.
                  </p>

                  <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-4 mb-6 text-left">
                    <p className="text-sm text-gray-300 mb-2">Readiness Status: <span className="font-medium text-white uppercase">{readinessStatus.status}</span></p>
                    <p className="text-sm text-gray-400 mb-3">{readinessStatus.message}</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-gray-800 rounded-lg p-2">
                        <p className="text-gray-400">Mic Gain</p>
                        <p className="font-semibold text-white">{readinessStatus.micGainScore}%</p>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-2">
                        <p className="text-gray-400">Noise Score</p>
                        <p className="font-semibold text-white">{readinessStatus.noiseScore}%</p>
                      </div>
                    </div>
                    {readinessStatus.sampleSentence && (
                      <p className="text-xs text-gray-400 mt-3">
                        Sample transcript: {readinessStatus.sampleSentence}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={startInterview}
                    disabled={readinessStatus.status === 'running'}
                    className={`px-8 py-4 rounded-xl font-semibold text-lg transition ${
                      readinessStatus.status === 'running'
                        ? 'bg-gray-600 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {readinessStatus.status === 'running' ? 'Running Checks...' : 'Start Interview'}
                  </button>
                </div>
              </div>
            )}

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
                    Thank you for completing the interview. Results will be shared soon.
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
                  {msg.meta?.confidence !== undefined && msg.meta?.confidence !== null && (
                    <p className="text-[11px] mt-1 opacity-80">confidence: {(msg.meta.confidence * 100).toFixed(0)}%</p>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

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

    </div>
  );
}
