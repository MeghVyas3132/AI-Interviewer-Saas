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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Edit, Trash2, Database, Upload, Download, Filter, X } from 'lucide-react';
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
}

interface Question {
  id: number;
  exam_id: number;
  subcategory_id: number;
  category: string;
  subcategory: string;
  subsection: string;
  question: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export function QuestionManager({ onUpdate }: { onUpdate: () => void }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [formData, setFormData] = useState({ 
    exam_id: '', 
    subcategory_id: '', 
    category: '', 
    subcategory: '', 
    subsection: '', 
    question: '' 
  });
  const [bulkUploadData, setBulkUploadData] = useState('');
  const [bulkQuestions, setBulkQuestions] = useState<Array<{id: string, text: string}>>([{id: '1', text: ''}]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Filter states
  const [filters, setFilters] = useState({
    examId: '',
    subcategoryId: ''
  });
  const [filterValues, setFilterValues] = useState({
    categories: [] as string[],
    subcategories: [] as string[],
    subsections: [] as string[]
  });
  const [showFilters, setShowFilters] = useState(false);
  
  // Dynamic filtering states
  const [filteredSubcategories, setFilteredSubcategories] = useState<Subcategory[]>([]);
  const [selectedFilterExamId, setSelectedFilterExamId] = useState<string>('');
  
  const { toast } = useToast();

  // Helper functions for bulk questions management
  const addBulkQuestion = () => {
    const newId = (bulkQuestions.length + 1).toString();
    setBulkQuestions([...bulkQuestions, {id: newId, text: ''}]);
  };

  const removeBulkQuestion = (id: string) => {
    if (bulkQuestions.length > 1) {
      setBulkQuestions(bulkQuestions.filter(q => q.id !== id));
    }
  };

  const updateBulkQuestion = (id: string, text: string) => {
    setBulkQuestions(bulkQuestions.map(q => q.id === id ? {...q, text} : q));
  };

  const getValidBulkQuestions = () => {
    return bulkQuestions.filter(q => q.text.trim() !== '');
  };

  useEffect(() => {
    fetchData();
  }, [currentPage, filters]);

  useEffect(() => {
    fetchFilterValues();
  }, []);

  // Effect to fetch subcategories when exam filter changes
  useEffect(() => {
    const fetchFilteredSubcategories = async () => {
      if (selectedFilterExamId) {
        try {
          const response = await fetch(`/api/subcategories?exam_id=${selectedFilterExamId}`);
          const data = await response.json();
          
          if (data.success) {
            setFilteredSubcategories(data.subcategories);
          } else {
            setFilteredSubcategories([]);
          }
        } catch (error) {
          console.error('Error fetching filtered subcategories:', error);
          setFilteredSubcategories([]);
        }
      } else {
        setFilteredSubcategories([]);
      }
    };

    fetchFilteredSubcategories();
  }, [selectedFilterExamId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Build query parameters
      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10'
      });
      
      // Add filter parameters
      if (filters.examId) queryParams.append('examId', filters.examId);
      if (filters.subcategoryId) queryParams.append('subcategoryId', filters.subcategoryId);
      
      const [questionsRes, examsRes, subcategoriesRes] = await Promise.all([
        fetch(`/api/admin/questions-postgres?${queryParams.toString()}`),
        fetch('/api/admin/exams-postgres'),
        fetch('/api/admin/subcategories-postgres')
      ]);

      const [questionsData, examsData, subcategoriesData] = await Promise.all([
        questionsRes.json(),
        examsRes.json(),
        subcategoriesRes.json()
      ]);

      if (questionsData.success) {
        setQuestions(questionsData.data);
        setTotalPages(questionsData.pagination.pages);
      }
      if (examsData.success) {
        setExams(examsData.data);
      }
      if (subcategoriesData.success) {
        setSubcategories(subcategoriesData.data);
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

  const fetchFilterValues = async () => {
    try {
      const response = await fetch('/api/admin/questions-postgres?action=filter-values');
      const data = await response.json();
      
      if (data.success) {
        setFilterValues(data.data);
      }
    } catch (error) {
      console.error('Error fetching filter values:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingQuestion ? '/api/admin/questions-postgres' : '/api/admin/questions-postgres';
      const method = editingQuestion ? 'PUT' : 'POST';
      const body = editingQuestion 
        ? { id: editingQuestion.id, examId: parseInt(formData.exam_id), subcategoryId: parseInt(formData.subcategory_id), category: formData.category, subcategory: formData.subcategory, subsection: formData.subsection, question: formData.question }
        : { examId: parseInt(formData.exam_id), subcategoryId: parseInt(formData.subcategory_id), category: formData.category, subcategory: formData.subcategory, subsection: formData.subsection, question: formData.question };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Success',
          description: editingQuestion ? 'Question updated successfully' : 'Question created successfully',
        });
        setIsDialogOpen(false);
        setEditingQuestion(null);
        resetForm();
        fetchData();
        onUpdate();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error saving question:', error);
      // Block error toast - log to console only
      // toast({
      //   title: 'Error',
      //   description: 'Failed to save question',
      //   variant: 'destructive',
      // });
      console.error('Error: Failed to save question');
    }
  };

  const handleBulkUpload = async () => {
    try {
      const validQuestions = getValidBulkQuestions();
      if (validQuestions.length === 0) {
        console.error('No valid questions found!');
        return;
      }
      
      // Convert bulk questions to the format expected by the API
      const questions = validQuestions.map(q => {
        const examId = parseInt(formData.exam_id);
        const subcategoryId = parseInt(formData.subcategory_id);
        
        if (isNaN(examId) || isNaN(subcategoryId)) {
          console.error('Invalid exam or subcategory ID:', { examId, subcategoryId, formData });
          return null;
        }
        
        return {
          examId,
          subcategoryId,
          category: formData.category,
          subcategory: formData.subcategory,
          subsection: formData.subsection,
          question: q.text.trim()
        };
      }).filter(q => q !== null);

      if (questions.length === 0) {
        console.error('Error: No valid questions found in the upload data');
        return;
      }

      console.log('Questions to upload:', questions);
      console.log('Form data:', formData);
      console.log('Request URL:', '/api/admin/bulk-upload-test');
      console.log('Request payload:', JSON.stringify({ questions }));

      const response = await fetch('/api/admin/bulk-upload-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions }),
      });
      
      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Success',
          description: data.message,
        });
        setBulkQuestions([{id: '1', text: ''}]);
        fetchData();
        onUpdate();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error bulk uploading questions:', error);
      console.error('Error: Failed to bulk upload questions');
    }
  };

  const handleEdit = (question: Question) => {
    setEditingQuestion(question);
    setFormData({ 
      exam_id: question.exam_id.toString(), 
      subcategory_id: question.subcategory_id.toString(), 
      category: question.category, 
      subcategory: question.subcategory, 
      subsection: question.subsection, 
      question: question.question 
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/admin/questions-postgres?id=${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Success',
          description: 'Question deleted successfully',
        });
        fetchData();
        onUpdate();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error deleting question:', error);
      // Block error toast - log to console only
      // toast({
      //   title: 'Error',
      //   description: 'Failed to delete question',
      //   variant: 'destructive',
      // });
      console.error('Error: Failed to delete question');
    }
  };

  const resetForm = () => {
    setEditingQuestion(null);
    setFormData({ 
      exam_id: '', 
      subcategory_id: '', 
      category: '', 
      subcategory: '', 
      subsection: '', 
      question: '' 
    });
    setBulkQuestions([{id: '1', text: ''}]);
    setIsDialogOpen(false);
  };

  const handleFilterChange = (key: string, value: string) => {
    if (key === 'examId') {
      // When exam changes, reset subcategory filter and update selected exam
      setFilters(prev => ({ 
        ...prev, 
        examId: value === 'all' ? '' : value,
        subcategoryId: '' // Reset subcategory when exam changes
      }));
      setSelectedFilterExamId(value === 'all' ? '' : value);
    } else {
      setFilters(prev => ({ ...prev, [key]: value === 'all' ? '' : value }));
    }
    setCurrentPage(1); // Reset to first page when filters change
  };

  const clearFilters = () => {
    setFilters({
      examId: '',
      subcategoryId: ''
    });
    setSelectedFilterExamId('');
    setFilteredSubcategories([]);
    setCurrentPage(1);
  };

  const hasActiveFilters = Object.values(filters).some(value => value !== '');

  const getExamName = (examId: number) => {
    const exam = exams.find(e => e.id === examId);
    return exam ? exam.name : 'Unknown Exam';
  };

  const getSubcategoryName = (subcategoryId: number) => {
    const subcategory = subcategories.find(s => s.id === subcategoryId);
    return subcategory ? subcategory.name : 'Unknown Subcategory';
  };

  const formFilteredSubcategories = formData.exam_id 
    ? subcategories.filter(s => s.exam_id === parseInt(formData.exam_id))
    : subcategories;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Questions</h2>
          <div className="h-10 w-24 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="grid gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Questions</h2>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className={hasActiveFilters ? 'bg-blue-50 border-blue-200' : ''}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-2">
                {Object.values(filters).filter(v => v !== '').length}
              </Badge>
            )}
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm} disabled={exams.length === 0}>
                <Plus className="h-4 w-4 mr-2" />
                Add Question
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingQuestion ? 'Edit Question' : 'Add New Question'}
              </DialogTitle>
              <DialogDescription>
                {editingQuestion ? 'Update the question details below.' : 'Create a new question by filling in the details below.'}
              </DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="single" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="single">Single Question</TabsTrigger>
                <TabsTrigger value="bulk">Bulk Upload</TabsTrigger>
              </TabsList>
              
              <TabsContent value="single">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="examId">Exam</Label>
                      <Select
                        value={formData.exam_id}
                        onValueChange={(value) => setFormData({ ...formData, exam_id: value, subcategory_id: '' })}
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
                      <Label htmlFor="subcategoryId">Subcategory</Label>
                      <Select
                        value={formData.subcategory_id}
                        onValueChange={(value) => setFormData({ ...formData, subcategory_id: value })}
                        required
                        disabled={!formData.exam_id}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a subcategory" />
                        </SelectTrigger>
                        <SelectContent>
                          {formFilteredSubcategories.map((subcategory) => (
                            <SelectItem key={subcategory.id} value={subcategory.id.toString()}>
                              {subcategory.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="category">Category</Label>
                      <Input
                        id="category"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        placeholder="e.g., Technical"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="subcategory">Subcategory</Label>
                      <Input
                        id="subcategory"
                        value={formData.subcategory}
                        onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                        placeholder="e.g., Programming"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="subsection">Subsection</Label>
                      <Input
                        id="subsection"
                        value={formData.subsection}
                        onChange={(e) => setFormData({ ...formData, subsection: e.target.value })}
                        placeholder="e.g., Data Structures"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="question">Question</Label>
                    <Textarea
                      id="question"
                      value={formData.question}
                      onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                      placeholder="Enter the interview question"
                      required
                      rows={4}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={resetForm}>
                      Cancel
                    </Button>
                    <Button type="submit">
                      {editingQuestion ? 'Update' : 'Create'} Question
                    </Button>
                  </DialogFooter>
                </form>
              </TabsContent>
              
              <TabsContent value="bulk">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bulkExamId">Exam</Label>
                      <Select
                        value={formData.exam_id}
                        onValueChange={(value) => setFormData({ ...formData, exam_id: value, subcategory_id: '' })}
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
                      <Label htmlFor="bulkSubcategoryId">Subcategory</Label>
                      <Select
                        value={formData.subcategory_id}
                        onValueChange={(value) => setFormData({ ...formData, subcategory_id: value })}
                        required
                        disabled={!formData.exam_id}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a subcategory" />
                        </SelectTrigger>
                        <SelectContent>
                          {formFilteredSubcategories.map((subcategory) => (
                            <SelectItem key={subcategory.id} value={subcategory.id.toString()}>
                              {subcategory.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bulkCategory">Category</Label>
                      <Input
                        id="bulkCategory"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        placeholder="e.g., Technical"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bulkSubcategory">Subcategory</Label>
                      <Input
                        id="bulkSubcategory"
                        value={formData.subcategory}
                        onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                        placeholder="e.g., Programming"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bulkSubsection">Subsection</Label>
                      <Input
                        id="bulkSubsection"
                        value={formData.subsection}
                        onChange={(e) => setFormData({ ...formData, subsection: e.target.value })}
                        placeholder="e.g., Data Structures"
                        required
                      />
                    </div>
                  </div>
                  
                  {/* Individual Question Inputs */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Questions</Label>
                    </div>
                    
                    {bulkQuestions.map((question, index) => (
                      <div key={question.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={`question-${question.id}`}>
                            Enter Question {index + 1}
                          </Label>
                          {bulkQuestions.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeBulkQuestion(question.id)}
                              className="text-red-500 hover:text-red-700"
                            >
                              🗑️ Remove
                            </Button>
                          )}
                        </div>
                        <Textarea
                          id={`question-${question.id}`}
                          value={question.text}
                          onChange={(e) => updateBulkQuestion(question.id, e.target.value)}
                          placeholder={`Enter question ${index + 1}...`}
                          rows={3}
                        />
                      </div>
                    ))}
                    
                    {/* Add Question Button positioned below the question boxes */}
                    <div className="flex justify-center pt-2">
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={addBulkQuestion}
                        className="flex items-center gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        Add Question
                      </Button>
                    </div>
                  </div>

                  {/* Preview Section */}
                  {getValidBulkQuestions().length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">Preview ({getValidBulkQuestions().length} questions)</Label>
                      <div className="border rounded-lg p-4 bg-gray-50 max-h-60 overflow-y-auto">
                        {getValidBulkQuestions().map((question, index) => (
                          <div key={question.id} className="mb-3 last:mb-0">
                            <div className="text-sm font-medium text-gray-700 mb-1">
                              Question {index + 1}:
                            </div>
                            <div className="text-sm text-gray-600 bg-white p-2 rounded border">
                              {question.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={resetForm}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleBulkUpload} 
                      disabled={!formData.exam_id || !formData.subcategory_id || !formData.category || !formData.subcategory || !formData.subsection || getValidBulkQuestions().length === 0}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Submit All Questions
                    </Button>
                  </DialogFooter>
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Filter Questions</CardTitle>
              <div className="flex items-center space-x-2">
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-1" />
                    Clear All
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowFilters(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Exam Filter */}
              <div className="space-y-2">
                <Label htmlFor="filter-exam">Exam</Label>
                <Select
                  value={filters.examId}
                  onValueChange={(value) => handleFilterChange('examId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Exams" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Exams</SelectItem>
                    {exams.map((exam) => (
                      <SelectItem key={exam.id} value={exam.id.toString()}>
                        {exam.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Subcategory Filter */}
              <div className="space-y-2">
                <Label htmlFor="filter-subcategory">Subcategory</Label>
                <Select
                  value={filters.subcategoryId}
                  onValueChange={(value) => handleFilterChange('subcategoryId', value)}
                  disabled={!selectedFilterExamId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={selectedFilterExamId ? "All Subcategories" : "Select an exam first"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Subcategories</SelectItem>
                    {filteredSubcategories.map((subcategory) => (
                      <SelectItem key={subcategory.id} value={subcategory.id.toString()}>
                        {subcategory.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {questions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Database className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No questions found</h3>
              <p className="text-gray-500 text-center mb-4">
                Get started by creating your first question.
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Question
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {questions.map((question) => (
              <Card key={question.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-lg">{question.question}</CardTitle>
                        <Badge variant="outline" className="text-xs font-mono bg-blue-50 text-blue-700 border-blue-200">
                          ID: {question.id}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge variant="outline">{getExamName(question.exam_id)}</Badge>
                        <Badge variant="outline">{getSubcategoryName(question.subcategory_id)}</Badge>
                        <Badge variant="secondary">{question.category}</Badge>
                        <Badge variant="secondary">{question.subcategory}</Badge>
                        <Badge variant="secondary">{question.subsection}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="secondary">Active</Badge>
                      <div className="flex space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(question)}
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
                                This action cannot be undone. This will permanently delete the question
                                and remove it from our servers.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(question.id)}>
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
                    Created: {new Date(question.created_at).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center space-x-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="flex items-center px-4">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
