import { NextApiRequest, NextApiResponse } from 'next';
import { 
  getInterviewSessions, 
  getInterviewSessionById, 
  createInterviewSession, 
  updateInterviewSession, 
  deleteInterviewSession,
  getCandidateById,
  getJobPositionById,
  getResumeById,
  getExamById,
  getSubcategoryById
} from '@/lib/postgres-data-store';
import { emailService } from '@/lib/email-service';
import { getAdminSession } from '@/lib/auth';

// Generate unique token using crypto
function generateToken(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const user = await getAdminSession(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    switch (req.method) {
      case 'GET': {
        const { status, candidateId, examId, subcategoryId } = req.query;
        const filters: any = {};
        
        if (status && typeof status === 'string') {
          filters.status = status;
        }
        if (candidateId && typeof candidateId === 'string') {
          filters.candidateId = parseInt(candidateId);
        }
        if (examId && typeof examId === 'string') {
          filters.examId = parseInt(examId);
        }
        if (subcategoryId && typeof subcategoryId === 'string') {
          filters.subcategoryId = parseInt(subcategoryId);
        }

        const sessions = await getInterviewSessions(Object.keys(filters).length > 0 ? filters : undefined);
        
        // Enrich sessions with candidate and exam/subcategory names
        const enrichedSessions = await Promise.all(sessions.map(async (session) => {
          const candidate = await getCandidateById(session.candidate_id);
          const exam = session.exam_id ? await getExamById(session.exam_id) : null;
          const subcategory = session.subcategory_id ? await getSubcategoryById(session.subcategory_id) : null;

          return {
            ...session,
            candidate_name: candidate ? `${candidate.first_name} ${candidate.last_name}` : 'Unknown',
            candidate_email: candidate?.email || '',
            exam_name: exam?.name || null,
            subcategory_name: subcategory?.name || null
          };
        }));

        res.status(200).json({ success: true, data: enrichedSessions });
        break;
      }

      case 'POST': {
        const { candidateId, jobRoleId, resumeId, examId, subcategoryId, scheduledTime, scheduledEndTime, interviewMode, sendEmail } = req.body;
        
        if (!candidateId) {
          return res.status(400).json({ 
            success: false, 
            error: 'Candidate ID is required' 
          });
        }

        const candidate = await getCandidateById(candidateId);
        if (!candidate) {
          return res.status(404).json({ 
            success: false, 
            error: 'Candidate not found' 
          });
        }

        // Generate unique token and set expiry
        const token = generateToken();
        
        // Validate end time is after start time if both are provided
        if (scheduledTime && scheduledEndTime) {
          const startTime = new Date(scheduledTime);
          const endTime = new Date(scheduledEndTime);
          if (endTime <= startTime) {
            return res.status(400).json({
              success: false,
              error: 'End time must be after start time'
            });
          }
        }
        
        // Set expires_at: use scheduled_end_time if provided, otherwise 7 days from now
        let expiresAt: Date;
        if (scheduledEndTime) {
          // Use scheduled end time as the expiry
          expiresAt = new Date(scheduledEndTime);
        } else {
          // Default: 7 days from now
          expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7);
        }

        const newSession = await createInterviewSession({
          candidate_id: candidateId,
          job_role_id: jobRoleId || null,
          resume_id: resumeId || null,
          exam_id: examId || null,
          subcategory_id: subcategoryId || null,
          token,
          status: 'pending',
          scheduled_time: scheduledTime || null,
          scheduled_end_time: scheduledEndTime || null,
          expires_at: expiresAt.toISOString(),
          interview_mode: interviewMode || null,
          is_active: true
        });

        // Send email if requested
        let emailSent = false;
        let emailError = null;
        
        if (sendEmail) {
          try {
            // Try to get job position first (AiGenthix style), fall back to exam/subcategory
            let jobPosition = null;
            let exam = null;
            let subcategory = null;
            
            if (jobRoleId) {
              jobPosition = await getJobPositionById(Number(jobRoleId));
            }
            
            if (!jobPosition) {
              // Fall back to exam/subcategory
              exam = examId ? await getExamById(examId) : null;
              subcategory = subcategoryId ? await getSubcategoryById(subcategoryId) : null;
            }
            
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 
              (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:9002');
            const interviewLink = `${baseUrl}/interview/${token}`;

            // Format job title for email - prefer job position, fall back to exam/subcategory
            let jobTitle = 'Interview';
            let jobDescription = undefined;
            let jobRequirements = undefined;
            let department = undefined;
            
            if (jobPosition) {
              jobTitle = jobPosition.title;
              jobDescription = jobPosition.description;
              jobRequirements = jobPosition.requirements;
              department = jobPosition.department;
            } else if (exam) {
              jobTitle = exam.name;
              if (subcategory) {
                jobTitle += ` - ${subcategory.name}`;
              }
            }

            emailSent = await emailService.sendInterviewLink({
              candidateName: `${candidate.first_name} ${candidate.last_name}`,
              candidateEmail: candidate.email,
              jobTitle: jobTitle,
              examName: exam?.name,
              subcategoryName: subcategory?.name,
              jobDescription: jobDescription,
              jobRequirements: jobRequirements,
              department: department,
              interviewLink,
              scheduledTime: scheduledTime,
              scheduledEndTime: scheduledEndTime,
              interviewMode: interviewMode
            });

            if (emailSent) {
              await updateInterviewSession(newSession.id, {
                link_sent_at: new Date().toISOString()
              });
            }
          } catch (error) {
            console.error('Error sending email:', error);
            emailError = error instanceof Error ? error.message : 'Unknown error';
          }
        }

        res.status(201).json({ 
          success: true, 
          data: newSession,
          emailSent,
          emailError
        });
        break;
      }

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Interview sessions API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

