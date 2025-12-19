'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, BookOpen } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Exam {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export function ExamManager({ onUpdate }: { onUpdate: () => void }) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const { toast } = useToast();

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/exams-postgres');
      const data = await response.json();
      if (data.success) {
        setExams(data.data);
      }
    } catch (error) {
      console.error('Error fetching exams:', error);
      // Block error toast - log to console only
      // toast({
      //   title: 'Error',
      //   description: 'Failed to fetch exams',
      //   variant: 'destructive',
      // });
      console.error('Error: Failed to fetch exams');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingExam ? '/api/admin/exams-postgres' : '/api/admin/exams-postgres';
      const method = editingExam ? 'PUT' : 'POST';
      const body = editingExam 
        ? { id: editingExam.id, ...formData }
        : formData;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Success',
          description: editingExam ? 'Exam updated successfully' : 'Exam created successfully',
        });
        setIsDialogOpen(false);
        setEditingExam(null);
        setFormData({ name: '', description: '' });
        fetchExams();
        onUpdate();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error saving exam:', error);
      // Block error toast - log to console only
      // toast({
      //   title: 'Error',
      //   description: 'Failed to save exam',
      //   variant: 'destructive',
      // });
      console.error('Error: Failed to save exam');
    }
  };

  const handleEdit = (exam: Exam) => {
    setEditingExam(exam);
    setFormData({ name: exam.name, description: exam.description });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/admin/exams-postgres?id=${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Success',
          description: 'Exam deleted successfully',
        });
        fetchExams();
        onUpdate();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error deleting exam:', error);
      // Block error toast - log to console only
      // toast({
      //   title: 'Error',
      //   description: 'Failed to delete exam',
      //   variant: 'destructive',
      // });
      console.error('Error: Failed to delete exam');
    }
  };

  const resetForm = () => {
    setEditingExam(null);
    setFormData({ name: '', description: '' });
    setIsDialogOpen(false);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Exams</h2>
          <div className="h-10 w-24 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Exams</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Add Exam
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingExam ? 'Edit Exam' : 'Add New Exam'}
              </DialogTitle>
              <DialogDescription>
                {editingExam ? 'Update the exam details below.' : 'Create a new exam by filling in the details below.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Exam Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., JEE Main, NEET, CAT"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the exam"
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingExam ? 'Update' : 'Create'} Exam
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {exams.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <BookOpen className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No exams found</h3>
              <p className="text-gray-500 text-center mb-4">
                Get started by creating your first exam.
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Exam
              </Button>
            </CardContent>
          </Card>
        ) : (
          exams.map((exam) => (
            <Card key={exam.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{exam.name}</CardTitle>
                    <CardDescription>{exam.description}</CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary">Active</Badge>
                    <div className="flex space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(exam)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently delete the exam
                              and remove it from our servers.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(exam.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-500">
                  Created: {new Date(exam.created_at).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
