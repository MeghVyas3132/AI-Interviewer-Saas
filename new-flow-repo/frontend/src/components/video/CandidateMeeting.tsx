'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { MeetingProvider, useMeeting, useParticipant } from '@videosdk.live/react-sdk';

interface CandidateMeetingProps {
  meetingId: string;
  token: string;
  participantName: string;
  roundId: string;
  onFrameCapture?: (frame: string) => void;
  onResumeUpload?: (file: File) => Promise<void>;
}

// Consent Screen
function ConsentScreen({ onConsent, onResumeUpload }: { onConsent: () => void; onResumeUpload?: (file: File) => Promise<void> }) {
  const [agreed, setAgreed] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProceed = async () => {
    // Resume is mandatory
    if (!resumeFile) {
      setUploadError('Please upload your resume to continue');
      return;
    }
    
    if (onResumeUpload) {
      setUploading(true);
      setUploadError(null);
      try {
        await onResumeUpload(resumeFile);
      } catch (error) {
        console.error('[CandidateMeeting] Resume upload failed:', error);
        setUploadError('Failed to upload resume. Please try again.');
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    onConsent();
  };

  return (
    <div className="fixed inset-0 bg-[#202124] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#292a2d] rounded-2xl p-8 shadow-2xl border border-[#3c4043] animate-meeting-fadeIn">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20 animate-meeting-float">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-medium text-white mb-2">Ready to join?</h1>
          <p className="text-[#9aa0a6] text-sm">Review the details before entering</p>
        </div>

        <div className="space-y-3 mb-6">
          {[
            { icon: '🎥', text: 'Interview will be recorded for evaluation' },
            { icon: '🤖', text: 'AI will analyze responses in real-time' },
            { icon: '🔒', text: 'Your data is secure and private' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 bg-[#3c4043]/50 rounded-xl px-4 py-3 transition-all hover:bg-[#3c4043]">
              <span className="text-xl">{item.icon}</span>
              <span className="text-sm text-[#e8eaed]">{item.text}</span>
            </div>
          ))}
        </div>

        <div className="mb-6">
          <div 
            onClick={() => fileInputRef.current?.click()} 
            className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all hover:scale-[1.01] ${
              resumeFile ? 'border-emerald-500/50 bg-emerald-500/10' : uploadError ? 'border-red-500/50 bg-red-500/10' : 'border-[#5f6368] hover:border-[#8ab4f8]'
            }`}
          >
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" onChange={(e) => { setResumeFile(e.target.files?.[0] || null); setUploadError(null); }} className="hidden" />
            {resumeFile ? (
              <div className="flex items-center justify-center gap-2 text-emerald-400">
                <span className="text-xl">📄</span>
                <span className="text-sm font-medium truncate max-w-[200px]">{resumeFile.name}</span>
              </div>
            ) : (
              <div className={uploadError ? 'text-red-400' : 'text-[#9aa0a6]'}>
                <span className="text-2xl">📎</span>
                <p className="text-sm mt-1">Upload resume (required)</p>
              </div>
            )}
          </div>
          {uploadError && (
            <p className="text-red-400 text-xs mt-2 text-center">{uploadError}</p>
          )}
        </div>

        <label className="flex items-center gap-3 mb-6 cursor-pointer group">
          <div className={`w-5 h-5 rounded flex items-center justify-center transition-all ${agreed ? 'bg-emerald-500' : 'bg-[#3c4043] group-hover:bg-[#5f6368]'}`}>
            {agreed && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
          </div>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="hidden" />
          <span className="text-sm text-[#e8eaed]">I consent to recording and AI analysis</span>
        </label>

        <button 
          onClick={handleProceed} 
          disabled={!agreed || uploading} 
          className={`w-full py-3.5 rounded-full font-medium transition-all transform ${
            agreed && !uploading 
              ? 'bg-[#8ab4f8] hover:bg-[#aecbfa] text-[#202124] hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[#8ab4f8]/20' 
              : 'bg-[#3c4043] text-[#5f6368] cursor-not-allowed'
          }`}
        >
          {uploading ? 'Uploading...' : 'Join now'}
        </button>
      </div>
    </div>
  );
}

// Participant Tile
function ParticipantTile({ participantId, size = 'normal' }: { participantId: string; size?: 'normal' | 'small' | 'pip' }) {
  const { webcamStream, micStream, webcamOn, micOn, isLocal, displayName } = useParticipant(participantId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animRef = useRef<number | null>(null);

  // Debug logging for stream state
  useEffect(() => {
    console.log(`[ParticipantTile ${participantId}] webcamOn: ${webcamOn}, webcamStream:`, webcamStream);
  }, [participantId, webcamOn, webcamStream]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (webcamOn && webcamStream) {
      // VideoSDK provides the track in webcamStream.track
      const track = webcamStream.track;
      if (track) {
        console.log(`[ParticipantTile ${participantId}] Setting video track:`, track);
        const mediaStream = new MediaStream();
        mediaStream.addTrack(track);
        videoElement.srcObject = mediaStream;
        videoElement.play().catch((err) => {
          console.error(`[ParticipantTile ${participantId}] Video play error:`, err);
        });
      } else {
        console.warn(`[ParticipantTile ${participantId}] webcamStream exists but track is null`);
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
        console.log(`[ParticipantTile ${participantId}] Setting audio track:`, track);
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
      ${isSpeaking ? 'ring-[3px] ring-[#8ab4f8] shadow-lg shadow-[#8ab4f8]/20' : 'ring-1 ring-[#3c4043]'}
      bg-[#3c4043]
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
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#3c4043] to-[#292a2d]">
          <div className={`
            rounded-full flex items-center justify-center transition-all duration-300
            ${isPip ? 'w-12 h-12' : isSmall ? 'w-16 h-16' : 'w-24 h-24'}
            ${isSpeaking ? 'scale-110 ring-4 ring-[#8ab4f8]/30 animate-meeting-pulse-slow' : ''}
            bg-gradient-to-br from-[#5f6368] to-[#3c4043]
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
                <div className="w-0.5 bg-[#8ab4f8] rounded-full animate-meeting-wave-1" />
                <div className="w-0.5 bg-[#8ab4f8] rounded-full animate-meeting-wave-2" />
                <div className="w-0.5 bg-[#8ab4f8] rounded-full animate-meeting-wave-3" />
              </div>
            )}
            <span className={`text-white font-medium truncate ${isPip ? 'text-[10px]' : 'text-xs'}`}>
              {displayName || 'Participant'} {isLocal && <span className="text-[#9aa0a6]">(You)</span>}
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

// Screen Share View
function ScreenShareView({ participantId }: { participantId: string }) {
  const { screenShareStream, screenShareOn, displayName } = useParticipant(participantId);
  const screenRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    console.log(`[ScreenShareView ${participantId}] screenShareOn: ${screenShareOn}, screenShareStream:`, screenShareStream);
  }, [participantId, screenShareOn, screenShareStream]);

  useEffect(() => {
    const videoElement = screenRef.current;
    if (!videoElement) return;

    if (screenShareOn && screenShareStream) {
      const track = screenShareStream.track;
      if (track) {
        console.log(`[ScreenShareView ${participantId}] Setting screen share track:`, track);
        const mediaStream = new MediaStream();
        mediaStream.addTrack(track);
        videoElement.srcObject = mediaStream;
        videoElement.play().catch((err: unknown) => {
          console.error(`[ScreenShareView ${participantId}] Screen share play error:`, err);
        });
      } else {
        console.warn(`[ScreenShareView ${participantId}] screenShareStream exists but track is null`);
      }
    } else {
      videoElement.srcObject = null;
    }
  }, [screenShareStream, screenShareOn, participantId]);

  if (!screenShareOn || !screenShareStream) return null;

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black h-full ring-1 ring-[#3c4043] shadow-2xl">
      <video ref={screenRef} autoPlay playsInline className="w-full h-full object-contain" />
      <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 animate-meeting-fadeIn">
        <div className="w-2 h-2 bg-[#8ab4f8] rounded-full animate-pulse" />
        <span className="text-white text-sm font-medium">{displayName || 'Participant'} is presenting</span>
      </div>
    </div>
  );
}

// Main Meeting View
function MeetingView({ onFrameCapture }: { onFrameCapture: (frame: string) => void }) {
  const [joined, setJoined] = useState(false);
  const [ready, setReady] = useState(false);
  const frameRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { join, leave, toggleMic, toggleWebcam, toggleScreenShare, localParticipant, participants, meetingId, localMicOn, localWebcamOn, localScreenShareOn } = useMeeting({
    onMeetingJoined: () => {
      console.log('[CandidateMeeting] Meeting joined successfully');
      setReady(true);
    },
    onMeetingLeft: () => { 
      console.log('[CandidateMeeting] Meeting left');
      setReady(false); 
      window.location.href = '/candidate/dashboard'; 
    },
    onError: (e: any) => console.error('[CandidateMeeting] Meeting error:', e),
  });

  useEffect(() => { 
    if (!joined) { 
      console.log('[CandidateMeeting] Joining meeting...');
      join(); 
      setJoined(true); 
    } 
  }, [join, joined]);

  useEffect(() => {
    if (ready && localParticipant) {
      frameRef.current = setInterval(() => {
        const video = document.querySelector('video[data-local="true"]') as HTMLVideoElement;
        if (video?.readyState >= 2 && video.videoWidth > 0) {
          const canvas = document.createElement('canvas');
          canvas.width = 320; canvas.height = 240;
          canvas.getContext('2d')?.drawImage(video, 0, 0, 320, 240);
          onFrameCapture(canvas.toDataURL('image/jpeg', 0.6));
        }
      }, 2000);
    }
    return () => { frameRef.current && clearInterval(frameRef.current); };
  }, [ready, localParticipant, onFrameCapture]);

  const doToggleMic = useCallback(() => { 
    console.log('[CandidateMeeting] Toggle mic clicked, ready:', ready, 'currentState:', localMicOn);
    if (ready && toggleMic) {
      toggleMic();
    }
  }, [ready, toggleMic, localMicOn]);

  const doToggleWebcam = useCallback(() => { 
    console.log('[CandidateMeeting] Toggle webcam clicked, ready:', ready, 'currentState:', localWebcamOn);
    if (ready && toggleWebcam) {
      toggleWebcam();
    }
  }, [ready, toggleWebcam, localWebcamOn]);

  const doToggleScreen = useCallback(() => { 
    console.log('[CandidateMeeting] Toggle screen share clicked, ready:', ready, 'currentState:', localScreenShareOn);
    if (ready && toggleScreenShare) {
      toggleScreenShare();
    }
  }, [ready, toggleScreenShare, localScreenShareOn]);

  const doLeave = useCallback(() => { 
    console.log('[CandidateMeeting] Leave clicked, ready:', ready);
    if (ready && leave) {
      leave();
    }
  }, [ready, leave]);

  const allIds = useMemo(() => [...participants.keys()], [participants]);
  const remoteId = useMemo(() => allIds.find((id: string) => id !== localParticipant?.id) || null, [allIds, localParticipant]);
  
  const screenSharer = useMemo(() => {
    for (const id of allIds) {
      const p = participants.get(id);
      if (p?.screenShareOn) return id;
    }
    return null;
  }, [allIds, participants]);

  return (
    <div className="fixed inset-0 bg-[#202124] flex flex-col overflow-hidden">
      {/* Video Area */}
      <div className="flex-1 p-4 flex gap-4 min-h-0">
        {screenSharer ? (
          // Screen share mode: main screen + PiP tiles on right
          <>
            <div className="flex-1 min-w-0">
              <ScreenShareView participantId={screenSharer} />
            </div>
            <div className="w-48 flex flex-col gap-3">
              {localParticipant && (
                <div className="h-32 animate-meeting-slideIn">
                  <ParticipantTile participantId={localParticipant.id} size="pip" />
                </div>
              )}
              {remoteId && (
                <div className="h-32 animate-meeting-slideIn" style={{ animationDelay: '0.1s' }}>
                  <ParticipantTile participantId={remoteId} size="pip" />
                </div>
              )}
            </div>
          </>
        ) : (
          // Normal mode: side by side
          <div className="flex-1 flex gap-4">
            {localParticipant && (
              <div className="flex-1 animate-meeting-fadeIn">
                <ParticipantTile participantId={localParticipant.id} />
              </div>
            )}
            {remoteId ? (
              <div className="flex-1 animate-meeting-fadeIn" style={{ animationDelay: '0.1s' }}>
                <ParticipantTile participantId={remoteId} />
              </div>
            ) : (
              <div className="flex-1 rounded-2xl bg-[#3c4043] ring-1 ring-[#5f6368] flex items-center justify-center animate-meeting-pulse-slow">
                <div className="text-center text-[#9aa0a6]">
                  <div className="w-20 h-20 rounded-full bg-[#5f6368] mx-auto mb-4 flex items-center justify-center">
                    <svg className="w-10 h-10 text-[#9aa0a6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <p className="font-medium">Waiting for interviewer...</p>
                  <p className="text-sm text-[#5f6368] mt-1">{meetingId}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Control Bar - Google Meet Style */}
      <div className="h-20 bg-[#202124] flex items-center justify-center px-4">
        <div className="flex items-center gap-3">
          {/* Mic Button */}
          <button 
            onClick={doToggleMic} 
            disabled={!ready}
            className={`
              group relative px-4 py-3 rounded-full flex items-center gap-2 transition-all duration-200
              ${localMicOn 
                ? 'bg-[#3c4043] hover:bg-[#4a4b4e] text-white' 
                : 'bg-[#ea4335] hover:bg-[#d33828] text-white'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
              hover:shadow-lg active:scale-95
            `}
          >
            {localMicOn ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            )}
            <span className="text-sm font-medium hidden sm:inline">{localMicOn ? 'Mute' : 'Unmute'}</span>
          </button>

          {/* Camera Button */}
          <button 
            onClick={doToggleWebcam} 
            disabled={!ready}
            className={`
              group relative px-4 py-3 rounded-full flex items-center gap-2 transition-all duration-200
              ${localWebcamOn 
                ? 'bg-[#3c4043] hover:bg-[#4a4b4e] text-white' 
                : 'bg-[#ea4335] hover:bg-[#d33828] text-white'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
              hover:shadow-lg active:scale-95
            `}
          >
            {localWebcamOn ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            )}
            <span className="text-sm font-medium hidden sm:inline">{localWebcamOn ? 'Stop video' : 'Start video'}</span>
          </button>

          {/* Screen Share Button */}
          <button 
            onClick={doToggleScreen} 
            disabled={!ready}
            className={`
              group relative px-4 py-3 rounded-full flex items-center gap-2 transition-all duration-200
              ${localScreenShareOn 
                ? 'bg-[#8ab4f8] hover:bg-[#aecbfa] text-[#202124]' 
                : 'bg-[#3c4043] hover:bg-[#4a4b4e] text-white'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
              hover:shadow-lg active:scale-95
            `}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
              <path d="M12 8l-4 4h3v4h2v-4h3l-4-4z"/>
            </svg>
            <span className="text-sm font-medium hidden sm:inline">{localScreenShareOn ? 'Stop presenting' : 'Present'}</span>
          </button>

          <div className="w-px h-8 bg-[#5f6368] mx-2" />

          {/* Leave Button */}
          <button 
            onClick={doLeave} 
            disabled={!ready}
            className="
              px-5 py-3 rounded-full bg-[#ea4335] hover:bg-[#d33828] text-white
              flex items-center gap-2 transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              hover:shadow-lg hover:shadow-red-500/30 active:scale-95
            "
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

export default function CandidateMeeting({ meetingId, token, participantName, roundId, onFrameCapture, onResumeUpload }: CandidateMeetingProps) {
  const [consented, setConsented] = useState(false);
  
  if (!consented) {
    return <ConsentScreen onConsent={() => setConsented(true)} onResumeUpload={onResumeUpload} />;
  }

  return (
    <MeetingProvider config={{ meetingId, micEnabled: false, webcamEnabled: false, name: participantName, debugMode: false }} token={token}>
      <MeetingView onFrameCapture={onFrameCapture} />
    </MeetingProvider>
  );
}
