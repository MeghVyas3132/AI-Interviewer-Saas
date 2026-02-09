'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { roundsApi } from '@/services/api';
import { Button, Card } from '@/components/ui';
import { 
  connectSocket, 
  disconnectSocket, 
  joinInterviewRoom, 
  leaveInterviewRoom, 
  sendVideoFrame,
  getSocket
} from '@/services/socket';
import { useAuthStore } from '@/store';

// API base URL for resume upload
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

// Dynamically import VideoSDK components to avoid SSR issues
const VideoSDKMeeting = dynamic(
  () => import('@/components/video/CandidateMeeting'),
  { ssr: false, loading: () => <LoadingSpinner /> }
);

function LoadingSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-white">Loading video...</p>
      </div>
    </div>
  );
}

interface RoundData {
  id: string;
  interview_id: string;
  round_number: number;
  status: string;
  videosdk_meeting_id: string;
  videosdk_token: string;
  external_candidate_id?: string;
}

export default function CandidateInterviewPage() {
  const params = useParams();
  const router = useRouter();
  const { token, user } = useAuthStore();
  const roundId = params.roundId as string;
  const [roundData, setRoundData] = useState<RoundData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  useEffect(() => {
    const fetchRound = async () => {
      try {
        // roundsApi.get returns the round data directly (axios response.data)
        const round = await roundsApi.get(roundId);
        console.log('Round data:', round); // Debug log
        if (!round.videosdk_meeting_id || !round.videosdk_token) {
          throw new Error('Meeting credentials not available. Please ensure the interview is set up correctly.');
        }
        setRoundData(round);
        setLoading(false);
      } catch (err: any) {
        console.error('Failed to fetch round:', err);
        const errorMessage = err.response?.data?.error || err.message || 'Failed to load interview';
        setError(errorMessage);
        setLoading(false);
      }
    };
    fetchRound();
  }, [roundId]);

  useEffect(() => {
    if (!roundData || !token) return;
    
    connectSocket({
      token,
      onConnect: () => {
        setConnectionStatus('connected');
        joinInterviewRoom(roundId);
      },
      onDisconnect: () => setConnectionStatus('disconnected'),
      onError: (err) => console.error('Socket error:', err),
    });
    
    return () => {
      leaveInterviewRoom(roundId);
      disconnectSocket();
    };
  }, [roundData, roundId, token]);

  const handleFrameCapture = useCallback((frame: string) => {
    if (connectionStatus === 'connected' && getSocket()?.connected) {
      sendVideoFrame({ roundId, frame, timestamp: Date.now() });
    }
  }, [roundId, connectionStatus]);

  // Handle resume upload - uploads file to backend
  const handleResumeUpload = useCallback(async (file: File): Promise<void> => {
    console.log('[CandidateInterview] Uploading resume:', file.name);
    
    const candidateId = roundData?.external_candidate_id || user?.id;
    if (!candidateId) {
      throw new Error('Candidate ID not available');
    }

    // Create FormData for file upload
    const formData = new FormData();
    formData.append('resume', file);
    formData.append('roundId', roundId);
    formData.append('candidateId', candidateId);

    const authToken = localStorage.getItem('authToken');
    
    const response = await fetch(`${API_BASE_URL}/resumes/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to upload resume');
    }

    console.log('[CandidateInterview] Resume uploaded successfully');
  }, [roundId, roundData, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-white text-lg">Loading interview...</p>
        </div>
      </div>
    );
  }

  if (error || !roundData) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Card className="p-8 max-w-md">
          <h2 className="text-xl font-bold text-red-500 mb-4">Error</h2>
          <p className="text-gray-300 mb-6">{error || 'Interview not found'}</p>
          <Button onClick={() => router.push('/candidate/dashboard')}>Back to Dashboard</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-white font-semibold">Interview Session</h1>
          <span className={`px-2 py-1 rounded text-xs ${connectionStatus === 'connected' ? 'bg-green-500/20 text-green-400' : connectionStatus === 'connecting' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
            {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
          </span>
        </div>
        <div className="text-gray-400 text-sm">Round {roundData.round_number}</div>
      </header>
      <main className="flex-1">
        <VideoSDKMeeting
          meetingId={roundData.videosdk_meeting_id}
          token={roundData.videosdk_token}
          participantName="Candidate"
          roundId={roundId}
          onFrameCapture={handleFrameCapture}
          onResumeUpload={handleResumeUpload}
        />
      </main>
    </div>
  );
}
