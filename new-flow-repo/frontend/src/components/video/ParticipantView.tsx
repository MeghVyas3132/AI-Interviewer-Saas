'use client';

import { useEffect, useRef, useMemo } from 'react';
import { useParticipant } from '@videosdk.live/react-sdk';
import { Mic, MicOff, Video, VideoOff, User } from 'lucide-react';

interface ParticipantViewProps {
  participantId: string;
  isLocal?: boolean;
  className?: string;
  showControls?: boolean;
  showName?: boolean;
}

export function ParticipantView({
  participantId,
  isLocal = false,
  className = '',
  showControls = true,
  showName = true,
}: ParticipantViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const {
    webcamStream,
    micStream,
    webcamOn,
    micOn,
    isLocal: isLocalParticipant,
    displayName,
  } = useParticipant(participantId);

  // Set up video stream
  useEffect(() => {
    if (videoRef.current && webcamStream) {
      const mediaStream = new MediaStream();
      mediaStream.addTrack(webcamStream.track);
      videoRef.current.srcObject = mediaStream;
      videoRef.current.play().catch((err) => {
        console.error('Error playing video:', err);
      });
    }
  }, [webcamStream]);

  // Set up audio stream (only for remote participants)
  useEffect(() => {
    if (!isLocal && audioRef.current && micStream) {
      const mediaStream = new MediaStream();
      mediaStream.addTrack(micStream.track);
      audioRef.current.srcObject = mediaStream;
      audioRef.current.play().catch((err) => {
        console.error('Error playing audio:', err);
      });
    }
  }, [micStream, isLocal]);

  return (
    <div className={`relative bg-gray-900 rounded-lg overflow-hidden ${className}`}>
      {/* Video or Placeholder */}
      {webcamOn && webcamStream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-800">
          <div className="text-center">
            <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-2">
              <User className="w-10 h-10 text-gray-400" />
            </div>
            <p className="text-gray-400 text-sm">{displayName || 'Participant'}</p>
            <p className="text-gray-500 text-xs">Camera off</p>
          </div>
        </div>
      )}

      {/* Audio element for remote participants */}
      {!isLocal && <audio ref={audioRef} autoPlay />}

      {/* Participant Info Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
        <div className="flex items-center justify-between">
          {showName && (
            <span className="text-white text-sm font-medium truncate">
              {displayName || 'Participant'}
              {isLocal && ' (You)'}
            </span>
          )}
          
          {showControls && (
            <div className="flex items-center gap-2">
              {micOn ? (
                <Mic className="w-4 h-4 text-green-400" />
              ) : (
                <MicOff className="w-4 h-4 text-red-400" />
              )}
              {webcamOn ? (
                <Video className="w-4 h-4 text-green-400" />
              ) : (
                <VideoOff className="w-4 h-4 text-red-400" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ParticipantView;
