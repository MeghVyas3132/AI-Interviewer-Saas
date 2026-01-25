import { NextApiRequest, NextApiResponse } from 'next';
import { bulkCreateQuestions } from '@/lib/postgres-data-store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('=== BULK UPLOAD TEST ENDPOINT ===');
  console.log('Method:', req.method);
  console.log('Query:', req.query);
  console.log('Body:', req.body);
  console.log('Headers:', req.headers);

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { questions } = req.body;
    
    console.log('Questions received:', questions);
    console.log('Questions type:', typeof questions);
    console.log('Is array:', Array.isArray(questions));
    console.log('Length:', questions?.length);

    if (!Array.isArray(questions)) {
      console.log('ERROR: Questions is not an array');
      return res.status(400).json({ 
        success: false, 
        error: 'Questions must be an array' 
      });
    }

    if (questions.length === 0) {
      console.log('ERROR: Questions array is empty');
      return res.status(400).json({ 
        success: false, 
        error: 'Questions array cannot be empty' 
      });
    }

    console.log('Processing questions...');
    
    const validQuestions = questions.filter(q => {
      console.log('Checking question:', q);
      const isValid = q.examId && q.subcategoryId && q.category && q.subcategory && q.subsection && q.question;
      console.log('Is valid:', isValid);
      return isValid;
    });

    console.log('Valid questions count:', validQuestions.length);

    if (validQuestions.length === 0) {
      console.log('ERROR: No valid questions found');
      return res.status(400).json({ 
        success: false, 
        error: 'No valid questions found' 
      });
    }

    const processedQuestions = validQuestions.map(q => ({
      exam_id: parseInt(q.examId),
      subcategory_id: parseInt(q.subcategoryId),
      category: q.category,
      subcategory: q.subcategory,
      subsection: q.subsection,
      question: q.question,
      is_active: true
    }));

    console.log('Processed questions:', processedQuestions);

    const createdQuestions = await bulkCreateQuestions(processedQuestions);
    
    console.log('Created questions:', createdQuestions.length);

    res.status(201).json({ 
      success: true, 
      data: createdQuestions,
      message: `${createdQuestions.length} questions uploaded successfully`
    });

  } catch (error) {
    console.error('Error in bulk upload test:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({ success: false, error: 'Failed to bulk upload questions' });
  }
}
