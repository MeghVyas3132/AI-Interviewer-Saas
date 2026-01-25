/**
 * Parses interview transcripts from email content
 * Handles various email formats and extracts Q&A data
 */

interface ParsedTranscript {
  candidate_id: string;
  candidate_name: string;
  candidate_email?: string;
  role?: string;
  interview_id?: string;
  status: string;
  questions_count: number;
  qa: Array<{
    id: string;
    type: string;
    at?: string;
    question?: string;
    answer?: string;
    feedback?: string;
    scoring?: any;
  }>;
  completed_at?: string;
}

interface EmailContent {
  text: string;
  html: string;
  subject: string;
}

export class TranscriptParser {
  /**
   * Parse transcript from email content
   */
  static parseTranscript(email: EmailContent, messageId: string): ParsedTranscript | null {
    // Try parsing from HTML first, then fallback to text
    const content = email.html || email.text;
    
    if (!content) {
      return null;
    }

    // Extract candidate information from subject or email content
    const candidateInfo = this.extractCandidateInfo(email.subject, content);
    
    // Extract Q&A pairs from content
    const qaPairs = this.extractQAPairs(content);
    
    if (qaPairs.length === 0) {
      // Try alternative parsing methods
      const altQAPairs = this.extractQAPairsAlternative(content);
      if (altQAPairs.length > 0) {
        return this.buildTranscript(candidateInfo, altQAPairs, email, messageId);
      }
      return null;
    }

    return this.buildTranscript(candidateInfo, qaPairs, email, messageId);
  }

  /**
   * Extract candidate information from email
   */
  private static extractCandidateInfo(subject: string, content: string): {
    candidate_id: string;
    candidate_name: string;
    candidate_email?: string;
    role?: string;
    interview_id?: string;
  } {
    // Try to extract from subject line patterns
    // Examples: "Interview Completed - John Doe - Software Engineer"
    //          "Interview Transcript - john@example.com"
    const subjectMatch = subject.match(/Interview.*?(?:Completed|Transcript).*?(?:[-:])\s*(.+?)(?:\s*[-:]\s*(.+))?$/i);
    
    let candidateName = 'Unknown Candidate';
    let role = '';
    
    if (subjectMatch) {
      candidateName = subjectMatch[1]?.trim() || candidateName;
      role = subjectMatch[2]?.trim() || '';
    }

    // Try to extract from content
    const nameMatch = content.match(/(?:Candidate|Name|Interviewee)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
    if (nameMatch) {
      candidateName = nameMatch[1];
    }

    const emailMatch = content.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const candidateEmail = emailMatch ? emailMatch[1] : undefined;

    const roleMatch = content.match(/(?:Position|Role|Job Title)[:\s]+(.+?)(?:\n|$)/i);
    if (roleMatch) {
      role = roleMatch[1].trim();
    }

    const interviewIdMatch = content.match(/(?:Interview ID|Session ID)[:\s]+([A-Za-z0-9-]+)/i);
    const interviewId = interviewIdMatch ? interviewIdMatch[1] : undefined;

    // Generate candidate_id from email or name
    const candidate_id = candidateEmail 
      ? candidateEmail.split('@')[0] 
      : candidateName.toLowerCase().replace(/\s+/g, '_');

    return {
      candidate_id,
      candidate_name: candidateName,
      candidate_email: candidateEmail,
      role: role || undefined,
      interview_id: interviewId,
    };
  }

  /**
   * Extract Q&A pairs from email content
   * Supports multiple formats:
   * - Q: Question\nA: Answer
   * - Question: ...\nAnswer: ...
   * - HTML formatted Q&A
   */
  private static extractQAPairs(content: string): Array<{
    question: string;
    answer: string;
    feedback?: string;
    scoring?: any;
    timestamp?: string;
  }> {
    const qaPairs: Array<{
      question: string;
      answer: string;
      feedback?: string;
      scoring?: any;
      timestamp?: string;
    }> = [];

    // Remove HTML tags for text extraction
    const textContent = content.replace(/<[^>]*>/g, '\n').replace(/\n+/g, '\n');

    // Pattern 1: Q: Question\nA: Answer
    const qaPattern1 = /(?:Q|Question)[:\s]+(.+?)(?:\n\s*(?:A|Answer)[:\s]+(.+?)(?=\n\s*(?:Q|Question)[:\s]|$))/gis;
    let match1;
    while ((match1 = qaPattern1.exec(textContent)) !== null) {
      const question = match1[1]?.trim();
      const answer = match1[2]?.trim();
      if (question && answer) {
        qaPairs.push({ question, answer });
      }
    }

    // Pattern 2: Question: ...\nAnswer: ...
    if (qaPairs.length === 0) {
      const qaPattern2 = /Question[:\s]+(.+?)\n\s*Answer[:\s]+(.+?)(?=\n\s*Question[:\s]|$)/gis;
      let match2;
      while ((match2 = qaPattern2.exec(textContent)) !== null) {
        const question = match2[1]?.trim();
        const answer = match2[2]?.trim();
        if (question && answer) {
          qaPairs.push({ question, answer });
        }
      }
    }

    // Pattern 3: HTML structured Q&A
    if (qaPairs.length === 0 && content.includes('<')) {
      const htmlPattern = /(?:<[^>]*class[^>]*question[^>]*>|<h[23][^>]*>|<strong[^>]*>)(.+?)(?:<\/[^>]+>)(?:.*?)(?:<[^>]*class[^>]*answer[^>]*>|<p[^>]*>)(.+?)(?:<\/[^>]+>)/gis;
      let match3;
      while ((match3 = htmlPattern.exec(content)) !== null) {
        const question = match3[1]?.replace(/<[^>]*>/g, '').trim();
        const answer = match3[2]?.replace(/<[^>]*>/g, '').trim();
        if (question && answer) {
          qaPairs.push({ question, answer });
        }
      }
    }

    // Pattern 4: Numbered questions
    if (qaPairs.length === 0) {
      const numberedPattern = /(?:^\d+[\.\)]\s*)(.+?)(?:\n\s*(?:Answer|Response)[:\s]*\n\s*(.+?)(?=\n\s*\d+[\.\)]|$))/gims;
      let match4;
      while ((match4 = numberedPattern.exec(textContent)) !== null) {
        const question = match4[1]?.trim();
        const answer = match4[2]?.trim();
        if (question && answer) {
          qaPairs.push({ question, answer });
        }
      }
    }

