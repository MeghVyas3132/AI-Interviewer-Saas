'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Settings, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Exam {
  id: number | string;
  name: string;
  description: string;
}

interface Subcategory {
  id: number | string;
  exam_id: number;
  examId?: string;
  name: string;
  description: string;
}

interface ExamConfig {
  id: number | string;
  exam_id?: number;
  examId?: string;
  subcategory_id?: number;
  subcategoryId?: string;
  num_questions?: number;
  numQuestions?: number;
  randomize_questions?: boolean;
  randomizeQuestions?: boolean;
  is_active?: boolean;
  isActive?: boolean;
}

interface ExamConfigManagerProps {
  onUpdate?: () => void;
}

export function ExamConfigManager({ onUpdate }: ExamConfigManagerProps) {
  const [configs, setConfigs] = useState<ExamConfig[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ExamConfig | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string>('');
  const [numQuestions, setNumQuestions] = useState<number>(8);
  const [randomizeQuestions, setRandomizeQuestions] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [configsRes, examsRes, subcategoriesRes] = await Promise.all([
        fetch('/api/admin/exam-configs-postgres'),
        fetch('/api/admin/exams-postgres'),
        fetch('/api/admin/subcategories-postgres')
      ]);

      const [configsData, examsData, subcategoriesData] = await Promise.all([
        configsRes.json(),
        examsRes.json(),
        subcategoriesRes.json()
      ]);

      setConfigs(configsData.data || []);
      setExams(examsData.data || []);
      setSubcategories(subcategoriesData.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (config?: ExamConfig) => {
    if (config) {
      setEditingConfig(config);
      setSelectedExamId(String(config.exam_id || config.examId || ''));
      setSelectedSubcategoryId(String(config.subcategory_id || config.subcategoryId || ''));
      setNumQuestions(config.num_questions || config.numQuestions || 8);
      setRandomizeQuestions(config.randomize_questions ?? config.randomizeQuestions ?? false);
    } else {
      setEditingConfig(null);
      setSelectedExamId('');
      setSelectedSubcategoryId('');
      setNumQuestions(8);
      setRandomizeQuestions(false);
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingConfig(null);
    setSelectedExamId('');
    setSelectedSubcategoryId('');
    setNumQuestions(8);
    setRandomizeQuestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedExamId || !selectedSubcategoryId || numQuestions <= 0) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive'
      });
      return;
    }

    try {
      const payload = {
        exam_id: Number(selectedExamId),
        subcategory_id: Number(selectedSubcategoryId),
        num_questions: numQuestions,
        randomize_questions: randomizeQuestions,
        is_active: true
      };

      let response;
      if (editingConfig) {
        response = await fetch('/api/admin/exam-configs-postgres', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingConfig.id, ...payload })
        });
      } else {
        response = await fetch('/api/admin/exam-configs-postgres', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Success',
          description: editingConfig ? 'Configuration updated successfully' : 'Configuration created successfully'
        });
        handleCloseDialog();
        fetchData();
        onUpdate?.();
      } else {
        throw new Error(data.error || 'Operation failed');
      }
    } catch (error: any) {
      console.error('Error saving config:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save configuration',
        variant: 'destructive'
      });
    }
  };

  const handleDelete = async (id: number | string) => {
    if (!confirm('Are you sure you want to delete this configuration?')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/exam-configs-postgres?id=${id}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Success',
          description: 'Configuration deleted successfully'
        });
        fetchData();
        onUpdate?.();
      } else {
        throw new Error(data.error || 'Delete failed');
      }
    } catch (error: any) {
      console.error('Error deleting config:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete configuration',
        variant: 'destructive'
      });
    }
  };

  const getExamName = (examId: number | string) => {
    const exam = exams.find(e => e.id == examId);
    return exam?.name || 'Unknown';
  };

  const getSubcategoryName = (subcategoryId: number | string) => {
    const subcategory = subcategories.find(s => s.id == subcategoryId);
    return subcategory?.name || 'Unknown';
  };

  const filteredSubcategories = selectedExamId
    ? subcategories.filter(s => String(s.exam_id || s.examId) === selectedExamId)
    : [];

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Settings className="h-5 w-5" />
              <span>Exam Configurations</span>
            </CardTitle>
            <CardDescription>
              Configure the number of questions for each exam-subcategory combination
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()} className="flex items-center space-x-2">
                <Plus className="h-4 w-4" />
                <span>New Configuration</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingConfig ? 'Edit Configuration' : 'Create Configuration'}
                </DialogTitle>
                <DialogDescription>
                  Configure how many questions to ask for a specific exam and subcategory.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="exam">Exam *</Label>
                  <Select
                    value={selectedExamId}
                    onValueChange={setSelectedExamId}
                    disabled={!!editingConfig}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an exam" />
                    </SelectTrigger>
                    <SelectContent>
                      {exams.map(exam => (
                        <SelectItem key={exam.id} value={String(exam.id)}>
                          {exam.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subcategory">Subcategory *</Label>
                  <Select
                    value={selectedSubcategoryId}
                    onValueChange={setSelectedSubcategoryId}
                    disabled={!selectedExamId || !!editingConfig}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a subcategory" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredSubcategories.map(subcategory => (
                        <SelectItem key={subcategory.id} value={String(subcategory.id)}>
                          {subcategory.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="numQuestions">Number of Questions *</Label>
                  <Input
                    id="numQuestions"
                    type="number"
                    min="1"
                    max="100"
                    value={numQuestions}
                    onChange={(e) => setNumQuestions(Number(e.target.value))}
                    placeholder="e.g., 10"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="randomize"
                    checked={randomizeQuestions}
                    onCheckedChange={setRandomizeQuestions}
                  />
                  <Label htmlFor="randomize" className="cursor-pointer">
                    Randomize question order
                  </Label>
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={handleCloseDialog}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingConfig ? 'Update' : 'Create'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {configs.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No configurations found. Create one to get started.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam</TableHead>
                  <TableHead>Subcategory</TableHead>
                  <TableHead>Questions</TableHead>
                  <TableHead>Randomize</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell className="font-medium">
                      {getExamName(config.exam_id || config.examId || '')}
                    </TableCell>
                    <TableCell>
                      {getSubcategoryName(config.subcategory_id || config.subcategoryId || '')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {config.num_questions || config.numQuestions || 0} questions
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(config.randomize_questions ?? config.randomizeQuestions) ? (
                        <Badge variant="outline">Yes</Badge>
                      ) : (
                        <Badge variant="outline">No</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(config)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(config.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

