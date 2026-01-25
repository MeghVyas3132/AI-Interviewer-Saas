'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Plus, Calendar, Mail, Play, Pause, Square, Clock, User, Filter, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { InterviewSchedulerDialog } from './interview-scheduler-dialog';
import { BulkInterviewSchedulerDialog } from './bulk-interview-scheduler-dialog';
import { SessionControlPanel } from './session-control-panel';

interface InterviewSession {
  id: number;
  candidate_id: number;
  candidate_name?: string;
  candidate_email?: string;
  exam_id?: number;
  subcategory_id?: number;
  exam_name?: string;
  subcategory_name?: string;
  token: string;
  status: string;
  scheduled_time?: string;
  scheduled_end_time?: string;
  link_sent_at?: string;
  started_at?: string;
  completed_at?: string;
  expires_at: string;
  interview_mode?: string;
  created_at: string;
}

interface Candidate {
  candidate_id: number;
  first_name: string;
  last_name: string;
  email: string;
  exam_id?: number | null;
  subcategory_id?: number | null;
}

interface Exam {
  id: number;
  name: string;
}

interface Subcategory {
  id: number;
  name: string;
}

export function InterviewSessionManager({ onUpdate }: { onUpdate?: () => void }) {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<InterviewSession | null>(null);
  const [selectedSession, setSelectedSession] = useState<InterviewSession | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCandidate, setFilterCandidate] = useState<string>('all');
  const [filterExam, setFilterExam] = useState<string>('all');
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [sessionsRes, candidatesRes, examsRes] = await Promise.all([
        fetch('/api/admin/interview-sessions'),
        fetch('/api/admin/candidates'),
        fetch('/api/admin/exams-postgres')
      ]);

      const [sessionsData, candidatesData, examsData] = await Promise.all([
        sessionsRes.json(),
        candidatesRes.json(),
        examsRes.json()
      ]);

      if (sessionsData.success) {
        // Ensure all sessions have a valid status
        const normalizedSessions = sessionsData.data.map((session: InterviewSession) => ({
          ...session,
          status: session.status || 'pending' // Default to 'pending' if status is missing
        }));
        setSessions(normalizedSessions);
        
        // Debug logging in development
        if (process.env.NODE_ENV === 'development') {
          console.log('Loaded sessions:', normalizedSessions);
          console.log('Session statuses:', normalizedSessions.map((s: InterviewSession) => ({ id: s.id, status: s.status })));
        }
      }
      if (candidatesData.success) {
        setCandidates(candidatesData.data);
      }
      if (examsData.success) {
        setExams(examsData.data);
      }

      // Fetch subcategories if needed
      if (examsData.success && examsData.data.length > 0) {
        const subcategoriesRes = await fetch('/api/admin/subcategories-postgres');
        const subcategoriesData = await subcategoriesRes.json();
        if (subcategoriesData.success) {
          setSubcategories(subcategoriesData.data);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async (sessionData: any) => {
    try {
      const response = await fetch('/api/admin/interview-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData),
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Success',
          description: 'Interview session created successfully',
        });
        setIsDialogOpen(false);
        fetchData();
        onUpdate?.();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error creating session:', error);
      toast({
        title: 'Error',
        description: 'Failed to create interview session',
        variant: 'destructive',
      });
    }
  };

  const handleBulkSchedule = async (bulkData: {
    candidateIds: number[];
    examId: number | null;
    subcategoryId: number | null;
    scheduledTime: string | null;
    scheduledEndTime: string | null;
    interviewMode: string | null;
    sendEmail: boolean;
  }) => {
    try {
      const response = await fetch('/api/admin/interview-sessions/bulk-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bulkData),
      });

      const data = await response.json();
      
      if (data.success) {
        const { success, failed, emailSent, emailFailed, errors } = data.data;
        let description = `Successfully scheduled ${success} interview${success !== 1 ? 's' : ''}`;
        if (failed > 0) {
          description += `. ${failed} failed.`;
        }
        if (emailSent > 0) {
          description += ` ${emailSent} email${emailSent !== 1 ? 's' : ''} sent.`;
        }
        if (emailFailed > 0) {
          description += ` ${emailFailed} email${emailFailed !== 1 ? 's' : ''} failed to send.`;
        }
        
        toast({
          title: 'Bulk Schedule Complete',
          description,
        });
        
        if (errors.length > 0) {
          console.error('Bulk schedule errors:', errors);
        }
        
        setIsBulkDialogOpen(false);
        fetchData();
        onUpdate?.();
      } else {
        throw new Error(data.error || 'Failed to bulk schedule interviews');
      }
    } catch (error) {
      console.error('Error bulk scheduling:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to bulk schedule interviews',
        variant: 'destructive',
      });
      throw error; // Re-throw to let the dialog handle it
    }
  };

  const handleSendLink = async (sessionId: number) => {
    try {
      const response = await fetch(`/api/admin/interview-sessions/${sessionId}/send-link`, {
        method: 'POST',
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Success',
          description: 'Interview link sent successfully',
        });
        fetchData();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error sending link:', error);
      toast({
        title: 'Error',
        description: 'Failed to send interview link',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (sessionId: number) => {
    try {
      const response = await fetch(`/api/admin/interview-sessions/${sessionId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Success',
          description: 'Session deleted successfully',
        });
        fetchData();
        onUpdate?.();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete session',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      pending: { label: 'Pending', variant: 'outline' },
      in_progress: { label: 'In Progress', variant: 'default' },
      completed: { label: 'Completed', variant: 'secondary' },
      expired: { label: 'Expired', variant: 'destructive' },
      abandoned: { label: 'Abandoned', variant: 'destructive' },
    };

    const config = statusConfig[status] || { label: status, variant: 'outline' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const filteredSessions = sessions.filter(session => {
    // Status filter - normalize comparison (case-insensitive, trim whitespace)
    if (filterStatus !== 'all') {
      const sessionStatus = (session.status || '').toLowerCase().trim();
      const filterStatusLower = filterStatus.toLowerCase().trim();
      
      // Debug logging (remove in production)
      if (process.env.NODE_ENV === 'development') {
        console.log('Filter check:', {
          sessionStatus,
          filterStatusLower,
          match: sessionStatus === filterStatusLower,
          sessionId: session.id
        });
      }
      
      if (sessionStatus !== filterStatusLower) return false;
    }
    
    // Candidate filter
    if (filterCandidate !== 'all') {
      if (!session.candidate_id || session.candidate_id.toString() !== filterCandidate) {
        return false;
      }
    }
    
    // Exam filter
    if (filterExam !== 'all') {
      if (!session.exam_id || session.exam_id.toString() !== filterExam) {
        return false;
      }
    }
    
    return true;
  });

  const upcomingSessions = filteredSessions.filter(s => 
    ['pending', 'in_progress'].includes(s.status) && new Date(s.expires_at) > new Date()
  );
  const ongoingSessions = filteredSessions.filter(s => s.status === 'in_progress');
  const completedSessions = filteredSessions.filter(s => s.status === 'completed');

  if (loading) {
    return <div className="text-center py-8">Loading sessions...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Interview Sessions</h2>
          <p className="text-sm text-muted-foreground">Manage and monitor interview sessions</p>
        </div>
        <div className="flex items-center gap-2">
          {isBulkDialogOpen ? (
            <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Users className="h-4 w-4 mr-2" />
                  Bulk Schedule
                </Button>
              </DialogTrigger>
              <BulkInterviewSchedulerDialog
                candidates={candidates}
                exams={exams}
                subcategories={subcategories}
                onClose={() => setIsBulkDialogOpen(false)}
                onSubmit={handleBulkSchedule}
              />
            </Dialog>
          ) : (
            <Button variant="outline" onClick={() => setIsBulkDialogOpen(true)}>
              <Users className="h-4 w-4 mr-2" />
              Bulk Schedule
            </Button>
          )}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Schedule Interview
              </Button>
            </DialogTrigger>
            <InterviewSchedulerDialog
              candidates={candidates}
              exams={exams}
              subcategories={subcategories}
              onClose={() => setIsDialogOpen(false)}
              onSubmit={handleCreateSession}
            />
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="abandoned">Abandoned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Candidate</label>
              <Select value={filterCandidate} onValueChange={setFilterCandidate}>
                <SelectTrigger>
                  <SelectValue placeholder="All Candidates" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Candidates</SelectItem>
                  {candidates.map(c => (
                    <SelectItem key={c.candidate_id} value={c.candidate_id.toString()}>
                      {c.first_name} {c.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Exam</label>
              <Select value={filterExam} onValueChange={setFilterExam}>
                <SelectTrigger>
                  <SelectValue placeholder="All Exams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Exams</SelectItem>
                  {exams.map(e => (
                    <SelectItem key={e.id} value={e.id.toString()}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions Tabs */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="upcoming">
            Upcoming ({upcomingSessions.length})
          </TabsTrigger>
          <TabsTrigger value="ongoing">
            Ongoing ({ongoingSessions.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({completedSessions.length})
          </TabsTrigger>
          <TabsTrigger value="all">
            All ({filteredSessions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming">
          <SessionList 
            sessions={upcomingSessions} 
            onSendLink={handleSendLink}
            onDelete={handleDelete}
            onControl={(session) => setSelectedSession(session)}
            getStatusBadge={getStatusBadge}
          />
        </TabsContent>

        <TabsContent value="ongoing">
          <SessionList 
            sessions={ongoingSessions} 
            onSendLink={handleSendLink}
            onDelete={handleDelete}
            onControl={(session) => setSelectedSession(session)}
            getStatusBadge={getStatusBadge}
          />
          {selectedSession && (
            <SessionControlPanel
              session={selectedSession}
              onClose={() => setSelectedSession(null)}
              onUpdate={() => {
                fetchData();
                setSelectedSession(null);
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="completed">
          <SessionList 
            sessions={completedSessions} 
            onSendLink={handleSendLink}
            onDelete={handleDelete}
            onControl={(session) => setSelectedSession(session)}
            getStatusBadge={getStatusBadge}
          />
        </TabsContent>

        <TabsContent value="all">
          <SessionList 
            sessions={filteredSessions} 
            onSendLink={handleSendLink}
            onDelete={handleDelete}
            onControl={(session) => setSelectedSession(session)}
            getStatusBadge={getStatusBadge}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SessionList({ 
  sessions, 
  onSendLink, 
  onDelete, 
  onControl,
  getStatusBadge 
}: { 
  sessions: InterviewSession[];
  onSendLink: (id: number) => void;
  onDelete: (id: number) => void;
  onControl: (session: InterviewSession) => void;
  getStatusBadge: (status: string) => React.ReactNode;
}) {
  if (!sessions || sessions.length === 0) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground">No sessions found</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      {sessions.map(session => {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        const interviewLink = `${baseUrl}/interview/${session.token}`;
        const isExpired = new Date(session.expires_at) < new Date();

        return (
          <Card key={session.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {session.candidate_name || 'Unknown Candidate'}
                  </CardTitle>
                  <CardDescription>{session.candidate_email}</CardDescription>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {getStatusBadge(session.status)}
                  {/* Detailed Status Indicators */}
                  <div className="flex flex-col gap-1 text-xs">
                    {session.link_sent_at && (
                      <Badge variant="outline" className="text-xs">
                        ✓ Sent: {new Date(session.link_sent_at).toLocaleDateString()}
                      </Badge>
                    )}
                    {session.started_at && !session.completed_at && (
                      <Badge variant="outline" className="text-xs bg-blue-50">
                        👁️ Opened: {new Date(session.started_at).toLocaleDateString()}
                      </Badge>
                    )}
                    {session.status === 'abandoned' && (
                      <Badge variant="destructive" className="text-xs">
                        ⚠️ Abandoned
                      </Badge>
                    )}
                    {session.completed_at && (
                      <Badge variant="outline" className="text-xs bg-green-50">
                        ✓ Finished: {new Date(session.completed_at).toLocaleDateString()}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {session.exam_name} {session.subcategory_name && `- ${session.subcategory_name}`}
                  </span>
                </div>
                {session.scheduled_time && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Scheduled: {new Date(session.scheduled_time).toLocaleString()}
                    </span>
                  </div>
                )}
                {session.scheduled_end_time && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Scheduled End: {new Date(session.scheduled_end_time).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className={isExpired || session.status === 'completed' ? 'text-destructive' : ''}>
                    Expires: {session.scheduled_end_time 
                      ? new Date(session.scheduled_end_time).toLocaleString()
                      : new Date(session.expires_at).toLocaleString()}
                    {session.status === 'completed' && ' (Link expired after completion)'}
                  </span>
                </div>
                {session.interview_mode && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Mode:</span>
                    <Badge variant="outline">{session.interview_mode}</Badge>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                    {interviewLink}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(interviewLink)}
                >
                  Copy Link
                </Button>
                {!session.link_sent_at && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSendLink(session.id)}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Send Link
                  </Button>
                )}
                {session.status === 'in_progress' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onControl(session)}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Control
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive">
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Session</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this interview session? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDelete(session.id)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