    // Try to extract feedback and scoring if available
    qaPairs.forEach((qa, index) => {
      // Look for feedback after the answer
      const feedbackMatch = textContent.match(
        new RegExp(`${qa.answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^]*?Feedback[:\s]+(.+?)(?=\n|$)`, 'i')
      );
      if (feedbackMatch) {
        qa.feedback = feedbackMatch[1].trim();
      }

      // Look for scoring information
      const scoreMatch = textContent.match(
        new RegExp(`Score[:\s]+(\\d+)`, 'i')
      );
      if (scoreMatch) {
        qa.scoring = { overallScore: parseInt(scoreMatch[1]) };
      }
    });

    return qaPairs;
  }

  /**
   * Alternative parsing method for different email formats
   */
  private static extractQAPairsAlternative(content: string): Array<{
    question: string;
    answer: string;
    feedback?: string;
    scoring?: any;
    timestamp?: string;
  }> {
    const qaPairs: Array<{
      question: string;
      answer: string;
      feedback?: string;
      scoring?: any;
      timestamp?: string;
    }> = [];

    // Split by common delimiters
    const sections = content.split(/(?:\n\s*){2,}/);
    
    for (const section of sections) {
      // Look for question-like patterns
      const questionMatch = section.match(/^(?:Q|Question|Q\d+)[:\s]+(.+?)$/im);
      const answerMatch = section.match(/(?:A|Answer|Response)[:\s]+(.+?)$/ims);
      
      if (questionMatch && answerMatch) {
        qaPairs.push({
          question: questionMatch[1].trim(),
          answer: answerMatch[1].trim(),
        });
      }
    }

    return qaPairs;
  }

  /**
   * Build transcript object from parsed data
   */
  private static buildTranscript(
    candidateInfo: {
      candidate_id: string;
      candidate_name: string;
      candidate_email?: string;
      role?: string;
      interview_id?: string;
    },
    qaPairs: Array<{
      question: string;
      answer: string;
      feedback?: string;
      scoring?: any;
      timestamp?: string;
    }>,
    email: EmailContent,
    messageId: string
  ): ParsedTranscript {
    // Extract completion date from content or use email date
    const dateMatch = email.text.match(/(?:Completed|Finished|Ended)[:\s]+(.+?)(?:\n|$)/i);
    const completedAt = dateMatch 
      ? new Date(dateMatch[1]).toISOString() 
      : new Date().toISOString();

    return {
      candidate_id: candidateInfo.candidate_id,
      candidate_name: candidateInfo.candidate_name,
      candidate_email: candidateInfo.candidate_email,
      role: candidateInfo.role,
      interview_id: candidateInfo.interview_id || `email-${messageId}`,
      status: 'completed',
      questions_count: qaPairs.length,
      qa: qaPairs.map((qa, idx) => ({
        id: `qa-${messageId}-${idx}`,
        type: 'qa',
        at: qa.timestamp || completedAt,
        question: qa.question,
        answer: qa.answer,
        feedback: qa.feedback,
        scoring: qa.scoring,
      })),
      completed_at: completedAt,
    };
  }
}

