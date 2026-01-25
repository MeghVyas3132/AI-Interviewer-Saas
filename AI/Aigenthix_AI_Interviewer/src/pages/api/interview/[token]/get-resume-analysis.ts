import { NextApiRequest, NextApiResponse } from 'next';
import { getInterviewSessionByToken, getResumeById } from '@/lib/postgres-data-store';
import { connectMongo } from '@/lib/mongodb';
import { ResumeAnalysis } from '@/lib/models';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: 'Interview token is required' });
    }

    // Check cache for resume analysis
    const cacheKey = `resume_analysis_${token}`;
    let resumeAnalysis = null;
    let comprehensiveResumeText = '';
    let extractedText = '';
    
    if (typeof global !== 'undefined' && global.resumeAnalysisCache) {
      const cached = global.resumeAnalysisCache.get(cacheKey);
      if (cached) {
        resumeAnalysis = cached.analysis;
        comprehensiveResumeText = cached.comprehensiveResumeText || '';
        extractedText = cached.extractedText || '';
      }
    }

    // If not in cache, check MongoDB
    if (!resumeAnalysis) {
      try {
        const mongoConnected = await connectMongo();
        if (mongoConnected) {
          const mongoAnalysis = await ResumeAnalysis.findOne({ interviewToken: token });
          if (mongoAnalysis) {
            console.log('Retrieved resume analysis from MongoDB for token:', token);
            
            // Reconstruct the analysis object from MongoDB document
            resumeAnalysis = {
              isResume: mongoAnalysis.analysis?.isResume ?? true,
              candidateName: mongoAnalysis.analysis?.candidateName || mongoAnalysis.candidateName || '',
              skills: mongoAnalysis.analysis?.skills || [],
              experienceSummary: mongoAnalysis.analysis?.experienceSummary || '',
              comprehensiveSummary: mongoAnalysis.analysis?.comprehensiveSummary || '',
              atsScore: mongoAnalysis.analysis?.atsScore,
              sectionRatings: mongoAnalysis.analysis?.sectionRatings || {},
              feedback: mongoAnalysis.analysis?.feedback || {},
              strengths: mongoAnalysis.analysis?.strengths || [],
              areasForImprovement: mongoAnalysis.analysis?.areasForImprovement || [],
              structuredData: mongoAnalysis.structuredData || {},
            };
            
            comprehensiveResumeText = mongoAnalysis.comprehensiveResumeText || '';
            extractedText = mongoAnalysis.extractedText || '';
            
            // Also populate cache for faster future access
            if (typeof global !== 'undefined') {
              if (!global.resumeAnalysisCache) {
                global.resumeAnalysisCache = new Map();
              }
              global.resumeAnalysisCache.set(cacheKey, {
                analysis: resumeAnalysis,
                comprehensiveResumeText: comprehensiveResumeText,
                extractedText: extractedText,
                uploadedAt: mongoAnalysis.uploadedAt?.toISOString() || new Date().toISOString()
              });
            }
          }
        }
      } catch (mongoError) {
        console.error('Error retrieving resume analysis from MongoDB:', mongoError);
        // Continue to check other sources
      }
    }

    // If still not found, check session resume_id (PostgreSQL)
    if (!resumeAnalysis) {
      const session = await getInterviewSessionByToken(token);
      if (session?.resume_id) {
        try {
          const resume = await getResumeById(session.resume_id);
          
          if (resume) {
            extractedText = resume.extracted_text || '';
            const parsedData = resume.parsed_data;
            
            if (parsedData) {
              resumeAnalysis = {
                candidateName: parsedData.candidateName || '',
                skills: parsedData.skills || [],
                experienceSummary: parsedData.experienceSummary || parsedData.comprehensiveSummary || '',
                comprehensiveSummary: parsedData.comprehensiveSummary || '',
                strengths: parsedData.strengths || [],
                areasForImprovement: parsedData.areasForImprovement || [],
                structuredData: parsedData.structuredData || parsedData
              };

              // Build comprehensive resume text
              const structuredDataObj = parsedData.structuredData || parsedData;
              const parts: string[] = [];
              
              if (structuredDataObj.professionalSummary) {
                parts.push(`Professional Summary: ${structuredDataObj.professionalSummary}`);
              }
              
              if (structuredDataObj.workExperience && structuredDataObj.workExperience.length > 0) {
                parts.push('\nWork Experience:');
                structuredDataObj.workExperience.forEach((exp: any) => {
                  parts.push(`${exp.role} at ${exp.company} (${exp.duration})`);
                  if (exp.description) parts.push(`  ${exp.description}`);
                  if (exp.highlights && exp.highlights.length > 0) {
                    exp.highlights.forEach((h: string) => parts.push(`  - ${h}`));
                  }
                });
              }
              
              if (structuredDataObj.education && structuredDataObj.education.length > 0) {
                parts.push('\nEducation:');
                structuredDataObj.education.forEach((edu: any) => {
                  parts.push(`${edu.degree} from ${edu.institution}${edu.year ? ` (${edu.year})` : ''}${edu.field ? `, ${edu.field}` : ''}`);
                });
              }
              
              if (parsedData.skills && parsedData.skills.length > 0) {
                parts.push(`\nSkills: ${parsedData.skills.join(', ')}`);
              } else if (structuredDataObj.skills && structuredDataObj.skills.length > 0) {
                parts.push(`\nSkills: ${structuredDataObj.skills.join(', ')}`);
              }
              
              if (structuredDataObj.certifications && structuredDataObj.certifications.length > 0) {
                parts.push(`\nCertifications: ${structuredDataObj.certifications.join(', ')}`);
              }
              
              if (parsedData.comprehensiveSummary) {
                parts.push(`\nSummary: ${parsedData.comprehensiveSummary}`);
              } else if (parsedData.experienceSummary) {
                parts.push(`\nExperience Summary: ${parsedData.experienceSummary}`);
              }
              
              comprehensiveResumeText = parts.join('\n');
            } else {
              comprehensiveResumeText = extractedText;
            }
          }
        } catch (err) {
          console.error('Error fetching resume from session:', err);
        }
      }
    }

    if (!resumeAnalysis) {
      return res.status(404).json({ 
        success: false, 
        error: 'No resume analysis found for this interview session' 
      });
    }

    res.status(200).json({
      success: true,
      data: {
        analysis: resumeAnalysis,
        comprehensiveResumeText: comprehensiveResumeText,
        extractedText: extractedText
      }
    });

  } catch (error) {
    console.error('Get resume analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get resume analysis',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

