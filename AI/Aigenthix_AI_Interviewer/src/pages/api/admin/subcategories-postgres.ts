import { NextApiRequest, NextApiResponse } from 'next';
import { getSubcategories, createSubcategory, updateSubcategory, deleteSubcategory } from '@/lib/postgres-data-store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const { examId } = req.query;
      const subcategories = await getSubcategories(examId ? parseInt(examId as string) : undefined);
      res.status(200).json({ success: true, data: subcategories });
    } catch (error) {
      console.error('Error fetching subcategories:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch subcategories' });
    }
  } else if (req.method === 'POST') {
    try {
      const { examId, name, description } = req.body;
      
      if (!examId || !name || !description) {
        return res.status(400).json({ success: false, error: 'Exam ID, name and description are required' });
      }
      
      const subcategory = await createSubcategory({
        exam_id: parseInt(examId),
        name,
        description,
        is_active: true
      });
      
      res.status(201).json({ 
        success: true, 
        data: subcategory 
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
      
      await updateSubcategory(parseInt(id), { name, description });
      
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
      
      await deleteSubcategory(parseInt(id as string));
      
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
