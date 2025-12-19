import { NextApiRequest, NextApiResponse } from 'next';
import { getExams, createExam, updateExam, deleteExam } from '@/lib/postgres-data-store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const exams = await getExams();
      res.status(200).json({ success: true, data: exams });
    } catch (error) {
      console.error('Error fetching exams:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch exams' });
    }
  } else if (req.method === 'POST') {
    try {
      const { name, description } = req.body;
      
      if (!name || !description) {
        return res.status(400).json({ success: false, error: 'Name and description are required' });
      }
      
      const exam = await createExam({
        name,
        description,
        is_active: true
      });
      
      res.status(201).json({ 
        success: true, 
        data: exam 
      });
    } catch (error) {
      console.error('Error creating exam:', error);
      res.status(500).json({ success: false, error: 'Failed to create exam' });
    }
  } else if (req.method === 'PUT') {
    try {
      const { id, name, description } = req.body;
      
      if (!id || !name || !description) {
        return res.status(400).json({ success: false, error: 'ID, name and description are required' });
      }
      
      await updateExam(parseInt(id), { name, description });
      
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
      
      await deleteExam(parseInt(id as string));
      
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
