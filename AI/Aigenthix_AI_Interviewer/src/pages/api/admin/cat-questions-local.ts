import { NextApiRequest, NextApiResponse } from 'next';
import { getCATQuestions, createCATQuestion, updateCATQuestion, deleteCATQuestion, bulkCreateCATQuestions } from '@/lib/local-data-store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const { page = '1', limit = '50' } = req.query;
      
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      
      const result = await getCATQuestions(pageNum, limitNum);
      
      res.status(200).json({ 
        success: true, 
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Error fetching CAT questions:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch CAT questions' });
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
        isActive: true
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
      
      await updateCATQuestion(id, {
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
      
      await deleteCATQuestion(id as string);
      
      res.status(200).json({ success: true, message: 'CAT question deleted successfully' });
    } catch (error) {
      console.error('Error deleting CAT question:', error);
      res.status(500).json({ success: false, error: 'Failed to delete CAT question' });
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
        q.category && q.subcategory && q.subsection && q.question
      ).map(q => ({
        category: q.category,
        subcategory: q.subcategory,
        subsection: q.subsection,
        question: q.question,
        isActive: true
      }));
      
      const createdQuestions = await bulkCreateCATQuestions(validQuestions);
      
      res.status(201).json({ 
        success: true, 
        data: createdQuestions,
        message: `${createdQuestions.length} CAT questions uploaded successfully`
      });
    } catch (error) {
      console.error('Error bulk uploading CAT questions:', error);
      res.status(500).json({ success: false, error: 'Failed to bulk upload CAT questions' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    res.status(405).json({ success: false, error: 'Method not allowed' });
  }
}
