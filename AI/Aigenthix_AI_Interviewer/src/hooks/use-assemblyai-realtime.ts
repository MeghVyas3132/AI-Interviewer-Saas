'use client';

import { useCallback, useRef, useState } from 'react';

const DEFAULT_SAMPLE_RATE = 16_000;

type TranscriptSegment = {
  id: string;
  text: string;
  turnOrder: number;
  timestamp: number;
};

type AssemblyAIRealtimeState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'error';

export function useAssemblyAIRealtime(sampleRate = DEFAULT_SAMPLE_RATE) {
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sessionReadyRef = useRef<boolean>(false);
  const audioBufferRef = useRef<Int16Array[]>([]);
  const beginTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [status, setStatus] = useState<AssemblyAIRealtimeState>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cleanupAudioNodes = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;

    sourceRef.current?.disconnect();
    sourceRef.current = null;

    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
      } catch (closeErr) {
        console.warn('AudioContext already closed', closeErr);
      }
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    if (beginTimeoutRef.current) {
      clearTimeout(beginTimeoutRef.current);
      beginTimeoutRef.current = null;
    }
    if (wsRef.current) {
      // Send terminate message before closing
      if (wsRef.current.readyState === WebSocket.OPEN && sessionReadyRef.current) {
        wsRef.current.send(JSON.stringify({ type: 'Terminate' }));
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    sessionReadyRef.current = false;
    audioBufferRef.current = [];
    if (error) {
      setError(null);
    }
    cleanupAudioNodes();
    setStatus('idle');
  }, [cleanupAudioNodes]);

  const resetTranscripts = useCallback(() => {
    setSegments([]);
    setPartialTranscript('');
    sessionReadyRef.current = false;
    audioBufferRef.current = [];
  }, []);

  const start = useCallback(async () => {
    if (status === 'connecting' || status === 'listening') {
      return;
    }

    setError(null);
    setStatus('connecting');
    sessionReadyRef.current = false;
    audioBufferRef.current = [];

    try {
      // Get microphone access first
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      mediaStreamRef.current = mediaStream;

      // Setup audio context
      const audioContext = new AudioContext({ sampleRate });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(mediaStream);
      sourceRef.current = source;

      const processor = audioContext.createScriptProcessor(1024, 1, 1);
      processorRef.current = processor;

      // Connect to our WebSocket proxy server (which handles AssemblyAI auth)
      // The proxy server runs on port 9003 and forwards to AssemblyAI with proper headers
      // Use environment variable for production/Docker, fallback to localhost for development
      const wsProxyUrl = process.env.NEXT_PUBLIC_WS_PROXY_URL || 'ws://localhost:9003';
      const wsUrl = `${wsProxyUrl}?sample_rate=${sampleRate}`;
      
      const socket = new WebSocket(wsUrl);
      socket.binaryType = 'arraybuffer';
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('Connected to WebSocket proxy, waiting for AssemblyAI session...');
        // Set a timeout to wait for Begin message (10 seconds)
        beginTimeoutRef.current = setTimeout(() => {
          if (!sessionReadyRef.current) {
            console.error('Timeout waiting for AssemblyAI Begin message');
            setError('Timeout waiting for session to start');
            setStatus('error');
            stop();
          }
        }, 10000);
      };

      socket.onmessage = event => {
        console.log('📨 Received WebSocket message, type:', typeof event.data, 'length:', event.data?.length || 0);
        try {
          // AssemblyAI sends JSON text messages
          if (typeof event.data !== 'string') {
            console.warn('Received non-string message, converting...');
            // Try to convert ArrayBuffer/Blob to string
            if (event.data instanceof ArrayBuffer) {
              const decoder = new TextDecoder();
              const text = decoder.decode(event.data);
              console.log('Converted ArrayBuffer to string:', text.substring(0, 100));
              const data = JSON.parse(text);
              console.log('Parsed data:', data);
              handleMessage(data);
              return;
            }
            // Binary data shouldn't come from AssemblyAI, but handle gracefully
            return;
          }

          console.log('Raw message string:', event.data.substring(0, 200));
          const data = JSON.parse(event.data);
          console.log('Parsed AssemblyAI message:', data);
          handleMessage(data);
        } catch (messageError) {
          console.error('Failed to parse AssemblyAI message:', messageError, 'Data:', event.data);
        }
      };

      const handleMessage = (data: any) => {
          
          // Handle v3 message types according to API docs
          if (data.type === 'Begin') {
            console.log('Session began:', data.id, 'Expires at:', data.expires_at);
            // Clear timeout
            if (beginTimeoutRef.current) {
              clearTimeout(beginTimeoutRef.current);
              beginTimeoutRef.current = null;
            }
            // Session is ready, we can start sending audio
            sessionReadyRef.current = true;
            setStatus('listening'); // Now we're actually listening
            
            // Send any buffered audio
            if (audioBufferRef.current.length > 0) {
              console.log('Sending buffered audio chunks:', audioBufferRef.current.length);
              audioBufferRef.current.forEach(chunk => {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(chunk);
                }
              });
              audioBufferRef.current = [];
            }
          } else if (data.type === 'Turn') {
            const transcriptText = data.transcript ?? '';
            
            // Check if this is a final or partial transcript
            if (data.end_of_turn === true) {
              // Final transcript for this turn
              if (transcriptText.trim()) {
                setSegments(prev => {
                  const existingIndex = prev.findIndex(
                    segment => segment.turnOrder === data.turn_order,
                  );
                  
                  const nextSegment: TranscriptSegment = {
                    id: `turn-${data.turn_order}`,
                    turnOrder: data.turn_order,
                    text: transcriptText,
                    timestamp: Date.now(),
                  };

                  if (existingIndex === -1) {
                    return [...prev, nextSegment].sort(
                      (a, b) => a.turnOrder - b.turnOrder,
                    );
                  }

                  const updated = [...prev];
                  updated[existingIndex] = nextSegment;
                  return updated;
                });
              }
              setPartialTranscript('');
            } else {
              // Partial transcript (interim results)
              setPartialTranscript(transcriptText);
            }
          } else if (data.type === 'Termination') {
            console.warn('Session terminated:', data);
            setError('Session terminated');
            setStatus('error');
            stop();
          }
      };

      socket.onerror = event => {
        console.error('WebSocket proxy error', event);
        // Don't immediately stop - let onclose handle it
        setError('WebSocket error - see console for details');
      };

      socket.onclose = (event) => {
        console.log('WebSocket proxy closed', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        
        // Code 1000 = normal closure, 1001 = going away, 1005 = no status code
        // Code 1005 often means the connection was closed without a proper close frame
        if (event.code === 1005) {
          console.warn('Connection closed without status code (1005) - may indicate network issue');
        }
        
        if (event.code !== 1000 && event.code !== 1001) {
          if (event.code !== 1005 || sessionReadyRef.current) {
            // Only set error if it's not a 1005 or if we were already connected
            setError(`Connection closed: ${event.reason || `Code ${event.code}`}`);
          }
        }
        stop();
      };

      // Setup audio processing
      processor.onaudioprocess = event => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          return;
        }

        const inputData = event.inputBuffer.getChannelData(0);
        
        // Downsample if necessary
        const targetData = audioContext.sampleRate === sampleRate 
          ? inputData 
          : downsampleBuffer(inputData, audioContext.sampleRate, sampleRate);

        if (!targetData) {
          return;
        }

        // Convert to 16-bit PCM
        const int16Buffer = convertFloat32ToInt16(targetData);
        
        // Wait for session to be ready (Begin message received)
        if (!sessionReadyRef.current) {
          // Buffer audio until session is ready
          audioBufferRef.current.push(int16Buffer);
          // Limit buffer size to prevent memory issues (max ~1 second of audio)
          if (audioBufferRef.current.length > 20) {
            audioBufferRef.current.shift();
          }
          return;
        }
        
        // Send raw PCM data directly (v3 accepts binary data)
        // Audio chunks should be between 50ms-1000ms
        // Our buffer size (1024 samples at 16kHz = ~64ms) is within range
        wsRef.current.send(int16Buffer);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

    } catch (err) {
      console.error('Unable to start AssemblyAI streaming', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
      stop();
    }
  }, [sampleRate, status, stop]);

  return {
    start,
    stop,
    resetTranscripts,
    status,
    error,
    partialTranscript,
    segments,
  };
}

function downsampleBuffer(
  buffer: Float32Array,
  sampleRate: number,
  outSampleRate: number,
) {
  if (outSampleRate === sampleRate) {
    return buffer;
  }

  if (outSampleRate > sampleRate) {
    throw new Error('Output sample rate must be less than input sample rate');
  }

  const sampleRateRatio = sampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;

    for (
      let i = offsetBuffer;
      i < nextOffsetBuffer && i < buffer.length;
      i += 1
    ) {
      accum += buffer[i];
      count += 1;
    }

    result[offsetResult] = accum / count;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function convertFloat32ToInt16(buffer: Float32Array) {
  const len = buffer.length;
  const result = new Int16Array(len);

  for (let i = 0; i < len; i += 1) {
    const value = Math.max(-1, Math.min(1, buffer[i]));
    result[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }

  return result;
}