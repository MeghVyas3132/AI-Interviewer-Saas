import { NextApiRequest, NextApiResponse } from 'next';
import { db, COLLECTIONS, Subcategory } from '@/lib/firebase-admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const { examId } = req.query;
      
      let query = db.collection(COLLECTIONS.SUBCATEGORIES)
        .where('isActive', '==', true);
      
      if (examId) {
        query = query.where('examId', '==', examId);
      }
      
      const snapshot = await query.orderBy('createdAt', 'desc').get();
      
      const subcategories = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      res.status(200).json({ success: true, data: subcategories });
    } catch (error) {
      console.error('Error fetching subcategories:', error);
      // If collection doesn't exist, return empty array
      if (error.code === 5) { // NOT_FOUND
        res.status(200).json({ success: true, data: [] });
      } else {
        res.status(500).json({ success: false, error: 'Failed to fetch subcategories' });
      }
    }
  } else if (req.method === 'POST') {
    try {
      const { examId, name, description } = req.body;
      
      if (!examId || !name || !description) {
        return res.status(400).json({ success: false, error: 'Exam ID, name and description are required' });
      }
      
      const subcategoryData: Omit<Subcategory, 'id'> = {
        examId,
        name,
        description,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      };
      
      const docRef = await db.collection(COLLECTIONS.SUBCATEGORIES).add(subcategoryData);
      
      res.status(201).json({ 
        success: true, 
        data: { id: docRef.id, ...subcategoryData } 
      });
    } catch (error) {
      console.error('Error creating subcategory:', error);
      res.status(500).json({ success: false, error: 'Failed to create subcategory' });
    }
  } else if (req.method === 'PUT') {
    try {
      const { id, name, description } = req.body;
      
      if (!id || !name || !description) {
        return res.status(400).json({ success: false, error: 'ID, name and description are required' });
      }
      
      await db.collection(COLLECTIONS.SUBCATEGORIES).doc(id).update({
        name,
        description,
        updatedAt: new Date()
      });
      
      res.status(200).json({ success: true, message: 'Subcategory updated successfully' });
    } catch (error) {
      console.error('Error updating subcategory:', error);
      res.status(500).json({ success: false, error: 'Failed to update subcategory' });
    }
  } else if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      
      if (!id) {
        return res.status(400).json({ success: false, error: 'Subcategory ID is required' });
      }
      
      await db.collection(COLLECTIONS.SUBCATEGORIES).doc(id as string).update({
        isActive: false,
        updatedAt: new Date()
      });
      
      res.status(200).json({ success: true, message: 'Subcategory deleted successfully' });
    } catch (error) {
      console.error('Error deleting subcategory:', error);
      res.status(500).json({ success: false, error: 'Failed to delete subcategory' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    res.status(405).json({ success: false, error: 'Method not allowed' });
  }
}
