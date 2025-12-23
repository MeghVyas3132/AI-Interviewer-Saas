import { connectMongo } from './mongodb';
import { Report, InterviewSession } from './models';
import { CandidateSummary as CandidateSummaryModel } from './models/CandidateSummary';
import { getInterviewSessions } from './postgres-data-store';
import { calculatePlagiarismScore } from './plagiarism-detector';

// Types for report data
export interface CandidateSummary {
  candidate_id: string;
  name: string;
  email?: string;
  role: string;
  status: string;
  overall_score: number;
  technical: number;
  communication: number;
  behavioral: number;
  plagiarism?: number;
  authenticity?: number;
  duration: string;
  timestamp?: string;
}

export interface ReportSummary {
  total_candidates: number;
  average_score: string;
  shortlisted: number;
  avg_duration: string;
  high_performers: number;
  needs_review: number;
  pending: number;
}

export interface AIReportOutput {
  summary: ReportSummary;
  candidates: CandidateSummary[];
}

/**
 * AI Analysis Engine for Candidate Reports (MongoDB Version)
 */
export class AIReportGeneratorMongoDB {
  private async fetchAllInterviewsFromPostgres(): Promise<any[]> {
    try {
      // Fetch all interview sessions with JOINs to get candidate and exam data
      // Similar to transcripts API but without limit
      const { query } = await import('@/lib/postgres');
      const sessionsResult = await query(`
        SELECT iss.*, 
               c.first_name, c.last_name, c.email,
               e.name as exam_name,
               s.name as subcategory_name,
               jp.title as job_title
        FROM interview_sessions iss
        LEFT JOIN candidates c ON iss.candidate_id = c.candidate_id
        LEFT JOIN exams e ON iss.exam_id = e.id
        LEFT JOIN subcategories s ON iss.subcategory_id = s.id
        LEFT JOIN job_positions jp ON iss.job_role_id = jp.position_id
        WHERE (iss.status = 'completed' OR iss.status = 'abandoned') 
          AND iss.is_active = true
        ORDER BY iss.completed_at DESC NULLS LAST, iss.created_at DESC
      `);
      
      const allSessions = sessionsResult.rows;
      
      // Parse results_json if it's a string (PostgreSQL JSONB fields might be returned as strings)
      const sessionsWithParsedJson = allSessions.map((s: any) => {
        if (s.results_json && typeof s.results_json === 'string') {
          try {
            s.results_json = JSON.parse(s.results_json);
          } catch (e) {
            console.warn(`⚠️ Failed to parse results_json for session ${s.id}:`, e);
          }
        }
        return s;
      });
      
      // Filter for sessions with data or that were started
      const filteredSessions = sessionsWithParsedJson.filter((s: any) => {
        const hasData = s.results_json && (
          s.results_json.finalReport || 
          (s.results_json.interviewData && Array.isArray(s.results_json.interviewData) && s.results_json.interviewData.length > 0)
        );
        const hasStarted = s.started_at;
        
        // Include if has data OR was started
        return hasData || hasStarted;
      });
      
      // Log sample session to debug field extraction
      if (filteredSessions.length > 0) {
        const sample = filteredSessions[0];
        console.log(`📋 Sample session data:`, {
          id: sample.id,
          candidate_id: sample.candidate_id,
          first_name: sample.first_name,
          last_name: sample.last_name,
          email: sample.email,
          job_title: sample.job_title,
          exam_name: sample.exam_name,
          subcategory_name: sample.subcategory_name,
          started_at: sample.started_at,
          completed_at: sample.completed_at,
          hasResultsJson: !!sample.results_json
        });
      }
      
      console.log(`📊 PostgreSQL query: Found ${allSessions.length} total completed/abandoned sessions, ${filteredSessions.length} have data or were started`);
      
      return filteredSessions;
    } catch (error) {
      console.error('Error fetching interviews from PostgreSQL:', error);
      return [];
    }
  }

  /**
   * Backfill CandidateSummary collection from existing PostgreSQL/MongoDB sessions
   * This ensures data persists even if candidates are deleted from admin
   */
  private async backfillCandidateSummaries(): Promise<void> {
    try {
      console.log('🔄 Starting backfill of CandidateSummary collection...');
      
      // Fetch interviews from both PostgreSQL and MongoDB
      const [postgresSessions, mongoSessions] = await Promise.all([
        this.fetchAllInterviewsFromPostgres(),
        this.fetchAllInterviewsFromMongoDB()
      ]);
      
      // Merge sessions, prioritizing MongoDB data (more complete)
      const sessionMap = new Map();
      
      // First add PostgreSQL sessions
      postgresSessions.forEach((s: any) => {
        const token = s.token || s.id?.toString();
        if (token) sessionMap.set(token, s);
      });
      
      // Then add/update with MongoDB sessions (they have more complete data)
      mongoSessions.forEach((s: any) => {
        const token = s.token;
        if (token) sessionMap.set(token, s);
      });
      
      const sessions = Array.from(sessionMap.values());
      console.log(`📊 Found ${sessions.length} sessions to backfill`);
      
      // Extract candidate data and save to CandidateSummary
      let savedCount = 0;
      for (const session of sessions) {
        try {
          const candidateData = this.extractCandidateData(session);
          if (!candidateData) {
            console.log(`⏭️ Skipping session ${session.token} - no candidate data extracted`);
            continue;
          }
          
          // Get interview_id (stable across environments) for upsert
          const interviewId = String(session.id);
          if (!interviewId || interviewId === 'undefined') {
            console.warn(`⚠️ Session has no id, skipping:`, session);
            continue;
          }
          
          // Build candidate summary document
          const candidateSummaryData = {
            candidate_id: String(candidateData.candidate_id || 'UNKNOWN'),
            interview_id: interviewId, // Use PostgreSQL session ID (stable across environments)
            interview_token: session.token || '', // Keep for reference
            name: candidateData.name || 'Unknown Candidate',
            email: candidateData.email || '',
            first_name: session.first_name || '',
            last_name: session.last_name || '',
            role: candidateData.role || 'Position',
            exam_name: session.exam_name || '',
            subcategory_name: session.subcategory_name || '',
            position: session.job_title || '',
            status: candidateData.status || 'pending',
            overall_score: candidateData.overall_score || 0,
            technical: candidateData.technical || 0,
            communication: candidateData.communication || 0,
            behavioral: candidateData.behavioral || 0,
            plagiarism: candidateData.plagiarism || 0,
            authenticity: candidateData.authenticity || 100,
            duration: candidateData.duration || '0m',
            completed_at: session.completed_at ? new Date(session.completed_at) : new Date(),
            started_at: session.started_at ? new Date(session.started_at) : undefined,
            created_at: session.created_at ? new Date(session.created_at) : new Date(),
          };
          
          // Save or update candidate summary using interview_id (stable across environments)
          try {
            // Try using interview_id as the query field
            await CandidateSummaryModel.findOneAndUpdate(
              { interview_id: interviewId },
              { $set: candidateSummaryData },
              { 
                upsert: true, 
                new: true,
                runValidators: true,
                setDefaultsOnInsert: true
              }
            );
            savedCount++;
          } catch (updateError: any) {
            // If interview_id is not recognized in schema (caching issue), try using interview_token as fallback
            if (updateError?.name === 'StrictModeError' && updateError?.path === 'interview_id') {
              console.warn(`⚠️ interview_id not recognized in schema for session ${session.token}, trying fallback with interview_token`);
              try {
                await CandidateSummaryModel.findOneAndUpdate(
                  { interview_token: session.token },
                  { $set: { ...candidateSummaryData, interview_id: interviewId } },
                  { 
                    upsert: true, 
                    new: true,
                    runValidators: false, // Disable validators for fallback
                    setDefaultsOnInsert: true
                  }
                );
                savedCount++;
              } catch (fallbackError) {
                console.error(`❌ Fallback update also failed for session ${session.token}:`, fallbackError);
                throw updateError; // Throw original error
              }
            } else {
              throw updateError;
            }
          }
        } catch (error) {
          console.error(`❌ Error backfilling candidate summary for session ${session.token}:`, error);
        }
      }
      
      console.log(`✅ Backfilled ${savedCount} candidate summaries to MongoDB`);
    } catch (error) {
      console.error('❌ Error during backfill:', error);
      throw error;
    }
  }

