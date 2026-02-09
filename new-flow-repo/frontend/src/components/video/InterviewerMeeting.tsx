'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { MeetingProvider, useMeeting, useParticipant } from '@videosdk.live/react-sdk';

interface InterviewerMeetingProps {
  meetingId: string;
  token: string;
  participantName: string;
  roundId: string;
  insights?: {
    nlpAnalysis?: { sentiment?: string; keyPhrases?: string[]; };
    speechAnalysis?: { pace?: string; clarity?: number; };
    videoAnalysis?: { eyeContact?: number; engagement?: string; };
    fraudDetection?: { riskLevel?: string; flags?: string[]; };
  };
  resumeUrl?: string;
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
    console.log(`[InterviewerTile ${participantId}] webcamOn: ${webcamOn}, webcamStream:`, webcamStream);
  }, [participantId, webcamOn, webcamStream]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (webcamOn && webcamStream) {
      const track = webcamStream.track;
      if (track) {
        console.log(`[InterviewerTile ${participantId}] Setting video track:`, track);
        const mediaStream = new MediaStream();
        mediaStream.addTrack(track);
        videoElement.srcObject = mediaStream;
        videoElement.play().catch((err: unknown) => {
          console.error(`[InterviewerTile ${participantId}] Video play error:`, err);
        });
      } else {
        console.warn(`[InterviewerTile ${participantId}] webcamStream exists but track is null`);
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
        console.log(`[InterviewerTile ${participantId}] Setting audio track:`, track);
        const mediaStream = new MediaStream();
        mediaStream.addTrack(track);
        audioElement.srcObject = mediaStream;
        audioElement.play().catch((err: unknown) => {
          console.error(`[InterviewerTile ${participantId}] Audio play error:`, err);
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
        console.error(`[InterviewerTile ${participantId}] Audio context error:`, e);
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
      {!isLocal && <audio ref={audioRef} autoPlay playsInline />}
    </div>
  );
}

// Screen Share View
function ScreenShareView({ participantId }: { participantId: string }) {
  const { screenShareStream, screenShareOn, displayName } = useParticipant(participantId);
  const screenRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    console.log(`[InterviewerScreenShare ${participantId}] screenShareOn: ${screenShareOn}, screenShareStream:`, screenShareStream);
  }, [participantId, screenShareOn, screenShareStream]);

  useEffect(() => {
    const videoElement = screenRef.current;
    if (!videoElement) return;

    if (screenShareOn && screenShareStream) {
      const track = screenShareStream.track;
      if (track) {
        console.log(`[InterviewerScreenShare ${participantId}] Setting screen share track:`, track);
        const mediaStream = new MediaStream();
        mediaStream.addTrack(track);
        videoElement.srcObject = mediaStream;
        videoElement.play().catch((err: unknown) => {
          console.error(`[InterviewerScreenShare ${participantId}] Screen share play error:`, err);
        });
      } else {
        console.warn(`[InterviewerScreenShare ${participantId}] screenShareStream exists but track is null`);
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

// AI Insights Panel
function InsightsPanel({ insights, resumeUrl }: { insights?: InterviewerMeetingProps['insights']; resumeUrl?: string }) {
  const [activeTab, setActiveTab] = useState<'ai' | 'resume'>('ai');
  
  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment?.toLowerCase()) {
      case 'positive': return 'text-emerald-400';
      case 'negative': return 'text-red-400';
      default: return 'text-amber-400';
    }
  };
  
  const getRiskColor = (risk?: string) => {
    switch (risk?.toLowerCase()) {
      case 'low': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'medium': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'high': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-[#3c4043] text-[#9aa0a6] border-[#5f6368]';
    }
  };

  return (
    <div className="w-80 bg-[#292a2d] rounded-2xl overflow-hidden flex flex-col ring-1 ring-[#3c4043] shadow-xl animate-meeting-slideIn">
      {/* Tabs */}
      <div className="flex border-b border-[#3c4043]">
        <button
          onClick={() => setActiveTab('ai')}
          className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
            activeTab === 'ai' 
              ? 'text-[#8ab4f8] border-b-2 border-[#8ab4f8] bg-[#8ab4f8]/5' 
              : 'text-[#9aa0a6] hover:text-white hover:bg-[#3c4043]/50'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            AI Analysis
          </span>
        </button>
        <button
          onClick={() => setActiveTab('resume')}
          className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
            activeTab === 'resume' 
              ? 'text-[#8ab4f8] border-b-2 border-[#8ab4f8] bg-[#8ab4f8]/5' 
              : 'text-[#9aa0a6] hover:text-white hover:bg-[#3c4043]/50'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Resume
          </span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 meeting-scrollbar">
        {activeTab === 'ai' ? (
          <>
            {/* Fraud Detection */}
            <div className="animate-meeting-fadeIn">
              <h3 className="text-xs font-semibold text-[#9aa0a6] uppercase tracking-wider mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#8ab4f8]" />
                Fraud Detection
              </h3>
              <div className={`px-4 py-3 rounded-xl border ${getRiskColor(insights?.fraudDetection?.riskLevel)} transition-all hover:scale-[1.02]`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Risk Level</span>
                  <span className="text-sm font-bold capitalize">{insights?.fraudDetection?.riskLevel || 'N/A'}</span>
                </div>
              </div>
              {insights?.fraudDetection?.flags && insights.fraudDetection.flags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {insights.fraudDetection.flags.map((flag, i) => (
                    <span key={i} className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded-full border border-red-500/30">
                      {flag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Sentiment */}
            <div className="animate-meeting-fadeIn" style={{ animationDelay: '0.1s' }}>
              <h3 className="text-xs font-semibold text-[#9aa0a6] uppercase tracking-wider mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Sentiment
              </h3>
              <div className="bg-[#3c4043]/50 rounded-xl p-4">
                <span className={`text-lg font-semibold capitalize ${getSentimentColor(insights?.nlpAnalysis?.sentiment)}`}>
                  {insights?.nlpAnalysis?.sentiment || 'Analyzing...'}
                </span>
              </div>
            </div>

            {/* Key Phrases */}
            {insights?.nlpAnalysis?.keyPhrases && insights.nlpAnalysis.keyPhrases.length > 0 && (
              <div className="animate-meeting-fadeIn" style={{ animationDelay: '0.2s' }}>
                <h3 className="text-xs font-semibold text-[#9aa0a6] uppercase tracking-wider mb-3 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  Key Phrases
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {insights.nlpAnalysis.keyPhrases.slice(0, 6).map((phrase, i) => (
                    <span key={i} className="text-xs bg-purple-500/20 text-purple-300 px-3 py-1.5 rounded-full border border-purple-500/30 transition-all hover:scale-105">
                      {phrase}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Speech Analysis */}
            <div className="animate-meeting-fadeIn" style={{ animationDelay: '0.3s' }}>
              <h3 className="text-xs font-semibold text-[#9aa0a6] uppercase tracking-wider mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                Speech
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#3c4043]/50 rounded-xl p-3 text-center transition-all hover:bg-[#3c4043]">
                  <div className="text-xs text-[#9aa0a6] mb-1">Pace</div>
                  <div className="text-sm font-semibold text-white capitalize">{insights?.speechAnalysis?.pace || '...'}</div>
                </div>
                <div className="bg-[#3c4043]/50 rounded-xl p-3 text-center transition-all hover:bg-[#3c4043]">
                  <div className="text-xs text-[#9aa0a6] mb-1">Clarity</div>
                  <div className="text-sm font-semibold text-white">{insights?.speechAnalysis?.clarity ? `${insights.speechAnalysis.clarity}%` : '...'}</div>
                </div>
              </div>
            </div>

            {/* Video Analysis */}
            <div className="animate-meeting-fadeIn" style={{ animationDelay: '0.4s' }}>
              <h3 className="text-xs font-semibold text-[#9aa0a6] uppercase tracking-wider mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Video
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#3c4043]/50 rounded-xl p-3 text-center transition-all hover:bg-[#3c4043]">
                  <div className="text-xs text-[#9aa0a6] mb-1">Eye Contact</div>
                  <div className="text-sm font-semibold text-white">{insights?.videoAnalysis?.eyeContact ? `${insights.videoAnalysis.eyeContact}%` : '...'}</div>
                </div>
                <div className="bg-[#3c4043]/50 rounded-xl p-3 text-center transition-all hover:bg-[#3c4043]">
                  <div className="text-xs text-[#9aa0a6] mb-1">Engagement</div>
                  <div className="text-sm font-semibold text-white capitalize">{insights?.videoAnalysis?.engagement || '...'}</div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="h-full animate-meeting-fadeIn">
            {resumeUrl ? (
              <iframe src={resumeUrl} className="w-full h-full min-h-[500px] rounded-xl bg-white" title="Resume" />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-[#9aa0a6]">
                <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm">No resume uploaded</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Meeting View
function MeetingView({ insights, resumeUrl }: { insights?: InterviewerMeetingProps['insights']; resumeUrl?: string }) {
  const [joined, setJoined] = useState(false);
  const [ready, setReady] = useState(false);

  const { join, leave, toggleMic, toggleWebcam, toggleScreenShare, localParticipant, participants, meetingId, localMicOn, localWebcamOn, localScreenShareOn } = useMeeting({
    onMeetingJoined: () => {
      console.log('[InterviewerMeeting] Meeting joined successfully');
      setReady(true);
    },
    onMeetingLeft: () => { 
      console.log('[InterviewerMeeting] Meeting left');
      setReady(false); 
      window.location.href = '/interviewer/dashboard'; 
    },
    onError: (e: any) => console.error('[InterviewerMeeting] Meeting error:', e),
  });

  useEffect(() => { 
    if (!joined) { 
      console.log('[InterviewerMeeting] Joining meeting...');
      join(); 
      setJoined(true); 
    } 
  }, [join, joined]);

  const doToggleMic = useCallback(() => { 
    console.log('[InterviewerMeeting] Toggle mic clicked, ready:', ready, 'currentState:', localMicOn);
    if (ready && toggleMic) {
      toggleMic();
    }
  }, [ready, toggleMic, localMicOn]);

  const doToggleWebcam = useCallback(() => { 
    console.log('[InterviewerMeeting] Toggle webcam clicked, ready:', ready, 'currentState:', localWebcamOn);
    if (ready && toggleWebcam) {
      toggleWebcam();
    }
  }, [ready, toggleWebcam, localWebcamOn]);

  const doToggleScreen = useCallback(() => { 
    console.log('[InterviewerMeeting] Toggle screen share clicked, ready:', ready, 'currentState:', localScreenShareOn);
    if (ready && toggleScreenShare) {
      toggleScreenShare();
    }
  }, [ready, toggleScreenShare, localScreenShareOn]);

  const doLeave = useCallback(() => { 
    console.log('[InterviewerMeeting] Leave clicked, ready:', ready);
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
      {/* Main Area */}
      <div className="flex-1 p-4 flex gap-4 min-h-0">
        {/* Video Section */}
        <div className="flex-1 flex gap-4 min-w-0">
          {screenSharer ? (
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
                    <p className="font-medium">Waiting for candidate...</p>
                    <p className="text-sm text-[#5f6368] mt-1">{meetingId}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* AI Insights Panel */}
        <InsightsPanel insights={insights} resumeUrl={resumeUrl} />
      </div>

      {/* Control Bar */}
      <div className="h-20 bg-[#202124] flex items-center justify-center px-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={doToggleMic} 
            disabled={!ready}
            className={`
              group relative px-4 py-3 rounded-full flex items-center gap-2 transition-all duration-200
              ${localMicOn ? 'bg-[#3c4043] hover:bg-[#4a4b4e] text-white' : 'bg-[#ea4335] hover:bg-[#d33828] text-white'}
              disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg active:scale-95
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

          <button 
            onClick={doToggleWebcam} 
            disabled={!ready}
            className={`
              group relative px-4 py-3 rounded-full flex items-center gap-2 transition-all duration-200
              ${localWebcamOn ? 'bg-[#3c4043] hover:bg-[#4a4b4e] text-white' : 'bg-[#ea4335] hover:bg-[#d33828] text-white'}
              disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg active:scale-95
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

          <button 
            onClick={doToggleScreen} 
            disabled={!ready}
            className={`
              group relative px-4 py-3 rounded-full flex items-center gap-2 transition-all duration-200
              ${localScreenShareOn ? 'bg-[#8ab4f8] hover:bg-[#aecbfa] text-[#202124]' : 'bg-[#3c4043] hover:bg-[#4a4b4e] text-white'}
              disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg active:scale-95
            `}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
              <path d="M12 8l-4 4h3v4h2v-4h3l-4-4z"/>
            </svg>
            <span className="text-sm font-medium hidden sm:inline">{localScreenShareOn ? 'Stop presenting' : 'Present'}</span>
          </button>

          <div className="w-px h-8 bg-[#5f6368] mx-2" />

          <button 
            onClick={doLeave} 
            disabled={!ready}
            className="px-5 py-3 rounded-full bg-[#ea4335] hover:bg-[#d33828] text-white flex items-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-red-500/30 active:scale-95"
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

export default function InterviewerMeeting({ meetingId, token, participantName, insights, resumeUrl }: InterviewerMeetingProps) {
  return (
    <MeetingProvider config={{ meetingId, micEnabled: false, webcamEnabled: false, name: participantName, debugMode: false }} token={token}>
      <MeetingView insights={insights} resumeUrl={resumeUrl} />
    </MeetingProvider>
  );
}
