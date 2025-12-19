"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceFeedbackProps {
  isListening: boolean;
  isMuted: boolean;
  volume: number;
  transcript: string;
  className?: string;
}

export function VoiceFeedback({ 
  isListening, 
  isMuted, 
  volume, 
  transcript, 
  className 
}: VoiceFeedbackProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [microphone, setMicrophone] = useState<MediaStreamAudioSourceNode | null>(null);

  // Initialize audio context and analyzer
  useEffect(() => {
    if (isListening && !audioContext) {
      const initAudio = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const context = new (window.AudioContext || (window as any).webkitAudioContext)();
          const analyserNode = context.createAnalyser();
          const microphoneNode = context.createMediaStreamSource(stream);
          
          analyserNode.fftSize = 256;
          analyserNode.smoothingTimeConstant = 0.8;
          
          microphoneNode.connect(analyserNode);
          
          setAudioContext(context);
          setAnalyser(analyserNode);
          setMicrophone(microphoneNode);
        } catch (error) {
          console.error('Failed to initialize audio:', error);
        }
      };
      
      initAudio();
    }

    return () => {
      if (audioContext) {
        try {
          if (audioContext.state !== "closed") {
            audioContext.close();
          }
        } catch (err) {
          console.warn("AudioContext already closed", err);
        } finally {
          setAudioContext(null);
          setAnalyser(null);
          setMicrophone(null);
        }
      }
    };
  }, [isListening, audioContext]);

  // Draw waveform
  useEffect(() => {
    if (!canvasRef.current || !analyser || !isListening || isMuted) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isListening || isMuted) return;

      animationRef.current = requestAnimationFrame(draw);
      
      analyser.getByteFrequencyData(dataArray);
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;
        
        // Create gradient effect
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#3b82f6'); // Blue
        gradient.addColorStop(0.5, '#8b5cf6'); // Purple
        gradient.addColorStop(1, '#ec4899'); // Pink
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        
        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, isListening, isMuted]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Compact Voice Status & Waveform Row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Voice Status Indicator */}
        <div className="p-2 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn(
              "w-2 h-2 rounded-full transition-all duration-300",
              isListening && !isMuted ? "bg-green-500 animate-pulse" : "bg-gray-400"
            )} />
            <span className="text-xs font-medium">
              {isMuted ? "Muted" : isListening ? "Listening" : "Not Listening"}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {isMuted ? (
              <MicOff className="w-3 h-3 text-red-500" />
            ) : (
              <Mic className="w-3 h-3 text-green-500" />
            )}
            
            {isMuted ? (
              <VolumeX className="w-3 h-3 text-red-500" />
            ) : (
              <Volume2 className="w-3 h-3 text-green-500" />
            )}
          </div>
        </div>

        {/* Compact Waveform */}
        <div className="p-2 bg-muted/50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">
              Voice Activity
            </span>
            <span className="text-xs text-muted-foreground">
              {Math.round(volume * 100)}%
            </span>
          </div>
          
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={120}
              height={30}
              className={cn(
                "w-full h-8 rounded border transition-opacity duration-300",
                isListening && !isMuted ? "opacity-100" : "opacity-30"
              )}
            />
          </div>
        </div>
      </div>



    </div>
  );
} 