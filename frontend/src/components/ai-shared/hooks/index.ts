/**
 * Custom hook for WebSocket-based real-time communication in AI interviews
 * Handles bidirectional communication between client and server for:
 * - Real-time transcription updates
 * - Interview state synchronization  
 * - Question delivery
 * - Feedback streaming
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketMessage } from '../types';

export interface UseWebSocketOptions {
    url: string;
    sessionId?: string;
    onMessage?: (message: WebSocketMessage) => void;
    onError?: (error: Event) => void;
    onOpen?: () => void;
    onClose?: () => void;
    autoReconnect?: boolean;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
}

export interface UseWebSocketReturn {
    sendMessage: (message: Partial<WebSocketMessage>) => void;
    isConnected: boolean;
    error: string | null;
    reconnect: () => void;
    close: () => void;
}

/**
 * WebSocket hook for real-time interview communication
 * Features:
 * - Automatic reconnection on disconnect
 * - Message queuing when disconnected
 * - Connection state management
 * - Error handling and recovery
 */
export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
    const {
        url,
        sessionId,
        onMessage,
        onError,
        onOpen,
        onClose,
        autoReconnect = true,
        reconnectInterval = 3000,
        maxReconnectAttempts = 5,
    } = options;

    const wsRef = useRef<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const reconnectCountRef = useRef(0);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const messageQueueRef = useRef<Partial<WebSocketMessage>[]>([]);

    const connect = useCallback(() => {
        try {
            const wsUrl = sessionId ? `${url}/${sessionId}` : url;
            const ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('[WebSocket] Connected to:', wsUrl);
                setIsConnected(true);
                setError(null);
                reconnectCountRef.current = 0;

                // Send queued messages
                while (messageQueueRef.current.length > 0) {
                    const queuedMessage = messageQueueRef.current.shift();
                    if (queuedMessage) {
                        ws.send(JSON.stringify({
                            ...queuedMessage,
                            timestamp: Date.now(),
                        }));
                    }
                }

                onOpen?.();
            };

            ws.onmessage = (event) => {
                try {
                    const message: WebSocketMessage = JSON.parse(event.data);
                    onMessage?.(message);
                } catch (err) {
                    console.error('[WebSocket] Failed to parse message:', err);
                }
            };

            ws.onerror = (event) => {
                console.error('[WebSocket] Error:', event);
                setError('WebSocket connection error');
                onError?.(event);
            };

            ws.onclose = (event) => {
                console.log('[WebSocket] Closed:', event.code, event.reason);
                setIsConnected(false);
                wsRef.current = null;

                onClose?.();

                // Auto-reconnect if enabled and not intentional close
                if (autoReconnect && event.code !== 1000 && reconnectCountRef.current < maxReconnectAttempts) {
                    reconnectCountRef.current += 1;
                    console.log(`[WebSocket] Reconnecting... Attempt ${reconnectCountRef.current}/${maxReconnectAttempts}`);

                    reconnectTimeoutRef.current = setTimeout(() => {
                        connect();
                    }, reconnectInterval);
                } else if (reconnectCountRef.current >= maxReconnectAttempts) {
                    setError('Max reconnection attempts reached');
                }
            };

            wsRef.current = ws;
        } catch (err) {
            console.error('[WebSocket] Connection failed:', err);
            setError('Failed to establish WebSocket connection');
        }
    }, [url, sessionId, autoReconnect, reconnectInterval, maxReconnectAttempts, onMessage, onError, onOpen, onClose]);

    const sendMessage = useCallback((message: Partial<WebSocketMessage>) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                ...message,
                timestamp: Date.now(),
            }));
        } else {
            // Queue message if not connected
            console.log('[WebSocket] Queueing message - not connected');
            messageQueueRef.current.push(message);
        }
    }, []);

    const close = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }
        wsRef.current?.close(1000, 'Client closed connection');
        wsRef.current = null;
        setIsConnected(false);
    }, []);

    const reconnect = useCallback(() => {
        close();
        reconnectCountRef.current = 0;
        connect();
    }, [close, connect]);

    useEffect(() => {
        connect();
        return () => {
            close();
        };
    }, [connect, close]);

    return {
        sendMessage,
        isConnected,
        error,
        reconnect,
        close,
    };
}

/**
 * Hook for monitoring audio/voice activity
 * Used for:
 * - Voice detection during interviews
 * - Volume level monitoring
 * - Silence detection
 */
