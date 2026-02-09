'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { roundsApi } from '@/services/api';
import { Button, Card, Badge } from '@/components/ui';
import { 
  connectSocket, 
  disconnectSocket, 
  joinInterviewRoom, 
  leaveInterviewRoom, 
  sendVideoFrame,
  getSocket,
  onInsightAggregated,
  onInsightAlert,
  onTranscriptUpdate,
  onMetricsSummary,
} from '@/services/socket';
import { useAuthStore, useAIMetricsStore } from '@/store';
import type { AIMetrics, TranscriptSegment, FraudAlert, LiveInsight } from '@/types';

// Dynamically import VideoSDK component to avoid SSR issues
const InterviewerMeeting = dynamic(
  () => import('@/components/video/InterviewerMeeting'),
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
  candidate_name?: string;
}

export default function InterviewerInterviewPage() {
  const params = useParams();
  const router = useRouter();
  const { user, token } = useAuthStore();
  const { updateMetrics, setInsights, setRecommendations } = useAIMetricsStore();
  const roundId = params.roundId as string;
  
  const [roundData, setRoundData] = useState<RoundData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [localMetrics, setLocalMetrics] = useState<AIMetrics>({
    speechConfidence: 0,
    engagementScore: 0,
    hesitationsCount: 0,
    avgResponseTime: 0,
    headMovement: 'stable',
    videoQuality: 'good',
    authenticity: 'verified',
  });
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [fraudAlerts, setFraudAlerts] = useState<FraudAlert[]>([]);
  const [liveInsights, setLiveInsights] = useState<LiveInsight[]>([]);
  const [resumeUrl, setResumeUrl] = useState<string | undefined>(undefined);

  // Auth check
  useEffect(() => {
    if (!user || user.role !== 'employee') {
      router.push('/');
    }
  }, [user, router]);

  // Fetch round data
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
        
        // Fetch resume URL for this round
        try {
          const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
          const authToken = localStorage.getItem('authToken');
          const resumeResponse = await fetch(`${API_BASE_URL}/resumes/round/${roundId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
          });
          if (resumeResponse.ok) {
            const resumeData = await resumeResponse.json();
            if (resumeData.file_url) {
              // Construct full URL for the resume
              const fullResumeUrl = resumeData.file_url.startsWith('http') 
                ? resumeData.file_url 
                : `${API_BASE_URL.replace('/api', '')}${resumeData.file_url}`;
              setResumeUrl(fullResumeUrl);
              console.log('Resume URL loaded:', fullResumeUrl);
            }
          }
        } catch (resumeErr) {
          console.log('No resume found for this round:', resumeErr);
          // Not critical - resume is optional for viewing
        }
      } catch (err: any) {
        console.error('Failed to fetch round:', err);
        const errorMessage = err.response?.data?.error || err.message || 'Failed to load interview';
        setError(errorMessage);
        setLoading(false);
      }
    };
    fetchRound();
  }, [roundId]);

  // Socket connection and listeners
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

    const unsubInsights = onInsightAggregated((data) => {
      const transformed = data.insights.map(i => ({
        ...i,
        timestampMs: i.timestampMs ?? Date.now(),
        metrics: i.metrics ?? {},
      }));
      setLiveInsights(prev => [...transformed, ...prev].slice(0, 50));
      setInsights(transformed);
      
      if (data.recommendations) setRecommendations(data.recommendations);

      data.insights.filter(i => i.category === 'fraud' && i.isAlert).forEach(insight => {
        setFraudAlerts(prev => [{
          id: insight.id,
          type: insight.insightType as any,
          message: insight.description,
          timestampMs: Date.now(),
          severity: insight.severity === 'high' ? 'alert' : 'warning',
        }, ...prev].slice(0, 10));
      });
    });

    const unsubAlerts = onInsightAlert((alert) => {
      setLiveInsights(prev => [{ ...alert, timestampMs: alert.timestampMs ?? Date.now(), metrics: alert.metrics ?? {} }, ...prev].slice(0, 50));
      if (alert.category === 'fraud') {
        setFraudAlerts(prev => [{
          id: alert.id,
          type: alert.insightType as any,
          message: alert.description,
          timestampMs: Date.now(),
          severity: alert.severity === 'high' ? 'alert' : 'warning',
        }, ...prev].slice(0, 10));
      }
    });

    const unsubTranscript = onTranscriptUpdate((data) => {
      if (data.isFinal) {
        setTranscript(prev => [...prev, {
          id: `ts-${data.timestamp}`,
          speaker: data.speaker,
          text: data.text,
          startMs: data.timestamp,
          endMs: data.timestamp,
          confidence: data.confidence,
        }].slice(-100));
      }
    });

    const unsubMetrics = onMetricsSummary((data) => {
      setLocalMetrics(prev => ({ ...prev, ...data }));
      updateMetrics(data);
    });
    
    return () => {
      unsubInsights();
      unsubAlerts();
      unsubTranscript();
      unsubMetrics();
      leaveInterviewRoom(roundId);
      disconnectSocket();
    };
  }, [roundData, roundId, token, setInsights, setRecommendations, updateMetrics]);

  const handleFrameCapture = useCallback((frame: string) => {
    if (connectionStatus === 'connected' && getSocket()?.connected) {
      sendVideoFrame({ roundId, frame, timestamp: Date.now() });
    }
  }, [roundId, connectionStatus]);

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
          <Button onClick={() => router.push('/interviewer/dashboard')}>Back to Dashboard</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-800 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-white font-semibold">Interview Session</h1>
          {roundData.candidate_name && <span className="text-gray-400">with {roundData.candidate_name}</span>}
          <Badge variant={connectionStatus === 'connected' ? 'success' : connectionStatus === 'connecting' ? 'warning' : 'error'}>
            {connectionStatus === 'connected' ? 'AI Connected' : connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
          </Badge>
        </div>
        <div className="text-gray-400 text-sm">Round {roundData.round_number}</div>
      </header>
      <main className="flex-1 overflow-hidden">
        <InterviewerMeeting
          meetingId={roundData.videosdk_meeting_id}
          token={roundData.videosdk_token}
          participantName="Interviewer"
          roundId={roundId}
          onFrameCapture={handleFrameCapture}
          metrics={localMetrics}
          transcript={transcript}
          fraudAlerts={fraudAlerts}
          liveInsights={liveInsights}
          resumeUrl={resumeUrl}
        />
      </main>
    </div>
  );
}
