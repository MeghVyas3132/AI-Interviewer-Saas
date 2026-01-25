'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Exam {
  id: number;
  name: string;
  description: string;
}

interface Subcategory {
  id: number;
  exam_id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export function SubcategoryManager({ onUpdate }: { onUpdate: () => void }) {
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSubcategory, setEditingSubcategory] = useState<Subcategory | null>(null);
  const [formData, setFormData] = useState({ exam_id: '', name: '', description: '' });
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [subcategoriesRes, examsRes] = await Promise.all([
        fetch('/api/admin/subcategories-postgres'),
        fetch('/api/admin/exams-postgres')
      ]);

      const [subcategoriesData, examsData] = await Promise.all([
        subcategoriesRes.json(),
        examsRes.json()
      ]);

      if (subcategoriesData.success) {
        setSubcategories(subcategoriesData.data);
      }
      if (examsData.success) {
        setExams(examsData.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      // Block error toast - log to console only
      // toast({
      //   title: 'Error',
      //   description: 'Failed to fetch data',
      //   variant: 'destructive',
      // });
      console.error('Error: Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form data
    if (!formData.exam_id || !formData.name || !formData.description) {
      // Block error toast - log to console only
      // toast({
      //   title: 'Error',
      //   description: 'Please fill in all fields',
      //   variant: 'destructive',
      // });
      console.error('Error: Please fill in all fields');
      return;
    }

    try {
      const url = editingSubcategory ? '/api/admin/subcategories-postgres' : '/api/admin/subcategories-postgres';
      const method = editingSubcategory ? 'PUT' : 'POST';
      const body = editingSubcategory 
        ? { id: editingSubcategory.id, examId: parseInt(formData.exam_id), name: formData.name, description: formData.description }
        : { examId: parseInt(formData.exam_id), name: formData.name, description: formData.description };

      console.log('Submitting subcategory:', { method, body });

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('HTTP error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Subcategory response:', data);
      
      if (data.success) {
        toast({
          title: 'Success',
          description: editingSubcategory ? 'Subcategory updated successfully' : 'Subcategory created successfully',
        });
        
        // Reset form and close dialog
        setIsDialogOpen(false);
        setEditingSubcategory(null);
        setFormData({ exam_id: '', name: '', description: '' });
        
        // Refresh data
        try {
          await fetchData();
          onUpdate();
        } catch (fetchError) {
          console.error('Error refreshing data after save:', fetchError);
          // Don't show error toast for refresh failure, data was saved successfully
        }
      } else {
        throw new Error(data.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error saving subcategory:', error);
      // Block error toast - log to console only
      // toast({
      //   title: 'Error',
      //   description: error instanceof Error ? error.message : 'Failed to save subcategory',
      //   variant: 'destructive',
      // });
      console.error('Error:', error instanceof Error ? error.message : 'Failed to save subcategory');
    }
  };

  const handleEdit = (subcategory: Subcategory) => {
    setEditingSubcategory(subcategory);
    setFormData({ 
      exam_id: subcategory.exam_id.toString(), 
      name: subcategory.name, 
      description: subcategory.description 
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/admin/subcategories-postgres?id=${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Success',
          description: 'Subcategory deleted successfully',
        });
        fetchData();
        onUpdate();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error deleting subcategory:', error);
      // Block error toast - log to console only
      // toast({
      //   title: 'Error',
      //   description: 'Failed to delete subcategory',
      //   variant: 'destructive',
      // });
      console.error('Error: Failed to delete subcategory');
    }
  };

  const resetForm = () => {
    setEditingSubcategory(null);
    setFormData({ exam_id: '', name: '', description: '' });
    setIsDialogOpen(false);
  };

  const getExamName = (examId: number) => {
    const exam = exams.find(e => e.id === examId);
    return exam ? exam.name : 'Unknown Exam';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Subcategories</h2>
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
        <h2 className="text-2xl font-bold">Subcategories</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} disabled={exams.length === 0}>
              <Plus className="h-4 w-4 mr-2" />
              Add Subcategory
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingSubcategory ? 'Edit Subcategory' : 'Add New Subcategory'}
              </DialogTitle>
              <DialogDescription>
                {editingSubcategory ? 'Update the subcategory details below.' : 'Create a new subcategory by filling in the details below.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="exam_id">Exam</Label>
                <Select
                  value={formData.exam_id}
                  onValueChange={(value) => setFormData({ ...formData, exam_id: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an exam" />
                  </SelectTrigger>
                  <SelectContent>
                    {exams.map((exam) => (
                      <SelectItem key={exam.id} value={exam.id.toString()}>
                        {exam.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Subcategory Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Physics, Chemistry, Mathematics"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the subcategory"
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingSubcategory ? 'Update' : 'Create'} Subcategory
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {exams.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No exams found</h3>
            <p className="text-gray-500 text-center mb-4">
              You need to create an exam first before adding subcategories.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {subcategories.length === 0 && exams.length > 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No subcategories found</h3>
              <p className="text-gray-500 text-center mb-4">
                Get started by creating your first subcategory.
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Subcategory
              </Button>
            </CardContent>
          </Card>
        ) : (
          subcategories.map((subcategory) => (
            <Card key={subcategory.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{subcategory.name}</CardTitle>
                    <CardDescription>{subcategory.description}</CardDescription>
                    <Badge variant="outline">{getExamName(subcategory.exam_id)}</Badge>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary">Active</Badge>
                    <div className="flex space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(subcategory)}
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
                              This action cannot be undone. This will permanently delete the subcategory
                              and remove it from our servers.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(subcategory.id)}>
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
                  Created: {new Date(subcategory.created_at).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
