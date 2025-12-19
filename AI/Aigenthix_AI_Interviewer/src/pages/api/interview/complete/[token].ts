import { NextApiRequest, NextApiResponse } from 'next';
import { getInterviewSessionByToken, updateInterviewSession } from '@/lib/postgres-data-store';
import { aiReportGenerator } from '@/lib/ai-report-generator-mongodb';
import { connectMongo } from '@/lib/mongodb';
import { InterviewSession as MongoInterviewSession } from '@/lib/models';
import { Transcript } from '@/lib/models/Transcript';
import { CandidateSummary } from '@/lib/models/CandidateSummary';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { token } = req.query;
    const { resultsJson, report, interviewData } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Token is required' 
      });
    }

    const session = await getInterviewSessionByToken(token);
    
    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'Invalid interview token' 
      });
    }

    if (session.status === 'completed') {
      return res.status(400).json({ 
        success: false, 
        error: 'Interview session has already been completed' 
      });
    }

    const endTime = new Date().toISOString();

    // Extract interviewData from multiple possible locations
    let actualInterviewData = interviewData || [];
    if (!actualInterviewData || actualInterviewData.length === 0) {
      // Try to get from resultsJson.interviewData
      if (resultsJson && resultsJson.interviewData && Array.isArray(resultsJson.interviewData)) {
        actualInterviewData = resultsJson.interviewData;
      }
      // Try to get from report.interviewData
      else if (report && report.interviewData && Array.isArray(report.interviewData)) {
        actualInterviewData = report.interviewData;
      }
    }

    console.log(`[Complete Interview] Saving interview data for session ${session.id}:`, {
      interviewDataParam: !!interviewData,
      interviewDataLength: Array.isArray(interviewData) ? interviewData.length : 'not array',
      resultsJsonInterviewData: !!resultsJson?.interviewData,
      resultsJsonInterviewDataLength: Array.isArray(resultsJson?.interviewData) ? resultsJson.interviewData.length : 'not array',
      actualInterviewDataLength: Array.isArray(actualInterviewData) ? actualInterviewData.length : 'not array',
      hasQuestions: actualInterviewData.length > 0 && actualInterviewData[0]?.question ? 'yes' : 'no'
    });

    // Extract proctoring event info if provided (from proctor guard)
    const proctorEvent = req.body.proctorEvent;
    const completionReason = proctorEvent 
      ? `proctor_${proctorEvent.event}_${proctorEvent.reason}` 
      : 'normal_completion';

    // Log completion event (including proctoring events if any)
    console.log('[Interview Complete]', {
      sessionId: session.id,
      token,
      status: 'completed',
      completionReason,
      interviewDataCount: actualInterviewData?.length || 0,
      proctorEvent: proctorEvent || null,
    });

    // Update PostgreSQL session to completed with results
    await updateInterviewSession(session.id, {
      status: 'completed',
      completed_at: endTime,
      results_json: {
        ...(session.results_json || {}),
        finalReport: report || resultsJson || null,
        completedAt: endTime,
        interviewData: actualInterviewData,
        completionReason, // Log how the interview was completed
        proctorEvent: proctorEvent || null, // Include proctoring event if applicable
      }
    });

    // Store complete interview data in MongoDB
    const connected = await connectMongo();
    if (connected) {
      try {
        const interviewDataArray = interviewData || resultsJson?.interviewData || [];
        
        console.log(`📝 Saving completed interview data for token ${token}:`, {
          interviewDataCount: interviewDataArray?.length || 0,
          hasQuestions: interviewDataArray?.some((qa: any) => qa.question) || false,
          hasAnswers: interviewDataArray?.some((qa: any) => qa.answer) || false,
          hasInterviewDataParam: !!interviewData,
          hasResultsJsonData: !!resultsJson?.interviewData
        });
        
        const savedDoc = await MongoInterviewSession.findOneAndUpdate(
          { token },
          {
            $set: {
              token,
              candidate: {
                name: `${session.first_name || ''} ${session.last_name || ''}`.trim() || 'Unknown',
                email: session.email || '',
                phone: '',
              },
              exam: session.exam_name || '',
              subcategory: session.subcategory_name || '',
              resumeText: '',
              questionsGenerated: [],
              interviewData: interviewDataArray,
              questionsAndAnswers: interviewDataArray.map((qa: any) => ({
                question: qa.question || '',
                answer: qa.answer || '',
                isRealQuestion: qa.isRealQuestion !== false,
                responseType: qa.responseType || 'typed', // Track whether response was spoken, typed, or mixed
                attempts: qa.attempts || 1,
                hintsGiven: qa.hintsGiven || [],
                isCorrect: qa.isCorrect,
                questionCategory: qa.questionCategory,
                isCurrentAffairs: qa.isCurrentAffairs || false,
                currentAffairsTopic: qa.currentAffairsTopic,
                currentAffairsCategory: qa.currentAffairsCategory,
                referenceQuestionIds: qa.referenceQuestionIds || [],
                feedback: qa.feedback || {},
                scoring: qa.scoring || {},
                timestamp: qa.timestamp ? new Date(qa.timestamp) : new Date(),
              })),
              resultsJson: {
                finalReport: report || resultsJson || null,
                completedAt: endTime,
                interviewData: interviewDataArray, // Ensure interview data is in resultsJson too
              },
              status: 'completed',
              startedAt: session.started_at ? new Date(session.started_at) : new Date(),
              completedAt: new Date(endTime),
              expiresAt: session.expires_at ? new Date(session.expires_at) : null,
            }
          },
          { upsert: true, new: true }
        );
        
        console.log('✅ Interview data saved to MongoDB for token:', token, {
          interviewDataCount: interviewDataArray.length,
          questionsAndAnswersCount: savedDoc?.questionsAndAnswers?.length || 0,
          status: savedDoc?.status
        });

        // Also save to Transcript collection for the transcripts API
        try {
          // Transform interviewDataArray into Transcript qa format
          const qaItems = interviewDataArray
            .filter((qa: any) => qa.question && qa.answer) // Only include items with both question and answer
            .map((qa: any, idx: number) => {
              // Extract feedback as string
              let feedbackText = '';
              if (typeof qa.feedback === 'string') {
                feedbackText = qa.feedback;
              } else if (qa.feedback && typeof qa.feedback === 'object') {
                // Combine feedback fields into readable format
                const feedbackParts = [];
                if (qa.feedback.contentFeedback) feedbackParts.push(`Content: ${qa.feedback.contentFeedback}`);
                if (qa.feedback.clarityFeedback) feedbackParts.push(`Clarity: ${qa.feedback.clarityFeedback}`);
                if (qa.feedback.toneFeedback) feedbackParts.push(`Tone: ${qa.feedback.toneFeedback}`);
                if (qa.feedback.visualFeedback) feedbackParts.push(`Visual: ${qa.feedback.visualFeedback}`);
                feedbackText = feedbackParts.join(' | ') || '';
              }

              // Extract scoring from feedback object or scoring field
              let scoring = null;
              if (qa.scoring) {
                scoring = qa.scoring;
              } else if (qa.feedback && typeof qa.feedback === 'object') {
                scoring = {
                  overallScore: qa.feedback.overallScore || qa.feedback.overall || 0,
                  ideasScore: qa.feedback.ideasScore || 0,
                  organizationScore: qa.feedback.organizationScore || 0,
                  accuracyScore: qa.feedback.accuracyScore || 0,
                  voiceScore: qa.feedback.voiceScore || 0,
                  grammarScore: qa.feedback.grammarScore || 0,
                  stopWordsScore: qa.feedback.stopWordsScore || 0,
                };
              }

              return {
                id: `qa-${session.id}-${idx}`,
                type: 'qa',
                at: qa.timestamp ? new Date(qa.timestamp) : (qa.at ? new Date(qa.at) : new Date(endTime)),
                question: qa.question || '',
                answer: qa.answer || '',
                feedback: feedbackText,
                scoring: scoring,
              };
            });

          // Determine role - prefer job_title, then exam_name/subcategory_name
          let role = 'Position';
          if (session.job_title) {
            role = session.job_title;
          } else if (session.exam_name) {
            role = session.exam_name;
            if (session.subcategory_name) {
              role += ` - ${session.subcategory_name}`;
            }
          }

          // Check if transcript already exists for this interview_id
          const existingTranscript = await Transcript.findOne({ 
            interview_id: String(session.id) 
          });

          const transcriptData = {
            candidate_id: String(session.candidate_id || 'UNKNOWN'),
            candidate_name: `${session.first_name || ''} ${session.last_name || ''}`.trim() || session.email || 'Unknown',
            candidate_email: session.email || '',
            role: role,
            interview_id: String(session.id),
            status: 'completed',
            questions_count: qaItems.length,
            qa: qaItems,
            completed_at: new Date(endTime),
          };

          if (existingTranscript) {
            // Update existing transcript
            await Transcript.findOneAndUpdate(
              { interview_id: String(session.id) },
              { $set: transcriptData },
              { new: true }
            );
            console.log('✅ Transcript updated in MongoDB for interview_id:', session.id, {
              questions_count: qaItems.length
            });
          } else {
            // Create new transcript
            const transcript = new Transcript(transcriptData);
            await transcript.save();
            console.log('✅ Transcript saved to MongoDB for interview_id:', session.id, {
              questions_count: qaItems.length
            });
          }
        } catch (transcriptError) {
          console.error('❌ Error saving Transcript to MongoDB:', transcriptError);
          // Continue even if Transcript save fails
        }

        // Save complete candidate summary to MongoDB (independent of PostgreSQL)
        try {
          // Extract scores from report/resultsJson
          const finalReport = report || resultsJson?.finalReport || resultsJson || {};
          const scores = finalReport.score || {};
          
          // Calculate duration
          let durationMin = 0;
          if (finalReport.duration && typeof finalReport.duration === 'number') {
            durationMin = Math.max(0, Math.round(finalReport.duration));
          } else if (session.started_at && endTime) {
            const ms = Math.max(0, new Date(endTime).getTime() - new Date(session.started_at).getTime());
            durationMin = Math.round(ms / 60000);
          }
          const durationStr = `${durationMin}m`;

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

          // Calculate scores - first try from report, then calculate from interviewData if needed
          let overallScore = Number(scores.overall || 0);
          let technicalScore = Number(scores.technical || 0);
          let communicationScore = Number(scores.communication || 0);
          let behavioralScore = Number(scores.behavioral || 0);
          let plagiarismScore = Number(scores.plagiarism || finalReport.plagiarism || 0);
          
          // If scores are 0, calculate from interviewDataArray
          if (overallScore === 0 && interviewDataArray && interviewDataArray.length > 0) {
            console.log('📊 Scores are 0, calculating from interviewDataArray...');
            
            const qaItemsWithScores = interviewDataArray.filter((q: any) => q.feedback || q.scoring);
            
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
                  // HR Interview Scoring
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
                } else if (firstScore.ideasScore !== undefined || firstScore.accuracyScore !== undefined) {
                  // Standard Interview Scoring
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
                } else {
                  // Old format
                  technicalScore = Math.round(allScores.reduce((sum: number, s: any) => sum + (Number(s.technical) || 0), 0) / allScores.length);
                  communicationScore = Math.round(allScores.reduce((sum: number, s: any) => sum + (Number(s.communication) || 0), 0) / allScores.length);
                  behavioralScore = Math.round(allScores.reduce((sum: number, s: any) => sum + (Number(s.behavioral) || 0), 0) / allScores.length);
                  overallScore = Math.round((technicalScore + communicationScore + behavioralScore) / 3);
                }
                
                // Convert from 1-10 scale to percentage (multiply by 10)
                if (overallScore <= 10) overallScore = overallScore * 10;
                if (technicalScore <= 10) technicalScore = technicalScore * 10;
                if (communicationScore <= 10) communicationScore = communicationScore * 10;
                if (behavioralScore <= 10) behavioralScore = behavioralScore * 10;
                
                console.log('✅ Calculated scores from interviewData:', {
                  overallScore,
                  technicalScore,
                  communicationScore,
                  behavioralScore
                });
              }
            }
          }
          
          const authenticityScore = 100 - plagiarismScore;

          // Determine status
          let candidateStatus = 'pending';
          if (overallScore >= 60) {
            candidateStatus = 'shortlisted';
          } else if (overallScore >= 50) {
            candidateStatus = 'pending';
          } else {
            candidateStatus = 'rejected';
          }
          if (plagiarismScore > 30) {
            candidateStatus = 'rejected';
          }

          // Get candidate name - use session data (stored at interview creation time)
          const candidateName = `${session.first_name || ''} ${session.last_name || ''}`.trim() || 
                               session.email?.split('@')[0] || 
                               'Unknown Candidate';

          const candidateSummaryData = {
            candidate_id: String(session.candidate_id || session.email || 'UNKNOWN'),
            interview_id: String(session.id), // Use PostgreSQL session ID (stable across environments)
            interview_token: token, // Keep for reference but not used as unique key
            name: candidateName,
            email: session.email || '',
            phone: session.phone || '',
            first_name: session.first_name || '',
            last_name: session.last_name || '',
            role: role,
            exam_name: session.exam_name || '',
            subcategory_name: session.subcategory_name || '',
            position: session.job_title || '',
            status: candidateStatus,
            overall_score: overallScore,
            technical: technicalScore,
            communication: communicationScore,
            behavioral: behavioralScore,
            plagiarism: plagiarismScore,
            authenticity: authenticityScore,
            duration: durationStr,
            questions_count: interviewDataArray.length,
            completed_at: new Date(endTime),
            started_at: session.started_at ? new Date(session.started_at) : new Date(),
            created_at: session.created_at ? new Date(session.created_at) : new Date(),
            interview_data: interviewDataArray,
            results_json: {
              finalReport: finalReport,
              completedAt: endTime,
              interviewData: interviewDataArray,
            },
          };

          // Save or update candidate summary using interview_id (stable across environments)
          const savedSummary = await CandidateSummary.findOneAndUpdate(
            { interview_id: String(session.id) },
            { $set: candidateSummaryData },
            { upsert: true, new: true }
          );

          console.log('✅ Candidate summary saved to MongoDB for token:', token, {
            candidateName,
            email: session.email,
            overallScore,
            status: candidateStatus,
            interview_id: String(session.id),
          });

          // Trigger report generation immediately after saving CandidateSummary
          // This ensures the report includes the newly completed interview data
          // Run in background to not block the response
          setImmediate(() => {
            aiReportGenerator.generateReport()
              .then(() => {
                console.log('✅ Report generated successfully for completed interview');
              })
              .catch((e) => {
                console.warn('Background report generation failed:', e);
              });
          });
        } catch (summaryError) {
          console.error('❌ Error saving CandidateSummary to MongoDB:', summaryError);
          // Continue even if CandidateSummary save fails
        }
      } catch (mongoError) {
        console.error('❌ Error saving to MongoDB:', mongoError);
        // Continue even if MongoDB save fails
      }
    }

    const updatedSession = await getInterviewSessionByToken(token);
    res.status(200).json({ 
      success: true, 
      message: 'Interview session completed successfully',
      redirectUrl: '/thank-you', // Redirect to thank you page instead of summary
      session: updatedSession
    });

  } catch (error) {
    console.error('Complete interview error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}

