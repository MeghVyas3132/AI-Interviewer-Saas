// WebRTC Hook for Peer-to-Peer Video Connections
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  sendWebRTCOffer,
  sendWebRTCAnswer,
  sendWebRTCIceCandidate,
  sendWebRTCReady,
  onWebRTCOffer,
  onWebRTCAnswer,
  onWebRTCIceCandidate,
  onWebRTCPeerReady,
  getSocket,
} from '@/services/socket';

// Free STUN servers for NAT traversal
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

interface UseWebRTCOptions {
  roundId: string;
  localStream: MediaStream | null;
  isInitiator: boolean; // Interviewer initiates, candidate receives
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

export const useWebRTC = ({
  roundId,
  localStream,
  isInitiator,
  onRemoteStream,
  onConnectionStateChange,
}: UseWebRTCOptions) => {
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [isConnected, setIsConnected] = useState(false);

  // Create peer connection
  const createPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendWebRTCIceCandidate(roundId, event.candidate);
      }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log('[WebRTC] Received remote track:', event.track.kind);
      if (event.streams && event.streams[0]) {
        onRemoteStream(event.streams[0]);
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
      setConnectionState(pc.connectionState);
      setIsConnected(pc.connectionState === 'connected');
      onConnectionStateChange?.(pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
    };

    // Add local tracks if we have a stream
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
        console.log('[WebRTC] Added local track:', track.kind);
      });
    }

    return pc;
  }, [roundId, localStream, onRemoteStream, onConnectionStateChange]);

  // Start the connection (for initiator/interviewer)
  const startConnection = useCallback(async () => {
    if (!getSocket()?.connected) {
      console.warn('[WebRTC] Socket not connected');
      return;
    }

    const pc = createPeerConnection();

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendWebRTCOffer(roundId, offer);
      console.log('[WebRTC] Created and sent offer');
    } catch (error) {
      console.error('[WebRTC] Error creating offer:', error);
    }
  }, [roundId, createPeerConnection]);

  // Handle incoming offer (for non-initiator/candidate)
  const handleOffer = useCallback(async (offer: RTCSessionDescriptionInit) => {
    console.log('[WebRTC] Received offer, creating answer...');
    const pc = createPeerConnection();

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Add any pending ICE candidates
      for (const candidate of pendingCandidatesRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      pendingCandidatesRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendWebRTCAnswer(roundId, answer);
      console.log('[WebRTC] Created and sent answer');
    } catch (error) {
      console.error('[WebRTC] Error handling offer:', error);
    }
  }, [roundId, createPeerConnection]);

  // Handle incoming answer (for initiator)
  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    console.log('[WebRTC] Received answer');
    const pc = peerConnectionRef.current;
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      
      // Add any pending ICE candidates
      for (const candidate of pendingCandidatesRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      pendingCandidatesRef.current = [];
    } catch (error) {
      console.error('[WebRTC] Error handling answer:', error);
    }
  }, []);

  // Handle incoming ICE candidate
  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionRef.current;
    
    if (!pc || !pc.remoteDescription) {
      // Queue candidate until we have a remote description
      pendingCandidatesRef.current.push(candidate);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('[WebRTC] Error adding ICE candidate:', error);
    }
  }, []);

  // Set up socket listeners
  useEffect(() => {
    if (!roundId) return;

    const unsubOffer = onWebRTCOffer(({ offer, fromRole }) => {
      // Only non-initiators handle offers
      if (!isInitiator) {
        handleOffer(offer);
      }
    });

    const unsubAnswer = onWebRTCAnswer(({ answer }) => {
      // Only initiators handle answers
      if (isInitiator) {
        handleAnswer(answer);
      }
    });

    const unsubIce = onWebRTCIceCandidate(({ candidate }) => {
      handleIceCandidate(candidate);
    });

    const unsubPeerReady = onWebRTCPeerReady(({ userId, role }) => {
      console.log('[WebRTC] Peer ready:', role, userId);
      // If we're the initiator and peer is ready, start connection
      if (isInitiator && localStream) {
        startConnection();
      }
    });

    // Signal that we're ready
    if (localStream && getSocket()?.connected) {
      setTimeout(() => {
        sendWebRTCReady(roundId);
      }, 1000); // Small delay to ensure socket listeners are set up
    }

    return () => {
      unsubOffer();
      unsubAnswer();
      unsubIce();
      unsubPeerReady();
    };
  }, [roundId, isInitiator, localStream, handleOffer, handleAnswer, handleIceCandidate, startConnection]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    };
  }, []);

  return {
    connectionState,
    isConnected,
    startConnection,
  };
};
