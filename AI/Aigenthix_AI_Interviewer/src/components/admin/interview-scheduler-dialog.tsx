'use client';

import { useState, useEffect } from 'react';
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { useToast } from '@/hooks/use-toast';

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
  exam_id: number;
}

interface InterviewSchedulerDialogProps {
  candidates: Candidate[];
  exams: Exam[];
  subcategories: Subcategory[];
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
}

export function InterviewSchedulerDialog({
  candidates,
  exams,
  subcategories,
  onClose,
  onSubmit
}: InterviewSchedulerDialogProps) {
  const [formData, setFormData] = useState({
    candidateId: '',
    examId: '',
    subcategoryId: '',
    scheduledTime: '',
    scheduledEndTime: '',
    interviewMode: '',
    sendEmail: true
  });
  const [filteredSubcategories, setFilteredSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Auto-populate exam and subcategory when candidate is selected
  useEffect(() => {
    if (formData.candidateId) {
      const selectedCandidate = candidates.find(c => c.candidate_id.toString() === formData.candidateId);
      if (selectedCandidate) {
        // Auto-populate exam and subcategory from candidate record
        if (selectedCandidate.exam_id) {
          setFormData(prev => ({ ...prev, examId: selectedCandidate.exam_id!.toString() }));
        }
        if (selectedCandidate.subcategory_id) {
          setFormData(prev => ({ ...prev, subcategoryId: selectedCandidate.subcategory_id!.toString() }));
        }
      }
    }
  }, [formData.candidateId, candidates]);

  useEffect(() => {
    if (formData.examId && formData.examId !== 'none') {
      const filtered = subcategories.filter(s => s.exam_id === parseInt(formData.examId));
      setFilteredSubcategories(filtered);
      // Reset subcategory if current one doesn't belong to selected exam
      if (formData.subcategoryId) {
        const currentSubcategory = subcategories.find(s => s.id === parseInt(formData.subcategoryId));
        if (currentSubcategory && currentSubcategory.exam_id !== parseInt(formData.examId)) {
          setFormData(prev => ({ ...prev, subcategoryId: '' }));
        }
      }
    } else {
      setFilteredSubcategories([]);
      // Only clear subcategory if exam is cleared manually (not from candidate auto-populate)
      if (!formData.candidateId || !candidates.find(c => c.candidate_id.toString() === formData.candidateId)?.exam_id) {
      setFormData(prev => ({ ...prev, subcategoryId: '' }));
      }
    }
  }, [formData.examId, subcategories, formData.candidateId, candidates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.candidateId) {
      toast({
        title: 'Error',
        description: 'Please select a candidate',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Validate end time is after start time if both are provided
      if (formData.scheduledTime && formData.scheduledEndTime) {
        const startTime = new Date(formData.scheduledTime);
        const endTime = new Date(formData.scheduledEndTime);
        if (endTime <= startTime) {
          toast({
            title: 'Error',
            description: 'End time must be after start time',
            variant: 'destructive',
          });
          return;
        }
      }

      await onSubmit({
        candidateId: parseInt(formData.candidateId),
        examId: formData.examId && formData.examId !== 'none' ? parseInt(formData.examId) : null,
        subcategoryId: formData.subcategoryId && formData.subcategoryId !== 'none' ? parseInt(formData.subcategoryId) : null,
        scheduledTime: formData.scheduledTime || null,
        scheduledEndTime: formData.scheduledEndTime || null,
        interviewMode: formData.interviewMode || null,
        sendEmail: formData.sendEmail
      });
      onClose();
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Schedule Interview</DialogTitle>
        <DialogDescription>
          Create a new interview session for a candidate. A unique token and link will be generated.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="candidate">Candidate *</Label>
          <Select
            value={formData.candidateId}
            onValueChange={(value) => setFormData(prev => ({ ...prev, candidateId: value }))}
            required
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a candidate" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map(candidate => (
                <SelectItem key={candidate.candidate_id} value={candidate.candidate_id.toString()}>
                  {candidate.first_name} {candidate.last_name} ({candidate.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="exam">Exam</Label>
          <Select
            value={formData.examId || undefined}
            onValueChange={(value) => setFormData(prev => ({ ...prev, examId: value === 'none' ? '' : value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an exam (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {exams.map(exam => (
                <SelectItem key={exam.id} value={exam.id.toString()}>
                  {exam.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {formData.examId && formData.examId !== 'none' && (
          <div className="space-y-2">
            <Label htmlFor="subcategory">Subcategory</Label>
            <Select
              value={formData.subcategoryId || undefined}
              onValueChange={(value) => setFormData(prev => ({ ...prev, subcategoryId: value === 'none' ? '' : value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a subcategory (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {filteredSubcategories.map(subcategory => (
                  <SelectItem key={subcategory.id} value={subcategory.id.toString()}>
                    {subcategory.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="interviewMode">Interview Mode</Label>
          <Select
            value={formData.interviewMode || undefined}
            onValueChange={(value) => setFormData(prev => ({ ...prev, interviewMode: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select interview mode (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="voice">Voice</SelectItem>
              <SelectItem value="text">Text</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="scheduledTime">Scheduled Start Time</Label>
          <DateTimePicker
            id="scheduledTime"
            value={formData.scheduledTime}
            onChange={(value) => setFormData(prev => ({ ...prev, scheduledTime: value }))}
            placeholder="Pick a date and time (optional)"
          />
          <p className="text-xs text-muted-foreground">
            Optional: Leave empty to allow candidate to take interview at their convenience
          </p>
        </div>

        {formData.scheduledTime && (
          <div className="space-y-2">
            <Label htmlFor="scheduledEndTime">Scheduled End Time</Label>
            <DateTimePicker
              id="scheduledEndTime"
              value={formData.scheduledEndTime}
              onChange={(value) => setFormData(prev => ({ ...prev, scheduledEndTime: value }))}
              min={formData.scheduledTime}
              placeholder="Pick an end time (optional)"
            />
            <p className="text-xs text-muted-foreground">
              Optional: Set the end time for the interview window. Must be after start time.
            </p>
          </div>
        )}

        <div className="flex items-center space-x-2">
          <Checkbox
            id="sendEmail"
            checked={formData.sendEmail}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, sendEmail: !!checked }))}
          />
          <Label htmlFor="sendEmail" className="cursor-pointer">
            Send interview invitation email automatically
          </Label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Schedule Interview'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

