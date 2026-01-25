import { Transcript } from '@/lib/models/Transcript';
import { aiReportGenerator } from '@/lib/ai-report-generator-mongodb';

/**
 * Analyzes transcripts stored in MongoDB
 * Generates insights, scores, and recommendations
 */
export class TranscriptAnalyzer {
  /**
   * Analyze a single transcript
   */
  async analyzeTranscript(transcriptId: string): Promise<any> {
    const transcript = await Transcript.findById(transcriptId);
    
    if (!transcript) {
      throw new Error(`Transcript not found: ${transcriptId}`);
    }

    if (transcript.analyzed) {
      console.log(`Transcript ${transcriptId} already analyzed`);
      return transcript.analysis_results;
    }

    // Perform analysis
    const analysis = await this.performAnalysis(transcript);

    // Update transcript with analysis results
    transcript.analyzed = true;
    transcript.analyzed_at = new Date();
    transcript.analysis_results = analysis;
    await transcript.save();

    return analysis;
  }

  /**
   * Analyze all unanalyzed transcripts
   */
  async analyzeAllUnanalyzed(limit: number = 50): Promise<{
    analyzed: number;
    errors: string[];
  }> {
    const unanalyzed = await Transcript.find({ analyzed: false })
      .limit(limit)
      .sort({ createdAt: -1 });

    const errors: string[] = [];
    let analyzed = 0;

    for (const transcript of unanalyzed) {
      try {
        await this.analyzeTranscript(transcript._id.toString());
        analyzed++;
        console.log(`Analyzed transcript ${transcript._id}`);
      } catch (error) {
        const errorMsg = `Error analyzing transcript ${transcript._id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error('[ERROR]', errorMsg);
        errors.push(errorMsg);
      }
    }

    return { analyzed, errors };
  }

  /**
   * Perform analysis on a transcript
   */
  private async performAnalysis(transcript: any): Promise<any> {
    const qaPairs = transcript.qa || [];
    
    if (qaPairs.length === 0) {
      return {
        error: 'No Q&A pairs found in transcript',
      };
    }

    // Calculate overall metrics
    const totalQuestions = qaPairs.length;
    const questionsWithFeedback = qaPairs.filter((qa: any) => qa.feedback).length;
    const questionsWithScoring = qaPairs.filter((qa: any) => qa.scoring).length;

    // Calculate average scores if available
    let avgScore = 0;
    let technicalScore = 0;
    let communicationScore = 0;
    let behavioralScore = 0;

    if (questionsWithScoring > 0) {
      const scores = qaPairs
        .filter((qa: any) => qa.scoring)
        .map((qa: any) => {
          const s = qa.scoring;
          return {
            overall: s.overallScore || s.overall || 0,
            technical: (s.accuracyScore || 0) + (s.ideasScore || 0),
            communication: (s.voiceScore || 0) + (s.grammarScore || 0),
            behavioral: (s.organizationScore || 0),
          };
        });

      if (scores.length > 0) {
        avgScore = scores.reduce((sum: number, s: any) => sum + s.overall, 0) / scores.length;
        technicalScore = scores.reduce((sum: number, s: any) => sum + s.technical, 0) / scores.length;
        communicationScore = scores.reduce((sum: number, s: any) => sum + s.communication, 0) / scores.length;
        behavioralScore = scores.reduce((sum: number, s: any) => sum + s.behavioral, 0) / scores.length;
      }
    }

    // Analyze response quality
    const avgAnswerLength = qaPairs.reduce((sum: number, qa: any) => {
      return sum + (qa.answer?.length || 0);
    }, 0) / totalQuestions;

    // Identify strengths and weaknesses
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    if (avgScore >= 70) {
      strengths.push('Strong overall performance');
    } else if (avgScore < 50) {
      weaknesses.push('Below average performance');
    }

    if (technicalScore >= 70) {
      strengths.push('Good technical knowledge');
    } else if (technicalScore < 50) {
      weaknesses.push('Technical knowledge needs improvement');
    }

    if (communicationScore >= 70) {
      strengths.push('Clear communication');
    } else if (communicationScore < 50) {
      weaknesses.push('Communication skills need improvement');
    }

    if (avgAnswerLength >= 100) {
      strengths.push('Detailed responses');
    } else if (avgAnswerLength < 50) {
      weaknesses.push('Brief responses - more detail needed');
    }

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (technicalScore < 60) {
      recommendations.push('Consider additional technical training or practice');
    }
    
    if (communicationScore < 60) {
      recommendations.push('Focus on improving clarity and articulation');
    }
    
    if (avgAnswerLength < 50) {
      recommendations.push('Provide more detailed responses in interviews');
    }

    // Determine overall status
    let status = 'pending';
    if (avgScore >= 70) {
      status = 'shortlisted';
    } else if (avgScore >= 50) {
      status = 'pending';
    } else {
      status = 'rejected';
    }

    return {
      metrics: {
        totalQuestions,
        questionsWithFeedback,
        questionsWithScoring,
        avgScore: Math.round(avgScore),
        technicalScore: Math.round(technicalScore),
        communicationScore: Math.round(communicationScore),
        behavioralScore: Math.round(behavioralScore),
        avgAnswerLength: Math.round(avgAnswerLength),
      },
      strengths,
      weaknesses,
      recommendations,
      status,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Get analysis summary for all analyzed transcripts
   */
  async getAnalysisSummary(): Promise<any> {
    const analyzed = await Transcript.find({ analyzed: true })
      .sort({ analyzed_at: -1 })
      .limit(100);

    if (analyzed.length === 0) {
      return {
        total: 0,
        averageScore: 0,
        shortlisted: 0,
        pending: 0,
        rejected: 0,
      };
    }

    const scores = analyzed
      .map((t: any) => t.analysis_results?.metrics?.avgScore || 0)
      .filter((s: number) => s > 0);

    const statuses = analyzed.map((t: any) => t.analysis_results?.status || 'pending');

    return {
      total: analyzed.length,
      averageScore: scores.length > 0 
        ? Math.round(scores.reduce((sum: number, s: number) => sum + s, 0) / scores.length)
        : 0,
      shortlisted: statuses.filter((s: string) => s === 'shortlisted').length,
      pending: statuses.filter((s: string) => s === 'pending').length,
      rejected: statuses.filter((s: string) => s === 'rejected').length,
    };
  }
}

export const transcriptAnalyzer = new TranscriptAnalyzer();

