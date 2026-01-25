'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { InterviewSession as InterviewSessionComponent } from '@/components/interview-session';
import { InterviewPrepareLink } from '@/components/interview-prepare-link';
import { saveQuestions, saveResumeAnalysis, clearAllData, endInterviewSession, saveInterviewMode, saveVideoPreference, saveExamConfig, setProctoringMode } from '@/lib/data-store';
import { analyzeResume } from '@/ai/flows/resume-analyzer';

interface InterviewSession {
  id: number;
  token: string;
  status: string;
  expires_at: string;
  candidate_id: number;
  exam_id?: number;
  subcategory_id?: number;
  job_role_id?: number;
  resume_id?: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  job_title?: string;
  exam_name?: string;
  subcategory_name?: string;
}

interface InterviewStartPageProps {
  params: Promise<{
    token: string;
  }>;
}

export default function InterviewStartPage({ params }: InterviewStartPageProps) {
  const [token, setToken] = useState<string>('');
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [resumeText, setResumeText] = useState<string>('');
  const [jobTitle, setJobTitle] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPrepared, setIsPrepared] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const hasLoadedSession = useRef(false); // Prevent multiple loadSession calls
  
  const { toast } = useToast();

  // Get token from params
  useEffect(() => {
    params.then(p => {
      setToken(p.token);
    });
  }, [params]);

  // Load session when token is available (only once)
  useEffect(() => {
    if (!token || hasLoadedSession.current) return; // Prevent multiple calls
    
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('INTERVIEW_COMPLETED');
      }
    } catch {}

    hasLoadedSession.current = true;
    loadSession();
    // Log unload/abandon events if user navigates away mid-interview
    // IMPORTANT: Only mark as abandoned if the interview has actually started (has interview data)
    // This prevents accidental abandonment when user is just navigating between pages before starting
    const handleBeforeUnload = () => {
      try {
        // If interview is already completed, don't mark as abandoned
        if (typeof window !== 'undefined' && localStorage.getItem('INTERVIEW_COMPLETED') === 'true') {
          return;
        }
        
        // Only mark as abandoned if there's actual interview data (interview has started)
        // Don't abandon if user is just navigating away before interview starts
        const savedData = localStorage.getItem('interviewData');
        const interviewData = savedData ? JSON.parse(savedData) : [];
        
        // Only abandon if there's interview data (interview has started)
        if (Array.isArray(interviewData) && interviewData.length > 0) {
          const payload = JSON.stringify({ interviewData });
          const url = `/api/interview/abandon/${token}`;
          if (navigator.sendBeacon) {
            const blob = new Blob([payload], { type: 'application/json' });
            navigator.sendBeacon(url, blob);
          } else {
            fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
          }
        }
      } catch {}
    };
    
    // Handle visibility change to save interview data when tab is switched
    // Only save if interview has actually started (has interview data)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        try {
          // Only save/abandon if there's actual interview data (interview has started)
          const savedData = localStorage.getItem('interviewData');
          if (savedData) {
            const interviewData = JSON.parse(savedData);
            // Only abandon if there's interview data (interview has started)
            if (Array.isArray(interviewData) && interviewData.length > 0) {
              const payload = JSON.stringify({ interviewData });
              const url = `/api/interview/abandon/${token}`;
              
              if (navigator.sendBeacon) {
                const blob = new Blob([payload], { type: 'application/json' });
                navigator.sendBeacon(url, blob);
              } else {
                fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: payload,
                  keepalive: true
                }).catch(() => {});
              }
            }
          }
        } catch (e) {
          console.error('Error saving interview data on visibility change:', e);
        }
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      // Cleanup on unmount
      clearAllData();
      endInterviewSession();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [token]); // Only depend on token to prevent infinite loop

  // Set proctoring mode and video preference for email-based interviews
  useEffect(() => {
    if (isPrepared && token) {
      // Set proctoring mode to 'proctored' for email-based interviews to enforce fullscreen and prevent tab switching
      setProctoringMode('proctored');
      
      // Ensure video preference is set for email-based interviews (default to enabled)
      // Import dynamically to avoid circular dependencies
      import('@/lib/data-store').then(({ getVideoPreference, saveVideoPreference }) => {
        const currentPreference = getVideoPreference();
        if (currentPreference === null || currentPreference === false) {
          saveVideoPreference(true); // Default to video enabled for email interviews
          console.log('Set video preference to enabled for email-based interview');
        }
      }).catch(err => {
        console.error('Error setting video preference:', err);
      });
    }
  }, [isPrepared, token]);

  const loadSession = async () => {
    try {
      setLoading(true);
      setError(null); // Clear any previous errors
      
      // Validate token
      console.log('Validating session token:', token);
      const response = await fetch(`/api/interview/validate/${token}`);
      const data = await response.json();

      if (!response.ok) {
        console.error('Session validation failed:', {
          status: response.status,
          error: data.error,
          data: data
        });
        throw new Error(data.error || 'Failed to load session');
      }
      
      console.log('Session validated successfully:', {
        sessionId: data.session?.id,
        status: data.session?.status,
        expiresAt: data.session?.expires_at,
        isActive: data.session?.is_active
      });

      setSession(data.session);
      
      // Load session data - resume and exam/subcategory information
      // Add a small delay to ensure resume cache is ready if just uploaded
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const { resumeTextValue, jobTitleValue, parsedData, experienceLevel, mandatorySkills } = await loadSessionData(data.session);
      
      // Prepare data for InterviewSession component
      await prepareInterviewData(data.session, resumeTextValue, jobTitleValue, parsedData);
      
      // Store job/exam details for interview agent
      if (experienceLevel && typeof window !== 'undefined') {
        localStorage.setItem('job_experience_level', experienceLevel);
      }
      if (mandatorySkills && typeof window !== 'undefined') {
        localStorage.setItem('job_mandatory_skills', mandatorySkills);
      }
      
      // Ensure video preference and interview mode are set for email-based interviews
      const { getVideoPreference, saveVideoPreference, getInterviewMode, saveInterviewMode } = await import('@/lib/data-store');
      const currentVideoPreference = getVideoPreference();
      const currentInterviewMode = getInterviewMode();
      
      // Default to video enabled and voice mode for email-based interviews if not set
      if (currentVideoPreference === null || currentVideoPreference === false) {
        saveVideoPreference(true);
        console.log('Set video preference to enabled for email-based interview');
      }
      if (!currentInterviewMode) {
        saveInterviewMode('voice');
        console.log('Set interview mode to voice for email-based interview');
      }
      
      // Mark session as started on server-side when interview is ready to begin
      // Only set started_at if not already set (allows retry after resume re-upload)
      if (data.session.id && token) {
        try {
          await fetch(`/api/interview/sessions/${data.session.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              status: 'in_progress',
              // Only set started_at if not already set (allows retry scenarios)
              // The API will handle this conditionally
            })
          });
        } catch (err) {
          console.warn('Failed to update session status on server:', err);
          // Continue anyway - interview can still proceed
        }
      }
      
      setLoading(false);
      setIsReady(true);
    } catch (error) {
      console.error('Error loading session:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Sorry for the issue. Company will Contact You.';
      
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();
        
        // Check for specific error types - order matters (most specific first)
        if (errorMsg.includes('expired')) {
          errorMessage = 'Your interview session has expired. Please contact the administrator to schedule a new interview.';
        } else if (errorMsg.includes('already been completed')) {
          errorMessage = 'This interview has already been completed. The link is no longer accessible.';
        } else if (errorMsg.includes('abandoned')) {
          errorMessage = 'This interview session has been abandoned. Please contact the administrator to schedule a new interview.';
        } else if (errorMsg.includes('no longer active') || errorMsg.includes('not active')) {
          errorMessage = 'This interview session is no longer active. Please contact the administrator.';
        } else if (errorMsg.includes('resume') || errorMsg.includes('analysis')) {
          errorMessage = 'There was an issue preparing your resume data. Please try uploading your resume again from the previous page.';
        } else if (errorMsg.includes('question') || errorMsg.includes('generate')) {
          errorMessage = 'There was an issue generating interview questions. Please try refreshing the page or contact support.';
        } else if (errorMsg.includes('session') || errorMsg.includes('token') || errorMsg.includes('invalid')) {
          errorMessage = 'There was an issue with your interview session. Please contact support.';
        } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        }
        
        // Log the full error for debugging
        console.error('Full error details:', {
          message: error.message,
          stack: error.stack,
          errorMsg: errorMsg
        });
      }
      
      setError(errorMessage);
      setLoading(false);
      setIsReady(false);
    }
  };

  const loadSessionData = async (sessionData: InterviewSession) => {
    try {
      // Try to load resume if resume_id is available
      let resumeTextValue = '';
      let parsedData = null;
      
      // First, check if resume was uploaded via the invitation page (cached)
      // Try fetching cache with retries since it might be processing
      let cacheFetched = false;
      for (let i = 0; i < 3; i++) {
        try {
          const cacheRes = await fetch(`/api/interview/${token}/get-resume-analysis`);
          const cacheData = await cacheRes.json();
          
          if (cacheData.success && cacheData.data) {
            console.log('Found resume analysis in cache');
            resumeTextValue = cacheData.data.extractedText || '';
            
            // Build parsedData from cached analysis
            const analysis = cacheData.data.analysis;
            parsedData = {
              candidateName: analysis.candidateName || '',
              skills: analysis.skills || [],
              experienceSummary: analysis.experienceSummary || '',
              comprehensiveSummary: analysis.comprehensiveSummary || '',
              strengths: analysis.strengths || [],
              areasForImprovement: analysis.areasForImprovement || [],
              structuredData: analysis.structuredData || analysis.structuredData?.structuredData || {}
            };
            
            console.log('Resume loaded from cache:', {
              textLength: resumeTextValue.length,
              hasParsedData: !!parsedData,
              candidateName: parsedData.candidateName
            });
            
            cacheFetched = true;
            break; // Found cache, exit retry loop
          }
        } catch (cacheError) {
          console.log(`Cache fetch attempt ${i + 1} failed, ${i < 2 ? 'retrying...' : 'checking other sources...'}`);
          if (i < 2) {
            // Wait before retry (only if not last attempt)
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
      
      if (!cacheFetched) {
        console.log('No cached resume found after retries, checking other sources...');
      }
      
      // Fallback to resume_id if available
      if (sessionData.resume_id) {
        console.log('Fetching resume with ID:', sessionData.resume_id);
        try {
          const resumeRes = await fetch(`/api/admin/resumes/${sessionData.resume_id}`);
          const resumeData = await resumeRes.json();
          
          if (resumeData.success && resumeData.data) {
            resumeTextValue = resumeData.data.extracted_text || '';
            parsedData = resumeData.data.parsed_data;
            console.log('Resume loaded successfully:', {
              fileName: resumeData.data.file_name,
              textLength: resumeTextValue.length,
              hasParsedData: !!parsedData
            });
          }
        } catch (resumeError) {
          console.error('Error fetching resume:', resumeError);
          // Continue without resume data
        }
      } else if (sessionData.candidate_id) {
        // Try to get resume from candidate's resume_analysis_json
        const candidateRes = await fetch(`/api/admin/candidates/${sessionData.candidate_id}`);
        const candidateData = await candidateRes.json();
        
        if (candidateData.success && candidateData.data?.resume_analysis_json) {
          parsedData = candidateData.data.resume_analysis_json;
          // Try to extract text from parsed data
          if (parsedData.experienceSummary) {
            resumeTextValue = parsedData.experienceSummary;
          }
        }
      }
      
      // Get exam/subcategory details for experience level and skills
      let experienceLevel = '';
      let mandatorySkills = '';
      
      // Determine job title from job_position, exam/subcategory, or job_title
      let jobTitleValue = sessionData.job_title || sessionData.exam_name || 'Interview';
      if (sessionData.subcategory_name && !sessionData.job_title) {
        jobTitleValue += ` - ${sessionData.subcategory_name}`;
      }
      
      // Try to fetch job position details if job_role_id is available
      if (sessionData.job_role_id) {
        try {
          const jobRes = await fetch(`/api/admin/job-positions/${sessionData.job_role_id}`);
          const jobData = await jobRes.json();
          
          if (jobData.success && jobData.data) {
            jobTitleValue = jobData.data.title || jobTitleValue;
            experienceLevel = jobData.data.experience_level || experienceLevel;
            mandatorySkills = jobData.data.requirements || mandatorySkills;
            console.log('Job position loaded:', {
              title: jobData.data.title,
              experienceLevel,
              requirements: jobData.data.requirements
            });
          }
        } catch (jobError) {
          console.warn('Error fetching job position:', jobError);
        }
      }
      
      if (sessionData.exam_id && sessionData.subcategory_id) {
        try {
          const examRes = await fetch(`/api/exam-config?examId=${sessionData.exam_id}&subcategoryId=${sessionData.subcategory_id}`);
          const examData = await examRes.json();
          if (examData.success && examData.data) {
            // Exam config might have requirements
          }
        } catch (err) {
          console.warn('Failed to fetch exam config:', err);
        }
      }
      
      console.log('Session data loaded:', {
        resumeLength: resumeTextValue.length,
        jobTitle: jobTitleValue,
        hasParsedData: !!parsedData
      });
      
      if (resumeTextValue.length === 0 && !parsedData) {
        console.warn('⚠️ WARNING: No resume data found!');
        toast({
          variant: 'destructive',
          title: 'Resume Not Found',
          description: 'Resume data is missing. The interview may not be personalized.',
        });
      }
      
      setResumeText(resumeTextValue);
      setJobTitle(jobTitleValue);
      
      // Store job/exam details in localStorage for interview session
      if (typeof window !== 'undefined') {
        localStorage.setItem('job_experience_level', experienceLevel);
        localStorage.setItem('job_mandatory_skills', mandatorySkills);
      }
      
      return { 
        resumeTextValue, 
        jobTitleValue,
        parsedData,
        experienceLevel,
        mandatorySkills
      };
    } catch (error) {
      console.error('Error loading session data:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load interview details',
      });
      return { 
        resumeTextValue: '', 
        jobTitleValue: sessionData.job_title || sessionData.exam_name || 'Interview', 
        parsedData: null,
        experienceLevel: '',
        mandatorySkills: ''
      };
    }
  };

  const prepareInterviewData = async (sessionData: InterviewSession, resumeTextValue: string, jobTitleValue: string, parsedData: any) => {
    try {
      console.log('Preparing interview data with:', {
        resumeLength: resumeTextValue.length,
        jobTitle: sessionData.job_title || sessionData.exam_name,
        jobDescription: jobTitleValue,
        hasParsedData: !!parsedData
      });

      // Try to get comprehensive resume text from cache first
      let comprehensiveResumeText = '';
      try {
        const cacheRes = await fetch(`/api/interview/${token}/get-resume-analysis`);
        const cacheData = await cacheRes.json();
        
        if (cacheData.success && cacheData.data?.comprehensiveResumeText) {
          comprehensiveResumeText = cacheData.data.comprehensiveResumeText;
          console.log('Using comprehensive resume text from cache');
        }
      } catch (error) {
        console.log('Could not fetch comprehensive resume text from cache, building from parsed data');
      }
      
      // Build comprehensive resume text from analysis data for question generation
      // This will be used both for initial question generation AND for the interview agent
      if (!comprehensiveResumeText && parsedData) {
        // Use structured data from DB for comprehensive question generation
        const structuredData = parsedData.structuredData || {};
        const parts: string[] = [];
        
        // Add professional summary if available
        if (structuredData.professionalSummary) {
          parts.push(`Professional Summary: ${structuredData.professionalSummary}`);
        }
        
        // Add work experience with details
        if (structuredData.workExperience && structuredData.workExperience.length > 0) {
          parts.push('\nWork Experience:');
          structuredData.workExperience.forEach((exp: any) => {
            parts.push(`${exp.role} at ${exp.company} (${exp.duration})`);
            if (exp.description) parts.push(`  ${exp.description}`);
            if (exp.highlights && exp.highlights.length > 0) {
              exp.highlights.forEach((h: string) => parts.push(`  - ${h}`));
            }
          });
        }
        
        // Add education
        if (structuredData.education && structuredData.education.length > 0) {
          parts.push('\nEducation:');
          structuredData.education.forEach((edu: any) => {
            parts.push(`${edu.degree} from ${edu.institution}${edu.year ? ` (${edu.year})` : ''}${edu.field ? `, ${edu.field}` : ''}`);
          });
        }
        
        // Add skills from parsed data
        if (parsedData.skills && parsedData.skills.length > 0) {
          parts.push(`\nSkills: ${parsedData.skills.join(', ')}`);
        } else if (structuredData.skills && structuredData.skills.length > 0) {
          parts.push(`\nSkills: ${structuredData.skills.join(', ')}`);
        }
        
        // Add certifications
        if (structuredData.certifications && structuredData.certifications.length > 0) {
          parts.push(`\nCertifications: ${structuredData.certifications.join(', ')}`);
        }
        
        // Add comprehensive summary or experience summary
        if (parsedData.comprehensiveSummary) {
          parts.push(`\nSummary: ${parsedData.comprehensiveSummary}`);
        } else if (parsedData.experienceSummary) {
          parts.push(`\nExperience Summary: ${parsedData.experienceSummary}`);
        }
        
        comprehensiveResumeText = parts.join('\n');
      } else {
        // Fallback to basic resume text
        comprehensiveResumeText = resumeTextValue || '';
      }

      // Check if we already have analyzed resume data
      let resumeAnalysis;
      if (parsedData && (parsedData.candidateName || parsedData.skills)) {
        console.log('Using pre-analyzed resume data from database');
        
        // Prioritize sessionData name (used in email) over resume-extracted name
        const sessionCandidateName = `${sessionData.first_name || ''} ${sessionData.last_name || ''}`.trim();
        resumeAnalysis = {
          isResume: true,
          candidateName: sessionCandidateName || parsedData.candidateName || 'Candidate',
          skills: parsedData.skills || [],
          experienceSummary: parsedData.experienceSummary || parsedData.comprehensiveSummary || resumeTextValue,
          strengths: parsedData.strengths || [],
          improvements: parsedData.areasForImprovement || [],
          // Add comprehensive resume text for interview agent
          comprehensiveResumeText: comprehensiveResumeText || resumeTextValue || parsedData.experienceSummary || parsedData.comprehensiveSummary || ''
        };
        
        // Save to local storage for interview session
        saveResumeAnalysis({
          isResume: true,
          candidateName: resumeAnalysis.candidateName,
          skills: resumeAnalysis.skills,
          experienceSummary: resumeAnalysis.experienceSummary,
          strengths: resumeAnalysis.strengths,
          improvements: resumeAnalysis.improvements,
          // Store comprehensive resume text for interview agent to use
          comprehensiveResumeText: resumeAnalysis.comprehensiveResumeText
        });
        
        console.log('Using candidate name from resume:', resumeAnalysis.candidateName);
      } else if (resumeTextValue.length > 0) {
        // Need to analyze resume now
        try {
          toast({
            title: "Analyzing Resume",
            description: "Extracting skills and experience from your resume...",
          });

          const analysisResult = await analyzeResume({
            resumeDataUri: `data:text/plain;base64,${btoa(resumeTextValue)}`,
            fileType: 'pdf',
            fileName: 'resume.pdf'
          });

          console.log('Resume analysis complete:', {
            candidateName: analysisResult.candidateName,
            skills: analysisResult.skills.length,
            strengths: analysisResult.strengths.length
          });

          // Prioritize sessionData name (used in email) over resume-extracted name
          const sessionCandidateName = `${sessionData.first_name || ''} ${sessionData.last_name || ''}`.trim();
          resumeAnalysis = {
            isResume: true,
            candidateName: sessionCandidateName || analysisResult.candidateName || 'Candidate',
            skills: analysisResult.skills,
            experienceSummary: analysisResult.experienceSummary,
            strengths: analysisResult.strengths,
            improvements: analysisResult.areasForImprovement
          };

          // Save resume analysis
          saveResumeAnalysis(resumeAnalysis);

          // Also save analysis to database for future use if candidate_id is available
          if (sessionData.candidate_id) {
            try {
              await fetch(`/api/admin/candidates/${sessionData.candidate_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  resume_analysis_json: {
                    candidateName: analysisResult.candidateName,
                    skills: analysisResult.skills,
                    experienceSummary: analysisResult.experienceSummary,
                    comprehensiveSummary: analysisResult.comprehensiveSummary,
                    atsScore: analysisResult.atsScore,
                    sectionRatings: analysisResult.sectionRatings,
                    feedback: analysisResult.feedback,
                    strengths: analysisResult.strengths,
                    areasForImprovement: analysisResult.areasForImprovement,
                    analyzedAt: new Date().toISOString()
                  }
                })
              });
              console.log('Resume analysis saved to database');
            } catch (dbError) {
              console.error('Failed to save analysis to database:', dbError);
            }
          }
        } catch (analysisError) {
          console.error('Resume analysis failed, using basic data:', analysisError);
          // Fallback to basic analysis
          resumeAnalysis = {
            isResume: true,
            candidateName: `${sessionData.first_name || ''} ${sessionData.last_name || ''}`.trim() || 'Candidate',
            skills: [],
            experienceSummary: resumeTextValue,
            strengths: [],
            improvements: []
          };
          saveResumeAnalysis(resumeAnalysis);
        }
      } else {
        // No resume data - create basic analysis from candidate info
        resumeAnalysis = {
          isResume: true,
          candidateName: `${sessionData.first_name || ''} ${sessionData.last_name || ''}`.trim() || 'Candidate',
          skills: [],
          experienceSummary: '',
          strengths: [],
          improvements: []
        };
        saveResumeAnalysis(resumeAnalysis);
      }

      // Fetch exam configuration
      if (sessionData.exam_id && sessionData.subcategory_id) {
        try {
          const configResponse = await fetch(`/api/exam-config?examId=${sessionData.exam_id}&subcategoryId=${sessionData.subcategory_id}`);
          const configData = await configResponse.json();
          
          if (configData.success && configData.data) {
            console.log('Found exam configuration:', configData.data);
            saveExamConfig({
              numQuestions: configData.data.num_questions || configData.data.numQuestions || 0,
              randomizeQuestions: configData.data.randomize_questions ?? configData.data.randomizeQuestions ?? false,
              examId: configData.data.exam_id?.toString() || sessionData.exam_id?.toString() || '',
              subcategoryId: configData.data.subcategory_id?.toString() || sessionData.subcategory_id?.toString() || '',
              examName: configData.data.exam_name || sessionData.exam_name || '',
              subcategoryName: configData.data.subcategory_name || sessionData.subcategory_name || ''
            });
          }
        } catch (configError) {
          console.warn('Failed to fetch exam config:', configError);
        }
      }

      // Generate questions based on exam/subcategory
      toast({
        title: "Generating Questions",
        description: "Creating personalized interview questions...",
      });

      // Import the question generator
      const { generateRoleSpecificQuestions } = await import('@/ai/flows/interview-question-generator');
      
      // Build the input object
      // Use subcategory name if available, otherwise fall back to job_title or exam_name
      // This ensures subcategory-specific questions are used (e.g., "CAT" instead of "MBA Entrance Exams")
      let jobRoleForQuestions = sessionData.job_title || sessionData.exam_name || 'Interview';
      if (sessionData.subcategory_name) {
        // Prefer subcategory name when available to ensure subcategory-specific questions
        jobRoleForQuestions = sessionData.subcategory_name;
      }
      
      // Determine if resume data is available
      const hasResumeData = comprehensiveResumeText && comprehensiveResumeText.trim().length > 50;
      
      const questionInput: {
        jobRole: string;
        company: string;
        college: string;
        language: string;
        resumeText: string;
        examId?: number;
        subcategoryId?: number;
        subcategoryName?: string;
        hasResumeData?: boolean;
      } = {
        jobRole: jobRoleForQuestions,
        company: jobTitleValue || 'Company',
        college: '',
        language: 'English',
        resumeText: comprehensiveResumeText || '',
        hasResumeData,
      };
      
      // Add examId and subcategoryId if available
      if (sessionData.exam_id != null) {
        questionInput.examId = sessionData.exam_id;
      }
      if (sessionData.subcategory_id != null) {
        questionInput.subcategoryId = sessionData.subcategory_id;
      }
      if (sessionData.subcategory_name) {
        questionInput.subcategoryName = sessionData.subcategory_name;
      }
      
      console.log('Question generation - Using jobRole:', jobRoleForQuestions, 'with examId:', questionInput.examId, 'subcategoryId:', questionInput.subcategoryId);
      
      console.log('Question generation input:', JSON.stringify(questionInput, null, 2));
      
      const questions = await generateRoleSpecificQuestions(questionInput);

      console.log('Generated questions:', questions);

      // Save questions for the InterviewSession component
      // Prioritize sessionData name (used in email) over resume analysis name
      const sessionCandidateName = `${sessionData.first_name || ''} ${sessionData.last_name || ''}`.trim();
      const candidateNameToUse = sessionCandidateName || resumeAnalysis.candidateName || 'Candidate';
      console.log('Using candidate name for questions:', candidateNameToUse);
      
      saveQuestions(
        questions, 
        'en-US', 
        jobRoleForQuestions, // Use subcategory name if available for proper question filtering
        candidateNameToUse, 
        ''
      );

      toast({
        title: "Ready!",
        description: "Interview is ready to start. Please test your camera and microphone.",
      });
      
    } catch (error) {
      console.error('Error preparing interview data:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Sorry for the issue. Company will Contact You.';
      
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();
        
        if (errorMsg.includes('resume') || errorMsg.includes('analysis')) {
          errorMessage = 'There was an issue processing your resume. Please ensure your resume was uploaded correctly and try again.';
        } else if (errorMsg.includes('question') || errorMsg.includes('generate')) {
          errorMessage = 'There was an issue generating interview questions. Please try refreshing the page. If the problem persists, contact support.';
        } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
          errorMessage = 'Network error while preparing interview. Please check your connection and try again.';
        }
      }
      
      // Don't set error here - let loadSession handle it with more context
      // Just re-throw with a more descriptive message
      const enhancedError = new Error(errorMessage);
      throw enhancedError;
    }
  };

  if (loading || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center p-12 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
            <p className="text-slate-600">Loading your interview...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md">
          <CardContent className="p-8">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Sorry for the issue. Company will Contact You.</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center p-12 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
            <p className="text-slate-600">Preparing your interview...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show preparation interface first (camera/mic testing)
  if (!isPrepared) {
    return (
      <InterviewPrepareLink
        onReady={() => setIsPrepared(true)}
        candidateName={`${session?.first_name || ''} ${session?.last_name || ''}`.trim() || 'Candidate'}
        jobTitle={session?.job_title || session?.exam_name || 'Interview'}
      />
    );
  }

  // After preparation, show the actual interview
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <InterviewSessionComponent proctoringMode="proctored" sessionToken={token} sessionData={session} />
    </div>
  );
}