  private async fetchAllInterviewsFromMongoDB(): Promise<any[]> {
    try {
      const connected = await connectMongo();
      if (!connected) {
        return [];
      }

      // Fetch all interview sessions from MongoDB (completed and abandoned)
      // Use a more lenient query to catch all sessions with status
      const sessions = await InterviewSession.find({
        status: { $in: ['completed', 'abandoned'] }
      }).lean();
      
      // Filter to include sessions with data OR that were started
      // This ensures we capture all interviews even if no questions were answered
      // For reports, we want to include ALL abandoned/completed sessions regardless of data
      // This allows the report to show even sessions that were abandoned early
      const sessionsWithData = sessions.filter((s: any) => {
        const hasQuestionsAndAnswers = s.questionsAndAnswers && Array.isArray(s.questionsAndAnswers) && s.questionsAndAnswers.length > 0;
        const hasInterviewData = s.interviewData && Array.isArray(s.interviewData) && s.interviewData.length > 0;
        const hasResultsJsonData = s.resultsJson?.interviewData && Array.isArray(s.resultsJson.interviewData) && s.resultsJson.interviewData.length > 0;
        const wasStarted = s.startedAt || s.started_at;
        const hasCandidateInfo = s.candidate && (s.candidate.name || s.candidate.email);
        
        // Include if has data OR was started OR has candidate info (for abandoned sessions)
        // This ensures we show all interviews in reports, even if they were abandoned before questions
        const shouldInclude = hasQuestionsAndAnswers || hasInterviewData || hasResultsJsonData || wasStarted || hasCandidateInfo;
        
        if (!shouldInclude) {
          console.log(`⚠️ MongoDB session ${s.token} filtered out - no data, not started, no candidate info`);
        }
        
        return shouldInclude;
      });
      
      console.log(`📊 MongoDB query: Found ${sessions.length} sessions with status completed/abandoned, ${sessionsWithData.length} will be processed`);
      
      // Log details about each session
      sessionsWithData.forEach((s: any) => {
        console.log(`📋 MongoDB session ${s.token}:`, {
          status: s.status,
          hasInterviewData: !!(s.interviewData?.length),
          hasQuestionsAndAnswers: !!(s.questionsAndAnswers?.length),
          hasResultsJsonData: !!(s.resultsJson?.interviewData?.length),
          wasStarted: !!(s.startedAt || s.started_at),
          candidateEmail: s.candidate?.email || 'none'
        });
      });

      return sessionsWithData.map((session: any) => {
        // Use interviewData from multiple possible locations
        const interviewData = session.interviewData || 
                            session.resultsJson?.interviewData || 
                            session.questionsAndAnswers || 
                            [];
        
        console.log(`📋 Processing MongoDB session ${session.token}:`, {
          status: session.status,
          interviewDataCount: interviewData.length,
          questionsAndAnswersCount: session.questionsAndAnswers?.length || 0,
          hasResultsJson: !!session.resultsJson
        });
        
        return {
          ...session,
          // Convert MongoDB format to match PostgreSQL format for compatibility
          candidate_id: session.candidate?.email || 'unknown',
          email: session.candidate?.email,
          first_name: session.candidate?.name?.split(' ')[0] || '',
          last_name: session.candidate?.name?.split(' ').slice(1).join(' ') || '',
          exam_name: session.exam,
          subcategory_name: session.subcategory,
          created_at: session.createdAt,
          completed_at: session.completedAt || session.abandonedAt,
          results_json: {
            finalReport: session.resultsJson?.finalReport,
            interviewData: interviewData, // Use consolidated interview data
            isPartial: session.status === 'abandoned',
            ...session.resultsJson
          }
        };
      });
    } catch (error) {
      console.error('Error fetching interviews from MongoDB:', error);
      return [];
    }
  }

