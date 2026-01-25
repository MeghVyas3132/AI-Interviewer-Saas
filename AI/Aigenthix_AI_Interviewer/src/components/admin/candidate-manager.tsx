'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Trash2, User, Mail, Phone, RotateCcw, Upload, FileSpreadsheet, CheckSquare, Square, Search, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';

interface Candidate {
  candidate_id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  exam_id?: number;
  subcategory_id?: number;
  resume_url?: string;
  status: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
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

export function CandidateManager({ onUpdate }: { onUpdate?: () => void }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    exam_id: '',
    subcategory_id: '',
    resume_url: '',
    status: 'active'
  });
  const [filteredSubcategories, setFilteredSubcategories] = useState<Subcategory[]>([]);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [bulkUploadFile, setBulkUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    total: number;
    success: number;
    failed: number;
    errors: Array<{ row: number; email: string; error: string }>;
    reactivated: number;
    skipped: number;
  } | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
    setSelectedCandidates(new Set()); // Clear selections when view changes
  }, [showDeleted]);

  useEffect(() => {
    if (formData.exam_id) {
      const filtered = subcategories.filter(s => s.exam_id === parseInt(formData.exam_id));
      setFilteredSubcategories(filtered);
      if (formData.subcategory_id) {
        const currentSubcategory = subcategories.find(s => s.id === parseInt(formData.subcategory_id));
        if (currentSubcategory && currentSubcategory.exam_id !== parseInt(formData.exam_id)) {
          setFormData(prev => ({ ...prev, subcategory_id: '' }));
        }
      }
    } else {
      setFilteredSubcategories([]);
      setFormData(prev => ({ ...prev, subcategory_id: '' }));
    }
  }, [formData.exam_id, subcategories]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [candidatesRes, examsRes, subcategoriesRes] = await Promise.all([
        fetch(`/api/admin/candidates?includeDeleted=${showDeleted}`),
        fetch('/api/admin/exams-postgres'),
        fetch('/api/admin/subcategories-postgres')
      ]);

      const [candidatesData, examsData, subcategoriesData] = await Promise.all([
        candidatesRes.json(),
        examsRes.json(),
        subcategoriesRes.json()
      ]);

      if (candidatesData.success) {
        setCandidates(candidatesData.data);
      }
      if (examsData.success) {
        setExams(examsData.data);
      }
      if (subcategoriesData.success) {
        setSubcategories(subcategoriesData.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch candidates',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Validate required fields
      if (!formData.exam_id) {
        throw new Error('Please select an exam');
      }
      if (!formData.subcategory_id) {
        throw new Error('Please select a subcategory');
      }

      const url = '/api/admin/candidates';
      const method = editingCandidate ? 'PUT' : 'POST';
      const body = editingCandidate
        ? { id: editingCandidate.candidate_id, ...formData, exam_id: parseInt(formData.exam_id) || null, subcategory_id: parseInt(formData.subcategory_id) || null }
        : { ...formData, exam_id: parseInt(formData.exam_id) || null, subcategory_id: parseInt(formData.subcategory_id) || null };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      
      if (response.status === 409) {
        toast({
          title: 'Candidate already exists',
          description: 'A candidate with this email already exists. Opening the profile for editing.',
        });
        if (data.candidate) {
          handleEdit(data.candidate);
          return;
        }
        return;
      }
      
      if (data.success) {
        // Handle reactivation case
        if (data.message && data.message.includes('reactivated')) {
          toast({
            title: 'Candidate Reactivated',
            description: 'The candidate was reactivated and updated with the new information.',
          });
        }
        
        // If a resume file is provided (creating or editing), upload it now
        if (resumeFile) {
          try {
            const candidateId = editingCandidate 
              ? editingCandidate.candidate_id 
              : (data.data?.candidate_id || data.candidate?.candidate_id);
            
            if (candidateId) {
              const uploadFormData = new FormData();
              uploadFormData.append('file', resumeFile);
              toast({ title: 'Uploading Resume', description: 'Analyzing resume...' });
              const uploadRes = await fetch(`/api/admin/candidates/${candidateId}/upload-resume`, {
                method: 'POST',
                body: uploadFormData
              });
              const uploadData = await uploadRes.json();
              if (uploadData.success) {
                toast({ 
                  title: 'Resume analyzed', 
                  description: `ATS Score: ${uploadData.data.analysis.atsScore}/100` 
                });
                // Refresh data to show updated resume URL
                fetchData();
              } else {
                console.warn('Resume upload failed:', uploadData.error);
                toast({
                  title: 'Resume Upload Failed',
                  description: uploadData.error || 'Failed to upload resume',
                  variant: 'destructive'
                });
              }
            }
          } catch (e) {
            console.warn('Resume auto-upload failed:', e);
            toast({
              title: 'Resume Upload Error',
              description: 'Failed to upload resume. Please try again.',
              variant: 'destructive'
            });
          }
        }

        toast({
          title: 'Success',
          description: editingCandidate ? 'Candidate updated successfully' : 'Candidate created successfully',
        });
        setIsDialogOpen(false);
        setEditingCandidate(null);
        setFormData({
          first_name: '',
          last_name: '',
          email: '',
          phone: '',
          exam_id: '',
          subcategory_id: '',
          resume_url: '',
          status: 'active'
        });
        setResumeFile(null);
        fetchData();
        onUpdate?.();
      } else {
        throw new Error(data.error || 'Failed to save candidate');
      }
    } catch (error) {
      console.error('Error saving candidate:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save candidate',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (candidate: Candidate) => {
    setEditingCandidate(candidate);
    setFormData({
      first_name: candidate.first_name,
      last_name: candidate.last_name,
      email: candidate.email,
      phone: candidate.phone || '',
      exam_id: candidate.exam_id?.toString() || 'none',
      subcategory_id: candidate.subcategory_id?.toString() || 'none',
      resume_url: candidate.resume_url || '',
      status: candidate.status
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/admin/candidates/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Success',
          description: 'Candidate deleted successfully',
        });
        fetchData();
        onUpdate?.();
      } else {
        throw new Error(data.error || 'Failed to delete candidate');
      }
    } catch (error) {
      console.error('Error deleting candidate:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete candidate',
        variant: 'destructive',
      });
    }
  };

  const handleRestore = async (id: number) => {
    try {
      const response = await fetch(`/api/admin/candidates/${id}/restore`, {
        method: 'POST',
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Success',
          description: 'Candidate restored successfully',
        });
        fetchData();
        onUpdate?.();
      } else {
        throw new Error(data.error || 'Failed to restore candidate');
      }
    } catch (error) {
      console.error('Error restoring candidate:', error);
      toast({
        title: 'Error',
        description: 'Failed to restore candidate',
        variant: 'destructive',
      });
    }
  };

  const handleBulkUpload = async () => {
    if (!bulkUploadFile) {
      toast({
        title: 'Error',
        description: 'Please select a file to upload',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', bulkUploadFile);

      const response = await fetch('/api/admin/candidates/bulk-upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setUploadResult(data.data);
        toast({
          title: 'Bulk Upload Complete',
          description: `Successfully processed ${data.data.success} candidates. ${data.data.failed} failed, ${data.data.skipped} skipped, ${data.data.reactivated} reactivated.`,
        });
        fetchData();
        onUpdate?.();
        // Reset file input after successful upload
        setBulkUploadFile(null);
      } else {
        throw new Error(data.error || 'Failed to upload candidates');
      }
    } catch (error) {
      console.error('Error uploading candidates:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to upload candidates',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const getExamName = (examId?: number) => {
    if (!examId) return 'N/A';
    const exam = exams.find(e => e.id === examId);
    return exam?.name || 'Unknown';
  };

  const getSubcategoryName = (subcategoryId?: number) => {
    if (!subcategoryId) return 'N/A';
    const subcategory = subcategories.find(s => s.id === subcategoryId);
    return subcategory?.name || 'Unknown';
  };

  const handleToggleCandidate = (candidateId: number) => {
    setSelectedCandidates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(candidateId)) {
        newSet.delete(candidateId);
      } else {
        newSet.add(candidateId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const activeCandidates = candidates.filter(c => c.is_active);
    if (selectedCandidates.size === activeCandidates.length) {
      setSelectedCandidates(new Set());
    } else {
      setSelectedCandidates(new Set(activeCandidates.map(c => c.candidate_id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedCandidates.size === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one candidate to delete',
        variant: 'destructive',
      });
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch('/api/admin/candidates/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds: Array.from(selectedCandidates) }),
      });

      const data = await response.json();

      if (data.success) {
        const { success, failed, errors } = data.data;
        let description = `Successfully deleted ${success} candidate${success !== 1 ? 's' : ''}`;
        if (failed > 0) {
          description += `. ${failed} failed.`;
        }

        toast({
          title: 'Bulk Delete Complete',
          description,
        });

        if (errors.length > 0) {
          console.error('Bulk delete errors:', errors);
        }

        setSelectedCandidates(new Set());
        fetchData();
        onUpdate?.();
      } else {
        throw new Error(data.error || 'Failed to delete candidates');
      }
    } catch (error) {
      console.error('Error deleting candidates:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete candidates',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading candidates...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Candidates</h2>
          <p className="text-sm text-muted-foreground">Manage candidate profiles</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedCandidates.size > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isDeleting}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Selected ({selectedCandidates.size})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Selected Candidates</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete {selectedCandidates.size} candidate{selectedCandidates.size !== 1 ? 's' : ''}? 
                    This will soft-delete the candidate{selectedCandidates.size !== 1 ? 's' : ''} (you can restore them later).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkDelete} disabled={isDeleting}>
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button
            variant={showDeleted ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setShowDeleted(!showDeleted);
              setSelectedCandidates(new Set());
            }}
          >
            {showDeleted ? 'Show Active Only' : 'Show Deleted'}
          </Button>
          
          <Dialog open={isBulkUploadOpen} onOpenChange={(open) => {
            setIsBulkUploadOpen(open);
            if (!open) {
              setBulkUploadFile(null);
              setUploadResult(null);
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Bulk Upload
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Bulk Upload Candidates</DialogTitle>
                <DialogDescription>
                  Upload an Excel (.xlsx, .xls) or CSV file to add multiple candidates at once. Maximum 1000 candidates per file.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="bulk_upload_file">Select File *</Label>
                  <Input
                    id="bulk_upload_file"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setBulkUploadFile(file);
                      setUploadResult(null);
                    }}
                    disabled={isUploading}
                  />
                  <p className="text-xs text-muted-foreground">
                    The file should have the following columns: First Name, Last Name, Email, Phone (optional), Exam, Subcategory, Status (optional, defaults to "active")
                  </p>
                </div>

                {bulkUploadFile && (
                  <div className="p-3 bg-muted rounded-md">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4" />
                      <span className="text-sm font-medium">{bulkUploadFile.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(bulkUploadFile.size / 1024).toFixed(2)} KB)
                      </span>
                    </div>
                  </div>
                )}

                {uploadResult && (
                  <div className="space-y-3 p-4 border rounded-md">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">Upload Results</h4>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Total</p>
                        <p className="text-lg font-semibold">{uploadResult.total}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Success</p>
                        <p className="text-lg font-semibold text-green-600">{uploadResult.success}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Failed</p>
                        <p className="text-lg font-semibold text-red-600">{uploadResult.failed}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Skipped</p>
                        <p className="text-lg font-semibold text-yellow-600">{uploadResult.skipped}</p>
                      </div>
                    </div>
                    {uploadResult.reactivated > 0 && (
                      <div>
                        <p className="text-sm text-muted-foreground">Reactivated: <span className="font-semibold">{uploadResult.reactivated}</span></p>
                      </div>
                    )}
                    {uploadResult.errors.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-semibold mb-2">Errors ({uploadResult.errors.length}):</p>
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {uploadResult.errors.slice(0, 20).map((error, idx) => (
                            <div key={idx} className="text-xs p-2 bg-red-50 rounded border border-red-200">
                              <p className="font-medium">Row {error.row} ({error.email}):</p>
                              <p className="text-red-600">{error.error}</p>
                            </div>
                          ))}
                          {uploadResult.errors.length > 20 && (
                            <p className="text-xs text-muted-foreground">
                              ... and {uploadResult.errors.length - 20} more errors
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsBulkUploadOpen(false)}
                    disabled={isUploading}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="button"
                    onClick={handleBulkUpload}
                    disabled={!bulkUploadFile || isUploading}
                  >
                    {isUploading ? 'Uploading...' : 'Upload Candidates'}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingCandidate(null);
            setFormData({
              first_name: '',
              last_name: '',
              email: '',
              phone: '',
              exam_id: '',
              subcategory_id: '',
              resume_url: '',
              status: 'active'
            });
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Candidate
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingCandidate ? 'Edit Candidate' : 'Add Candidate'}</DialogTitle>
              <DialogDescription>
                {editingCandidate ? 'Update candidate information' : 'Create a new candidate profile'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name *</Label>
                  <Input
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name *</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  required
                  disabled={!!editingCandidate}
                />
                {editingCandidate && (
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+1234567890"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="exam_id">Exam *</Label>
                <Select
                  value={formData.exam_id || undefined}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, exam_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an exam" />
                  </SelectTrigger>
                  <SelectContent>
                    {exams.map(exam => (
                      <SelectItem key={exam.id} value={exam.id.toString()}>
                        {exam.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.exam_id && (
                <div className="space-y-2">
                  <Label htmlFor="subcategory_id">Subcategory *</Label>
                  <Select
                    value={formData.subcategory_id || undefined}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, subcategory_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a subcategory" />
                    </SelectTrigger>
                    <SelectContent>
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
                  <Label htmlFor="resume_file">Upload Resume (PDF/DOCX)</Label>
                  <Input
                    id="resume_file"
                    type="file"
                    accept=".pdf,.doc,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setResumeFile(file);
                  }}
                />
                  <p className="text-xs text-muted-foreground">
                  Upload a PDF or DOCX resume. It will be automatically analyzed by AI after creating the candidate.
                  </p>
                </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingCandidate ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Search Filter */}
      <Card>
        <CardContent className="py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filter candidates based on search query */}
      {(() => {
        const filteredCandidates = candidates.filter((candidate) => {
          if (!searchQuery.trim()) return true;
          
          const query = searchQuery.toLowerCase().trim();
          const fullName = `${candidate.first_name} ${candidate.last_name}`.toLowerCase();
          const email = candidate.email.toLowerCase();
          
          return fullName.includes(query) || email.includes(query);
        });

        if (filteredCandidates.length === 0) {
          return (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                {searchQuery ? (
                  <>
                    No candidates found matching "{searchQuery}". 
                    <Button
                      variant="link"
                      className="ml-2 p-0 h-auto"
                      onClick={() => setSearchQuery('')}
                    >
                      Clear search
                    </Button>
                  </>
                ) : (
                  'No candidates found. Click "Add Candidate" to create one.'
                )}
              </CardContent>
            </Card>
          );
        }

        return (
          <div className="space-y-4">
            {/* Select All Header */}
            {!showDeleted && filteredCandidates.filter(c => c.is_active).length > 0 && (
              <Card>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedCandidates.size > 0 && selectedCandidates.size === filteredCandidates.filter(c => c.is_active).length}
                        onCheckedChange={() => {
                          const activeCandidates = filteredCandidates.filter(c => c.is_active);
                          if (selectedCandidates.size === activeCandidates.length) {
                            // Deselect all
                            setSelectedCandidates(new Set());
                          } else {
                            // Select all filtered active candidates
                            setSelectedCandidates(new Set(activeCandidates.map(c => c.candidate_id)));
                          }
                        }}
                        id="select-all"
                      />
                      <Label htmlFor="select-all" className="cursor-pointer">
                        Select All ({filteredCandidates.filter(c => c.is_active).length} candidate{filteredCandidates.filter(c => c.is_active).length !== 1 ? 's' : ''})
                      </Label>
                    </div>
                    {selectedCandidates.size > 0 && (
                      <Badge variant="outline">
                        {selectedCandidates.size} selected
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="grid gap-4">
              {filteredCandidates.map((candidate) => {
              const isSelected = selectedCandidates.has(candidate.candidate_id);
              const canSelect = candidate.is_active;
              
              return (
                <Card key={candidate.candidate_id} className={isSelected ? 'ring-2 ring-primary' : ''}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3 flex-1">
                        {canSelect && (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleCandidate(candidate.candidate_id)}
                            id={`candidate-${candidate.candidate_id}`}
                          />
                        )}
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">
                            {candidate.first_name} {candidate.last_name}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-4 mt-1">
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {candidate.email}
                            </span>
                            {candidate.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {candidate.phone}
                              </span>
                            )}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!candidate.is_active && (
                          <Badge variant="destructive">Deleted</Badge>
                        )}
                        <Badge variant={candidate.status === 'active' ? 'default' : 'secondary'}>
                          {candidate.status}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Exam</p>
                    <p className="font-medium">{getExamName(candidate.exam_id)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Subcategory</p>
                    <p className="font-medium">{getSubcategoryName(candidate.subcategory_id)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Resume</p>
                      {candidate.resume_url ? (
                      <div className="flex items-center gap-3">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="link" className="p-0 h-auto text-primary">
                            View Resume
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Resume Analysis</DialogTitle>
                              <DialogDescription>
                                {candidate.resume_analysis_json?.candidateName || `${candidate.first_name} ${candidate.last_name}`}
                                {candidate.resume_analysis_json?.analyzedAt && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    (Analyzed: {new Date(candidate.resume_analysis_json.analyzedAt).toLocaleString()})
                                  </span>
                                )}
                              </DialogDescription>
                            </DialogHeader>
                            {candidate.resume_analysis_json ? (
                              <div className="space-y-6">
                                {/* ATS Score */}
                                {candidate.resume_analysis_json.atsScore !== undefined && (
                                  <div className="border-b pb-4">
                                    <p className="text-sm text-muted-foreground mb-2">ATS Score</p>
                                    <p className="text-3xl font-bold">{candidate.resume_analysis_json.atsScore}/100</p>
                                  </div>
                                )}

                                {/* Section Ratings */}
                                {candidate.resume_analysis_json.sectionRatings && (
                                  <div className="border-b pb-4">
                                    <p className="text-sm font-semibold mb-2">Section Ratings</p>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                      {Object.entries(candidate.resume_analysis_json.sectionRatings).map(([section, rating]) => (
                                        <div key={section}>
                                          <p className="text-xs text-muted-foreground capitalize">{section}</p>
                                          <p className="text-lg font-semibold">{rating}/5</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Comprehensive Summary */}
                                {candidate.resume_analysis_json.comprehensiveSummary && (
                                  <div className="border-b pb-4">
                                    <p className="text-sm font-semibold mb-2">Comprehensive Summary</p>
                                    <p className="text-sm whitespace-pre-wrap">
                                      {candidate.resume_analysis_json.comprehensiveSummary}
                                    </p>
                                  </div>
                                )}

                                {/* Skills */}
                                {candidate.resume_analysis_json.skills && candidate.resume_analysis_json.skills.length > 0 && (
                                  <div className="border-b pb-4">
                                    <p className="text-sm font-semibold mb-2">All Skills ({candidate.resume_analysis_json.skills.length})</p>
                                    <div className="flex flex-wrap gap-2 mt-1">
                                      {candidate.resume_analysis_json.skills.map((s: string, idx: number) => (
                                        <Badge key={idx} variant="secondary">{s}</Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Structured Data - Work Experience */}
                                {candidate.resume_analysis_json.structuredData?.workExperience && 
                                 candidate.resume_analysis_json.structuredData.workExperience.length > 0 && (
                                  <div className="border-b pb-4">
                                    <p className="text-sm font-semibold mb-2">Work Experience</p>
                                    <div className="space-y-3">
                                      {candidate.resume_analysis_json.structuredData.workExperience.map((exp: any, idx: number) => (
                                        <div key={idx} className="bg-muted/50 p-3 rounded">
                                          <p className="font-semibold">{exp.role} at {exp.company}</p>
                                          <p className="text-xs text-muted-foreground">{exp.duration}</p>
                                          {exp.highlights && exp.highlights.length > 0 && (
                                            <ul className="list-disc list-inside mt-2 text-sm space-y-1">
                                              {exp.highlights.map((h: string, hi: number) => (
                                                <li key={hi}>{h}</li>
                                              ))}
                                            </ul>
                                          )}
                                          {exp.description && (
                                            <p className="text-sm mt-2">{exp.description}</p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Structured Data - Education */}
                                {candidate.resume_analysis_json.structuredData?.education && 
                                 candidate.resume_analysis_json.structuredData.education.length > 0 && (
                                  <div className="border-b pb-4">
                                    <p className="text-sm font-semibold mb-2">Education</p>
                                    <div className="space-y-2">
                                      {candidate.resume_analysis_json.structuredData.education.map((edu: any, idx: number) => (
                                        <div key={idx} className="bg-muted/50 p-3 rounded">
                                          <p className="font-semibold">{edu.degree}</p>
                                          <p className="text-sm">{edu.institution}</p>
                                          {(edu.year || edu.field) && (
                                            <p className="text-xs text-muted-foreground">
                                              {edu.field && `${edu.field}`}
                                              {edu.field && edu.year && ' • '}
                                              {edu.year && `${edu.year}`}
                                            </p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Certifications */}
                                {candidate.resume_analysis_json.structuredData?.certifications && 
                                 candidate.resume_analysis_json.structuredData.certifications.length > 0 && (
                                  <div className="border-b pb-4">
                                    <p className="text-sm font-semibold mb-2">Certifications</p>
                                    <ul className="list-disc list-inside space-y-1">
                                      {candidate.resume_analysis_json.structuredData.certifications.map((cert: string, idx: number) => (
                                        <li key={idx}>{cert}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {/* Experience Summary */}
                                {candidate.resume_analysis_json.experienceSummary && (
                                  <div className="border-b pb-4">
                                    <p className="text-sm font-semibold mb-2">Experience Summary</p>
                                    <p className="text-sm whitespace-pre-wrap">
                                      {candidate.resume_analysis_json.experienceSummary}
                                    </p>
                                  </div>
                                )}

                                {/* Strengths */}
                                {candidate.resume_analysis_json.strengths && candidate.resume_analysis_json.strengths.length > 0 && (
                                  <div className="border-b pb-4">
                                    <p className="text-sm font-semibold mb-2">Strengths</p>
                                    <ul className="list-disc list-inside space-y-1">
                                      {candidate.resume_analysis_json.strengths.map((t: string, idx: number) => (
                                        <li key={idx}>{t}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {/* Areas for Improvement */}
                                {candidate.resume_analysis_json.areasForImprovement && candidate.resume_analysis_json.areasForImprovement.length > 0 && (
                                  <div className="border-b pb-4">
                                    <p className="text-sm font-semibold mb-2">Areas for Improvement</p>
                                    <ul className="list-disc list-inside space-y-1">
                                      {candidate.resume_analysis_json.areasForImprovement.map((t: string, idx: number) => (
                                        <li key={idx}>{t}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {/* Feedback */}
                                {candidate.resume_analysis_json.feedback && (
                                  <div className="border-b pb-4 space-y-3">
                                    <p className="text-sm font-semibold">Detailed Feedback</p>
                                    {candidate.resume_analysis_json.feedback.grammar && candidate.resume_analysis_json.feedback.grammar.length > 0 && (
                                      <div>
                                        <p className="text-xs font-medium mb-1">Grammar & Style</p>
                                        <ul className="list-disc list-inside space-y-1 text-sm">
                                          {candidate.resume_analysis_json.feedback.grammar.map((f: string, idx: number) => (
                                            <li key={idx}>{f}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {candidate.resume_analysis_json.feedback.ats && candidate.resume_analysis_json.feedback.ats.length > 0 && (
                                      <div>
                                        <p className="text-xs font-medium mb-1">ATS Optimization</p>
                                        <ul className="list-disc list-inside space-y-1 text-sm">
                                          {candidate.resume_analysis_json.feedback.ats.map((f: string, idx: number) => (
                                            <li key={idx}>{f}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {candidate.resume_analysis_json.feedback.content && candidate.resume_analysis_json.feedback.content.length > 0 && (
                                      <div>
                                        <p className="text-xs font-medium mb-1">Content Improvements</p>
                                        <ul className="list-disc list-inside space-y-1 text-sm">
                                          {candidate.resume_analysis_json.feedback.content.map((f: string, idx: number) => (
                                            <li key={idx}>{f}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {candidate.resume_analysis_json.feedback.formatting && candidate.resume_analysis_json.feedback.formatting.length > 0 && (
                                      <div>
                                        <p className="text-xs font-medium mb-1">Formatting & Structure</p>
                                        <ul className="list-disc list-inside space-y-1 text-sm">
                                          {candidate.resume_analysis_json.feedback.formatting.map((f: string, idx: number) => (
                                            <li key={idx}>{f}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">No AI analysis found for this resume.</p>
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                          {candidate.resume_analysis_json && (
                          <span className="text-xs text-muted-foreground">
                              (ATS: {candidate.resume_analysis_json.atsScore}/100)
                            </span>
                          )}
                      </div>
                      ) : (
                      <p className="font-medium">Not provided</p>
                      )}
                    {candidate.resume_analysis_json && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {candidate.resume_analysis_json.skills?.length || 0} skills detected
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground">Created</p>
                    <p className="font-medium">
                      {new Date(candidate.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  {!candidate.is_active ? (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleRestore(candidate.candidate_id)}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Restore
                    </Button>
                  ) : (
                    <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(candidate)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Candidate</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete {candidate.first_name} {candidate.last_name}? 
                              This will soft-delete the candidate (you can restore them later).
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(candidate.candidate_id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
            );
            })}
          </div>
        </div>
        );
      })()}
    </div>
  );
}

