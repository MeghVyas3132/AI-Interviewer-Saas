import { NextApiRequest, NextApiResponse } from 'next';
import { getQuestions, createQuestion, updateQuestion, deleteQuestion, bulkCreateQuestions } from '@/lib/local-data-store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const { examId, subcategoryId, page = '1', limit = '50' } = req.query;
      
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      
      const result = await getQuestions(
        examId as string, 
        subcategoryId as string, 
        pageNum, 
        limitNum
      );
      
      res.status(200).json({ 
        success: true, 
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Error fetching questions:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch questions' });
    }
  } else if (req.method === 'POST') {
    try {
      const { examId, subcategoryId, category, subcategory, subsection, question } = req.body;
      
      if (!examId || !subcategoryId || !category || !subcategory || !subsection || !question) {
        return res.status(400).json({ 
          success: false, 
          error: 'All fields are required' 
        });
      }
      
      const questionData = await createQuestion({
        examId,
        subcategoryId,
        category,
        subcategory,
        subsection,
        question,
        isActive: true
      });
      
      res.status(201).json({ 
        success: true, 
        data: questionData 
      });
    } catch (error) {
      console.error('Error creating question:', error);
      res.status(500).json({ success: false, error: 'Failed to create question' });
    }
  } else if (req.method === 'PUT') {
    try {
      const { id, category, subcategory, subsection, question } = req.body;
      
      if (!id || !category || !subcategory || !subsection || !question) {
        return res.status(400).json({ 
          success: false, 
          error: 'All fields are required' 
        });
      }
      
      await updateQuestion(id, {
        category,
        subcategory,
        subsection,
        question
      });
      
      res.status(200).json({ success: true, message: 'Question updated successfully' });
    } catch (error) {
      console.error('Error updating question:', error);
      res.status(500).json({ success: false, error: 'Failed to update question' });
    }
  } else if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      
      if (!id) {
        return res.status(400).json({ success: false, error: 'Question ID is required' });
      }
      
      await deleteQuestion(id as string);
      
      res.status(200).json({ success: true, message: 'Question deleted successfully' });
    } catch (error) {
      console.error('Error deleting question:', error);
      res.status(500).json({ success: false, error: 'Failed to delete question' });
    }
  } else if (req.method === 'POST' && req.query.action === 'bulk-upload') {
    try {
      const { questions } = req.body;
      
      if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Questions array is required' 
        });
      }
      
      const validQuestions = questions.filter(q => 
        q.examId && q.subcategoryId && q.category && q.subcategory && q.subsection && q.question
      ).map(q => ({
        examId: q.examId,
        subcategoryId: q.subcategoryId,
        category: q.category,
        subcategory: q.subcategory,
        subsection: q.subsection,
        question: q.question,
        isActive: true
      }));
      
      const createdQuestions = await bulkCreateQuestions(validQuestions);
      
      res.status(201).json({ 
        success: true, 
        data: createdQuestions,
        message: `${createdQuestions.length} questions uploaded successfully`
      });
    } catch (error) {
      console.error('Error bulk uploading questions:', error);
      res.status(500).json({ success: false, error: 'Failed to bulk upload questions' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    res.status(405).json({ success: false, error: 'Method not allowed' });
  }
}