  private extractCandidateData(session: any): Partial<CandidateSummary> | null {
    const { candidate_id, email, first_name, last_name, exam_name, subcategory_name, job_title, results_json, created_at, started_at, completed_at, status } = session;
    
    // Handle partial interviews (abandoned)
    const isPartial = status === 'abandoned' || results_json?.isPartial;
    const interviewData = results_json?.interviewData || results_json?.finalReport?.questions || [];
    
    console.log(`🔍 Extracting candidate data for session:`, {
      token: session.token,
      status,
      isPartial,
      interviewDataCount: interviewData?.length || 0,
      hasResultsJson: !!results_json,
      hasFinalReport: !!results_json?.finalReport
    });
    
    // For token-based interviews (email links), process ANY interview with data OR that was started
    // This ensures partial interviews with even 1 question get analyzed and shown in reports
    const hasInterviewData = interviewData && interviewData.length > 0;
    const hasAnyData = hasInterviewData || results_json?.finalReport;
    const wasStarted = session.started_at || session.startedAt;
    const hasCandidateInfo = (first_name || last_name || email);
    
    // Skip only if there's truly no data at all AND not started AND no candidate info
    // This ensures we show all interviews in reports, even if abandoned early
    if (!hasAnyData && !wasStarted && !hasCandidateInfo) {
      console.log(`⏭️ Skipping session ${session.token} - no data, not started, no candidate info`);
      return null;
    }
    
    // If we have candidate info but no interview data, still process it (show as abandoned/0 score)
    if (!hasAnyData && !wasStarted && hasCandidateInfo) {
      console.log(`⚠️ Processing session ${session.token} with candidate info but no interview data`);
    }
    
    // For token-based interviews, always process if there's any interview data OR session was started
    // No minimum question requirement - even 1 question should generate analysis
    if (hasInterviewData) {
      console.log(`✅ Processing ${isPartial ? 'partial' : 'completed'} session ${session.token} with ${interviewData.length} question(s)`);
    } else if (wasStarted) {
      console.log(`⚠️ Processing ${isPartial ? 'partial' : 'completed'} session ${session.token} - was started but no interview data yet`);
    }

    // Fix null reference error - check if results_json exists before accessing finalReport
    const report = (results_json && results_json.finalReport) ? results_json.finalReport : {};
    
    // Build candidate name from first_name and last_name, with fallbacks
    let candidateName = 'Unknown Candidate';
    if (first_name || last_name) {
      candidateName = `${first_name || ''} ${last_name || ''}`.trim();
    } else if (email) {
      // Extract name from email if available
      const emailName = email.split('@')[0];
      // Capitalize first letter
      candidateName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
    }
    
    console.log(`👤 Candidate name extraction:`, {
      first_name,
      last_name,
      email,
      candidateName
    });
    
    // For partial interviews, calculate scores from interviewData
    // Include ALL answered questions, even if they don't have feedback yet (for very early abandons)
    // For token-based interviews, we want to analyze whatever data is available
    const qaItems = isPartial 
      ? interviewData.filter((q: any) => q.answer && (q.feedback || q.scoring || q.question))
      : (report.questions || interviewData || []).filter((q: any) => q.answer && (q.scoring || q.feedback || q.question));
    
    // Extract scores from report (if available)
    const scores = report.score || {};
    let overallScore = Number(scores.overall || 0);
    let technicalScore = Number(scores.technical || 0);
    let communicationScore = Number(scores.communication || 0);
    let behavioralScore = Number(scores.behavioral || 0);
    let plagiarismScore = Number(scores.plagiarism || report.plagiarism || 0);

    // If no scores from report, calculate from QA items
    // For token-based interviews, calculate scores even with just 1 question
    if (overallScore === 0 && qaItems.length > 0) {
        // For partial interviews, use feedback directly
        const allScores = qaItems.map((q: any) => {
          if (q.scoring) {
            // Include all scoring fields, including HR-specific ones
            return {
              ...q.scoring,
              // Also check for HR scores in nested structures
              isHRInterview: q.scoring.isHRInterview,
              languageFlowScore: q.scoring.languageFlowScore,
              languageLevelScore: q.scoring.languageLevelScore,
              confidenceScoreHR: q.scoring.confidenceScoreHR,
              communicationClarityScore: q.scoring.communicationClarityScore,
              grammarScoreHR: q.scoring.grammarScoreHR,
              pronunciationScore: q.scoring.pronunciationScore,
              fluencyScoreHR: q.scoring.fluencyScoreHR,
              vocabularyScore: q.scoring.vocabularyScore,
              toneScoreHR: q.scoring.toneScoreHR,
              impactOfNativeLanguageScore: q.scoring.impactOfNativeLanguageScore,
              gesturesScore: q.scoring.gesturesScore,
              resumeScore: q.scoring.resumeScore,
              dressingScore: q.scoring.dressingScore,
              bodyLanguageScoreHR: q.scoring.bodyLanguageScoreHR,
              flowOfThoughtsScore: q.scoring.flowOfThoughtsScore,
            };
          }
          if (q.feedback) {
            // Convert feedback format to scoring format
            return {
              ideasScore: q.feedback.ideasScore || 0,
              organizationScore: q.feedback.organizationScore || 0,
              accuracyScore: q.feedback.accuracyScore || 0,
              voiceScore: q.feedback.voiceScore || 0,
              grammarScore: q.feedback.grammarScore || 0,
              stopWordsScore: q.feedback.stopWordsScore || 0,
              overallScore: q.feedback.overallScore || 0,
            };
          }
          // Try to extract score from score field if it exists as a string like "6/10"
          if (q.score) {
            const scoreMatch = String(q.score).match(/(\d+(?:\.\d+)?)\/10/);
            if (scoreMatch) {
              return {
                overallScore: parseFloat(scoreMatch[1]),
              };
            }
          }
          return null;
        }).filter(Boolean);
        
        if (allScores.length > 0) {
          const firstScore = allScores[0];
          
          // Check if this is an HR interview (has HR-specific scores)
          const isHRInterview = firstScore.isHRInterview === true || 
                                firstScore.languageFlowScore !== undefined || 
                                firstScore.communicationClarityScore !== undefined ||
                                (exam_name && exam_name.toLowerCase() === 'interview' && subcategory_name && subcategory_name.toLowerCase() === 'hr');
          
          if (isHRInterview) {
            // HR Interview Scoring System
            // Calculate Communication from: Communication Clarity, Grammar, Pronunciation, Fluency, Vocabulary, Tone
            communicationScore = Math.round(allScores.reduce((sum: number, s: any) => {
              const clarity = Number(s.communicationClarityScore || 0);
              const grammar = Number(s.grammarScoreHR || s.grammarScore || 0);
              const pronunciation = Number(s.pronunciationScore || 0);
              const fluency = Number(s.fluencyScoreHR || 0);
              const vocabulary = Number(s.vocabularyScore || 0);
              const tone = Number(s.toneScoreHR || 0);
              const avg = (clarity + grammar + pronunciation + fluency + vocabulary + tone) / 6;
              return sum + avg;
            }, 0) / allScores.length);
            
            // Calculate Behavioral from: Language Flow, Language Level, Confidence, Flow of Thoughts, Gestures
            behavioralScore = Math.round(allScores.reduce((sum: number, s: any) => {
              const flow = Number(s.languageFlowScore || 0);
              const level = Number(s.languageLevelScore || 0);
              const confidence = Number(s.confidenceScoreHR || s.confidenceScore || 0);
              const thoughts = Number(s.flowOfThoughtsScore || 0);
              const gestures = Number(s.gesturesScore || 0);
              const avg = (flow + level + confidence + thoughts + gestures) / 5;
              return sum + avg;
            }, 0) / allScores.length);
            
            // For HR interviews, Technical score is based on: Resume alignment, Impact of Native Language, Body Language, Dressing
            technicalScore = Math.round(allScores.reduce((sum: number, s: any) => {
              const resume = Number(s.resumeScore || 0);
              const nativeLang = Number(s.impactOfNativeLanguageScore || 0);
              const bodyLang = Number(s.bodyLanguageScoreHR || s.bodyLanguageScore || 0);
              const dressing = Number(s.dressingScore || 0);
              // Average of available scores (resume might not always be available)
              const scores = [resume, nativeLang, bodyLang, dressing].filter(s => s > 0);
              const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
              return sum + avg;
            }, 0) / allScores.length);
            
            // Overall score: average of all HR criteria or use provided overallScore
            const avgOverall = allScores.reduce((sum: number, s: any) => sum + Number(s.overallScore || 0), 0) / allScores.length;
            if (avgOverall > 0) {
              overallScore = Math.round(avgOverall);
            } else {
              // Calculate from HR criteria if overallScore not provided
              const hrCriteriaCount = allScores.reduce((count: number, s: any) => {
                const criteria = [
                  s.languageFlowScore, s.languageLevelScore, s.confidenceScoreHR || s.confidenceScore,
                  s.communicationClarityScore, s.grammarScoreHR || s.grammarScore, s.pronunciationScore,
                  s.fluencyScoreHR, s.vocabularyScore, s.toneScoreHR, s.impactOfNativeLanguageScore,
                  s.gesturesScore, s.resumeScore, s.dressingScore, s.bodyLanguageScoreHR || s.bodyLanguageScore,
                  s.flowOfThoughtsScore
                ].filter(score => score !== undefined && score > 0).length;
                return count + criteria;
              }, 0);
              
              if (hrCriteriaCount > 0) {
                const totalHRScore = allScores.reduce((sum: number, s: any) => {
                  const criteria = [
                    s.languageFlowScore || 0, s.languageLevelScore || 0, s.confidenceScoreHR || s.confidenceScore || 0,
                    s.communicationClarityScore || 0, s.grammarScoreHR || s.grammarScore || 0, s.pronunciationScore || 0,
                    s.fluencyScoreHR || 0, s.vocabularyScore || 0, s.toneScoreHR || 0, s.impactOfNativeLanguageScore || 0,
                    s.gesturesScore || 0, s.resumeScore || 0, s.dressingScore || 0, s.bodyLanguageScoreHR || s.bodyLanguageScore || 0,
                    s.flowOfThoughtsScore || 0
                  ].filter(score => score > 0);
                  return sum + (criteria.length > 0 ? criteria.reduce((a, b) => a + b, 0) / criteria.length : 0);
                }, 0);
                overallScore = Math.round(totalHRScore / allScores.length);
              } else {
                overallScore = Math.round((technicalScore + communicationScore + behavioralScore) / 3);
              }
            }
            
            console.log(`📊 Calculated HR interview scores from ${allScores.length} question(s): Overall=${overallScore}, Technical=${technicalScore}, Communication=${communicationScore}, Behavioral=${behavioralScore}`);
          } else if (firstScore.ideasScore !== undefined || firstScore.accuracyScore !== undefined) {
            // Standard Interview Scoring System
            // Works correctly even with just 1 score (allScores.length = 1)
            technicalScore = Math.round(allScores.reduce((sum: number, s: any) => {
              const acc = Number(s.accuracyScore || 0);
              const ideas = Number(s.ideasScore || 0);
              return sum + ((acc + ideas) / 2);
            }, 0) / allScores.length);
            
            communicationScore = Math.round(allScores.reduce((sum: number, s: any) => {
              const voice = Number(s.voiceScore || 0);
              const grammar = Number(s.grammarScore || 0);
              return sum + ((voice + grammar) / 2);
            }, 0) / allScores.length);
            
            behavioralScore = Math.round(allScores.reduce((sum: number, s: any) => {
              const org = Number(s.organizationScore || 0);
              const stopWords = Number(s.stopWordsScore || 0);
              return sum + ((org + stopWords) / 2);
            }, 0) / allScores.length);
            
            const avgOverall = allScores.reduce((sum: number, s: any) => sum + Number(s.overallScore || 0), 0) / allScores.length;
            overallScore = avgOverall > 0 ? Math.round(avgOverall) : Math.round((technicalScore + communicationScore + behavioralScore) / 3);
            
            console.log(`📊 Calculated scores from ${allScores.length} question(s): Overall=${overallScore}, Technical=${technicalScore}, Communication=${communicationScore}, Behavioral=${behavioralScore}`);
          } else {
            // Old format: direct technical, communication, behavioral fields
            technicalScore = Math.round(allScores.reduce((sum: number, s: any) => sum + (Number(s.technical) || 0), 0) / allScores.length);
            communicationScore = Math.round(allScores.reduce((sum: number, s: any) => sum + (Number(s.communication) || 0), 0) / allScores.length);
            behavioralScore = Math.round(allScores.reduce((sum: number, s: any) => sum + (Number(s.behavioral) || 0), 0) / allScores.length);
            overallScore = Math.round((technicalScore + communicationScore + behavioralScore) / 3);
          }
        } else {
          // If we have interview data but no scores yet, OR no interview data at all
          // Set default scores to 0 - this allows the interview to still appear in reports
          const dataCount = interviewData?.length || 0;
          if (dataCount > 0) {
            console.log(`⚠️ Session ${session.token} has ${dataCount} question(s) but no scores yet - using default scores`);
          } else {
            console.log(`⚠️ Session ${session.token} has no interview data - using default scores (0)`);
          }
          overallScore = 0;
          technicalScore = 0;
          communicationScore = 0;
          behavioralScore = 0;
        }
      }

    // Calculate plagiarism if not already present
    if (plagiarismScore === 0) {
      const qaItemsForPlagiarism = isPartial 
        ? interviewData.filter((q: any) => q.answer)
        : (report.questions || []).filter((q: any) => q.answer);
      
      if (qaItemsForPlagiarism.length > 0) {
        const answers = qaItemsForPlagiarism.map((q: any) => ({ answer: q.answer, question: q.question }));
        const plagiarismResult = calculatePlagiarismScore(answers);
        plagiarismScore = plagiarismResult.overallPlagiarism;
      }
    }

    // Calculate duration - use started_at to completed_at for actual interview duration
    let durationMin = 0;
    if (report.duration && typeof report.duration === 'number') {
      durationMin = Math.max(0, Math.round(report.duration));
    } else if (started_at && completed_at) {
      // Use started_at to completed_at for actual interview duration
      const startTime = new Date(started_at).getTime();
      const endTime = new Date(completed_at).getTime();
      const ms = Math.max(0, endTime - startTime);
      durationMin = Math.round(ms / 60000);
    } else if (created_at && completed_at) {
      // Fallback to created_at if started_at is not available
      const startTime = new Date(created_at).getTime();
      const endTime = new Date(completed_at).getTime();
      const ms = Math.max(0, endTime - startTime);
      durationMin = Math.round(ms / 60000);
    }
    const durationStr = `${durationMin}m`;

    console.log(`⏱️ Duration calculation:`, {
      started_at,
      completed_at,
      created_at,
      reportDuration: report.duration,
      durationMin,
      durationStr
    });

    // Extract job role - prioritize job_title from JOIN, then exam_name + subcategory_name
    let jobRole = 'Position';
    if (job_title) {
      jobRole = job_title;
    } else if (exam_name) {
      jobRole = `${exam_name}${subcategory_name ? ` - ${subcategory_name}` : ''}`;
    }
    
    console.log(`💼 Role extraction:`, {
      job_title,
      exam_name,
      subcategory_name,
      jobRole
    });

    const timestamp = completed_at || created_at || new Date().toISOString();
    const authenticityScore = 100 - plagiarismScore;

    // Helper function to get minimum questions based on exam type
    const getMinQuestionsForExam = (jobRole: string, company?: string, subcategoryName?: string): number => {
      if (!jobRole) return 8; // Default
      const role = jobRole.toLowerCase();
      // HR interviews require 10 questions (1 resume-based + 1 technical resume + 8 general HR)
      if (role === 'hr' || (role === 'interview' && (company?.toLowerCase() === 'hr' || subcategoryName?.toLowerCase() === 'hr'))) {
        return 10;
      }
      if (role.includes('neet')) return 8;
      if (role.includes('jee')) return 9;
      if (role.includes('cat') || role.includes('mba')) return 7;
      return 8; // Default for other exams
    };

    // Count real questions answered (questions marked as real questions)
    const realQuestionsAnswered = qaItems.filter((q: any) => q.isRealQuestion !== false).length;
    
    // Get minimum questions required from exam config or calculate from job role
    let minQuestionsRequired = 8; // Default
    if (results_json?.examConfig?.numQuestions && results_json.examConfig.numQuestions > 0) {
      minQuestionsRequired = results_json.examConfig.numQuestions;
    } else if (jobRole) {
      minQuestionsRequired = getMinQuestionsForExam(jobRole, job_title, subcategory_name);
    }
    
    // Check if interview is incomplete (didn't answer minimum questions)
    const isIncomplete = realQuestionsAnswered < minQuestionsRequired;
    
    // Determine candidate status
    // Mark as rejected if: abandoned OR incomplete (didn't finish full interview)
    let candidateStatus: string;
    if (status === 'abandoned') {
      // Abandoned interviews are always rejected
      candidateStatus = 'rejected';
    } else if (isIncomplete) {
      // Incomplete interviews (didn't answer minimum questions) are rejected
      candidateStatus = 'rejected';
    } else if (overallScore >= 60) {
      candidateStatus = 'shortlisted';
    } else if (overallScore >= 50) {
      candidateStatus = 'pending';
    } else {
      candidateStatus = 'rejected';
    }
    
    // Override: High plagiarism always rejected
    if (plagiarismScore > 30) {
      candidateStatus = 'rejected';
    }
    
    // Log status determination for debugging
    console.log(`📊 Status determination for session ${session.token}:`, {
      status,
      isIncomplete,
      realQuestionsAnswered,
      minQuestionsRequired,
      overallScore,
      plagiarismScore,
      candidateStatus
    });

    // Convert scores to percentages (multiply by 10 since they're on 1-10 scale)
    // But only if they're not already percentages (scores > 10 are likely already percentages)
    const convertToPercentage = (score: number): number => {
      if (score > 10) return score; // Already a percentage
      return score * 10; // Convert from 1-10 scale to percentage
    };

    return {
      candidate_id: String(candidate_id || 'UNKNOWN'),
      name: candidateName,
      email: email,
      role: jobRole,
      status: candidateStatus,
      overall_score: convertToPercentage(overallScore),
      overall: convertToPercentage(overallScore), // Also set overall for backward compatibility
      technical: convertToPercentage(technicalScore),
      communication: convertToPercentage(communicationScore),
      behavioral: convertToPercentage(behavioralScore),
      plagiarism: plagiarismScore,
      authenticity: authenticityScore,
      duration: durationStr,
      timestamp
    };
  }

