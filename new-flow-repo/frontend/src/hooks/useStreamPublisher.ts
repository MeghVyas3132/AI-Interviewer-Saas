// Custom hook for publishing media streams to backend for analysis
import { useRef, useCallback, useEffect } from 'react';
import { getSocket, sendVideoFrame, sendAudioChunk } from '@/services/socket';

interface UseStreamPublisherOptions {
  roundId: string;
  enabled?: boolean;
  videoIntervalMs?: number; // Default: 2000ms (2 seconds)
  audioIntervalMs?: number; // Default: 500ms
}

interface UseStreamPublisherReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  startVideoCapture: () => void;
  stopVideoCapture: () => void;
  startAudioCapture: (stream: MediaStream) => void;
  stopAudioCapture: () => void;
  captureFrame: () => string | null;
  isCapturing: boolean;
}

export const useStreamPublisher = ({
  roundId,
  enabled = true,
  videoIntervalMs = 2000,
  audioIntervalMs = 500,
}: UseStreamPublisherOptions): UseStreamPublisherReturn => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const isCapturingRef = useRef(false);

  // Capture a single video frame as base64
  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Set canvas size to video size
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to base64 JPEG (70% quality for bandwidth)
    return canvas.toDataURL('image/jpeg', 0.7);
  }, []);

  // Start video frame capture and publishing
  const startVideoCapture = useCallback(() => {
    if (!enabled || videoIntervalRef.current) return;

    const socket = getSocket();
    if (!socket?.connected) {
      console.warn('[StreamPublisher] Socket not connected');
      return;
    }

    isCapturingRef.current = true;

    videoIntervalRef.current = setInterval(() => {
      const frame = captureFrame();
      if (frame) {
        sendVideoFrame({
          roundId,
          frame,
          timestamp: Date.now(),
        });
      }
    }, videoIntervalMs);

    console.log('[StreamPublisher] Video capture started');
  }, [roundId, enabled, videoIntervalMs, captureFrame]);

  // Stop video frame capture
  const stopVideoCapture = useCallback(() => {
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    console.log('[StreamPublisher] Video capture stopped');
  }, []);

  // Start audio capture and publishing
  const startAudioCapture = useCallback(
    (stream: MediaStream) => {
      if (!enabled || audioIntervalRef.current) return;

      const socket = getSocket();
      if (!socket?.connected) {
        console.warn('[StreamPublisher] Socket not connected');
        return;
      }

      try {
        // Create audio context
        audioContextRef.current = new AudioContext();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 2048;
        source.connect(analyserRef.current);

        // Use MediaRecorder for audio chunks
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
        });
        mediaRecorderRef.current = mediaRecorder;

        const audioChunks: Blob[] = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.push(event.data);
          }
        };

        // Send audio chunks periodically
        audioIntervalRef.current = setInterval(() => {
          if (audioChunks.length > 0) {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            audioChunks.length = 0;

            // Convert to base64
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result as string;
              sendAudioChunk({
                roundId,
                chunk: base64.split(',')[1], // Remove data URL prefix
                timestamp: Date.now(),
                sampleRate: audioContextRef.current?.sampleRate,
              });
            };
            reader.readAsDataURL(blob);
          }
        }, audioIntervalMs);

        mediaRecorder.start(audioIntervalMs);
        console.log('[StreamPublisher] Audio capture started');
      } catch (error) {
        console.error('[StreamPublisher] Audio capture error:', error);
      }
    },
    [roundId, enabled, audioIntervalMs]
  );

  // Stop audio capture
  const stopAudioCapture = useCallback(() => {
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
      audioIntervalRef.current = null;
    }

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    console.log('[StreamPublisher] Audio capture stopped');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVideoCapture();
      stopAudioCapture();
    };
  }, [stopVideoCapture, stopAudioCapture]);

  return {
    videoRef,
    canvasRef,
    startVideoCapture,
    stopVideoCapture,
    startAudioCapture,
    stopAudioCapture,
    captureFrame,
    isCapturing: isCapturingRef.current,
  };
};
