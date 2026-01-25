'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X, Play, Pause, Square, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface InterviewSession {
  id: number;
  candidate_id: number;
  candidate_name?: string;
  token: string;
  status: string;
  scheduled_time?: string;
  scheduled_end_time?: string;
  started_at?: string;
  completed_at?: string;
  expires_at: string;
}

interface SessionControlPanelProps {
  session: InterviewSession;
  onClose: () => void;
  onUpdate: () => void;
}

export function SessionControlPanel({ session, onClose, onUpdate }: SessionControlPanelProps) {
  const [selectedStatus, setSelectedStatus] = useState(session.status);
  const [newExpiresAt, setNewExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleStatusChange = async (newStatus: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/interview-sessions/${session.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: newStatus,
          expiresAt: newExpiresAt || undefined
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Success',
          description: `Session status updated to ${newStatus}`,
        });
        setSelectedStatus(newStatus);
        onUpdate();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update session status',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
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

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const interviewLink = `${baseUrl}/interview/${session.token}`;

  return (
    <Card className="fixed bottom-4 right-4 w-96 z-50 shadow-lg">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Session Control</CardTitle>
            <CardDescription>{session.candidate_name || 'Unknown Candidate'}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Current Status:</span>
          {getStatusBadge(selectedStatus)}
        </div>

        <div className="space-y-2">
          <Label>Change Status</Label>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="abandoned">Abandoned</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            onClick={() => handleStatusChange(selectedStatus)}
            disabled={loading || selectedStatus === session.status}
            className="w-full"
          >
            Update Status
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Extend Expiry (Optional)</Label>
          <Input
            type="datetime-local"
            value={newExpiresAt}
            onChange={(e) => setNewExpiresAt(e.target.value)}
          />
          <Button 
            onClick={() => handleStatusChange(session.status)}
            disabled={loading || !newExpiresAt}
            variant="outline"
            className="w-full"
          >
            <Clock className="h-4 w-4 mr-2" />
            Extend Expiry
          </Button>
        </div>

        <div className="space-y-2 pt-2 border-t">
          <Label>Quick Actions</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleStatusChange('in_progress')}
              disabled={loading || session.status === 'in_progress'}
            >
              <Play className="h-4 w-4 mr-2" />
              Start
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleStatusChange('completed')}
              disabled={loading || session.status === 'completed'}
            >
              <Square className="h-4 w-4 mr-2" />
              Complete
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleStatusChange('expired')}
              disabled={loading || session.status === 'expired'}
            >
              <Clock className="h-4 w-4 mr-2" />
              Expire
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(interviewLink)}
            >
              Copy Link
            </Button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
          <div>Session ID: {session.id}</div>
          {session.started_at && (
            <div>Started: {new Date(session.started_at).toLocaleString()}</div>
          )}
          {session.scheduled_end_time && (
            <div>Scheduled End: {new Date(session.scheduled_end_time).toLocaleString()}</div>
          )}
          <div>Expires: {session.scheduled_end_time 
            ? new Date(session.scheduled_end_time).toLocaleString()
            : new Date(session.expires_at).toLocaleString()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

