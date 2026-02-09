'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { roundsApi, RoundResponse } from '@/services/api';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { Calendar, Clock, User, LogOut, Video, Loader2, RefreshCw } from 'lucide-react';

// Helper to convert backend status to frontend format
const mapStatus = (status: string): 'scheduled' | 'waiting' | 'in_progress' | 'completed' | 'cancelled' | 'no_show' => {
  const statusMap: Record<string, 'scheduled' | 'waiting' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'> = {
    'SCHEDULED': 'scheduled',
    'WAITING_FOR_CANDIDATE': 'waiting',
    'WAITING_FOR_INTERVIEWER': 'waiting',
    'IN_PROGRESS': 'in_progress',
    'COMPLETED': 'completed',
    'CANCELLED': 'cancelled',
    'NO_SHOW': 'no_show',
  };
  return statusMap[status] || 'scheduled';
};

const mapRoundType = (type: string): string => {
  const typeMap: Record<string, string> = {
    'TECHNICAL_AI': 'Technical (AI)',
    'SCREENING_HUMAN': 'Screening',
    'HR_HUMAN': 'HR Round',
    'MANAGERIAL_HUMAN': 'Managerial',
    'CULTURAL_FIT_HUMAN': 'Culture Fit',
  };
  return typeMap[type] || type;
};

export default function CandidateDashboard() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [rounds, setRounds] = useState<RoundResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRounds = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await roundsApi.list();
      setRounds(data);
    } catch (err: any) {
      console.error('Failed to fetch rounds:', err);
      setError(err.response?.data?.error || 'Failed to fetch interview rounds');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'candidate') {
      router.push('/');
      return;
    }
    fetchRounds();
  }, [user, router, fetchRounds]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const handleJoinInterview = (roundId: string) => {
    router.push(`/candidate/interview/${roundId}`);
  };

  const getStatusBadge = (status: string) => {
    const mappedStatus = mapStatus(status);
    const variants: Record<string, 'info' | 'warning' | 'success' | 'danger'> = {
      scheduled: 'info',
      waiting: 'info',
      in_progress: 'warning',
      completed: 'success',
      cancelled: 'danger',
      no_show: 'danger',
    };
    const labels: Record<string, string> = {
      scheduled: 'Scheduled',
      waiting: 'Waiting',
      in_progress: 'In Progress',
      completed: 'Completed',
      cancelled: 'Cancelled',
      no_show: 'No Show',
    };
    return <Badge variant={variants[mappedStatus]}>{labels[mappedStatus]}</Badge>;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Not scheduled';
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const canJoin = (round: RoundResponse) => {
    const status = mapStatus(round.status);
    return status === 'scheduled' || status === 'in_progress' || status === 'waiting';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Interview Dashboard</h1>
            <p className="text-sm text-gray-600">Welcome back, {user?.fullName || user?.name || 'Candidate'}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={fetchRounds} leftIcon={<RefreshCw className="w-4 h-4" />}>
              Refresh
            </Button>
            <Button variant="ghost" onClick={handleLogout} leftIcon={<LogOut className="w-4 h-4" />}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Your Scheduled Interviews</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                <span className="ml-3 text-gray-600">Loading interviews...</span>
              </div>
            ) : rounds.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Video className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium">No interviews scheduled yet.</p>
                <p className="text-sm mt-1">When HR schedules an interview for you, it will appear here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {rounds.map((round) => (
                  <div
                    key={round.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-primary-200 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant="default">{mapRoundType(round.round_type)}</Badge>
                        {getStatusBadge(round.status)}
                        {round.videosdk_meeting_id && (
                          <Badge variant="info" size="sm">Video Ready</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(round.scheduled_at)}
                        </span>
                        {round.scheduled_duration_minutes && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {round.scheduled_duration_minutes} mins
                          </span>
                        )}
                        <span className="text-xs">
                          Round {round.round_number}
                        </span>
                      </div>
                      {round.candidate_consent_given && (
                        <p className="text-xs text-success-600 mt-1">✓ You have given AI consent</p>
                      )}
                    </div>
                    <div>
                      {canJoin(round) ? (
                        <Button
                          onClick={() => handleJoinInterview(round.id)}
                          leftIcon={<Video className="w-4 h-4" />}
                        >
                          Join Interview
                        </Button>
                      ) : (
                        <Button disabled variant="secondary">
                          {mapStatus(round.status) === 'completed' ? 'Completed' : 'Unavailable'}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
