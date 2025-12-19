'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Calendar, Clock, User, Briefcase, FileText, AlertCircle, CheckCircle, Upload, X } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';

interface InterviewSession {
  id: number;
  candidate_id: number;
  job_role_id?: number;
  resume_id?: number;
  exam_id?: number;
  subcategory_id?: number;
  token: string;
  status: string;
  scheduled_time?: string;
  scheduled_end_time?: string;
  link_sent_at?: string;
  completed_at?: string;
  expires_at: string;
  results_json?: any;
  questions_generated?: any;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  first_name?: string;
  last_name?: string;
  email?: string;
  job_title?: string;
  resume_name?: string;
  exam_name?: string;
  subcategory_name?: string;
}

interface InterviewPageProps {
  params: Promise<{
    token: string;
  }>;
}

export default function InterviewPage({ params }: InterviewPageProps) {
  const [token, setToken] = useState<string>('');
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [isCheckingResume, setIsCheckingResume] = useState(true);
  const [resumeStatus, setResumeStatus] = useState<'missing' | 'processing' | 'ready' | 'error'>('missing');
  const [resumeStatusMessage, setResumeStatusMessage] = useState('');
  const [startStatusMessage, setStartStatusMessage] = useState('');
  const resumePollRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const validateToken = async () => {
        try {
      setLoading(true);
      setError(null);
            const response = await fetch(`/api/interview/validate/${token}`);
            const data = await response.json();

      if (!response.ok) {
        // Check if it's a scheduled time window error (not yet available or window ended)
        // These errors should be displayed to the user, not redirected
        if (data.error && (
          data.error.includes('not yet available') || 
          data.error.includes('window has ended') ||
          data.error.includes('will be available')
        )) {
          // If we have scheduled time info in the error response, create a partial session
          // so we can display the scheduled times in the error UI
          if (data.scheduledTime || data.scheduledEndTime) {
            setSession({
              id: 0,
              candidate_id: 0,
              token: token,
              status: 'pending',
              scheduled_time: data.scheduledTime || undefined,
              scheduled_end_time: data.scheduledEndTime || undefined,
              expires_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              is_active: true
            } as InterviewSession);
          }
          setError(data.error);
          setLoading(false);
          return;
        }
        
        // For other errors, redirect to invalid-session page
        router.push('/invalid-session');
        return;
      }

      setSession(data.session);
      if (data.session?.resume_id) {
        setResumeStatus('ready');
        setResumeUploaded(true);
        setResumeStatusMessage('Resume already on file. You can start the interview whenever you are ready.');
      } else {
        setResumeStatus('missing');
        setResumeUploaded(false);
        setResumeStatusMessage('');
      }
        } catch (error) {
      console.error('Token validation error:', error);
      // Redirect to invalid-session page on validation failure
      router.push('/invalid-session');
    } finally {
      setLoading(false);
        }
    };

  // Check if session is expired - uses scheduled_end_time if available, otherwise expires_at
  // This matches the backend validation logic
  const isExpired = (session: InterviewSession | null): boolean => {
    if (!session) return true;
    
    const currentTime = new Date().getTime();
    let actualExpiryTime: number;
    
    // Use scheduled_end_time if available (takes precedence over expires_at)
    if (session.scheduled_end_time) {
      const scheduledEndTime = new Date(session.scheduled_end_time).getTime();
      if (!isNaN(scheduledEndTime)) {
        actualExpiryTime = scheduledEndTime;
      } else {
        // Fall back to expires_at if scheduled_end_time is invalid
        actualExpiryTime = new Date(session.expires_at).getTime();
      }
    } else {
      // Use expires_at if no scheduled_end_time
      actualExpiryTime = new Date(session.expires_at).getTime();
    }
    
    // Also check if status is explicitly 'expired' (unless we're within scheduled window)
    if (session.status === 'expired') {
      // If we have a scheduled window, check if we're actually within it
      if (session.scheduled_end_time) {
        const scheduledEndTime = new Date(session.scheduled_end_time).getTime();
        const scheduledStartTime = session.scheduled_time ? new Date(session.scheduled_time).getTime() : null;
        const isWithinWindow = (!scheduledStartTime || currentTime >= scheduledStartTime) && currentTime <= scheduledEndTime;
        
        // If we're within the window, don't consider it expired (status will be reset by backend)
        if (isWithinWindow) {
          return false;
        }
      }
      // If status is expired and we're not within a scheduled window, it's expired
      return true;
    }
    
    // Check if current time is past the actual expiry time
    return currentTime > actualExpiryTime;
  };

  const isCompleted = (status: string) => {
    return status === 'completed';
  };

  const checkResumeStatus = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token) return;
      const silent = options?.silent ?? false;
      
      try {
        if (!silent) {
          setIsCheckingResume(true);
        }
        const response = await fetch(`/api/interview/${token}/resume-status`);
        const data = await response.json();
        
        if (data.success) {
          const state = data.data.state as 'missing' | 'processing' | 'ready' | 'error';
          setResumeStatus(state);
          setResumeStatusMessage(data.data.message || '');
          
          const hasResume = state === 'ready';
          setResumeUploaded(hasResume);
          
          if (hasResume) {
            setResumeFile(null);
            setError(null);
            setStartStatusMessage('');
            setSession(prev => prev ? {
              ...prev,
              resume_id: data.data.resumeId ?? prev.resume_id,
              resume_name: data.data.fileName ?? prev.resume_name
            } : prev);
          }
        } else {
          setResumeStatus('error');
          setResumeStatusMessage(data.error || 'Failed to verify resume status. Please try again.');
          setResumeUploaded(false);
        }
      } catch (error) {
        console.error('Error checking resume status:', error);
        setResumeStatus('error');
        setResumeStatusMessage('Unable to contact the server to verify your resume. Please try again.');
        setResumeUploaded(false);
      } finally {
        if (!silent) {
          setIsCheckingResume(false);
        }
      }
    },
    [token]
  );

  useEffect(() => {
    params.then(p => {
      setToken(p.token);
    });
  }, [params]);

  useEffect(() => {
    if (!token) return;
    validateToken();
  }, [token]);

  useEffect(() => {
    // Only check status if we have token and session
    // Skip if status is already 'ready' to avoid unnecessary API calls
    if (token && session) {
      // Only check if we don't already know the status is ready
      // This prevents continuous polling after resume is processed
      if (resumeStatus !== 'ready') {
        checkResumeStatus();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, session]); // Intentionally exclude checkResumeStatus to prevent infinite loops

  useEffect(() => {
    // Only poll when status is 'processing'
    if (resumeStatus === 'processing' && token) {
      if (resumePollRef.current) {
        clearTimeout(resumePollRef.current);
      }
      resumePollRef.current = setTimeout(() => {
        checkResumeStatus({ silent: true });
      }, 2000);
    } else {
      // Stop polling for any other status (ready, error, missing)
      if (resumePollRef.current) {
        clearTimeout(resumePollRef.current);
        resumePollRef.current = null;
      }
    }

    return () => {
      if (resumePollRef.current) {
        clearTimeout(resumePollRef.current);
        resumePollRef.current = null;
      }
    };
  }, [resumeStatus, token, checkResumeStatus]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['.pdf', '.doc', '.docx'];
      const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      
      if (!validTypes.includes(fileExtension)) {
        toast({
          variant: 'destructive',
          title: 'Invalid File Type',
          description: 'Please upload a PDF, DOC, or DOCX file.',
        });
        return;
      }

      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          variant: 'destructive',
          title: 'File Too Large',
          description: 'Please upload a file smaller than 10MB.',
        });
        return;
      }

      setResumeFile(file);
    }
  };

  const handleResumeUpload = async () => {
    if (!resumeFile || !token) return;

    try {
      setIsUploading(true);
      setResumeStatus('processing');
      setResumeStatusMessage('Resume received. Processing may take a few seconds...');
      setStartStatusMessage('');
      
      const formData = new FormData();
      formData.append('file', resumeFile);

      const response = await fetch(`/api/interview/${token}/upload-resume`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload resume');
      }

      if (data.success) {
        const state = data.data?.status as ('ready' | 'processing' | undefined) ?? 'ready';
        const message = data.data?.message || 'Resume uploaded successfully.';
        setResumeStatus(state === 'ready' ? 'ready' : 'processing');
        setResumeStatusMessage(message);
        setResumeUploaded(state === 'ready');
        if (state === 'ready') {
          setResumeFile(null);
          setSession(prev => prev ? {
            ...prev,
            resume_id: data.data?.resumeId ?? prev.resume_id,
            resume_name: data.data?.resumeStatus?.fileName ?? prev.resume_name
          } : prev);
        }
        setError(null); // Clear any previous errors when resume is successfully uploaded
        toast({
          title: 'Resume Uploaded Successfully',
          description: message,
        });
        
        // Refresh resume status to ensure it's up to date
        checkResumeStatus({ silent: true });
      }
    } catch (error) {
      console.error('Error uploading resume:', error);
      setResumeStatus('error');
      setResumeStatusMessage(error instanceof Error ? error.message : 'Failed to upload resume. Please try again.');
      setResumeUploaded(false);
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload resume. Please try again.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartInterview = async () => {
    if (!token) return;
    setStartStatusMessage('');

    if (resumeStatus === 'processing') {
      setStartStatusMessage('Resume processing — please wait a moment. We will enable Start automatically.');
      return;
    }

    if (resumeStatus === 'error') {
      toast({
        variant: 'destructive',
        title: 'Resume Needs Attention',
        description: resumeStatusMessage || 'There was an issue processing your resume. Please re-upload and try again.',
      });
      return;
    }

    // Check if resume is uploaded before starting
    if (!resumeUploaded && !session?.resume_id) {
      toast({
        variant: 'destructive',
        title: 'Resume Required',
        description: 'Please upload your resume before starting the interview.',
      });
      return;
    }

    try {
      setIsStarting(true);
      const response = await fetch(`/api/interview/start/${token}`, {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok) {
        if (data.status === 'processing') {
          setResumeStatus('processing');
          setResumeStatusMessage(data.message || 'Resume processing — please wait a moment.');
          setStartStatusMessage(data.message || 'Resume processing — please wait a moment.');
          checkResumeStatus({ silent: true });
          return;
        }

        const message = data.message || data.error || 'Failed to start interview. Please try again.';
        if (data.status) {
          setResumeStatus(data.status);
          setResumeStatusMessage(message);
        }
        setStartStatusMessage(message);
        toast({
          variant: 'destructive',
          title: 'Unable to Start Interview',
          description: message,
        });
        return;
      }

      if (data.status === 'processing') {
        setResumeStatus('processing');
        setResumeStatusMessage(data.message || 'Resume processing — please wait a moment.');
        setStartStatusMessage(data.message || 'Resume processing — please wait a moment.');
        checkResumeStatus({ silent: true });
        return;
      }

      if (data.status === 'error') {
        setResumeStatus('error');
        setResumeStatusMessage(data.message || 'Resume processing failed. Please try uploading again.');
        setStartStatusMessage(data.message || 'Resume processing failed. Please try uploading again.');
        toast({
          variant: 'destructive',
          title: 'Resume Processing Issue',
          description: data.message || 'Resume processing failed. Please try uploading again.',
        });
        return;
      }

      // Success or already started
      router.push(`/interview/${token}/start`);
    } catch (error) {
      console.error('Error starting interview:', error);
      setError('Failed to start interview. Please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Validating interview link...</p>
        </div>
      </div>
    );
  }

  if (error) {
    // Check if error is about scheduled time window (not yet available or window ended)
    const isScheduledTimeError = error.includes('not yet available') || 
                                  error.includes('window has ended') ||
                                  error.includes('will be available');
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center px-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardHeader>
            <CardTitle className={`flex items-center ${isScheduledTimeError ? 'text-orange-600' : 'text-red-600'}`}>
              <AlertCircle className="h-5 w-5 mr-2" />
              {isScheduledTimeError ? 'Interview Not Available' : 'Invalid Interview Link'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant={isScheduledTimeError ? 'default' : 'destructive'}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="whitespace-pre-line">
                {error}
              </AlertDescription>
            </Alert>
            {session?.scheduled_time && (
              <div className="mt-4 p-4 bg-muted rounded-md">
                <p className="text-sm font-medium mb-2">Scheduled Time:</p>
                <p className="text-sm text-muted-foreground">
                  Start: {new Date(session.scheduled_time).toLocaleString()}
                </p>
                {session.scheduled_end_time && (
                  <p className="text-sm text-muted-foreground">
                    End: {new Date(session.scheduled_end_time).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center px-4">
        <Card className="max-w-md w-full shadow-lg">
                    <CardHeader>
            <CardTitle className="text-center">Error</CardTitle>
                    </CardHeader>
                    <CardContent>
            <p className="text-center text-gray-600">
              Sorry for the issue. Company will Contact You.
            </p>
                    </CardContent>
                </Card>
            </div>
        );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        {/* Logo and Description Section */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="relative w-24 h-24 bg-white rounded-full shadow-lg flex items-center justify-center">
              <Image 
                src="/logo.png" 
                alt="Aigenthix AI Interviewer Logo" 
                width={80} 
                height={80}
                className="object-contain"
              />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            Interview Invitation
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Welcome to your AI-powered interview session. We're excited to learn more about you and your experience. 
            This interview will help us understand your skills and how you might contribute to our team.
          </p>
        </div>

        <Card className="mb-6 shadow-lg border-0">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center text-xl">
              <User className="h-6 w-6 mr-2 text-blue-600" />
              Your Interview Details
            </CardTitle>
            <CardDescription className="text-base">
              Please review your information and interview schedule
                        </CardDescription>
                    </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Candidate Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Candidate Information</h3>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <User className="h-4 w-4 mr-2 text-gray-500" />
                    <span className="font-medium">
                      {session.first_name || session.last_name
                        ? `${session.first_name || ''} ${session.last_name || ''}`.trim()
                        : session.email || `Candidate ID: ${session.candidate_id}` || 'Candidate'}
                    </span>
                  </div>
                  {(session.job_title || session.exam_name) && (
                    <div className="flex items-center">
                      <Briefcase className="h-4 w-4 mr-2 text-gray-500" />
                      <span>{session.job_title || session.exam_name}</span>
                      {session.subcategory_name && (
                        <span className="ml-2 text-gray-500">- {session.subcategory_name}</span>
                      )}
                    </div>
                  )}
                  {session.resume_name && (
                    <div className="flex items-center">
                      <FileText className="h-4 w-4 mr-2 text-gray-500" />
                      <span>{session.resume_name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Interview Details */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Interview Details</h3>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2 text-gray-500" />
                    <span>
                      {session.scheduled_time 
                        ? new Date(session.scheduled_time).toLocaleString()
                        : 'Flexible timing'
                      }
                    </span>
                  </div>
                  {session.scheduled_end_time ? (
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 mr-2 text-gray-500" />
                      <span>
                        Expires: {new Date(session.scheduled_end_time).toLocaleString()}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 mr-2 text-gray-500" />
                      <span>
                        Expires: {session.scheduled_end_time 
                          ? new Date(session.scheduled_end_time).toLocaleString()
                          : new Date(session.expires_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center">
                    <Badge 
                      variant={
                        session.status === 'completed' ? 'default' :
                        session.status === 'in_progress' ? 'default' :
                        session.status === 'expired' ? 'destructive' :
                        'secondary'
                      }
                        >
                      {session.status}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status Messages */}
        {isExpired(session) && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {session.scheduled_end_time && new Date(session.scheduled_end_time) > new Date()
                ? 'The interview window has ended. Please contact the HR team for assistance.'
                : 'This interview link has expired. Please contact the HR team for assistance.'}
            </AlertDescription>
          </Alert>
        )}

        {isCompleted(session.status) && (
          <Alert className="mb-6">
            <CheckCircle className="h-4 w-4" />
                            <AlertDescription>
              You have already completed this interview. Thank you for your participation!
                            </AlertDescription>
                        </Alert>
        )}

        {/* Interview Instructions */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Interview Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Before You Start */}
              <div>
                <h4 className="font-semibold mb-3">Before You Start</h4>
                <ul className="list-disc list-inside space-y-2 text-sm text-gray-600">
                  <li>Ensure you have a stable internet connection (minimum 1 Mbps recommended).</li>
                  <li>Test your webcam and microphone to confirm they are working properly.</li>
                  <li>Choose a quiet, well-lit environment with minimal background distractions.</li>
                  <li>Keep a copy of your resume or portfolio nearby for quick reference.</li>
                  <li>Be prepared to discuss your experience, skills, and problem-solving approach.</li>
                  <li>Close any unnecessary applications or browser tabs to improve performance.</li>
                </ul>
              </div>
              
              {/* During the Interview */}
              <div>
                <h4 className="font-semibold mb-3">During the Interview</h4>
                
                <div className="space-y-3">
                  <div>
                    <h5 className="font-medium mb-2 text-green-600">✅ Do's</h5>
                    <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                      <li>Speak clearly and look into the camera to maintain natural eye contact.</li>
                      <li>Take a moment to think before answering quality over speed.</li>
                      <li>Be honest and authentic in all your responses.</li>
                      <li>Show enthusiasm and a positive attitude throughout the interview.</li>
                      <li>Stay focused and engaged treat it like a real conversation.</li>
                      <li>Check your posture and body language; confident and relaxed works best.</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h5 className="font-medium mb-2 text-red-600">❌ Don'ts</h5>
                    <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                      <li>Do not switch tabs or open other applications during the interview.</li>
                      <li>Avoid background noise or interruptions silence your phone and notifications.</li>
                      <li>Don't read from a script; let your answers sound natural and genuine.</li>
                      <li>Don't look away from the screen for long periods.</li>
                      <li>Do not attempt to restart or reload the page unless instructed.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Technical Requirements */}
              <div>
                <h4 className="font-semibold mb-3">Technical Requirements</h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                  <li>Modern web browser: Chrome, Firefox, Safari, or Edge (latest version).</li>
                  <li>Functional webcam and microphone (internal or external).</li>
                  <li>Stable internet connection (minimum 1 Mbps upload/download).</li>
                </ul>
              </div>
            </div>
                    </CardContent>
                </Card>

        {/* Resume Upload Section */}
        {!isExpired(session) && !isCompleted(session.status) && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2 text-blue-600" />
                Upload Your Resume
              </CardTitle>
              <CardDescription>
                Please upload your resume to help us personalize your interview questions. Your resume will be analyzed automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isCheckingResume ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  <span className="text-gray-600">Checking resume status...</span>
                </div>
              ) : (
                <>
                  {resumeStatus === 'ready' && (
                    <Alert className="bg-green-50 border-green-200 mb-4">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        {resumeStatusMessage || 'Resume uploaded and analyzed successfully. You can now start the interview.'}
                      </AlertDescription>
                    </Alert>
                  )}

                  {resumeStatus === 'processing' && (
                    <Alert className="bg-blue-50 border-blue-200 mb-4">
                      <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                      <AlertDescription className="text-blue-800">
                        {resumeStatusMessage || 'Resume processing — please wait a moment. We will enable Start automatically when ready.'}
                      </AlertDescription>
                    </Alert>
                  )}

                  {resumeStatus === 'error' && (
                    <Alert variant="destructive" className="mb-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {resumeStatusMessage || 'There was an issue processing your resume. Please upload it again and ensure it is a valid PDF, DOC, or DOCX.'}
                      </AlertDescription>
                    </Alert>
                  )}

                  {(resumeStatus === 'missing' || resumeStatus === 'error' || !resumeUploaded) && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <Input
                            type="file"
                            accept=".pdf,.doc,.docx"
                            onChange={handleFileSelect}
                            disabled={isUploading || resumeStatus === 'processing'}
                            className="cursor-pointer"
                          />
                          <p className="text-xs text-gray-500 mt-2">
                            Supported formats: PDF, DOC, DOCX (Max 10MB)
                          </p>
                        </div>
                        {resumeFile && (
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-gray-500" />
                            <span className="text-sm text-gray-700">{resumeFile.name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setResumeFile(null)}
                              disabled={isUploading}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                      {resumeFile && (
                        <Button
                          onClick={handleResumeUpload}
                          disabled={isUploading}
                          className="w-full"
                        >
                          {isUploading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Analyzing Resume...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 mr-2" />
                              Upload and Analyze Resume
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="text-center">
          {!isExpired(session) && !isCompleted(session.status) ? (
            <Button 
              size="lg" 
              onClick={handleStartInterview}
              disabled={
                isStarting ||
                resumeStatus === 'processing' ||
                (resumeStatus !== 'ready' && !session.resume_id)
              }
              className="px-8 py-3"
            >
              {isStarting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting Interview...
                </>
              ) : resumeStatus === 'processing' ? (
                'Resume Processing'
              ) : (!resumeUploaded && !session.resume_id) ? (
                'Upload Resume to Start'
              ) : (
                'Start Interview'
              )}
            </Button>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-600">
                {isExpired(session) 
                  ? (session.scheduled_end_time && new Date(session.scheduled_end_time) > new Date()
                      ? 'The interview window has ended.'
                      : 'This interview link has expired.')
                  : 'You have already completed this interview.'
                }
              </p>
            </div>
          )}
          {startStatusMessage && (
            <p className="mt-3 text-sm text-gray-600">{startStatusMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}
