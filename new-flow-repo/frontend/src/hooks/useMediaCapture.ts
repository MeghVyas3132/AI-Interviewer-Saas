// Custom hook for capturing video frames for analysis
import { useRef, useCallback } from 'react';

interface UseMediaCaptureReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  captureFrame: () => string | null;
  captureFrameBlob: () => Promise<Blob | null>;
}

export const useMediaCapture = (): UseMediaCaptureReturn => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Capture video frame as base64 string
  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Ensure video has dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to base64 JPEG (70% quality for bandwidth optimization)
    return canvas.toDataURL('image/jpeg', 0.7);
  }, []);

  // Capture video frame as Blob (for file upload)
  const captureFrameBlob = useCallback(async (): Promise<Blob | null> => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Ensure video has dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to Blob
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        0.7
      );
    });
  }, []);

  return {
    videoRef,
    canvasRef,
    captureFrame,
    captureFrameBlob,
  };
};
