'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { MeetingProvider, useMeeting, useParticipant } from '@videosdk.live/react-sdk';

interface CandidateMeetingProps {
  meetingId: string;
  token: string;
  participantName: string;
  roundId: string;
  companyName?: string;
  onLeave?: () => void;
}

// Participant Tile
function ParticipantTile({ participantId, size = 'normal' }: { participantId: string; size?: 'normal' | 'small' | 'pip' }) {
  const { webcamStream, micStream, webcamOn, micOn, isLocal, displayName } = useParticipant(participantId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (webcamOn && webcamStream) {
      const track = webcamStream.track;
      if (track) {
        const mediaStream = new MediaStream();
        mediaStream.addTrack(track);
        videoElement.srcObject = mediaStream;
        videoElement.play().catch((err) => {
          console.error(`[ParticipantTile ${participantId}] Video play error:`, err);
        });
      }
    } else {
      videoElement.srcObject = null;
    }
  }, [webcamStream, webcamOn, participantId]);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    if (micOn && micStream && !isLocal) {
      const track = micStream.track;
      if (track) {
        const mediaStream = new MediaStream();
        mediaStream.addTrack(track);
        audioElement.srcObject = mediaStream;
        audioElement.play().catch((err) => {
          console.error(`[ParticipantTile ${participantId}] Audio play error:`, err);
        });
      }
    } else {
      audioElement.srcObject = null;
    }
  }, [micStream, micOn, isLocal, participantId]);

  useEffect(() => {
    if (micStream && micOn) {
      const track = micStream.track;
      if (!track) return;
      
      try {
        audioCtxRef.current = new AudioContext();
        const analyser = audioCtxRef.current.createAnalyser();
        const mediaStream = new MediaStream();
        mediaStream.addTrack(track);
        const source = audioCtxRef.current.createMediaStreamSource(mediaStream);
        source.connect(analyser);
        analyser.fftSize = 256;
        const check = () => {
          const data = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(data);
          setIsSpeaking(data.reduce((a, b) => a + b) / data.length > 20);
          animRef.current = requestAnimationFrame(check);
        };
        check();
      } catch (e) {
        console.error(`[ParticipantTile ${participantId}] Audio context error:`, e);
      }
    }
    return () => {
      animRef.current && cancelAnimationFrame(animRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, [micStream, micOn, participantId]);

  const initials = (displayName || 'U').charAt(0).toUpperCase();
  const isPip = size === 'pip';
  const isSmall = size === 'small';

  return (
    <div className={`
      relative overflow-hidden h-full transition-all duration-300 group
      ${isPip ? 'rounded-xl' : 'rounded-2xl'}
      ${isSpeaking ? 'ring-[3px] ring-blue-500 shadow-lg shadow-blue-500/20' : 'ring-1 ring-gray-700'}
      bg-gray-800
    `}>
      {webcamOn && webcamStream ? (
        <video 
          ref={videoRef} 
          data-local={isLocal ? "true" : "false"} 
          autoPlay 
          playsInline 
          muted={isLocal} 
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300"
          style={{ transform: isLocal ? 'scaleX(-1)' : 'none' }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
          <div className={`
            rounded-full flex items-center justify-center transition-all duration-300
            ${isPip ? 'w-12 h-12' : isSmall ? 'w-16 h-16' : 'w-24 h-24'}
            ${isSpeaking ? 'scale-110 ring-4 ring-blue-500/30' : ''}
            bg-gradient-to-br from-gray-600 to-gray-700
          `}>
            <span className={`font-medium text-white ${isPip ? 'text-lg' : isSmall ? 'text-xl' : 'text-3xl'}`}>{initials}</span>
          </div>
        </div>
      )}
      
      {/* Name badge */}
      <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent ${isPip ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {isSpeaking && (
              <div className="flex gap-0.5 items-end h-3">
                <div className="w-0.5 bg-blue-500 rounded-full animate-pulse" style={{ height: '8px' }} />
                <div className="w-0.5 bg-blue-500 rounded-full animate-pulse" style={{ height: '12px', animationDelay: '0.1s' }} />
                <div className="w-0.5 bg-blue-500 rounded-full animate-pulse" style={{ height: '6px', animationDelay: '0.2s' }} />
              </div>
            )}
            <span className={`text-white font-medium truncate ${isPip ? 'text-[10px]' : 'text-xs'}`}>
              {displayName || 'Participant'} {isLocal && <span className="text-gray-400">(You)</span>}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {!micOn && (
              <div className="p-1 bg-red-500 rounded-full animate-pulse">
                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                  <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {!isLocal && <audio ref={audioRef} autoPlay playsInline />}
    </div>
  );
}

// Main Meeting View
function MeetingView({ onLeave, companyName }: { onLeave?: () => void; companyName?: string }) {
  const [joined, setJoined] = useState(false);
  const [ready, setReady] = useState(false);

  const { 
    join, 
    leave, 
    toggleMic, 
    toggleWebcam, 
    localParticipant, 
    participants, 
    meetingId, 
    localMicOn, 
    localWebcamOn 
  } = useMeeting({
    onMeetingJoined: () => {
      console.log('[CandidateMeeting] Meeting joined successfully');
      setReady(true);
    },
    onMeetingLeft: () => { 
      console.log('[CandidateMeeting] Meeting left');
      setReady(false); 
      onLeave?.();
    },
    onError: (e: unknown) => console.error('[CandidateMeeting] Meeting error:', e),
  });

  useEffect(() => { 
    if (!joined) { 
      console.log('[CandidateMeeting] Joining meeting...');
      join(); 
      setJoined(true); 
    } 
  }, [join, joined]);

  const doToggleMic = useCallback(async () => { 
    console.log('[CandidateMeeting] Toggle mic clicked, current state:', localMicOn);
    try {
      // Request mic permission if not already granted
      if (!localMicOn) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      if (toggleMic) {
        toggleMic();
        console.log('[CandidateMeeting] toggleMic called successfully');
      } else {
        console.error('[CandidateMeeting] toggleMic is undefined');
      }
    } catch (err) {
      console.error('[CandidateMeeting] Error toggling mic:', err);
      alert('Could not access microphone. Please check browser permissions.');
    }
  }, [toggleMic, localMicOn]);

  const doToggleWebcam = useCallback(async () => { 
    console.log('[CandidateMeeting] Toggle webcam clicked, current state:', localWebcamOn);
    try {
      // Request camera permission if not already granted
      if (!localWebcamOn) {
        await navigator.mediaDevices.getUserMedia({ video: true });
      }
      if (toggleWebcam) {
        toggleWebcam();
        console.log('[CandidateMeeting] toggleWebcam called successfully');
      } else {
        console.error('[CandidateMeeting] toggleWebcam is undefined');
      }
    } catch (err) {
      console.error('[CandidateMeeting] Error toggling webcam:', err);
      alert('Could not access camera. Please check browser permissions.');
    }
  }, [toggleWebcam, localWebcamOn]);

  const doLeave = useCallback(() => { 
    console.log('[CandidateMeeting] Leave clicked');
    try {
      if (leave) {
        leave();
        console.log('[CandidateMeeting] leave called successfully');
      } else {
        console.error('[CandidateMeeting] leave is undefined, calling onLeave directly');
        onLeave?.();
      }
    } catch (err) {
      console.error('[CandidateMeeting] Error leaving:', err);
      onLeave?.();
    }
  }, [leave, onLeave]);

  const allIds = useMemo(() => [...participants.keys()], [participants]);
  const remoteId = useMemo(() => allIds.find((id: string) => id !== localParticipant?.id) || null, [allIds, localParticipant]);

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col overflow-hidden">
      {/* Header */}
      {companyName && (
        <div className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <span className="text-white font-medium">{companyName} Interview</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm text-gray-400">Live</span>
          </div>
        </div>
      )}

      {/* Video Area */}
      <div className="flex-1 p-4 flex gap-4 min-h-0">
        <div className="flex-1 flex gap-4">
          {localParticipant && (
            <div className="flex-1">
              <ParticipantTile participantId={localParticipant.id} />
            </div>
          )}
          {remoteId ? (
            <div className="flex-1">
              <ParticipantTile participantId={remoteId} />
            </div>
          ) : (
            <div className="flex-1 rounded-2xl bg-gray-800 ring-1 ring-gray-700 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <div className="w-20 h-20 rounded-full bg-gray-700 mx-auto mb-4 flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <p className="font-medium">Waiting for interviewer...</p>
                <p className="text-sm text-gray-500 mt-1">Meeting ID: {meetingId}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Control Bar */}
      <div className="h-20 bg-gray-900 flex items-center justify-center px-4">
        <div className="flex items-center gap-3">
          {/* Mic Button */}
          <button 
            onClick={doToggleMic} 
            className={`
              px-4 py-3 rounded-full flex items-center gap-2 transition-all duration-200
              ${localMicOn 
                ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                : 'bg-red-500 hover:bg-red-600 text-white'
              }
              hover:shadow-lg active:scale-95
            `}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
            <span className="text-sm font-medium hidden sm:inline">{localMicOn ? 'Mute' : 'Unmute'}</span>
          </button>

          {/* Camera Button */}
          <button 
            onClick={doToggleWebcam} 
            className={`
              px-4 py-3 rounded-full flex items-center gap-2 transition-all duration-200
              ${localWebcamOn 
                ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                : 'bg-red-500 hover:bg-red-600 text-white'
              }
              hover:shadow-lg active:scale-95
            `}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
            <span className="text-sm font-medium hidden sm:inline">{localWebcamOn ? 'Stop video' : 'Start video'}</span>
          </button>

          <div className="w-px h-8 bg-gray-600 mx-2" />

          {/* Leave Button */}
          <button 
            onClick={doLeave} 
            className="px-5 py-3 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center gap-2 transition-all duration-200 hover:shadow-lg hover:shadow-red-500/30 active:scale-95"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
            </svg>
            <span className="text-sm font-medium">Leave</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CandidateMeeting({ meetingId, token, participantName, roundId, companyName, onLeave }: CandidateMeetingProps) {
  return (
    <MeetingProvider 
      config={{ 
        meetingId, 
        micEnabled: false, 
        webcamEnabled: false, 
        name: participantName, 
        debugMode: false 
      }} 
      token={token}
    >
      <MeetingView onLeave={onLeave} companyName={companyName} />
    </MeetingProvider>
  );
}
