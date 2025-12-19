import { NextApiRequest, NextApiResponse } from 'next';
import { getCATQuestions, createCATQuestion, updateCATQuestion, deleteCATQuestion, bulkCreateCATQuestions, getCATQuestionFilterValues } from '@/lib/postgres-data-store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const { 
        page = '1', 
        limit = '50',
        examId,
        subcategoryId,
        category,
        subcategory,
        subsection,
        action
      } = req.query;
      
      // Handle filter values request
      if (action === 'filter-values') {
        const filterValues = await getCATQuestionFilterValues();
        return res.status(200).json({ 
          success: true, 
          data: filterValues
        });
      }
      
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      
      // If examId is provided, we need to get the exam name to use as category filter
      let categoryFilter = category as string;
      if (examId && !category) {
        // Get exam name from examId
        const { getExamById } = await import('@/lib/postgres-data-store');
        try {
          const exam = await getExamById(parseInt(examId as string));
          if (exam) {
            categoryFilter = exam.name;
          }
        } catch (error) {
          console.error('Error fetching exam:', error);
        }
      }
      
      // If subcategoryId is provided, we need to get the subcategory name
      let subcategoryFilter = subcategory as string;
      if (subcategoryId && !subcategory) {
        try {
          const { query } = await import('@/lib/postgres');
          const result = await query('SELECT name FROM subcategories WHERE id = $1', [parseInt(subcategoryId as string)]);
          if (result.rows.length > 0) {
            subcategoryFilter = result.rows[0].name;
          }
        } catch (error) {
          console.error('Error fetching subcategory:', error);
        }
      }
      
      const result = await getCATQuestions(
        pageNum, 
        limitNum,
        categoryFilter,
        subcategoryFilter,
        subsection as string
      );
      
      res.status(200).json({ 
        success: true, 
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Error fetching CAT questions:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch CAT questions' });
    }
  } else if (req.method === 'POST' && req.query.action === 'bulk-upload') {
    try {
      const { questions } = req.body;
      
      console.log('=== BULK UPLOAD DEBUG ===');
      console.log('API received questions:', questions);
      console.log('Questions length:', questions?.length);
      console.log('Request body:', req.body);
      console.log('Request query:', req.query);
      
      if (!Array.isArray(questions) || questions.length === 0) {
        console.log('Validation failed: Questions array is required');
        return res.status(400).json({ 
          success: false, 
          error: 'Questions array is required' 
        });
      }
      
      // Check each question individually for debugging
      const validationErrors = [];
      questions.forEach((q, index) => {
        console.log(`Question ${index + 1}:`, q);
        if (!q.category) validationErrors.push(`Question ${index + 1}: category is missing`);
        if (!q.subcategory) validationErrors.push(`Question ${index + 1}: subcategory is missing`);
        if (!q.subsection) validationErrors.push(`Question ${index + 1}: subsection is missing`);
        if (!q.question) validationErrors.push(`Question ${index + 1}: question is missing`);
      });
      
      console.log('Validation errors:', validationErrors);
      
      if (validationErrors.length > 0) {
        console.log('Validation failed with errors:', validationErrors);
        return res.status(400).json({ 
          success: false, 
          error: `Validation failed: ${validationErrors.join(', ')}` 
        });
      }
      
      const validQuestions = questions.map(q => ({
        category: q.category,
        subcategory: q.subcategory,
        subsection: q.subsection,
        question: q.question,
        is_active: true
      }));
      
      console.log('Valid questions after filtering:', validQuestions);
      console.log('Valid questions count:', validQuestions.length);
      
      const createdQuestions = await bulkCreateCATQuestions(validQuestions);
      
      res.status(201).json({ 
        success: true, 
        data: createdQuestions,
        count: createdQuestions.length
      });
    } catch (error) {
      console.error('Error bulk uploading CAT questions:', error);
      res.status(500).json({ success: false, error: 'Failed to bulk upload CAT questions' });
    }
  } else if (req.method === 'POST') {
    try {
      const { category, subcategory, subsection, question } = req.body;
      
      if (!category || !subcategory || !subsection || !question) {
        return res.status(400).json({ 
          success: false, 
          error: 'All fields are required' 
        });
      }
      
      const questionData = await createCATQuestion({
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
      console.error('Error creating CAT question:', error);
      res.status(500).json({ success: false, error: 'Failed to create CAT question' });
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
      
      await updateCATQuestion(parseInt(id), {
        category,
        subcategory,
        subsection,
        question
      });
      
      res.status(200).json({ success: true, message: 'CAT question updated successfully' });
    } catch (error) {
      console.error('Error updating CAT question:', error);
      res.status(500).json({ success: false, error: 'Failed to update CAT question' });
    }
  } else if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      
      if (!id) {
        return res.status(400).json({ success: false, error: 'Question ID is required' });
      }
      
      await deleteCATQuestion(parseInt(id as string));
      
      res.status(200).json({ success: true, message: 'CAT question deleted successfully' });
    } catch (error) {
      console.error('Error deleting CAT question:', error);
      res.status(500).json({ success: false, error: 'Failed to delete CAT question' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    res.status(405).json({ success: false, error: 'Method not allowed' });
  }
}
