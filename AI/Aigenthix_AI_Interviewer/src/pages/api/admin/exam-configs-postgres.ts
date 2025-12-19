import type { NextApiRequest, NextApiResponse } from 'next';
import { 
  getExamConfigs, 
  createExamConfig, 
  updateExamConfig, 
  deleteExamConfig,
  type ExamConfig 
} from '@/lib/postgres-data-store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    switch (req.method) {
      case 'GET':
        const configs = await getExamConfigs();
        return res.status(200).json({ success: true, data: configs });

      case 'POST':
        const newConfig = await createExamConfig(req.body);
        return res.status(201).json({ success: true, data: newConfig });

      case 'PUT':
        const { id, ...updates } = req.body;
        if (!id) {
          return res.status(400).json({ success: false, error: 'Config ID is required' });
        }
        await updateExamConfig(id, updates);
        return res.status(200).json({ success: true, message: 'Config updated successfully' });

      case 'DELETE':
        const configId = req.query.id as string;
        if (!configId) {
          return res.status(400).json({ success: false, error: 'Config ID is required' });
        }
        await deleteExamConfig(Number(configId));
        return res.status(200).json({ success: true, message: 'Config deleted successfully' });

      default:
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('Exam configs API error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}

