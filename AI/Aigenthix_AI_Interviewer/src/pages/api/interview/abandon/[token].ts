import { NextApiRequest, NextApiResponse } from 'next';
import { getInterviewSessionByToken, updateInterviewSession } from '@/lib/postgres-data-store';
import { connectMongo } from '@/lib/mongodb';
import { InterviewSession as MongoInterviewSession } from '@/lib/models';
import { aiReportGenerator } from '@/lib/ai-report-generator-mongodb';
import { CandidateSummary } from '@/lib/models/CandidateSummary';
import { Transcript } from '@/lib/models/Transcript';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { token } = req.query;
    const { interviewData } = req.body; // Get partial interview data if available

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
        error: 'Cannot abandon a completed interview session' 
      });
    }

    const abandonTime = new Date().toISOString();

    // Ensure we capture all interview data including feedback and scoring
    const fullInterviewData = interviewData || session.results_json?.interviewData || [];
    
    console.log(`📝 Saving abandoned interview data for token ${token}:`, {
      interviewDataCount: fullInterviewData?.length || 0,
      hasQuestions: fullInterviewData?.some((qa: any) => qa.question) || false,
      hasAnswers: fullInterviewData?.some((qa: any) => qa.answer) || false,
      interviewDataItems: fullInterviewData?.map((qa: any, idx: number) => ({
        index: idx,
        hasQuestion: !!qa.question,
        hasAnswer: !!qa.answer,
        questionPreview: qa.question?.substring(0, 50),
        answerPreview: qa.answer?.substring(0, 50),
        hasFeedback: !!qa.feedback,
        overallScore: qa.feedback?.overallScore
      })) || [],
      rawBodyData: req.body?.interviewData?.length || 0
    });
    
    // Update PostgreSQL session to abandoned with all captured data
    await updateInterviewSession(session.id, {
      status: 'abandoned',
      results_json: {
        ...(session.results_json || {}),
        abandonedAt: abandonTime,
        interviewData: fullInterviewData, // Save all Q&A data
        isPartial: true,
        // Ensure we have all question-answer pairs with their feedback
        questionsAndAnswers: fullInterviewData.map((qa: any) => ({
          question: qa.question || '',
          answer: qa.answer || '',
          feedback: qa.feedback || {},
          scoring: qa.scoring || {},
          isRealQuestion: qa.isRealQuestion !== false,
          attempts: qa.attempts || 1,
          hintsGiven: qa.hintsGiven || [],
          isCorrect: qa.isCorrect,
          questionCategory: qa.questionCategory,
          timestamp: qa.timestamp || new Date().toISOString()
        }))
      }
    });

    // Store partial interview data in MongoDB with all feedback and scoring
    const connected = await connectMongo();
    if (connected) {
      try {
        const interviewDataArray = fullInterviewData || [];
        
        // Ensure we have valid interview data before saving
        if (!interviewDataArray || interviewDataArray.length === 0) {
          console.warn(`⚠️ No interview data to save for token ${token}. interviewDataArray is empty.`);
        }
        
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
                abandonedAt: abandonTime,
                isPartial: true,
                interviewData: interviewDataArray, // Ensure interview data is in resultsJson too
              },
              status: 'abandoned',
              startedAt: session.started_at ? new Date(session.started_at) : new Date(),
              abandonedAt: new Date(abandonTime),
              expiresAt: session.expires_at ? new Date(session.expires_at) : null,
            }
          },
          { upsert: true, new: true }
        );
        
        console.log('✅ Partial interview data saved to MongoDB for token:', token, {
          interviewDataCount: interviewDataArray.length,
          questionsAndAnswersCount: savedDoc?.questionsAndAnswers?.length || 0,
          status: savedDoc?.status
        });

        // Also save to Transcript collection for the transcripts API (even for abandoned interviews)
        // This ensures transcripts appear in reports even when interview was ended due to tab switching
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
                at: qa.timestamp ? new Date(qa.timestamp) : (qa.at ? new Date(qa.at) : new Date(abandonTime)),
                question: qa.question || '',
                answer: qa.answer || '',
                feedback: feedbackText,
                scoring: scoring,
              };
            });

          // Only create transcript if we have Q&A items
          if (qaItems.length > 0) {
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
              status: 'abandoned', // Mark as abandoned but still create transcript
              questions_count: qaItems.length,
              qa: qaItems,
              completed_at: new Date(abandonTime),
            };

            if (existingTranscript) {
              // Update existing transcript
              await Transcript.findOneAndUpdate(
                { interview_id: String(session.id) },
                { $set: transcriptData },
                { new: true }
              );
              console.log('✅ Transcript updated in MongoDB for abandoned interview_id:', session.id, {
                questions_count: qaItems.length,
                status: 'abandoned'
              });
            } else {
              // Create new transcript
              const transcript = new Transcript(transcriptData);
              await transcript.save();
              console.log('✅ Transcript saved to MongoDB for abandoned interview_id:', session.id, {
                questions_count: qaItems.length,
                status: 'abandoned'
              });
            }
          } else {
            console.log('⚠️ No Q&A items to create transcript for abandoned interview_id:', session.id);
          }
        } catch (transcriptError) {
          console.error('❌ Error saving Transcript to MongoDB for abandoned interview:', transcriptError);
          // Continue even if Transcript save fails
        }

        // Save complete candidate summary to MongoDB (independent of PostgreSQL)
        try {
          // Calculate scores from interview data if available
          const qaItemsWithScores = interviewDataArray.filter((qa: any) => qa.feedback || qa.scoring);
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
          }

          // Calculate duration
          let durationMin = 0;
          if (session.started_at && abandonTime) {
            const ms = Math.max(0, new Date(abandonTime).getTime() - new Date(session.started_at).getTime());
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
            status: 'abandoned',
            overall_score: overallScore,
            technical: technicalScore,
            communication: communicationScore,
            behavioral: behavioralScore,
            plagiarism: 0,
            authenticity: 100,
            duration: durationStr,
            questions_count: interviewDataArray.length,
            completed_at: new Date(abandonTime),
            started_at: session.started_at ? new Date(session.started_at) : new Date(),
            created_at: session.created_at ? new Date(session.created_at) : new Date(),
            interview_data: interviewDataArray,
            results_json: {
              abandonedAt: abandonTime,
              isPartial: true,
              interviewData: interviewDataArray,
            },
          };

          // Save or update candidate summary using interview_id (stable across environments)
          await CandidateSummary.findOneAndUpdate(
            { interview_id: String(session.id) },
            { $set: candidateSummaryData },
            { upsert: true, new: true }
          );

          console.log('✅ Candidate summary saved to MongoDB for abandoned interview token:', token, {
            candidateName,
            email: session.email,
            overallScore,
            status: 'abandoned',
          });
        } catch (summaryError) {
          console.error('❌ Error saving CandidateSummary to MongoDB:', summaryError);
          // Continue even if CandidateSummary save fails
        }
        
        // Trigger report generation after a short delay to ensure MongoDB has fully persisted
        // This ensures the report includes the newly saved interview data
        setTimeout(() => {
          aiReportGenerator.generateReport()
            .then(() => {
              console.log('✅ Report generated successfully for abandoned interview');
            })
            .catch((e) => {
              console.warn('Background report generation for abandoned interview failed:', e);
            });
        }, 2000); // Wait 2 seconds for MongoDB to fully persist
      } catch (mongoError) {
        console.error('❌ Error saving abandoned interview to MongoDB:', mongoError);
        // Continue even if MongoDB save fails
      }
    }

    const updatedSession = await getInterviewSessionByToken(token);
    res.status(200).json({ 
      success: true, 
      message: 'Interview session marked as abandoned',
      redirectUrl: '/thank-you', // Redirect to thank-you page for email-based interviews
      session: updatedSession
    });

  } catch (error) {
    console.error('Abandon interview error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}

