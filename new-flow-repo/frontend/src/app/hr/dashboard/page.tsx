'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { roundsApi, RoundResponse, CreateRoundPayload } from '@/services/api';
import { Button, Card, CardHeader, CardTitle, CardContent, Badge, ProgressBar, Modal } from '@/components/ui';
import { 
  LogOut, 
  Users, 
  Briefcase, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  Eye,
  Download,
  Filter,
  Search,
  TrendingUp,
  User,
  Calendar,
  FileText,
  BarChart3,
  ChevronRight,
  Plus,
  Loader2,
  RefreshCw,
  Trash2,
  Edit2
} from 'lucide-react';

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

export default function HRDashboard() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [rounds, setRounds] = useState<RoundResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRound, setEditingRound] = useState<RoundResponse | null>(null);
  const [updating, setUpdating] = useState(false);

  // Form state for creating interview
  const [newInterview, setNewInterview] = useState({
    candidateEmail: '',
    candidateName: '',
    interviewerEmail: '',
    roundType: 'SCREENING_HUMAN' as CreateRoundPayload['roundType'],
    interviewMode: 'HUMAN_AI_ASSISTED' as CreateRoundPayload['interviewMode'],
    scheduledAt: '',
    durationMinutes: 45,
  });

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
    if (!user || user.role !== 'hr') {
      router.push('/');
      return;
    }
    fetchRounds();
  }, [user, router, fetchRounds]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const handleCreateInterview = async () => {
    try {
      setCreating(true);
      setError(null);
      
      // Format scheduledAt properly for ISO 8601 datetime (only if provided)
      let scheduledAtISO: string | undefined = undefined;
      if (newInterview.scheduledAt && newInterview.scheduledAt.trim() !== '') {
        const date = new Date(newInterview.scheduledAt);
        if (!isNaN(date.getTime())) {
          scheduledAtISO = date.toISOString();
        }
      }
      
      // Use dev user IDs for testing
      // In production, these would be selected from actual users
      const DEV_INTERVIEWER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901'; // interviewer@test.com
      const DEV_CANDIDATE_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';   // candidate@test.com
      
      // Generate IDs for the new interview (in production, these would come from the main app)
      const payload: CreateRoundPayload = {
        externalInterviewId: `interview-${Date.now()}`,
        externalCandidateId: DEV_CANDIDATE_ID,
        externalInterviewerId: DEV_INTERVIEWER_ID,
        externalJobRoleId: 'job-role-001',
        roundNumber: 1,
        roundType: newInterview.roundType,
        interviewMode: newInterview.interviewMode,
        scheduledDurationMinutes: newInterview.durationMinutes,
      };
      
      // Only add scheduledAt if it's a valid date
      if (scheduledAtISO) {
        payload.scheduledAt = scheduledAtISO;
      }
      
      console.log('Creating interview with payload:', payload);

      await roundsApi.create(payload);
      setShowCreateModal(false);
      setNewInterview({
        candidateEmail: '',
        candidateName: '',
        interviewerEmail: '',
        roundType: 'SCREENING_HUMAN',
        interviewMode: 'HUMAN_AI_ASSISTED',
        scheduledAt: '',
        durationMinutes: 45,
      });
      fetchRounds();
    } catch (err: any) {
      console.error('Failed to create interview:', err);
      setError(err.response?.data?.error || 'Failed to create interview');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteInterview = async (roundId: string) => {
    if (!confirm('Are you sure you want to delete this interview? This action cannot be undone.')) {
      return;
    }
    
    try {
      setDeleting(roundId);
      setError(null);
      await roundsApi.delete(roundId);
      fetchRounds();
    } catch (err: any) {
      console.error('Failed to delete interview:', err);
      setError(err.response?.data?.error || 'Failed to delete interview');
    } finally {
      setDeleting(null);
    }
  };

  const handleEditInterview = (round: RoundResponse) => {
    setEditingRound(round);
    setShowEditModal(true);
  };

  const handleUpdateInterview = async () => {
    if (!editingRound) return;
    
    try {
      setUpdating(true);
      setError(null);
      
      // Format scheduledAt properly for ISO 8601 datetime
      let scheduledAtISO: string | undefined = undefined;
      if (editingRound.scheduled_at && editingRound.scheduled_at.trim() !== '') {
        const date = new Date(editingRound.scheduled_at);
        if (!isNaN(date.getTime())) {
          scheduledAtISO = date.toISOString();
        }
      }
      
      await roundsApi.update(editingRound.id, {
        roundType: editingRound.round_type as any,
        interviewMode: editingRound.interview_mode as any,
        scheduledAt: scheduledAtISO,
        scheduledDurationMinutes: editingRound.scheduled_duration_minutes,
      });
      
      setShowEditModal(false);
      setEditingRound(null);
      fetchRounds();
    } catch (err: any) {
      console.error('Failed to update interview:', err);
      setError(err.response?.data?.error || 'Failed to update interview');
    } finally {
      setUpdating(false);
    }
  };

  const filteredRounds = rounds.filter(r => {
    const status = mapStatus(r.status);
    const matchesSearch = 
      r.external_candidate_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' || status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: rounds.length,
    completed: rounds.filter(r => r.status === 'COMPLETED').length,
    inProgress: rounds.filter(r => r.status === 'IN_PROGRESS' || r.status === 'WAITING_FOR_CANDIDATE' || r.status === 'WAITING_FOR_INTERVIEWER').length,
    scheduled: rounds.filter(r => r.status === 'SCHEDULED').length,
  };

  const getStatusBadge = (status: string) => {
    const mappedStatus = mapStatus(status);
    const config: Record<string, { variant: 'success' | 'warning' | 'info' | 'danger'; label: string }> = {
      completed: { variant: 'success', label: 'Completed' },
      in_progress: { variant: 'warning', label: 'In Progress' },
      waiting: { variant: 'info', label: 'Waiting' },
      scheduled: { variant: 'info', label: 'Scheduled' },
      cancelled: { variant: 'danger', label: 'Cancelled' },
      no_show: { variant: 'danger', label: 'No Show' },
    };
    const { variant, label } = config[mappedStatus] || { variant: 'info', label: status };
    return <Badge variant={variant}>{label}</Badge>;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Not scheduled';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">HR Dashboard</h1>
            <p className="text-sm text-gray-600">Welcome, {user?.fullName || user?.name || 'HR Manager'}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={() => setShowCreateModal(true)} leftIcon={<Plus className="w-4 h-4" />}>
              Create Interview
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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-primary-500 to-primary-600 text-white">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-primary-100 text-sm">Total Interviews</p>
                  <p className="text-3xl font-bold mt-1">{stats.total}</p>
                </div>
                <Users className="w-10 h-10 text-primary-200" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm">Completed</p>
                  <p className="text-3xl font-bold text-success-600 mt-1">{stats.completed}</p>
                </div>
                <CheckCircle className="w-10 h-10 text-success-200" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm">In Progress</p>
                  <p className="text-3xl font-bold text-warning-600 mt-1">{stats.inProgress}</p>
                </div>
                <Clock className="w-10 h-10 text-warning-200" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm">Scheduled</p>
                  <p className="text-3xl font-bold text-primary-600 mt-1">{stats.scheduled}</p>
                </div>
                <Calendar className="w-10 h-10 text-primary-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Interview Rounds List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-primary-600" />
                Interview Rounds
              </CardTitle>
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={fetchRounds} leftIcon={<RefreshCw className="w-4 h-4" />}>
                  Refresh
                </Button>
                {/* Search */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                {/* Filter */}
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                >
                  <option value="all">All Status</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                <span className="ml-3 text-gray-600">Loading interviews...</span>
              </div>
            ) : filteredRounds.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Briefcase className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium">No interviews found</p>
                <p className="text-sm mt-1">Create your first interview to get started</p>
                <Button 
                  variant="primary" 
                  className="mt-4"
                  onClick={() => setShowCreateModal(true)}
                  leftIcon={<Plus className="w-4 h-4" />}
                >
                  Create Interview
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRounds.map((round) => (
                  <div
                    key={round.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-primary-200 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                        <User className="w-6 h-6 text-primary-600" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">
                          Round {round.round_number} - {mapRoundType(round.round_type)}
                        </h3>
                        <p className="text-sm text-gray-600">
                          Candidate: {round.external_candidate_id.slice(0, 8)}...
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                          <Calendar className="w-3 h-3" />
                          {formatDate(round.scheduled_at)}
                          {round.videosdk_meeting_id && (
                            <Badge variant="info" size="sm">Video Ready</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {getStatusBadge(round.status)}
                      <div className="text-xs text-gray-500">
                        ID: {round.id.slice(0, 8)}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditInterview(round)}
                          className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Edit interview"
                          disabled={round.status === 'IN_PROGRESS' || round.status === 'COMPLETED'}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteInterview(round.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete interview"
                          disabled={deleting === round.id || round.status === 'IN_PROGRESS'}
                        >
                          {deleting === round.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Create Interview Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Interview"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Round Type</label>
            <select
              value={newInterview.roundType}
              onChange={(e) => setNewInterview({ ...newInterview, roundType: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="SCREENING_HUMAN">Screening</option>
              <option value="TECHNICAL_AI">Technical (AI)</option>
              <option value="HR_HUMAN">HR Round</option>
              <option value="MANAGERIAL_HUMAN">Managerial</option>
              <option value="CULTURAL_FIT_HUMAN">Culture Fit</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Interview Mode</label>
            <select
              value={newInterview.interviewMode}
              onChange={(e) => setNewInterview({ ...newInterview, interviewMode: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="HUMAN_AI_ASSISTED">Human + AI Assisted</option>
              <option value="AI_CONDUCTED">AI Conducted</option>
              <option value="HUMAN_ONLY">Human Only</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Time</label>
            <input
              type="datetime-local"
              value={newInterview.scheduledAt}
              onChange={(e) => setNewInterview({ ...newInterview, scheduledAt: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
            <input
              type="number"
              value={newInterview.durationMinutes}
              onChange={(e) => setNewInterview({ ...newInterview, durationMinutes: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              min="15"
              max="120"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => setShowCreateModal(false)} className="flex-1">
              Cancel
            </Button>
            <Button 
              variant="primary" 
              onClick={handleCreateInterview} 
              disabled={creating}
              className="flex-1"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                'Create Interview'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Interview Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingRound(null);
        }}
        title="Edit Interview"
        size="md"
      >
        {editingRound && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Round Type</label>
              <select
                value={editingRound.round_type}
                onChange={(e) => setEditingRound({ ...editingRound, round_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="SCREENING_HUMAN">Screening</option>
                <option value="TECHNICAL_AI">Technical (AI)</option>
                <option value="HR_HUMAN">HR Round</option>
                <option value="MANAGERIAL_HUMAN">Managerial</option>
                <option value="CULTURAL_FIT_HUMAN">Culture Fit</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Interview Mode</label>
              <select
                value={editingRound.interview_mode}
                onChange={(e) => setEditingRound({ ...editingRound, interview_mode: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="HUMAN_AI_ASSISTED">Human + AI Assisted</option>
                <option value="AI_CONDUCTED">AI Conducted</option>
                <option value="HUMAN_ONLY">Human Only</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Time</label>
              <input
                type="datetime-local"
                value={editingRound.scheduled_at ? new Date(editingRound.scheduled_at).toISOString().slice(0, 16) : ''}
                onChange={(e) => setEditingRound({ ...editingRound, scheduled_at: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
              <input
                type="number"
                value={editingRound.scheduled_duration_minutes}
                onChange={(e) => setEditingRound({ ...editingRound, scheduled_duration_minutes: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                min="15"
                max="120"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowEditModal(false);
                  setEditingRound(null);
                }} 
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                variant="primary" 
                onClick={handleUpdateInterview} 
                disabled={updating}
                className="flex-1"
              >
                {updating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Updating...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
