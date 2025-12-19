import { NextApiRequest, NextApiResponse } from 'next';
import { db, COLLECTIONS, Exam } from '@/lib/firebase-admin';
import { getExams, createExam, updateExam, deleteExam } from '@/lib/local-data-store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const snapshot = await db.collection(COLLECTIONS.EXAMS)
        .where('isActive', '==', true)
        .orderBy('createdAt', 'desc')
        .get();
      
      const exams = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      res.status(200).json({ success: true, data: exams });
    } catch (error) {
      console.error('Error fetching exams from Firebase, falling back to local store:', error);
      try {
        const exams = await getExams();
        res.status(200).json({ success: true, data: exams });
      } catch (localError) {
        console.error('Error fetching exams from local store:', localError);
        res.status(500).json({ success: false, error: 'Failed to fetch exams' });
      }
    }
  } else if (req.method === 'POST') {
    try {
      const { name, description } = req.body;
      
      if (!name || !description) {
        return res.status(400).json({ success: false, error: 'Name and description are required' });
      }
      
      const examData: Omit<Exam, 'id'> = {
        name,
        description,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      };
      
      const docRef = await db.collection(COLLECTIONS.EXAMS).add(examData);
      
      res.status(201).json({ 
        success: true, 
        data: { id: docRef.id, ...examData } 
      });
    } catch (error) {
      console.error('Error creating exam in Firebase, falling back to local store:', error);
      try {
        const { name, description } = req.body;
        
        if (!name || !description) {
          return res.status(400).json({ success: false, error: 'Name and description are required' });
        }
        
        const exam = await createExam({
          name,
          description,
          isActive: true
        });
        
        res.status(201).json({ 
          success: true, 
          data: exam 
        });
      } catch (localError) {
        console.error('Error creating exam in local store:', localError);
        res.status(500).json({ success: false, error: 'Failed to create exam' });
      }
    }
  } else if (req.method === 'PUT') {
    try {
      const { id, name, description } = req.body;
      
      if (!id || !name || !description) {
        return res.status(400).json({ success: false, error: 'ID, name and description are required' });
      }
      
      await db.collection(COLLECTIONS.EXAMS).doc(id).update({
        name,
        description,
        updatedAt: new Date()
      });
      
      res.status(200).json({ success: true, message: 'Exam updated successfully' });
    } catch (error) {
      console.error('Error updating exam:', error);
      res.status(500).json({ success: false, error: 'Failed to update exam' });
    }
  } else if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      
      if (!id) {
        return res.status(400).json({ success: false, error: 'Exam ID is required' });
      }
      
      await db.collection(COLLECTIONS.EXAMS).doc(id as string).update({
        isActive: false,
        updatedAt: new Date()
      });
      
      res.status(200).json({ success: true, message: 'Exam deleted successfully' });
    } catch (error) {
      console.error('Error deleting exam:', error);
      res.status(500).json({ success: false, error: 'Failed to delete exam' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    res.status(405).json({ success: false, error: 'Method not allowed' });
  }
}
