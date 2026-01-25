import { NextApiRequest, NextApiResponse } from 'next';
import { 
  getCandidates, 
  getCandidateById, 
  createCandidate, 
  updateCandidate, 
  deleteCandidate,
  getCandidateByEmail,
  restoreCandidate
} from '@/lib/postgres-data-store';
import { getAdminSession } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const user = await getAdminSession(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    switch (req.method) {
      case 'GET':
        const { includeDeleted } = req.query;
        const includeDeletedBool = includeDeleted === 'true';
        const candidates = await getCandidates(includeDeletedBool);
        res.status(200).json({ success: true, data: candidates });
        break;

      case 'POST': {
        const { first_name, last_name, email, phone, exam_id, subcategory_id, resume_url } = req.body;
        
        if (!first_name || !last_name || !email) {
          return res.status(400).json({ 
            success: false, 
            error: 'First name, last name, and email are required' 
          });
        }

        // Check if candidate with email already exists
        const existingCandidate = await getCandidateByEmail(email);
        if (existingCandidate) {
          // If candidate exists but is soft-deleted (is_active = false), reactivate them
          if (!existingCandidate.is_active) {
            await updateCandidate(existingCandidate.candidate_id, {
              first_name,
              last_name,
              phone: phone || null,
              exam_id: exam_id || null,
              subcategory_id: subcategory_id || null,
              resume_url: resume_url || null,
              status: 'active',
              is_active: true
            });
            const reactivatedCandidate = await getCandidateById(existingCandidate.candidate_id);
            return res.status(200).json({ 
              success: true, 
              data: reactivatedCandidate,
              message: 'Candidate reactivated and updated'
            });
          }
          // If candidate is active, return conflict
          return res.status(409).json({ 
            success: false, 
            error: 'Candidate with this email already exists',
            candidate: existingCandidate
          });
        }

        const newCandidate = await createCandidate({
          first_name,
          last_name,
          email,
          phone: phone || null,
          exam_id: exam_id || null,
          subcategory_id: subcategory_id || null,
          resume_url: resume_url || null,
          status: 'active',
          is_active: true
        });

        res.status(201).json({ success: true, data: newCandidate });
        break;
      }

      case 'PUT': {
        const { id, first_name, last_name, email, phone, exam_id, subcategory_id, resume_url, status } = req.body;
        
        if (!id) {
          return res.status(400).json({ 
            success: false, 
            error: 'Candidate ID is required' 
          });
        }

        if (!first_name || !last_name) {
          return res.status(400).json({ 
            success: false, 
            error: 'First name and last name are required' 
          });
        }

        const candidateId = parseInt(id);
        
        // Verify candidate exists
        const existingCandidate = await getCandidateById(candidateId);
        if (!existingCandidate) {
          return res.status(404).json({ 
            success: false, 
            error: 'Candidate not found' 
          });
        }

        // Email cannot be changed - it's a unique identifier
        // If email is provided and different, reject the update
        if (email && email !== existingCandidate.email) {
          return res.status(400).json({ 
            success: false, 
            error: 'Email cannot be changed. It is a unique identifier for the candidate.' 
          });
        }
        
        // Build update object, excluding undefined/null values that shouldn't be updated
        const updates: any = {
          first_name,
          last_name,
        };

        // Only include fields that are provided (not null/undefined)
        if (phone !== undefined) updates.phone = phone || null;
        if (exam_id !== undefined) updates.exam_id = exam_id || null;
        if (subcategory_id !== undefined) updates.subcategory_id = subcategory_id || null;
        if (resume_url !== undefined) updates.resume_url = resume_url || null;
        if (status !== undefined) updates.status = status || 'active';

        // Update the candidate
        await updateCandidate(candidateId, updates);
        
        // Fetch the updated candidate
        const updatedCandidate = await getCandidateById(candidateId);
        
        if (!updatedCandidate) {
          return res.status(404).json({ 
            success: false, 
            error: 'Candidate not found after update' 
          });
        }

        res.status(200).json({ success: true, data: updatedCandidate });
        break;
      }

      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT']);
        res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Candidates API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

