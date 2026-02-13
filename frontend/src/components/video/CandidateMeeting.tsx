'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Cookies from 'js-cookie';

interface CandidateMeetingProps {
  meetingId: string;
  token: string;
  participantName: string;
  roundId: string;
  companyName?: string;
  onLeave?: () => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.stunprotocol.org:3478' },
  ],
};

function getAuthToken(): string {
  if (typeof window !== 'undefined') {
    return Cookies.get('access_token') || '';
  }
  return '';
}

async function postSignal(roundId: string, type: string, data: object) {
  const authToken = getAuthToken();
  console.log('[CandidateMeeting] Sending signal:', { roundId, type, hasToken: !!authToken });
  try {
    const res = await fetch(`/api/realtime/rounds/${roundId}/signal`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type, data }),
    });
    if (!res.ok) {
      console.error('[CandidateMeeting] postSignal failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('[CandidateMeeting] postSignal error:', err);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pollSignals(roundId: string): Promise<Array<{ type: string; data: any; from_role: string }>> {
  const authToken = getAuthToken();
  try {
    const res = await fetch(`/api/realtime/rounds/${roundId}/signal`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
    });
    const json = await res.json();
    return json.messages || [];
  } catch {
    return [];
  }
}

async function postPresence(roundId: string) {
  const authToken = getAuthToken();
  try {
    const res = await fetch(`/api/realtime/rounds/${roundId}/presence`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });
    const json = await res.json();
    console.log('[CandidateMeeting] Presence posted, my_role:', json.role);
  } catch (err) {
    console.error('[CandidateMeeting] postPresence error:', err);
  }
}

async function checkPresence(roundId: string): Promise<boolean> {
  const authToken = getAuthToken();
  try {
    const res = await fetch(`/api/realtime/rounds/${roundId}/presence`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
    });
    const json = await res.json();
    console.log('[CandidateMeeting] Presence check:', { peer_online: json.peer_online, my_role: json.my_role, peer_role: json.peer_role });
    return json.peer_online || false;
  } catch (err) {
    console.error('[CandidateMeeting] checkPresence error:', err);
    return false;
  }
}