  private calculateMetrics(candidates: CandidateSummary[]): ReportSummary {
    if (candidates.length === 0) {
      return {
        total_candidates: 0,
        average_score: '0%',
        shortlisted: 0,
        avg_duration: '0m',
        high_performers: 0,
        needs_review: 0,
        pending: 0
      };
    }

    // Calculate averages
    const totalScore = candidates.reduce((sum, c) => sum + c.overall_score, 0);
    const avgScore = Math.round(totalScore / candidates.length);

    // Parse and sum durations
    const durations = candidates.map(c => {
      const match = c.duration.match(/(\d+)m/);
      return match ? parseInt(match[1]) : 0;
    });
    const avgDuration = durations.length > 0 
      ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)
      : 0;

    // Counts
    const shortlisted = candidates.filter(c => c.status === 'shortlisted').length;
    const high_performers = candidates.filter(c => c.overall_score >= 80).length;
    // Needs review: low scores that aren't rejected (rejected includes abandoned and incomplete interviews)
    const needs_review = candidates.filter(c => c.overall_score < 50 && c.status !== 'rejected' && c.status !== 'abandoned').length;
    const pending = candidates.filter(c => c.status === 'pending').length;

    return {
      total_candidates: candidates.length,
      average_score: `${avgScore}%`,
      shortlisted,
      avg_duration: `${avgDuration}m`,
      high_performers,
      needs_review,
      pending
    };
  }

  /**
   * Generate candidate summaries from the same source as transcripts (PostgreSQL + MongoDB)
   * This ensures consistency with the Interview Transcripts section
   */
  private async generateCandidateSummariesFromTranscriptSource(): Promise<CandidateSummary[]> {
    console.log('🔄 Generating candidate summaries from transcript source (PostgreSQL + MongoDB)...');
    
    const allCandidates: CandidateSummary[] = [];
    
    // 1. Fetch from MongoDB Transcript collection (same as transcripts API)
    try {
      const connected = await connectMongo();
      if (connected) {
        const { Transcript } = await import('./models/Transcript');
        const mongoTranscripts = await Transcript.find({})
          .sort({ completed_at: -1, createdAt: -1 })
          .lean();
        
        console.log(`📊 Fetched ${mongoTranscripts.length} transcripts from MongoDB`);
        
        for (const transcript of mongoTranscripts) {
          // Extract scores from Q&A items
          const qaItems = transcript.qa || [];
          const qaItemsWithScores = qaItems.filter((q: any) => q.feedback || q.scoring);
          
          let overallScore = 0;
          let technicalScore = 0;
          let communicationScore = 0;
          let behavioralScore = 0;
          
          if (qaItemsWithScores.length > 0) {
            const allScores = qaItemsWithScores.map((q: any) => {
              if (q.scoring) return q.scoring;
              if (q.feedback && typeof q.feedback === 'object') {
                return {
                  ideasScore: q.feedback.ideasScore || 0,
                  organizationScore: q.feedback.organizationScore || 0,
                  accuracyScore: q.feedback.accuracyScore || 0,
                  voiceScore: q.feedback.voiceScore || 0,
                  grammarScore: q.feedback.grammarScore || 0,
                  stopWordsScore: q.feedback.stopWordsScore || 0,
                  overallScore: q.feedback.overallScore || 0,
                };
              }
              return null;
            }).filter(Boolean);
            
            if (allScores.length > 0) {
              const firstScore = allScores[0];
              const isHRInterview = firstScore.isHRInterview === true || 
                                    firstScore.languageFlowScore !== undefined || 
                                    firstScore.communicationClarityScore !== undefined;
              
              if (isHRInterview) {
                communicationScore = Math.round(allScores.reduce((sum: number, s: any) => {
                  const clarity = Number(s.communicationClarityScore || 0);
                  const grammar = Number(s.grammarScoreHR || s.grammarScore || 0);
                  const pronunciation = Number(s.pronunciationScore || 0);
                  const fluency = Number(s.fluencyScoreHR || 0);
                  const vocabulary = Number(s.vocabularyScore || 0);
                  const tone = Number(s.toneScoreHR || 0);
                  const avg = (clarity + grammar + pronunciation + fluency + vocabulary + tone) / 6;
                  return sum + avg;
                }, 0) / allScores.length);
                
                behavioralScore = Math.round(allScores.reduce((sum: number, s: any) => {
                  const flow = Number(s.languageFlowScore || 0);
                  const level = Number(s.languageLevelScore || 0);
                  const confidence = Number(s.confidenceScoreHR || s.confidenceScore || 0);
                  const thoughts = Number(s.flowOfThoughtsScore || 0);
                  const gestures = Number(s.gesturesScore || 0);
                  const avg = (flow + level + confidence + thoughts + gestures) / 5;
                  return sum + avg;
                }, 0) / allScores.length);
                
                technicalScore = Math.round(allScores.reduce((sum: number, s: any) => {
                  const resume = Number(s.resumeScore || 0);
                  const nativeLang = Number(s.impactOfNativeLanguageScore || 0);
                  const bodyLang = Number(s.bodyLanguageScoreHR || s.bodyLanguageScore || 0);
                  const dressing = Number(s.dressingScore || 0);
                  const scores = [resume, nativeLang, bodyLang, dressing].filter(s => s > 0);
                  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
                  return sum + avg;
                }, 0) / allScores.length);
                
                const avgOverall = allScores.reduce((sum: number, s: any) => sum + Number(s.overallScore || 0), 0) / allScores.length;
                overallScore = avgOverall > 0 ? Math.round(avgOverall) : Math.round((technicalScore + communicationScore + behavioralScore) / 3);
              } else {
                technicalScore = Math.round(allScores.reduce((sum: number, s: any) => {
                  const acc = Number(s.accuracyScore || 0);
                  const ideas = Number(s.ideasScore || 0);
                  return sum + ((acc + ideas) / 2);
                }, 0) / allScores.length);
                
                communicationScore = Math.round(allScores.reduce((sum: number, s: any) => {
                  const voice = Number(s.voiceScore || 0);
                  const grammar = Number(s.grammarScore || 0);
                  return sum + ((voice + grammar) / 2);
                }, 0) / allScores.length);
                
                behavioralScore = Math.round(allScores.reduce((sum: number, s: any) => {
                  const org = Number(s.organizationScore || 0);
                  const stopWords = Number(s.stopWordsScore || 0);
                  return sum + ((org + stopWords) / 2);
                }, 0) / allScores.length);
                
                const avgOverall = allScores.reduce((sum: number, s: any) => sum + Number(s.overallScore || 0), 0) / allScores.length;
                overallScore = avgOverall > 0 ? Math.round(avgOverall) : Math.round((technicalScore + communicationScore + behavioralScore) / 3);
              }
              
              // Convert to percentage
              if (overallScore <= 10) overallScore = overallScore * 10;
              if (technicalScore <= 10) technicalScore = technicalScore * 10;
              if (communicationScore <= 10) communicationScore = communicationScore * 10;
              if (behavioralScore <= 10) behavioralScore = behavioralScore * 10;
            }
          }
          
          // Calculate duration
          let duration = '0m';
          if (transcript.completed_at) {
            const completed = new Date(transcript.completed_at);
            const created = transcript.createdAt ? new Date(transcript.createdAt) : completed;
            const ms = Math.max(0, completed.getTime() - created.getTime());
            const minutes = Math.round(ms / 60000);
            duration = `${minutes}m`;
          }
          
          // Helper function to get minimum questions based on exam type
          const getMinQuestionsForExam = (jobRole: string, company?: string, subcategoryName?: string): number => {
            if (!jobRole) return 8; // Default
            const role = jobRole.toLowerCase();
            // HR interviews require 10 questions (1 resume-based + 1 technical resume + 8 general HR)
            if (role === 'hr' || (role === 'interview' && (company?.toLowerCase() === 'hr' || subcategoryName?.toLowerCase() === 'hr'))) {
              return 10;
            }
            if (role.includes('neet')) return 8;
            if (role.includes('jee')) return 9;
            if (role.includes('cat') || role.includes('mba')) return 7;
            return 8; // Default for other exams
          };

          // Count real questions answered
          const realQuestionsAnswered = qaItems.filter((q: any) => q.isRealQuestion !== false).length;
          
          // Get minimum questions required
          const jobRole = transcript.role || 'Position';
          const company = transcript.position || undefined;
          const subcategoryName = transcript.subcategory_name || undefined;
          let minQuestionsRequired = getMinQuestionsForExam(jobRole, company, subcategoryName);
          
          // Check if interview is incomplete or abandoned
          const isIncomplete = realQuestionsAnswered < minQuestionsRequired;
          const isAbandoned = transcript.status === 'abandoned';
          
          // Calculate plagiarism/authenticity from answers
          const plagiarismInput = qaItems
            .filter((q: any) => typeof q.answer === 'string' && q.answer.trim().length > 0)
            .map((q: any) => ({ answer: q.answer, question: q.question }));
          
          let plagiarismScore = 0;
          let authenticityScore = 100;
          if (plagiarismInput.length > 0) {
            const plagiarismResult = calculatePlagiarismScore(plagiarismInput);
            plagiarismScore = plagiarismResult.overallPlagiarism;
            authenticityScore = plagiarismResult.authenticityScore;
          }
          
          // Determine status
          // Mark as rejected if: abandoned OR incomplete (didn't finish full interview)
          let status = 'pending';
          if (isAbandoned || isIncomplete) {
            status = 'rejected';
          } else if (overallScore >= 60) {
            status = 'shortlisted';
          } else if (overallScore >= 50) {
            status = 'pending';
          } else {
            status = 'rejected';
          }
          
          allCandidates.push({
            candidate_id: String(transcript.candidate_id || 'UNKNOWN'),
            name: transcript.candidate_name || 'Unknown',
            email: transcript.candidate_email || '',
            role: transcript.role || 'Position',
            status,
            overall_score: overallScore,
            technical: technicalScore,
            communication: communicationScore,
            behavioral: behavioralScore,
            plagiarism: plagiarismScore,
            authenticity: authenticityScore,
            duration,
            timestamp: transcript.completed_at || new Date().toISOString(),
          });
        }
      }
    } catch (mongoError) {
      console.error('❌ Error fetching from MongoDB Transcripts:', mongoError);
    }
    
    // 2. Fetch from PostgreSQL (same query as transcripts API)
    try {
      const { query } = await import('@/lib/postgres');
      const sessionsResult = await query(`
        SELECT iss.*, 
               c.first_name, c.last_name, c.email,
               e.name as exam_name,
               s.name as subcategory_name,
               jp.title as job_title
        FROM interview_sessions iss
        LEFT JOIN candidates c ON iss.candidate_id = c.candidate_id
        LEFT JOIN exams e ON iss.exam_id = e.id
        LEFT JOIN subcategories s ON iss.subcategory_id = s.id
        LEFT JOIN job_positions jp ON iss.job_role_id = jp.position_id
        WHERE (iss.status = 'completed' OR iss.status = 'abandoned') 
          AND iss.is_active = true 
          AND iss.results_json IS NOT NULL
          AND (
            iss.results_json->>'interviewData' IS NOT NULL 
            OR iss.results_json->'interviewData' IS NOT NULL
          )
        ORDER BY 
          COALESCE(iss.completed_at, iss.updated_at, iss.created_at) DESC NULLS LAST
      `, []);
      
      const completedSessions = sessionsResult.rows;
      console.log(`📊 Fetched ${completedSessions.length} completed sessions from PostgreSQL`);
      
        for (const session of completedSessions) {
        // Skip if we already have this interview_id from MongoDB
        const existingIndex = allCandidates.findIndex(c => 
          c.candidate_id === String(session.candidate_id) && 
          (c as any).interview_id === String(session.id)
        );
        if (existingIndex >= 0) continue; // Prefer MongoDB data
        
        const resultsJson = session.results_json || {};
        let interviewData = [];
        
        // Extract interview data (same logic as transcripts API - check all possible locations)
        // 1. Try interviewData array first (primary source)
        if (Array.isArray(resultsJson.interviewData) && resultsJson.interviewData.length > 0) {
          interviewData = resultsJson.interviewData;
        }
        // 2. Try resultsJson.interviewData (nested in resultsJson from old format)
        else if (resultsJson.resultsJson && Array.isArray(resultsJson.resultsJson.interviewData) && resultsJson.resultsJson.interviewData.length > 0) {
          interviewData = resultsJson.resultsJson.interviewData;
        }
        // 3. Try finalReport.questions
        else if (resultsJson.finalReport && Array.isArray(resultsJson.finalReport.questions) && resultsJson.finalReport.questions.length > 0) {
          interviewData = resultsJson.finalReport.questions;
        }
        // 4. Try finalReport.interviewData
        else if (resultsJson.finalReport && Array.isArray(resultsJson.finalReport.interviewData) && resultsJson.finalReport.interviewData.length > 0) {
          interviewData = resultsJson.finalReport.interviewData;
        }
        // 5. Try finalReport.resultsJson.interviewData (nested structure)
        else if (resultsJson.finalReport && resultsJson.finalReport.resultsJson && Array.isArray(resultsJson.finalReport.resultsJson.interviewData) && resultsJson.finalReport.resultsJson.interviewData.length > 0) {
          interviewData = resultsJson.finalReport.resultsJson.interviewData;
        }
        // 6. Try resultsJson directly (if it's an array)
        else if (Array.isArray(resultsJson) && resultsJson.length > 0) {
          interviewData = resultsJson;
        }
        
        if (interviewData.length === 0) continue; // Skip if no interview data
        
        // Extract scores (same logic as before)
        const qaItemsWithScores = interviewData.filter((q: any) => q.feedback || q.scoring);
        
        let overallScore = 0;
        let technicalScore = 0;
        let communicationScore = 0;
        let behavioralScore = 0;
        
        if (qaItemsWithScores.length > 0) {
          const allScores = qaItemsWithScores.map((q: any) => {
            if (q.scoring) return q.scoring;
            if (q.feedback && typeof q.feedback === 'object') {
              return {
                ideasScore: q.feedback.ideasScore || 0,
                organizationScore: q.feedback.organizationScore || 0,
                accuracyScore: q.feedback.accuracyScore || 0,
                voiceScore: q.feedback.voiceScore || 0,
                grammarScore: q.feedback.grammarScore || 0,
                stopWordsScore: q.feedback.stopWordsScore || 0,
                overallScore: q.feedback.overallScore || 0,
              };
            }
            return null;
          }).filter(Boolean);
          
          if (allScores.length > 0) {
            const firstScore = allScores[0];
            const isHRInterview = firstScore.isHRInterview === true || 
                                  firstScore.languageFlowScore !== undefined || 
                                  firstScore.communicationClarityScore !== undefined ||
                                  (session.exam_name && session.exam_name.toLowerCase() === 'interview' && 
                                   session.subcategory_name && session.subcategory_name.toLowerCase() === 'hr');
            
            if (isHRInterview) {
              communicationScore = Math.round(allScores.reduce((sum: number, s: any) => {
                const clarity = Number(s.communicationClarityScore || 0);
                const grammar = Number(s.grammarScoreHR || s.grammarScore || 0);
                const pronunciation = Number(s.pronunciationScore || 0);
                const fluency = Number(s.fluencyScoreHR || 0);
                const vocabulary = Number(s.vocabularyScore || 0);
                const tone = Number(s.toneScoreHR || 0);
                const avg = (clarity + grammar + pronunciation + fluency + vocabulary + tone) / 6;
                return sum + avg;
              }, 0) / allScores.length);
              
              behavioralScore = Math.round(allScores.reduce((sum: number, s: any) => {
                const flow = Number(s.languageFlowScore || 0);
                const level = Number(s.languageLevelScore || 0);
                const confidence = Number(s.confidenceScoreHR || s.confidenceScore || 0);
                const thoughts = Number(s.flowOfThoughtsScore || 0);
                const gestures = Number(s.gesturesScore || 0);
                const avg = (flow + level + confidence + thoughts + gestures) / 5;
                return sum + avg;
              }, 0) / allScores.length);
              
              technicalScore = Math.round(allScores.reduce((sum: number, s: any) => {
                const resume = Number(s.resumeScore || 0);
                const nativeLang = Number(s.impactOfNativeLanguageScore || 0);
                const bodyLang = Number(s.bodyLanguageScoreHR || s.bodyLanguageScore || 0);
                const dressing = Number(s.dressingScore || 0);
                const scores = [resume, nativeLang, bodyLang, dressing].filter(s => s > 0);
                const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
                return sum + avg;
              }, 0) / allScores.length);
              
              const avgOverall = allScores.reduce((sum: number, s: any) => sum + Number(s.overallScore || 0), 0) / allScores.length;
              overallScore = avgOverall > 0 ? Math.round(avgOverall) : Math.round((technicalScore + communicationScore + behavioralScore) / 3);
            } else {
              technicalScore = Math.round(allScores.reduce((sum: number, s: any) => {
                const acc = Number(s.accuracyScore || 0);
                const ideas = Number(s.ideasScore || 0);
                return sum + ((acc + ideas) / 2);
              }, 0) / allScores.length);
              
              communicationScore = Math.round(allScores.reduce((sum: number, s: any) => {
                const voice = Number(s.voiceScore || 0);
                const grammar = Number(s.grammarScore || 0);
                return sum + ((voice + grammar) / 2);
              }, 0) / allScores.length);
              
              behavioralScore = Math.round(allScores.reduce((sum: number, s: any) => {
                const org = Number(s.organizationScore || 0);
                const stopWords = Number(s.stopWordsScore || 0);
                return sum + ((org + stopWords) / 2);
              }, 0) / allScores.length);
              
              const avgOverall = allScores.reduce((sum: number, s: any) => sum + Number(s.overallScore || 0), 0) / allScores.length;
              overallScore = avgOverall > 0 ? Math.round(avgOverall) : Math.round((technicalScore + communicationScore + behavioralScore) / 3);
            }
            
            // Convert to percentage
            if (overallScore <= 10) overallScore = overallScore * 10;
            if (technicalScore <= 10) technicalScore = technicalScore * 10;
            if (communicationScore <= 10) communicationScore = communicationScore * 10;
            if (behavioralScore <= 10) behavioralScore = behavioralScore * 10;
          }
        }
        
        // Calculate duration
        let duration = '0m';
        if (session.completed_at && session.started_at) {
          const start = new Date(session.started_at);
          const end = new Date(session.completed_at);
          const ms = Math.max(0, end.getTime() - start.getTime());
          const minutes = Math.round(ms / 60000);
          duration = `${minutes}m`;
        } else if (session.completed_at && session.created_at) {
          const start = new Date(session.created_at);
          const end = new Date(session.completed_at);
          const ms = Math.max(0, end.getTime() - start.getTime());
          const minutes = Math.round(ms / 60000);
          duration = `${minutes}m`;
        }
        
        // Determine role
        let role = 'Position';
        if (session.job_title) {
          role = session.job_title;
        } else if (session.exam_name) {
          role = session.exam_name;
          if (session.subcategory_name) {
            role += ` - ${session.subcategory_name}`;
          }
        }
        
        // Helper function to get minimum questions based on exam type
        const getMinQuestionsForExam = (jobRole: string, company?: string, subcategoryName?: string): number => {
          if (!jobRole) return 8; // Default
          const role = jobRole.toLowerCase();
          // HR interviews require 10 questions (1 resume-based + 1 technical resume + 8 general HR)
          if (role === 'hr' || (role === 'interview' && (company?.toLowerCase() === 'hr' || subcategoryName?.toLowerCase() === 'hr'))) {
            return 10;
          }
          if (role.includes('neet')) return 8;
          if (role.includes('jee')) return 9;
          if (role.includes('cat') || role.includes('mba')) return 7;
          return 8; // Default for other exams
        };

        // Count real questions answered
        const realQuestionsAnswered = interviewData.filter((q: any) => q.isRealQuestion !== false).length;
        
        // Get minimum questions required from exam config or calculate from job role
        let minQuestionsRequired = 8; // Default
        if (resultsJson?.examConfig?.numQuestions && resultsJson.examConfig.numQuestions > 0) {
          minQuestionsRequired = resultsJson.examConfig.numQuestions;
        } else {
          const company = session.job_title || undefined;
          const subcategoryName = session.subcategory_name || undefined;
          minQuestionsRequired = getMinQuestionsForExam(role, company, subcategoryName);
        }
        
        // Check if interview is incomplete or abandoned
        const isIncomplete = realQuestionsAnswered < minQuestionsRequired;
        const isAbandoned = session.status === 'abandoned';
        
        // Calculate plagiarism/authenticity from answers
        const plagiarismInput = interviewData
          .filter((q: any) => typeof q.answer === 'string' && q.answer.trim().length > 0)
          .map((q: any) => ({ answer: q.answer, question: q.question }));
        
        let plagiarismScore = 0;
        let authenticityScore = 100;
        if (plagiarismInput.length > 0) {
          const plagiarismResult = calculatePlagiarismScore(plagiarismInput);
          plagiarismScore = plagiarismResult.overallPlagiarism;
          authenticityScore = plagiarismResult.authenticityScore;
        }
        
        // Determine status
        // Mark as rejected if: abandoned OR incomplete (didn't finish full interview)
        let status = 'pending';
        if (isAbandoned || isIncomplete) {
          status = 'rejected';
        } else if (overallScore >= 60) {
          status = 'shortlisted';
        } else if (overallScore >= 50) {
          status = 'pending';
        } else {
          status = 'rejected';
        }
        
        const candidateName = `${session.first_name || ''} ${session.last_name || ''}`.trim() || session.email || 'Unknown';
        
        // Determine completed_at timestamp - use completed_at for completed sessions,
        // or updated_at/abandonedAt for abandoned sessions
        let completedAt = session.completed_at;
        if (!completedAt && session.status === 'abandoned') {
          // For abandoned sessions, try to get abandonedAt from results_json, otherwise use updated_at
          if (resultsJson.abandonedAt) {
            completedAt = resultsJson.abandonedAt;
          } else {
            completedAt = session.updated_at || session.created_at;
          }
        }
        
        allCandidates.push({
          candidate_id: String(session.candidate_id || 'UNKNOWN'),
          name: candidateName,
          email: session.email || '',
          role,
          status,
          overall_score: overallScore,
          technical: technicalScore,
          communication: communicationScore,
          behavioral: behavioralScore,
          plagiarism: plagiarismScore,
          authenticity: authenticityScore,
          duration,
          timestamp: completedAt || session.updated_at || session.created_at || new Date().toISOString(),
        });
      }
    } catch (postgresError) {
      console.error('❌ Error fetching from PostgreSQL:', postgresError);
    }
    
    // Deduplicate by interview_id (prefer MongoDB data)
    const candidateMap = new Map<string, CandidateSummary>();
    for (const candidate of allCandidates) {
      const key = (candidate as any).interview_id || `${candidate.candidate_id}-${candidate.timestamp}`;
      if (!candidateMap.has(key)) {
        candidateMap.set(key, candidate);
      }
    }
    
    const finalCandidates = Array.from(candidateMap.values());
    console.log(`✅ Generated ${finalCandidates.length} candidate summaries from transcript source`);
    
    return finalCandidates;
  }

  async generateReport(): Promise<AIReportOutput> {
    console.log('🤖 Starting AI report generation using transcript source...');

    // Use the same data source as Interview Transcripts for consistency
    let candidates: CandidateSummary[] = [];
    try {
      candidates = await this.generateCandidateSummariesFromTranscriptSource();
      
      console.log(`📊 Generated ${candidates.length} candidates from transcript source`);
      console.log(`📋 Candidate details:`, {
        count: candidates.length,
        names: candidates.map(c => c.name).slice(0, 10),
        roles: candidates.map(c => c.role).slice(0, 10)
      });
    } catch (error) {
      console.error('❌ Error fetching candidate summaries from MongoDB or collection is empty:', error);
      // Fallback to PostgreSQL/MongoDB sessions when CandidateSummary is empty or doesn't exist
      console.log('⚠️ Falling back to PostgreSQL/MongoDB session method...');
      
      // Fetch interviews from both PostgreSQL and MongoDB
      const [postgresSessions, mongoSessions] = await Promise.all([
        this.fetchAllInterviewsFromPostgres(),
        this.fetchAllInterviewsFromMongoDB()
      ]);
      
      // Merge sessions, prioritizing MongoDB data (more complete)
      const sessionMap = new Map();
      
      // First add PostgreSQL sessions
      postgresSessions.forEach((s: any) => {
        const token = s.token || s.id?.toString();
        if (token) sessionMap.set(token, s);
      });
      
      // Then add/update with MongoDB sessions (they have more complete data)
      mongoSessions.forEach((s: any) => {
        const token = s.token;
        if (token) sessionMap.set(token, s);
      });
      
      const sessions = Array.from(sessionMap.values());
      console.log(`📊 Fetched ${sessions.length} interview records (${postgresSessions.length} from PostgreSQL, ${mongoSessions.length} from MongoDB)`);

      // Transform to candidate summaries
      candidates = sessions
        .map(session => {
          try {
            return this.extractCandidateData(session);
          } catch (error) {
            console.error(`❌ Error extracting candidate data for session ${session.token}:`, error);
            return null;
          }
        })
        .filter((c): c is CandidateSummary => {
          // Only filter out truly null results - allow all candidates with valid IDs
          if (c === null) return false;
          // Allow candidates even if candidate_id is 'UNKNOWN' - we'll use email/name as fallback
          return true;
        })
        .map(c => ({ ...c, name: c.name || 'Unknown', role: c.role || 'Position' }));

      console.log(`✅ Generated ${candidates.length} candidate summaries from ${sessions.length} sessions`);
    }

    // Ensure we have candidates before proceeding
    if (candidates.length === 0) {
      console.warn('⚠️ No candidates found after processing. Attempting backfill...');
      await this.backfillCandidateSummaries();
      
      // Try fetching again after backfill
      const retrySummaries = await CandidateSummaryModel.find({})
        .sort({ completed_at: -1, createdAt: -1 })
        .lean();
      
      if (retrySummaries.length > 0) {
        console.log(`✅ Found ${retrySummaries.length} candidates after backfill, reprocessing...`);
        // Reprocess with backfilled data
        candidates = retrySummaries.map((summary: any) => {
          const convertToPercentage = (score: number): number => {
            if (score > 10) return score;
            return score * 10;
          };
          
          let candidateName = summary.name || `${summary.first_name || ''} ${summary.last_name || ''}`.trim() || 'Unknown Candidate';
          let candidateRole = summary.role || summary.position || `${summary.exam_name || ''}${summary.subcategory_name ? ` - ${summary.subcategory_name}` : ''}`.trim() || 'Position';
          let candidateDuration = summary.duration || '0m';
          
          return {
            candidate_id: String(summary.candidate_id || 'UNKNOWN'),
            name: candidateName,
            email: summary.email || '',
            role: candidateRole,
            status: summary.status || 'pending',
            overall_score: convertToPercentage(Number(summary.overall_score || 0)),
            technical: convertToPercentage(Number(summary.technical || 0)),
            communication: convertToPercentage(Number(summary.communication || 0)),
            behavioral: convertToPercentage(Number(summary.behavioral || 0)),
            plagiarism: Number(summary.plagiarism || 0),
            authenticity: Number(summary.authenticity || 100),
            duration: candidateDuration,
            timestamp: summary.completed_at ? new Date(summary.completed_at).toISOString() : 
                       summary.created_at ? new Date(summary.created_at).toISOString() : 
                       new Date().toISOString(),
          };
        });
      }
    }

    console.log(`📊 Final candidate count before metrics: ${candidates.length}`);
    
    // Calculate metrics (will return zeros if no candidates)
    const summary = this.calculateMetrics(candidates);

    // Sort candidates by overall score (descending)
    const sortedCandidates = candidates.sort((a, b) => b.overall_score - a.overall_score);
    
    console.log(`📊 Report summary:`, {
      totalCandidates: summary.total_candidates,
      sortedCandidatesCount: sortedCandidates.length,
      firstFewNames: sortedCandidates.slice(0, 5).map(c => c.name)
    });

    // Generate report document to store in MongoDB
    const reportDoc = {
      type: 'summary',
      generated_at: new Date().toISOString(),
      metrics: summary,
      candidate_summaries: sortedCandidates
    };

    // Save to MongoDB
    try {
      // Ensure MongoDB connection before saving
      const connected = await connectMongo();
      if (!connected) {
        console.warn('⚠️ MongoDB not connected, skipping report save');
        throw new Error('MongoDB connection unavailable');
      }

      // Verify collections exist (they auto-create with Mongoose, but we can verify)
      const savedReport = await Report.findOneAndUpdate(
        { sessionToken: 'report_summary_latest' },
        {
          sessionToken: 'report_summary_latest',
          reportJson: reportDoc,
          candidateName: 'System Report',
          candidateEmail: 'system@reports',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );
      
      console.log('💾 Report saved to MongoDB:', {
        reportId: savedReport?._id,
        totalCandidates: reportDoc.candidate_summaries.length,
        summary: reportDoc.metrics
      });
    } catch (error) {
      console.error('❌ Error saving report to MongoDB:', error);
      // Don't throw - allow function to complete even if MongoDB save fails
    }

    return {
      summary,
      candidates: sortedCandidates
    };
  }

  async getLatestReport(forceRefresh: boolean = false): Promise<AIReportOutput | null> {
    try {
      const connected = await connectMongo();
      if (!connected) {
        console.warn('⚠️ MongoDB not available, cannot fetch cached report');
        // Return empty report structure instead of null
        return {
          summary: {
            total_candidates: 0,
            average_score: '0%',
            shortlisted: 0,
            avg_duration: '0m',
            high_performers: 0,
            needs_review: 0,
            pending: 0
          },
          candidates: []
        };
      }
      
      // If force refresh is requested, skip cache and generate new report
      if (forceRefresh) {
        console.log('🔄 Force refresh requested, generating new report...');
        const newReport = await this.generateReport();
        console.log('✅ Generated new report:', {
          totalCandidates: newReport.summary?.total_candidates || 0,
          candidatesCount: newReport.candidates?.length || 0
        });
        return newReport;
      }
      
      const report = await Report.findOne({ sessionToken: 'report_summary_latest' });
      
      if (report && report.reportJson) {
        const cachedCandidatesCount = report.reportJson.candidate_summaries?.length || 0;
        const cachedTotalCandidates = report.reportJson.metrics?.total_candidates || 0;
        
        // Check if CandidateSummary collection has more documents than cached report
        // This indicates new interviews have completed
        const actualCandidateCount = await CandidateSummaryModel.countDocuments({});
        
        console.log('📊 Checking cached report:', {
          cachedCandidatesCount,
          cachedTotalCandidates,
          actualCandidateCount,
          reportGeneratedAt: report.updatedAt || report.createdAt
        });
        
        // If cached report has 0 candidates OR actual count doesn't match, regenerate
        const shouldRegenerate = (cachedCandidatesCount === 0 && cachedTotalCandidates === 0) ||
                                 (actualCandidateCount > 0 && actualCandidateCount !== cachedCandidatesCount);
        
        if (shouldRegenerate) {
          console.log('⚠️ Cached report is stale or has 0 candidates, regenerating...', {
            reason: cachedCandidatesCount === 0 ? 'zero candidates' : 'count mismatch',
            cachedCount: cachedCandidatesCount,
            actualCount: actualCandidateCount
          });
          try {
            const newReport = await this.generateReport();
            // Only use new report if it has candidates, otherwise return cached
            if (newReport.candidates.length > 0 || newReport.summary.total_candidates > 0) {
              console.log('✅ Regenerated report with candidates:', {
                totalCandidates: newReport.summary?.total_candidates || 0,
                candidatesCount: newReport.candidates?.length || 0
              });
              return newReport;
            } else {
              console.log('⚠️ Regenerated report also has 0 candidates, returning cached');
            }
          } catch (regenerateError) {
            console.error('❌ Error regenerating report, returning cached:', regenerateError);
          }
        } else {
          console.log('📊 Returning cached report from MongoDB:', {
            totalCandidates: cachedTotalCandidates,
            candidatesCount: cachedCandidatesCount
          });
        }
        
        return {
          summary: report.reportJson.metrics || {
            total_candidates: 0,
            average_score: '0%',
            shortlisted: 0,
            avg_duration: '0m',
            high_performers: 0,
            needs_review: 0,
            pending: 0
          },
          candidates: report.reportJson.candidate_summaries || []
        };
      }
      
      // No report exists yet, generate one
      console.log('📝 No cached report found, generating new report...');
      const newReport = await this.generateReport();
      console.log('✅ Generated new report:', {
        totalCandidates: newReport.summary?.total_candidates || 0,
        candidatesCount: newReport.candidates?.length || 0
      });
      return newReport;
    } catch (error: any) {
      console.error('❌ Error fetching latest report:', error);
      // Return empty report structure instead of null to prevent frontend crashes
      return {
        summary: {
          total_candidates: 0,
          average_score: '0%',
          shortlisted: 0,
          avg_duration: '0m',
          high_performers: 0,
          needs_review: 0,
          pending: 0
        },
        candidates: []
      };
    }
  }
}

export const aiReportGenerator = new AIReportGeneratorMongoDB();

