'use client';

import { useState, useMemo, useCallback } from 'react';
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { useToast } from '@/hooks/use-toast';
import { Users, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

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

interface BulkInterviewSchedulerDialogProps {
  candidates: Candidate[];
  exams: Exam[];
  subcategories: Subcategory[];
  onClose: () => void;
  onSubmit: (data: {
    candidateIds: number[];
    examId: number | null;
    subcategoryId: number | null;
    scheduledTime: string | null;
    scheduledEndTime: string | null;
    interviewMode: string | null;
    sendEmail: boolean;
  }) => Promise<void>;
}

export function BulkInterviewSchedulerDialog({
  candidates,
  exams,
  subcategories,
  onClose,
  onSubmit
}: BulkInterviewSchedulerDialogProps) {
  const [formData, setFormData] = useState({
    examId: '',
    subcategoryId: '',
    scheduledTime: '',
    scheduledEndTime: '',
    interviewMode: '',
    sendEmail: true,
    filterExam: '',
    filterSubcategory: '',
    filterName: '',
    filterEmail: '',
  });
  const [selectedCandidates, setSelectedCandidates] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Filter candidates based on exam/subcategory/name/email filters
  const filteredCandidates = useMemo(() => {
    let filtered = candidates;

    // Filter by exam
    if (formData.filterExam) {
      const examId = parseInt(formData.filterExam);
      filtered = filtered.filter(c => c.exam_id === examId);
    }

    // Filter by subcategory
    if (formData.filterSubcategory) {
      const subcategoryId = parseInt(formData.filterSubcategory);
      filtered = filtered.filter(c => c.subcategory_id === subcategoryId);
    }

    // Filter by name (case-insensitive search in first_name and last_name)
    if (formData.filterName.trim()) {
      const searchName = formData.filterName.trim().toLowerCase();
      filtered = filtered.filter(c => {
        const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim().toLowerCase();
        return fullName.includes(searchName);
      });
    }

    // Filter by email (case-insensitive search)
    if (formData.filterEmail.trim()) {
      const searchEmail = formData.filterEmail.trim().toLowerCase();
      filtered = filtered.filter(c => {
        return c.email?.toLowerCase().includes(searchEmail) || false;
      });
    }

    return filtered;
  }, [candidates, formData.filterExam, formData.filterSubcategory, formData.filterName, formData.filterEmail]);

  // Subcategories for the main form (interview settings)
  const filteredSubcategories = useMemo(() => {
    if (formData.examId && formData.examId !== 'none') {
      return subcategories.filter(s => s.exam_id === parseInt(formData.examId));
    }
    return [];
  }, [formData.examId, subcategories]);

  // Subcategories for the filter dropdown
  const filterSubcategories = useMemo(() => {
    if (formData.filterExam) {
      return subcategories.filter(s => s.exam_id === parseInt(formData.filterExam));
    }
    return [];
  }, [formData.filterExam, subcategories]);

  // Handle exam change - reset subcategory if it doesn't belong to the new exam
  const handleExamChange = useCallback((examId: string) => {
    const newExamId = examId === 'none' ? '' : examId;
    
    setFormData(prev => {
      // Check if current subcategory belongs to the new exam
      if (newExamId && prev.subcategoryId) {
        const currentSubcategory = subcategories.find(s => s.id === parseInt(prev.subcategoryId));
        if (currentSubcategory && currentSubcategory.exam_id !== parseInt(newExamId)) {
          // Subcategory doesn't belong to new exam, clear it
          return { ...prev, examId: newExamId, subcategoryId: '' };
        }
      }
      // If no exam selected or subcategory is valid, just update exam
      return { ...prev, examId: newExamId };
    });
  }, [subcategories]);

  const handleSelectAll = useCallback(() => {
    setSelectedCandidates(prev => {
      if (prev.size === filteredCandidates.length) {
        return new Set();
      } else {
        return new Set(filteredCandidates.map(c => c.candidate_id));
      }
    });
  }, [filteredCandidates]);

  const handleToggleCandidate = useCallback((candidateId: number) => {
    setSelectedCandidates(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(candidateId)) {
        newSelected.delete(candidateId);
      } else {
        newSelected.add(candidateId);
      }
      return newSelected;
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (selectedCandidates.size === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one candidate',
        variant: 'destructive',
      });
      return;
    }

    if (selectedCandidates.size > 1000) {
      toast({
        title: 'Error',
        description: 'Maximum 1000 candidates can be scheduled at once',
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
        candidateIds: Array.from(selectedCandidates),
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

  const selectedCount = selectedCandidates.size;
  const totalCount = filteredCandidates.length;

  if (!candidates || candidates.length === 0) {
    return null;
  }

  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Bulk Schedule Interviews</DialogTitle>
        <DialogDescription>
          Schedule interviews for multiple candidates at once. Select candidates and set common interview parameters.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Common Interview Settings */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h3 className="font-semibold text-lg">Interview Settings (Applied to All)</h3>
            
            <div className="space-y-2">
              <Label htmlFor="exam">Exam</Label>
              <Select
                value={formData.examId || undefined}
                onValueChange={handleExamChange}
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
              <p className="text-xs text-muted-foreground">
                This will override candidate-specific exam settings
              </p>
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
                Optional: Leave empty to allow candidates to take interview at their convenience
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
                  Optional: Set the end time for the interview window. The link will only be valid between start and end time. Must be after start time.
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
                Send interview invitation email automatically to all candidates
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Candidate Selection */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Select Candidates</h3>
              <div className="flex items-center gap-4">
                <Badge variant="outline">
                  {selectedCount} of {totalCount} selected
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                >
                  {selectedCount === totalCount ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div className="space-y-4 pb-4 border-b">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="filterExam">Filter by Exam</Label>
                  <Select
                    value={formData.filterExam || 'all'}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, filterExam: value === 'all' ? '' : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Exams" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Exams</SelectItem>
                      {exams.map(exam => (
                        <SelectItem key={exam.id} value={exam.id.toString()}>
                          {exam.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filterSubcategory">Filter by Subcategory</Label>
                  <Select
                    value={formData.filterSubcategory || 'all'}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, filterSubcategory: value === 'all' ? '' : value }))}
                    disabled={!formData.filterExam}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Subcategories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Subcategories</SelectItem>
                      {formData.filterExam && filterSubcategories.map(subcategory => (
                        <SelectItem key={subcategory.id} value={subcategory.id.toString()}>
                          {subcategory.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="filterName">Filter by Name</Label>
                  <Input
                    id="filterName"
                    type="text"
                    placeholder="Search by candidate name..."
                    value={formData.filterName}
                    onChange={(e) => setFormData(prev => ({ ...prev, filterName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filterEmail">Filter by Email ID</Label>
                  <Input
                    id="filterEmail"
                    type="text"
                    placeholder="Search by email address..."
                    value={formData.filterEmail}
                    onChange={(e) => setFormData(prev => ({ ...prev, filterEmail: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Candidate List */}
            <div className="max-h-96 overflow-y-auto space-y-2 border rounded-md p-4">
              {filteredCandidates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No candidates found. Try adjusting your filters.</p>
                </div>
              ) : (
                filteredCandidates.map(candidate => {
                  const isSelected = selectedCandidates.has(candidate.candidate_id);
                  const candidateId = candidate.candidate_id;
                  return (
                    <div
                      key={`candidate-${candidateId}`}
                      className={`flex items-center space-x-3 p-3 rounded-md border cursor-pointer transition-colors ${
                        isSelected ? 'bg-primary/10 border-primary' : 'hover:bg-muted'
                      }`}
                      onClick={() => handleToggleCandidate(candidateId)}
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleToggleCandidate(candidateId)}
                          id={`candidate-checkbox-${candidateId}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {candidate.first_name} {candidate.last_name}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">{candidate.email}</p>
                      </div>
                      {candidate.exam_id && (
                        <Badge variant="outline" className="ml-auto">
                          Exam: {exams.find(e => e.id === candidate.exam_id)?.name || 'N/A'}
                        </Badge>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        {selectedCount > 0 && (
          <Card className="bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="font-semibold">{selectedCount} candidate{selectedCount !== 1 ? 's' : ''} will be scheduled</span>
              </div>
              {formData.sendEmail && (
                <div className="flex items-center gap-2 text-sm mt-2 text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  <span>Interview invitation emails will be sent to all selected candidates</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading || selectedCount === 0}>
            {loading ? 'Scheduling...' : `Schedule ${selectedCount} Interview${selectedCount !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

