import { NextApiRequest, NextApiResponse } from 'next';
import { db, COLLECTIONS, Question } from '@/lib/firebase-admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const { examId, subcategoryId, page = '1', limit = '50' } = req.query;
      
      let query = db.collection(COLLECTIONS.QUESTIONS)
        .where('isActive', '==', true);
      
      if (examId) {
        query = query.where('examId', '==', examId);
      }
      
      if (subcategoryId) {
        query = query.where('subcategoryId', '==', subcategoryId);
      }
      
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const offset = (pageNum - 1) * limitNum;
      
      const snapshot = await query
        .orderBy('createdAt', 'desc')
        .offset(offset)
        .limit(limitNum)
        .get();
      
      const questions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Get total count for pagination
      const totalSnapshot = await query.get();
      const total = totalSnapshot.size;
      
      res.status(200).json({ 
        success: true, 
        data: questions,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      console.error('Error fetching questions:', error);
      // If collection doesn't exist, return empty array
      if (error.code === 5) { // NOT_FOUND
        res.status(200).json({ 
          success: true, 
          data: [],
          pagination: {
            page: 1,
            limit: 50,
            total: 0,
            pages: 0
          }
        });
      } else {
        res.status(500).json({ success: false, error: 'Failed to fetch questions' });
      }
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
      
      const questionData: Omit<Question, 'id'> = {
        examId,
        subcategoryId,
        category,
        subcategory,
        subsection,
        question,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      };
      
      const docRef = await db.collection(COLLECTIONS.QUESTIONS).add(questionData);
      
      res.status(201).json({ 
        success: true, 
        data: { id: docRef.id, ...questionData } 
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
      
      await db.collection(COLLECTIONS.QUESTIONS).doc(id).update({
        category,
        subcategory,
        subsection,
        question,
        updatedAt: new Date()
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
      
      await db.collection(COLLECTIONS.QUESTIONS).doc(id as string).update({
        isActive: false,
        updatedAt: new Date()
      });
      
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
      
      const batch = db.batch();
      const results = [];
      
      for (const questionData of questions) {
        const { examId, subcategoryId, category, subcategory, subsection, question } = questionData;
        
        if (!examId || !subcategoryId || !category || !subcategory || !subsection || !question) {
          continue; // Skip invalid questions
        }
        
        const docRef = db.collection(COLLECTIONS.QUESTIONS).doc();
        const questionDoc: Omit<Question, 'id'> = {
          examId,
          subcategoryId,
          category,
          subcategory,
          subsection,
          question,
          createdAt: new Date(),
          updatedAt: new Date(),
          isActive: true
        };
        
        batch.set(docRef, questionDoc);
        results.push({ id: docRef.id, ...questionDoc });
      }
      
      await batch.commit();
      
      res.status(201).json({ 
        success: true, 
        data: results,
        message: `${results.length} questions uploaded successfully`
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
