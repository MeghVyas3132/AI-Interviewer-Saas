import type { NextApiRequest, NextApiResponse } from 'next';
import { interviewAgent, type InterviewAgentInput } from '@/ai/flows/interview-agent';

/**
 * API endpoint for the Interview Agent
 * This allows external services (like the main frontend) to call the AI interview agent
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const {
      currentQuestion,
      answer,
      jobTitle,
      company,
      college,
      resumeText,
      language,
      conversationHistory,
      interviewData,
      currentAffairsMetadata,
      questionAttempts,
      questionsRemaining,
      minimumQuestionsRequired,
      questionsAnswered,
      configuredQuestionLimit,
      videoFrameDataUri,
      recentScores,
      isCurrentQuestionReal,
      hasResumeData,
      isEmailInterview,
    } = req.body;

    // Validate required fields
    if (!currentQuestion || !answer) {
      return res.status(400).json({
        success: false,
        error: 'currentQuestion and answer are required',
      });
    }

    // Map conversationHistory to the expected format (array of question/answer objects)
    const formattedHistory = (conversationHistory || interviewData || []).map((item: any) => ({
      question: item.question || item.currentQuestion || '',
      answer: item.answer || item.transcript || '',
      attempts: item.attempts || 1,
      hintsGiven: item.hintsGiven || item.hints || [],
      isCorrect: item.isCorrect,
      isCurrentAffairs: item.isCurrentAffairs || false,
    }));

    // Calculate minimum questions based on interview type
    // HR interviews require 10 questions, others use the provided value or defaults
    const getMinQuestionsForInterview = (role: string, comp: string, providedMin?: number): number => {
      const normalizedRole = (role || '').toLowerCase();
      const normalizedCompany = (comp || '').toLowerCase();
      
      // HR interviews require 10 questions (1 resume-based + 1 technical + 8 general HR)
      if (normalizedRole === 'hr' || 
          normalizedRole === 'interview' || 
          normalizedCompany === 'hr' ||
          normalizedRole.includes('hr')) {
        return 10;
      }
      if (normalizedRole.includes('neet')) return 8;
      if (normalizedRole.includes('jee')) return 9;
      if (normalizedRole.includes('cat') || normalizedRole.includes('mba')) return 7;
      
      // Use provided minimum or default to 8
      return providedMin || 8;
    };
    
    const calculatedMinQuestions = getMinQuestionsForInterview(jobTitle, company, minimumQuestionsRequired);
    
    // Prepare input for interview agent
    const input: InterviewAgentInput = {
      currentTranscript: answer,
      jobRole: jobTitle || 'General',
      company: company || '',
      college: college,
      resumeText: resumeText || '',
      language: language || 'English',
      conversationHistory: formattedHistory,
      videoFrameDataUri: videoFrameDataUri,
      realQuestionCount: questionsAnswered || formattedHistory.length,
      recentScores: recentScores || [],
      isCurrentQuestionReal: isCurrentQuestionReal ?? true,
      currentQuestionAttempts: questionAttempts || 0,
      currentQuestionHints: [],
      minQuestionsRequired: calculatedMinQuestions,
      hasResumeData: hasResumeData ?? (!!resumeText && resumeText.trim().length > 0),
      isEmailInterview: isEmailInterview ?? true,
    };

    // Call the interview agent
    const result = await interviewAgent(input);

    return res.status(200).json({
      success: true,
      ...result,
    });

  } catch (error: any) {
    console.error('Interview agent error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process interview response',
    });
  }
}
