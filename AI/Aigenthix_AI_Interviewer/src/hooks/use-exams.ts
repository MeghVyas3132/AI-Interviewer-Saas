import { useState, useEffect } from 'react';

export interface Exam {
  id: number;
  name: string;
  description: string;
}

export interface Subcategory {
  id: number;
  name: string;
  description: string;
  exam_id?: number;
}

export function useExams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchExams = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/exams');
        const data = await response.json();
        
        if (data.success) {
          setExams(data.exams);
        } else {
          setError(data.error || 'Failed to fetch exams');
        }
      } catch (err) {
        setError('Failed to fetch exams');
        console.error('Error fetching exams:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchExams();
  }, []);

  return { exams, loading, error };
}

export function useSubcategories(examId?: number) {
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSubcategories = async () => {
      try {
        setLoading(true);
        const url = examId ? `/api/subcategories?exam_id=${examId}` : '/api/subcategories';
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
          setSubcategories(data.subcategories);
        } else {
          setError(data.error || 'Failed to fetch subcategories');
        }
      } catch (err) {
        setError('Failed to fetch subcategories');
        console.error('Error fetching subcategories:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSubcategories();
  }, [examId]);

  return { subcategories, loading, error };
}
