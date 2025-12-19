import { NextApiRequest, NextApiResponse } from 'next';
import { 
  createInterviewSession, 
  updateInterviewSession,
  getCandidateById,
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

interface BulkScheduleResult {
  success: number;
  failed: number;
  errors: Array<{ candidateId: number; email: string; error: string }>;
  emailSent: number;
  emailFailed: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const user = await getAdminSession(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.setHeader('Allow', ['POST']).status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const { candidateIds, examId, subcategoryId, scheduledTime, scheduledEndTime, interviewMode, sendEmail } = req.body;
    
    if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Candidate IDs array is required' 
      });
    }

    if (candidateIds.length > 1000) {
      return res.status(400).json({ 
        success: false, 
        error: 'Maximum 1000 candidates can be scheduled at once' 
      });
    }

    const result: BulkScheduleResult = {
      success: 0,
      failed: 0,
      errors: [],
      emailSent: 0,
      emailFailed: 0,
    };

    // Get exam and subcategory details if provided
    let exam = null;
    let subcategory = null;
    
    if (examId) {
      exam = await getExamById(examId);
    }
    if (subcategoryId) {
      subcategory = await getSubcategoryById(subcategoryId);
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:9002');

    // Process candidates in batches
    const batchSize = 50;
    for (let i = 0; i < candidateIds.length; i += batchSize) {
      const batch = candidateIds.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (candidateId: number) => {
          try {
            // Get candidate
            const candidate = await getCandidateById(candidateId);
            if (!candidate) {
              result.failed++;
              result.errors.push({
                candidateId,
                email: 'N/A',
                error: 'Candidate not found'
              });
              return;
            }

            // Use provided exam/subcategory or fall back to candidate's settings
            const finalExamId = examId || candidate.exam_id || null;
            const finalSubcategoryId = subcategoryId || candidate.subcategory_id || null;

            // Get final exam and subcategory details
            let finalExam = exam;
            let finalSubcategory = subcategory;
            
            if (!finalExam && finalExamId) {
              finalExam = await getExamById(finalExamId);
            }
            if (!finalSubcategory && finalSubcategoryId) {
              finalSubcategory = await getSubcategoryById(finalSubcategoryId);
            }

            // Generate unique token and set expiry
            const token = generateToken();
            
            // Validate end time is after start time if both are provided
            if (scheduledTime && scheduledEndTime) {
              const startTime = new Date(scheduledTime);
              const endTime = new Date(scheduledEndTime);
              if (endTime <= startTime) {
                result.failed++;
                result.errors.push({
                  candidateId,
                  email: candidate.email,
                  error: 'End time must be after start time'
                });
                return;
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

            // Create interview session
            const newSession = await createInterviewSession({
              candidate_id: candidateId,
              job_role_id: null,
              resume_id: null,
              exam_id: finalExamId,
              subcategory_id: finalSubcategoryId,
              token,
              status: 'pending',
              scheduled_time: scheduledTime || null,
              scheduled_end_time: scheduledEndTime || null,
              expires_at: expiresAt.toISOString(),
              interview_mode: interviewMode || null,
              is_active: true
            });

            result.success++;

            // Send email if requested
            if (sendEmail) {
              try {
                const interviewLink = `${baseUrl}/interview/${token}`;

                // Format job title for email
                let jobTitle = 'Interview';
                if (finalExam) {
                  jobTitle = finalExam.name;
                  if (finalSubcategory) {
                    jobTitle += ` - ${finalSubcategory.name}`;
                  }
                }

                const emailSent = await emailService.sendInterviewLink({
                  candidateName: `${candidate.first_name} ${candidate.last_name}`,
                  candidateEmail: candidate.email,
                  jobTitle: jobTitle,
                  examName: finalExam?.name,
                  subcategoryName: finalSubcategory?.name,
                  jobDescription: undefined,
                  jobRequirements: undefined,
                  department: undefined,
                  interviewLink,
                  scheduledTime: scheduledTime,
                  scheduledEndTime: scheduledEndTime,
                  interviewMode: interviewMode
                });

                if (emailSent) {
                  await updateInterviewSession(newSession.id, {
                    link_sent_at: new Date().toISOString()
                  });
                  result.emailSent++;
                } else {
                  result.emailFailed++;
                }
              } catch (emailError) {
                console.error(`Error sending email to ${candidate.email}:`, emailError);
                result.emailFailed++;
              }
            }
          } catch (error) {
            result.failed++;
            result.errors.push({
              candidateId,
              email: 'N/A',
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        })
      );
    }

    res.status(200).json({
      success: true,
      data: {
        total: candidateIds.length,
        ...result
      }
    });
  } catch (error) {
    console.error('Bulk schedule error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

