'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { roundsApi, RoundResponse } from '@/services/api';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { Calendar, Clock, User, LogOut, Video, FileText, ArrowRight, Loader2, RefreshCw } from 'lucide-react';

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

export default function InterviewerDashboard() {
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
    if (!user || user.role !== 'employee') {
      router.push('/');
      return;
    }
    fetchRounds();
  }, [user, router, fetchRounds]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const handleStartInterview = (roundId: string) => {
    router.push(`/interviewer/interview/${roundId}`);
  };

  const handleViewVerdict = (roundId: string) => {
    router.push(`/interviewer/verdict/${roundId}`);
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

  const getRoundTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      'SCREENING_HUMAN': 'bg-purple-100 text-purple-700',
      'HR_HUMAN': 'bg-pink-100 text-pink-700',
      'MANAGERIAL_HUMAN': 'bg-indigo-100 text-indigo-700',
      'TECHNICAL_AI': 'bg-blue-100 text-blue-700',
      'CULTURAL_FIT_HUMAN': 'bg-teal-100 text-teal-700',
    };
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[type] || 'bg-gray-100 text-gray-700'}`}>
        {mapRoundType(type)}
      </span>
    );
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

  const upcomingRounds = rounds.filter(r => {
    const status = mapStatus(r.status);
    return status === 'scheduled' || status === 'in_progress' || status === 'waiting';
  });
  const completedRounds = rounds.filter(r => mapStatus(r.status) === 'completed');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Interviewer Dashboard</h1>
            <p className="text-sm text-gray-600">Welcome, {user?.fullName || user?.name || 'Interviewer'}</p>
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
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Error Message */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            <span className="ml-3 text-gray-600">Loading interviews...</span>
          </div>
        ) : (
          <>
            {/* Upcoming Interviews */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary-600" />
                  Upcoming Interviews ({upcomingRounds.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingRounds.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Video className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p>No upcoming interviews scheduled.</p>
                    <p className="text-sm mt-1">Interviews will appear here when HR schedules them.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {upcomingRounds.map((round) => (
                      <div
                        key={round.id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-primary-200 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-medium text-gray-900">
                              Round {round.round_number}
                            </h3>
                            {getRoundTypeBadge(round.round_type)}
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
                            <span className="flex items-center gap-1">
                              <User className="w-4 h-4" />
                              Candidate: {round.external_candidate_id.slice(0, 8)}...
                            </span>
                          </div>
                          {round.candidate_consent_given && (
                            <p className="text-xs text-success-600 mt-1">✓ Candidate has given AI consent</p>
                          )}
                        </div>
                        <Button
                          onClick={() => handleStartInterview(round.id)}
                          leftIcon={<Video className="w-4 h-4" />}
                        >
                          {mapStatus(round.status) === 'in_progress' ? 'Rejoin' : 'Start Interview'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Completed Interviews */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-success-600" />
                  Completed Interviews ({completedRounds.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {completedRounds.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p>No completed interviews yet.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {completedRounds.map((round) => (
                      <div
                        key={round.id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-medium text-gray-900">
                              Round {round.round_number}
                            </h3>
                            {getRoundTypeBadge(round.round_type)}
                            <Badge variant="success">Completed</Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {formatDate(round.ended_at || round.scheduled_at)}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => handleViewVerdict(round.id)}
                          rightIcon={<ArrowRight className="w-4 h-4" />}
                        >
                          View / Edit Verdict
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