export interface UseVoiceMonitorOptions {
    onVoiceActivity?: (isActive: boolean) => void;
    onVolumeChange?: (volume: number) => void;
    silenceThreshold?: number; // Volume level below which is considered silence (0-1)
    activityThreshold?: number; // Volume level above which is considered voice activity (0-1)
    enabled?: boolean;
}

export interface UseVoiceMonitorReturn {
    volume: number;
    isVoiceActive: boolean;
    lastActivityTime: number;
    start: () => Promise<void>;
    stop: () => void;
}

export function useVoiceMonitor(options: UseVoiceMonitorOptions): UseVoiceMonitorReturn {
    const {
        onVoiceActivity,
        onVolumeChange,
        silenceThreshold = 0.01,
        activityThreshold = 0.05,
        enabled = true,
    } = options;

    const [volume, setVolume] = useState(0);
    const [isVoiceActive, setIsVoiceActive] = useState(false);
    const [lastActivityTime, setLastActivityTime] = useState(Date.now());

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const updateVolume = useCallback(() => {
        if (!analyserRef.current || !enabled) return;

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalizedVolume = average / 255;

        setVolume(normalizedVolume);
        onVolumeChange?.(normalizedVolume);

        // Detect voice activity
        if (normalizedVolume > activityThreshold) {
            if (!isVoiceActive) {
                setIsVoiceActive(true);
                onVoiceActivity?.(true);
            }
            setLastActivityTime(Date.now());
        } else if (normalizedVolume < silenceThreshold && isVoiceActive) {
            setIsVoiceActive(false);
            onVoiceActivity?.(false);
        }

        animationFrameRef.current = requestAnimationFrame(updateVolume);
    }, [enabled, activityThreshold, silenceThreshold, isVoiceActive, onVoiceActivity, onVolumeChange]);

    const start = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const microphone = audioContext.createMediaStreamSource(stream);

            analyser.fftSize = 256;
            microphone.connect(analyser);

            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            updateVolume();
        } catch (error) {
            console.error('[VoiceMonitor] Failed to start:', error);
        }
    }, [updateVolume]);

    const stop = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;

        if (audioContextRef.current?.state !== 'closed') {
            audioContextRef.current?.close();
        }
        audioContextRef.current = null;
        analyserRef.current = null;

        setVolume(0);
        setIsVoiceActive(false);
    }, []);

    useEffect(() => {
        if (enabled) {
            start();
        }
        return () => stop();
    }, [enabled, start, stop]);

    return {
        volume,
        isVoiceActive,
        lastActivityTime,
        start,
        stop,
    };
}

/**
 * Hook for idle detection during interviews
 * Automatically ends interview or shows warning after inactivity
 */
export interface UseIdleDetectionOptions {
    timeout: number; // Time in ms before considered idle
    onIdle: () => void;
    enabled?: boolean;
    warningTime?: number; // Time before timeout to show warning
    onWarning?: () => void;
}

export function useIdleDetection(options: UseIdleDetectionOptions) {
    const { timeout, onIdle, enabled = true, warningTime, onWarning } = options;

    const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
    const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastActivityRef = useRef(Date.now());

    const resetTimer = useCallback(() => {
        lastActivityRef.current = Date.now();

        // Clear existing timers
        if (idleTimerRef.current) {
            clearTimeout(idleTimerRef.current);
        }
        if (warningTimerRef.current) {
            clearTimeout(warningTimerRef.current);
        }

        if (!enabled) return;

        // Set warning timer if specified
        if (warningTime && onWarning) {
            warningTimerRef.current = setTimeout(() => {
                onWarning();
            }, warningTime);
        }

        // Set idle timer
        idleTimerRef.current = setTimeout(() => {
            console.log('[IdleDetection] User idle for', timeout, 'ms');
            onIdle();
        }, timeout);
    }, [timeout, onIdle, enabled, warningTime, onWarning]);

    useEffect(() => {
        if (!enabled) return;

        const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];

        events.forEach(event => {
            window.addEventListener(event, resetTimer);
        });

        // Initialize timer
        resetTimer();

        return () => {
            events.forEach(event => {
                window.removeEventListener(event, resetTimer);
            });
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        };
    }, [enabled, resetTimer]);

    return {
        lastActivity: lastActivityRef.current,
        resetTimer,
    };
}
