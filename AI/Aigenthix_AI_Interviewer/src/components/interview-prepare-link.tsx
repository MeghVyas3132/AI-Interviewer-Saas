"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Camera, Mic, CheckCircle, Loader2, AlertCircle, Volume2 } from "lucide-react";

interface InterviewPrepareLinkProps {
  onReady: () => void;
  candidateName: string;
  jobTitle: string;
}

export function InterviewPrepareLink({ onReady, candidateName, jobTitle }: InterviewPrepareLinkProps) {
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isCameraTestOpen, setIsCameraTestOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [cameraPermission, setCameraPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [isStarting, setIsStarting] = useState(false);

  const videoTestRef = useRef<HTMLVideoElement>(null);

  // Microphone monitoring effect
  useEffect(() => {
    if (!isMuted) {
      const startMicrophoneMonitoring = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setMicPermission('granted');
          
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const analyserNode = audioCtx.createAnalyser();
          const source = audioCtx.createMediaStreamSource(stream);
          
          analyserNode.fftSize = 256;
          source.connect(analyserNode);
          
          setAudioContext(audioCtx);
          setAnalyser(analyserNode);
          
          const updateVolume = () => {
            if (analyserNode) {
              const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
              analyserNode.getByteFrequencyData(dataArray);
              const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
              setVolume(average / 255);
            }
          };
          
          const interval = setInterval(updateVolume, 100);
          
          return () => {
            clearInterval(interval);
            stream.getTracks().forEach(track => track.stop());
            if (audioCtx.state !== 'closed') {
              audioCtx.close();
            }
          };
        } catch (error) {
          console.error('Error accessing microphone:', error);
          setMicPermission('denied');
        }
      };
      
      const cleanup = startMicrophoneMonitoring();
      return () => {
        cleanup.then(cleanupFn => cleanupFn?.());
      };
    } else {
      // Clean up when muted
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
      }
      setAudioContext(null);
      setAnalyser(null);
      setVolume(0);
    }
  }, [isMuted]);

  const handleTestCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraPermission('granted');
      if (videoTestRef.current) {
        videoTestRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera Access Denied:", err);
      setCameraPermission('denied');
      setIsCameraTestOpen(false);
    }
  };

  const handleStopCamera = () => {
    if (videoTestRef.current?.srcObject) {
      const stream = videoTestRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoTestRef.current.srcObject = null;
    }
  };

  const handleCameraTestOpenChange = (open: boolean) => {
    if (open) {
      handleTestCamera();
    } else {
      handleStopCamera();
    }
    setIsCameraTestOpen(open);
  };

  const handleStartInterview = async () => {
    setIsStarting(true);
    
    // Import and use the data-store functions to save preferences
    const { saveVideoPreference, saveInterviewMode } = await import('@/lib/data-store');
    saveVideoPreference(videoEnabled);
    saveInterviewMode('voice');
    
    // Small delay for smooth transition
    setTimeout(() => {
      onReady();
    }, 500);
  };

  useEffect(() => {
    return () => {
      handleStopCamera();
    };
  }, []);

  const isReadyToStart = (videoEnabled ? cameraPermission === 'granted' : true) && 
                          (!isMuted && micPermission === 'granted');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl rounded-3xl shadow-xl">
        <CardHeader className="text-center pb-6">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-blue-600" />
          </div>
          <CardTitle className="text-3xl font-bold mb-2">
            Welcome, {candidateName}!
          </CardTitle>
          <CardDescription className="text-lg">
            Preparing for your {jobTitle} interview
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Instructions */}
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              Please test your camera and microphone before starting the interview. 
              This ensures a smooth interview experience.
            </AlertDescription>
          </Alert>

          {/* Camera Setup */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-slate-800">Camera Setup (Required)</h3>
            
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl">
              <div className="flex items-center space-x-3">
                <Camera className="w-6 h-6 text-blue-600" />
                <div>
                  <p className="font-semibold text-slate-800">Enable Video</p>
                  <p className="text-sm text-slate-600">
                    Allows AI to provide feedback on body language
                  </p>
                </div>
              </div>
              <Switch 
                checked={videoEnabled} 
                onCheckedChange={setVideoEnabled}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>

            {videoEnabled && (
              <div className="space-y-2">
                <Dialog open={isCameraTestOpen} onOpenChange={handleCameraTestOpenChange}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full rounded-xl"
                      disabled={cameraPermission === 'denied'}
                    >
                      <Camera className="w-5 h-5 mr-2" />
                      {cameraPermission === 'granted' ? 'Test Camera Again' : 'Test Camera'}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Camera Test</DialogTitle>
                    </DialogHeader>
                    <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden">
                      <video 
                        ref={videoTestRef} 
                        className="w-full h-full object-cover" 
                        autoPlay 
                        muted 
                        playsInline 
                      />
                    </div>
                    <p className="text-sm text-slate-600 text-center">
                      You should see yourself in the preview above
                    </p>
                  </DialogContent>
                </Dialog>

                {cameraPermission === 'granted' && (
                  <div className="flex items-center gap-2 text-green-600 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    <span>Camera is working!</span>
                  </div>
                )}
                
                {cameraPermission === 'denied' && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Camera access was denied. Please enable camera permissions in your browser settings.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>

          {/* Microphone Setup */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-slate-800">Microphone Setup (Required)</h3>
            
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
              <div className="flex items-center space-x-3">
                <Mic className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-semibold text-slate-800">Enable Microphone</p>
                  <p className="text-sm text-slate-600">
                    Required for voice interview
                  </p>
                </div>
              </div>
              <Switch 
                checked={!isMuted} 
                onCheckedChange={(checked) => setIsMuted(!checked)}
                className="data-[state=checked]:bg-green-600"
              />
            </div>

            {!isMuted && (
              <div className="space-y-4">
                {/* Volume Level Indicator */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700">Volume Level</span>
                    {micPermission === 'granted' && (
                      <span className="text-sm text-green-600 font-semibold flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" />
                        Working
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-3">
                    <div 
                      className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-150" 
                      style={{ width: `${Math.min(volume * 100, 85)}%` }}
                    />
                  </div>
                </div>

                {/* Test Instructions */}
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                  <p className="text-sm text-blue-800">
                    <strong>Test Instructions:</strong> Speak into your microphone to see the volume level move. 
                    Make sure the bar moves when you speak.
                  </p>
                </div>

                {micPermission === 'denied' && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Microphone access was denied. Please enable microphone permissions in your browser settings.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>

          {/* Start Button */}
          <div className="pt-6">
            <Button
              onClick={handleStartInterview}
              disabled={!isReadyToStart || isStarting}
              className="w-full rounded-xl py-6 text-lg font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Starting Interview...
                </>
              ) : !isReadyToStart ? (
                <>
                  <AlertCircle className="w-5 h-5 mr-2" />
                  Complete Setup to Continue
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 mr-2" />
                  Start Interview
                </>
              )}
            </Button>

            {!isReadyToStart && (
              <p className="text-sm text-slate-500 text-center mt-3">
                {videoEnabled && cameraPermission !== 'granted' && "• Test your camera"}
                {(!isMuted && micPermission !== 'granted') && " • Test your microphone"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