export default function CandidateMeeting({ meetingId, participantName, roundId, companyName, onLeave }: CandidateMeetingProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connected, setConnected] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [connectionState, setConnectionState] = useState('new');
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 5;

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const presenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const iceCandidatesQueue = useRef<RTCIceCandidate[]>([]);
  const hasCreatedOffer = useRef(false);
  const mountedRef = useRef(true);

  // Retry connection function
  const retryConnection = useCallback(() => {
    if (retryCount >= MAX_RETRIES) {
      console.log('[CandidateMeeting] Max retries reached');
      return;
    }
    console.log(`[CandidateMeeting] Retrying connection (${retryCount + 1}/${MAX_RETRIES})...`);
    setRetryCount(prev => prev + 1);
    hasCreatedOffer.current = false;
    setConnected(false);
    setConnectionState('new');
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  }, [retryCount]);

  // Initialize local media
  useEffect(() => {
    mountedRef.current = true;
    let stream: MediaStream | null = null;

    const init = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('[CandidateMeeting] getUserMedia error:', err);
        // Try audio only
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
          setLocalStream(stream);
        } catch (err2) {
          console.error('[CandidateMeeting] Audio-only also failed:', err2);
        }
      }
    };

    init();
    return () => {
      mountedRef.current = false;
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Setup RTCPeerConnection and signaling
  useEffect(() => {
    if (!localStream) return;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Add local tracks
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });

    // Handle remote tracks
    const remoteMs = new MediaStream();
    setRemoteStream(remoteMs);

    pc.ontrack = (event) => {
      console.log('[CandidateMeeting] Got remote track:', event.track.kind);
      remoteMs.addTrack(event.track);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteMs;
      }
      setConnected(true);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[CandidateMeeting] Sending ICE candidate');
        postSignal(roundId, 'ice-candidate', { candidate: event.candidate.toJSON() });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[CandidateMeeting] Connection state:', pc.connectionState);
      setConnectionState(pc.connectionState);
      if (pc.connectionState === 'connected') {
        setConnected(true);
        setRetryCount(0); // Reset retry count on successful connection
      }
      if (pc.connectionState === 'failed') {
        setConnected(false);
        // Auto-retry on failure
        if (retryCount < MAX_RETRIES) {
          console.log('[CandidateMeeting] Connection failed, scheduling retry...');
          setTimeout(() => {
            retryConnection();
          }, 2000);
        }
      }
      if (pc.connectionState === 'disconnected') {
        setConnected(false);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[CandidateMeeting] ICE state:', pc.iceConnectionState);
    };

    // Start presence heartbeat
    postPresence(roundId);
    presenceIntervalRef.current = setInterval(() => {
      postPresence(roundId);
      checkPresence(roundId).then(online => {
        if (mountedRef.current) setPeerOnline(online);
      });
    }, 3000);

    // Start signal polling
    pollIntervalRef.current = setInterval(async () => {
      if (!mountedRef.current) return;
      const messages = await pollSignals(roundId);
      
      for (const msg of messages) {
        try {
          if (msg.type === 'offer' && pc.signalingState !== 'stable') {
            console.log('[CandidateMeeting] Ignoring offer - already have one');
            continue;
          }

          if (msg.type === 'offer') {
            console.log('[CandidateMeeting] Received offer from interviewer');
            await pc.setRemoteDescription(new RTCSessionDescription(msg.data as RTCSessionDescriptionInit));
            
            // Flush queued ICE candidates
            for (const ic of iceCandidatesQueue.current) {
              await pc.addIceCandidate(ic);
            }
            iceCandidatesQueue.current = [];
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await postSignal(roundId, 'answer', answer);
            console.log('[CandidateMeeting] Sent answer');
          } else if (msg.type === 'answer') {
            if (pc.signalingState === 'have-local-offer') {
              console.log('[CandidateMeeting] Received answer');
              await pc.setRemoteDescription(new RTCSessionDescription(msg.data as RTCSessionDescriptionInit));
              
              for (const ic of iceCandidatesQueue.current) {
                await pc.addIceCandidate(ic);
              }
              iceCandidatesQueue.current = [];
            }
          } else if (msg.type === 'ice-candidate') {
            const candidateData = (msg.data as { candidate?: RTCIceCandidateInit }).candidate;
            if (candidateData) {
              const candidate = new RTCIceCandidate(candidateData);
              if (pc.remoteDescription) {
                await pc.addIceCandidate(candidate);
              } else {
                iceCandidatesQueue.current.push(candidate);
              }
            }
          }
        } catch (err) {
          console.error('[CandidateMeeting] Signal processing error:', err);
        }
      }
    }, 1000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (presenceIntervalRef.current) clearInterval(presenceIntervalRef.current);
      pc.close();
    };
  }, [localStream, roundId, retryCount, retryConnection]);

  // When peer comes online and we haven't created an offer yet,
  // the candidate waits for the interviewer to send an offer.
  // But if both sides are waiting, the interviewer creates the offer.
  // Candidate is passive (answerer).

  const toggleMic = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setMicOn(prev => !prev);
    }
  }, [localStream]);

  const toggleCam = useCallback(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
      setCamOn(prev => !prev);
    }
  }, [localStream]);

  const handleLeave = useCallback(() => {
    if (pcRef.current) pcRef.current.close();
    localStream?.getTracks().forEach(t => t.stop());
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (presenceIntervalRef.current) clearInterval(presenceIntervalRef.current);
    onLeave?.();
  }, [localStream, onLeave]);

  const initials = (participantName || 'C').charAt(0).toUpperCase();

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
            <div className={`w-2 h-2 rounded-full animate-pulse ${connected ? 'bg-green-500' : 'bg-amber-500'}`} />
            <span className="text-sm text-gray-400">{connected ? 'Connected' : connectionState === 'connecting' ? 'Connecting...' : 'Waiting'}</span>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="h-8 bg-gray-800/50 flex items-center justify-center px-4 text-xs text-gray-400">
        <span className="text-green-400 mr-2">P2P v2</span> |
        Meeting: {meetingId} | Round: {roundId.substring(0, 8)}... | 
        {peerOnline ? ' ✅ Interviewer online' : ' ⏳ Waiting for interviewer to join...'} |
        Connection: {connectionState}
      </div>

      {/* Video Area */}
      <div className="flex-1 p-4 flex gap-4 min-h-0">
        {/* Local video */}
        <div className="flex-1 relative rounded-2xl overflow-hidden bg-gray-800 ring-1 ring-gray-700">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
          {!camOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center">
                <span className="text-3xl font-medium text-white">{initials}</span>
              </div>
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
            <span className="text-xs text-white font-medium">{participantName} (You)</span>
          </div>
        </div>

        {/* Remote video */}
        <div className="flex-1 relative rounded-2xl overflow-hidden bg-gray-800 ring-1 ring-gray-700">
          {connected && remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <div className="w-20 h-20 rounded-full bg-gray-700 mx-auto mb-4 flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <p className="font-medium">
                  {peerOnline ? 'Connecting to interviewer...' : 'Waiting for interviewer...'}
                </p>
                <p className="text-sm text-gray-500 mt-1">Meeting ID: {meetingId}</p>
                {peerOnline && (
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                    <span className="text-sm text-blue-400">Establishing WebRTC connection...</span>
                  </div>
                )}
              </div>
            </div>
          )}
          {connected && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
              <span className="text-xs text-white font-medium">Interviewer</span>
            </div>
          )}
        </div>
      </div>

      {/* Control Bar */}
      <div className="h-20 bg-gray-900 flex items-center justify-center px-4">
        <div className="flex items-center gap-3">
          {/* Mic Button */}
          <button
            onClick={toggleMic}
            className={`px-4 py-3 rounded-full flex items-center gap-2 transition-all duration-200 hover:shadow-lg active:scale-95
              ${micOn ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
            <span className="text-sm font-medium hidden sm:inline">{micOn ? 'Mute' : 'Unmute'}</span>
          </button>

          {/* Camera Button */}
          <button
            onClick={toggleCam}
            className={`px-4 py-3 rounded-full flex items-center gap-2 transition-all duration-200 hover:shadow-lg active:scale-95
              ${camOn ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
            <span className="text-sm font-medium hidden sm:inline">{camOn ? 'Stop video' : 'Start video'}</span>
          </button>

          <div className="w-px h-8 bg-gray-600 mx-2" />

          {/* Leave Button */}
          <button
            onClick={handleLeave}
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
