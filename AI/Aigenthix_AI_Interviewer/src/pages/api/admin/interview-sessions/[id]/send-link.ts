import { NextApiRequest, NextApiResponse } from 'next';
import { 
  getInterviewSessionById,
  updateInterviewSession,
  getCandidateById,
  getExamById,
  getSubcategoryById
} from '@/lib/postgres-data-store';
import { emailService } from '@/lib/email-service';
import { getAdminSession } from '@/lib/auth';
import { connectMongo } from '@/lib/mongodb';
import { InterviewSession as MongoInterviewSession } from '@/lib/models';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Check authentication
  const user = await getAdminSession(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ success: false, error: 'Session ID is required' });
    }

    const sessionId = parseInt(id);
    const session = await getInterviewSessionById(sessionId);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    // Check if session is still valid
    // Use scheduled_end_time if available, otherwise expires_at
    const currentTime = new Date().getTime();
    let actualExpiryTime: number;
    
    if (session.scheduled_end_time) {
      actualExpiryTime = new Date(session.scheduled_end_time).getTime();
    } else {
      actualExpiryTime = new Date(session.expires_at).getTime();
    }
    
    if (currentTime > actualExpiryTime) {
      return res.status(400).json({ 
        success: false, 
        error: session.scheduled_end_time
          ? 'The interview window has ended. Please contact the administrator to schedule a new interview.'
          : 'Interview session has expired'
      });
    }

    const candidate = await getCandidateById(session.candidate_id);
    if (!candidate) {
      return res.status(404).json({ success: false, error: 'Candidate not found' });
    }

    const exam = session.exam_id ? await getExamById(session.exam_id) : null;
    const subcategory = session.subcategory_id ? await getSubcategoryById(session.subcategory_id) : null;

    // Generate the interview link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:9002');
    const interviewLink = `${baseUrl}/interview/${session.token}`;

    console.log('Sending interview link email:', {
      candidateEmail: candidate.email,
      candidateName: `${candidate.first_name} ${candidate.last_name}`,
      interviewLink,
      baseUrl
    });

    // Send the email - adapt email service call to work with both formats
    const jobTitle = exam?.name || 'Interview';
    const subcategoryName = subcategory?.name || '';
    const fullJobTitle = subcategoryName ? `${jobTitle} - ${subcategoryName}` : jobTitle;

    const emailSent = await emailService.sendInterviewLink({
      candidateName: `${candidate.first_name} ${candidate.last_name}`,
      candidateEmail: candidate.email,
      jobTitle: fullJobTitle,
      examName: exam?.name,
      subcategoryName: subcategory?.name,
      interviewLink,
      scheduledTime: session.scheduled_time,
      interviewMode: session.interview_mode
    });

    console.log('Email send result:', emailSent);

    if (!emailSent) {
      console.error('Failed to send email');
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to send email. Please check server logs for details.' 
      });
    }

    // Update the session to mark link as sent
    await updateInterviewSession(sessionId, {
      link_sent_at: new Date().toISOString(),
      status: 'link_sent'
    });

    // Create MongoDB record for this interview session
    const connected = await connectMongo();
    if (connected) {
      try {
        await MongoInterviewSession.findOneAndUpdate(
          { token: session.token },
          {
            $set: {
              token: session.token,
              candidate: {
                name: `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim() || 'Unknown',
                email: candidate.email || '',
                phone: candidate.phone || '',
              },
              exam: exam?.name || '',
              subcategory: subcategory?.name || '',
              resumeText: '',
              questionsGenerated: [],
              interviewData: [],
              questionsAndAnswers: [],
              status: 'pending',
              scheduledTime: session.scheduled_time ? new Date(session.scheduled_time) : null,
              expiresAt: session.expires_at ? new Date(session.expires_at) : null,
            }
          },
          { upsert: true, new: true }
        );
        
        console.log('Interview session initialized in MongoDB for token:', session.token);
      } catch (mongoError) {
        console.error('Error creating MongoDB session:', mongoError);
        // Continue even if MongoDB save fails
      }
    }

    res.status(200).json({ 
      success: true, 
      message: 'Interview link sent successfully',
      interviewLink 
    });

  } catch (error) {
    console.error('Send interview link error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      error: JSON.stringify(error, null, 2)
    });
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

