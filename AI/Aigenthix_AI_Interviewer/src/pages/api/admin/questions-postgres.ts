import { NextApiRequest, NextApiResponse } from 'next';
import { getQuestions, createQuestion, updateQuestion, deleteQuestion, bulkCreateQuestions, getQuestionFilterValues } from '@/lib/postgres-data-store';
import { validateRequest, idSchema, paginationSchema, questionTextSchema, categorySchema } from '@/lib/input-validation';
import { z } from 'zod';

// Validation schemas
const getQuestionsSchema = paginationSchema.extend({
  examId: idSchema.optional(),
  subcategoryId: idSchema.optional(),
  category: categorySchema.optional(),
  subcategory: categorySchema.optional(),
  subsection: categorySchema.optional(),
  action: z.string().optional(),
});

const createQuestionSchema = z.object({
  examId: idSchema,
  subcategoryId: idSchema,
  category: categorySchema,
  subcategory: categorySchema,
  subsection: categorySchema,
  question: questionTextSchema,
});

const updateQuestionSchema = z.object({
  id: idSchema,
  category: categorySchema,
  subcategory: categorySchema,
  subsection: categorySchema,
  question: questionTextSchema,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      // Validate query parameters
      const validation = validateRequest(getQuestionsSchema, req.query);
      if (!validation.success) {
        return res.status(400).json({ 
          success: false, 
          error: `Invalid request parameters: ${validation.error}` 
        });
      }
      
      const { 
        examId, 
        subcategoryId, 
        page, 
        limit,
        category,
        subcategory,
        subsection,
        action
      } = validation.data;
      
      // Handle filter values request
      if (action === 'filter-values') {
        const filterValues = await getQuestionFilterValues();
        return res.status(200).json({ 
          success: true, 
          data: filterValues
        });
      }
      
      const result = await getQuestions(
        examId,
        subcategoryId,
        page,
        limit,
        category,
        subcategory,
        subsection
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
      // Validate request body
      const validation = validateRequest(createQuestionSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          success: false, 
          error: `Invalid request data: ${validation.error}` 
        });
      }
      
      const { examId, subcategoryId, category, subcategory, subsection, question } = validation.data;
      
      const questionData = await createQuestion({
        exam_id: examId,
        subcategory_id: subcategoryId,
        category,
        subcategory,
        subsection,
        question,
        is_active: true
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
      // Validate request body
      const validation = validateRequest(updateQuestionSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          success: false, 
          error: `Invalid request data: ${validation.error}` 
        });
      }
      
      const { id, category, subcategory, subsection, question } = validation.data;
      
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
      // Validate query parameter
      const validation = validateRequest(z.object({ id: idSchema }), req.query);
      if (!validation.success) {
        return res.status(400).json({ 
          success: false, 
          error: `Invalid request: ${validation.error}` 
        });
      }
      
      await deleteQuestion(validation.data.id);
      
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
      
      const validQuestions = questions.filter(q => {
        if (!q.examId || !q.subcategoryId || !q.category || !q.subcategory || !q.subsection || !q.question) {
          return false;
        }
        
        const examId = parseInt(q.examId);
        const subcategoryId = parseInt(q.subcategoryId);
        
        if (isNaN(examId) || isNaN(subcategoryId)) {
          return false;
        }
        
        return true;
      }).map(q => ({
        exam_id: parseInt(q.examId),
        subcategory_id: parseInt(q.subcategoryId),
        category: q.category,
        subcategory: q.subcategory,
        subsection: q.subsection,
        question: q.question,
        is_active: true
      }));
      
      if (validQuestions.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'No valid questions found after validation' 
        });
      }
      
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
