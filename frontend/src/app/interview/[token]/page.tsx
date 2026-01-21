'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface InterviewSession {
  id: number;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  position: string;
  company_name: string;
  scheduled_time: string;
  duration_minutes: number;
  status: string;
  questions_generated: string[];
  ats_score?: number;
  ats_report?: ATSResult;
  resume_text?: string;
}

interface ATSResult {
  score: number;
  summary: string;
  verdict?: string;
  highlights?: string[];
  improvements?: string[];
  keywords_found?: string[];
  keywords_missing?: string[];
}

type Step = 'loading' | 'resume' | 'ats-check' | 'device-check' | 'ready' | 'error' | 'not-started' | 'expired';

export default function InterviewLandingPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [currentStep, setCurrentStep] = useState<Step>('loading');
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [error, setError] = useState('');
  const [timeUntilStart, setTimeUntilStart] = useState('');

  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState('');
  const [uploadingResume, setUploadingResume] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ATS Check state
  const [atsResult, setAtsResult] = useState<ATSResult | null>(null);
  const [atsLoading, setAtsLoading] = useState(false);

  const [cameraStatus, setCameraStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [micStatus, setMicStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [testingDevices, setTestingDevices] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/interviews/by-token/${token}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError('Interview session not found. Please check your link.');
          } else {
            setError('Failed to load interview session.');
          }
          setCurrentStep('error');
          return;
        }

        const data = await response.json();
        setSession(data);

        const scheduledTime = new Date(data.scheduled_time);
        const now = new Date();
        const windowStart = new Date(scheduledTime.getTime() - 15 * 60000);
        const windowEnd = new Date(scheduledTime.getTime() + (data.duration_minutes + 30) * 60000);

        if (now < windowStart) {
          setCurrentStep('not-started');
        } else if (now > windowEnd) {
          setCurrentStep('expired');
        } else if (data.status === 'completed') {
          setCurrentStep('expired');
        } else {
          setCurrentStep('resume');
        }
      } catch {
        setError('Network error. Please try again.');
        setCurrentStep('error');
      }
    };

    fetchSession();
  }, [token]);

  useEffect(() => {
    if (currentStep !== 'not-started' || !session) return;

    const updateCountdown = () => {
      const scheduledTime = new Date(session.scheduled_time);
      const now = new Date();
      const windowStart = new Date(scheduledTime.getTime() - 15 * 60000);
      const diff = windowStart.getTime() - now.getTime();

      if (diff <= 0) {
        setCurrentStep('resume');
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      if (hours > 0) {
        setTimeUntilStart(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setTimeUntilStart(`${minutes}m ${seconds}s`);
      } else {
        setTimeUntilStart(`${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [currentStep, session]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type === 'application/pdf' || file.type === 'text/plain' || 
          file.name.endsWith('.doc') || file.name.endsWith('.docx')) {
        setResumeFile(file);
        setError('');
      } else {
        setError('Please upload a PDF, DOC, DOCX, or TXT file.');
      }
    }
  };

  const handleResumeSubmit = async () => {
    if (!resumeFile) {
      setError('Please upload your resume to continue.');
      return;
    }

    setUploadingResume(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const text = reader.result as string;
        setResumeText(text);
        localStorage.setItem(`resume_${token}`, text);
        localStorage.setItem(`resume_filename_${token}`, resumeFile.name);
        setUploadingResume(false);
        
        // Check if ATS score already exists from dashboard check
        if (session?.ats_score && session.ats_report) {
          // Use cached ATS result from dashboard
          setAtsResult({
            score: session.ats_score,
            summary: session.ats_report.summary || 'Resume analysis complete (from dashboard check).',
            verdict: session.ats_report.verdict,
            highlights: session.ats_report.highlights || [],
            improvements: session.ats_report.improvements || [],
            keywords_found: session.ats_report.keywords_found || [],
            keywords_missing: session.ats_report.keywords_missing || []
          });
          setCurrentStep('ats-check');
          return;
        }
        
        setCurrentStep('ats-check');
        
        // Run ATS check
        setAtsLoading(true);
        try {
          const jobDescription = session?.position ? 
            `Position: ${session.position} at ${session.company_name}` : 
            'General interview position';
          
          const response = await fetch(`${API_BASE_URL}/ai/ats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              resume_text: text,
              job_description: jobDescription,
              interview_id: session?.id
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            setAtsResult({
              score: data.score || data.ai_response?.score || 75,
              summary: data.summary || data.ai_response?.summary || 'Resume analysis complete.',
              verdict: data.verdict || data.ai_response?.verdict,
              highlights: data.highlights || data.ai_response?.highlights || [],
              improvements: data.improvements || data.ai_response?.improvements || [],
              keywords_found: data.keywords_found || data.ai_response?.keywords_found || [],
              keywords_missing: data.keywords_missing || data.ai_response?.keywords_missing || []
            });
          } else {
            // Even if ATS fails, allow to continue
            setAtsResult({
              score: 0,
              summary: 'ATS check could not be completed. You can still proceed with the interview.'
            });
          }
        } catch {
          setAtsResult({
            score: 0,
            summary: 'ATS check could not be completed. You can still proceed with the interview.'
          });
        } finally {
          setAtsLoading(false);
        }
      };
      reader.readAsText(resumeFile);
    } catch {
      setError('Failed to process resume. Please try again.');
      setUploadingResume(false);
    }
  };

  const testDevices = useCallback(async () => {
    setTestingDevices(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      setCameraStatus('granted');
      setMicStatus('granted');
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setCameraStatus('denied');
      setMicStatus('denied');
    } finally {
      setTestingDevices(false);
    }
  }, []);

  useEffect(() => {
    if (currentStep === 'device-check') {
      testDevices();
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [currentStep, testDevices]);

  const proceedToReady = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setCurrentStep('ready');
  };

  const startInterview = () => {
    router.push(`/interview/${token}/room`);
  };

  const getStepNumber = () => {
    switch (currentStep) {
      case 'resume': return 1;
      case 'ats-check': return 2;
      case 'device-check': return 3;
      case 'ready': return 4;
      default: return 0;
    }
  };

  const showProgress = ['resume', 'ats-check', 'device-check', 'ready'].includes(currentStep);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">AI Interview</h1>
              {session && (
                <p className="text-sm text-gray-500">{session.company_name} - {session.position}</p>
              )}
            </div>
            {session && (
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{session.candidate_name}</p>
                <p className="text-xs text-gray-500">{session.candidate_email}</p>
              </div>
            )}
          </div>
        </div>
      </header>

      {showProgress && (
        <div className="bg-white border-b">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <div className="flex items-center justify-center gap-2">
              {['Resume', 'ATS Check', 'Devices', 'Ready'].map((step, index) => (
                <div key={step} className="flex items-center">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                    index + 1 < getStepNumber() 
                      ? 'bg-green-600 text-white' 
                      : index + 1 === getStepNumber() 
                        ? 'bg-primary-600 text-white' 
                        : 'bg-gray-200 text-gray-500'
                  }`}>
                    {index + 1 < getStepNumber() ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : index + 1}
                  </div>
                  <span className={`ml-2 text-sm hidden sm:inline ${
                    index + 1 <= getStepNumber() ? 'text-gray-900 font-medium' : 'text-gray-400'
                  }`}>
                    {step}
                  </span>
                  {index < 3 && (
                    <div className={`w-8 h-0.5 mx-2 ${
                      index + 1 < getStepNumber() ? 'bg-green-600' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {currentStep === 'loading' && (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-gray-600 text-lg">Loading interview details...</p>
            </div>
          )}

          {currentStep === 'error' && (
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h2>
              <p className="text-gray-600 mb-6">{error}</p>
              <button onClick={() => window.location.reload()} className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition">
                Try Again
              </button>
            </div>
          )}

          {currentStep === 'not-started' && (
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-6 bg-yellow-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Interview Not Yet Available</h2>
              <p className="text-gray-600 mb-2">Your interview is scheduled for:</p>
              <p className="text-xl font-semibold text-blue-600 mb-4">
                {session && new Date(session.scheduled_time).toLocaleString()}
              </p>
              <p className="text-gray-500 mb-6">You can join 15 minutes before the scheduled time.</p>
              <div className="bg-gray-100 rounded-xl px-8 py-4 inline-block">
                <p className="text-sm text-gray-500 mb-1">Opens in</p>
                <p className="text-3xl font-bold text-gray-900">{timeUntilStart}</p>
              </div>
            </div>
          )}

          {currentStep === 'expired' && (
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Interview Session Expired</h2>
              <p className="text-gray-600 mb-6">This interview session is no longer available.</p>
              <p className="text-gray-500">Please contact HR to reschedule.</p>
            </div>
          )}

          {currentStep === 'resume' && (
            <div className="max-w-lg mx-auto">
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 bg-primary-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload Your Resume</h2>
                <p className="text-gray-600">Please upload your resume so our AI interviewer can review your background.</p>
              </div>

              <div 
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
                  resumeFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-primary-400'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleFileSelect} className="hidden" />
                
                {resumeFile ? (
                  <div>
                    <div className="w-12 h-12 mx-auto mb-3 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="font-medium text-gray-900">{resumeFile.name}</p>
                    <p className="text-sm text-gray-500 mt-1">Click to change file</p>
                  </div>
                ) : (
                  <div>
                    <div className="w-12 h-12 mx-auto mb-3 bg-primary-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="font-medium text-gray-700">Drop your resume here or click to browse</p>
                    <p className="text-sm text-gray-500 mt-1">PDF, DOC, DOCX, or TXT (Max 5MB)</p>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleResumeSubmit}
                disabled={!resumeFile || uploadingResume}
                className={`w-full mt-6 py-4 rounded-xl font-semibold text-white transition ${
                  resumeFile && !uploadingResume ? 'bg-primary-600 hover:bg-primary-700' : 'bg-gray-300 cursor-not-allowed'
                }`}
              >
                {uploadingResume ? 'Processing...' : 'Continue'}
              </button>
            </div>
          )}

          {currentStep === 'ats-check' && (
            <div className="max-w-lg mx-auto">
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 bg-primary-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Resume Analysis</h2>
                <p className="text-gray-600">Our AI is analyzing your resume for compatibility with this role.</p>
              </div>

              {atsLoading ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-600">Analyzing your resume...</p>
                  <p className="text-sm text-gray-400 mt-2">This may take a few seconds</p>
                </div>
              ) : atsResult && (
                <div className="space-y-6">
                  {/* Score Display */}
                  <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white text-center">
                    <p className="text-sm opacity-90 mb-2">ATS Compatibility Score</p>
                    <div className="text-5xl font-bold mb-2">{atsResult.score}%</div>
                    <div className="w-full bg-white/20 rounded-full h-3 mt-4">
                      <div 
                        className="bg-white h-3 rounded-full transition-all duration-1000"
                        style={{ width: `${atsResult.score}%` }}
                      />
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <h3 className="font-semibold text-gray-900 mb-2">Analysis Summary</h3>
                    <p className="text-gray-600 text-sm">{atsResult.summary}</p>
                    {atsResult.verdict && (
                      <p className="mt-2 text-sm font-medium">
                        Verdict: <span className={`${
                          atsResult.verdict === 'EXCELLENT' ? 'text-green-600' :
                          atsResult.verdict === 'GOOD' ? 'text-blue-600' :
                          atsResult.verdict === 'FAIR' ? 'text-amber-600' : 'text-red-600'
                        }`}>{atsResult.verdict}</span>
                      </p>
                    )}
                  </div>

                  {/* Highlights/Strengths */}
                  {atsResult.highlights && atsResult.highlights.length > 0 && (
                    <div className="bg-primary-50 rounded-xl p-4">
                      <h3 className="font-semibold text-primary-800 mb-2 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Strengths
                      </h3>
                      <ul className="space-y-1">
                        {atsResult.highlights.slice(0, 5).map((highlight, i) => (
                          <li key={i} className="text-sm text-primary-700 flex items-start gap-2">
                            <span className="text-primary-400 mt-1">•</span>
                            {highlight}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Improvements */}
                  {atsResult.improvements && atsResult.improvements.length > 0 && (
                    <div className="bg-orange-50 rounded-xl p-4">
                      <h3 className="font-semibold text-orange-800 mb-2 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Areas for Improvement
                      </h3>
                      <ul className="space-y-1">
                        {atsResult.improvements.slice(0, 5).map((improvement, i) => (
                          <li key={i} className="text-sm text-orange-700 flex items-start gap-2">
                            <span className="text-orange-400 mt-1">•</span>
                            {improvement}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Keywords Found */}
                  {atsResult.keywords_found && atsResult.keywords_found.length > 0 && (
                    <div className="bg-green-50 rounded-xl p-4">
                      <h3 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Keywords Found
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {atsResult.keywords_found.slice(0, 8).map((keyword, i) => (
                          <span key={i} className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Keywords Missing */}
                  {atsResult.keywords_missing && atsResult.keywords_missing.length > 0 && (
                    <div className="bg-amber-50 rounded-xl p-4">
                      <h3 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Consider Adding
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {atsResult.keywords_missing.slice(0, 6).map((keyword, i) => (
                          <span key={i} className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-sm">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setCurrentStep('device-check')}
                    className="w-full py-4 rounded-xl font-semibold text-white bg-primary-600 hover:bg-primary-700 transition"
                  >
                    Continue to Device Check
                  </button>
                </div>
              )}
            </div>
          )}

          {currentStep === 'device-check' && (
            <div className="max-w-lg mx-auto">
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 bg-primary-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Device Check</h2>
                <p className="text-gray-600">Let&apos;s make sure your camera and microphone are working.</p>
              </div>

              <div className="bg-gray-900 rounded-xl overflow-hidden mb-6 aspect-video relative">
                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" style={{ display: cameraStatus === 'granted' ? 'block' : 'none' }} />
                {cameraStatus !== 'granted' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-white">
                      {testingDevices ? (
                        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>
                      ) : (
                        <svg className="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 mb-6">
                <div className={`flex items-center justify-between p-4 rounded-lg ${
                  cameraStatus === 'granted' ? 'bg-green-50' : cameraStatus === 'denied' ? 'bg-red-50' : 'bg-gray-50'
                }`}>
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="font-medium">Camera</span>
                  </div>
                  <span className={`text-sm font-medium ${
                    cameraStatus === 'granted' ? 'text-green-600' : cameraStatus === 'denied' ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {cameraStatus === 'granted' ? 'Working' : cameraStatus === 'denied' ? 'Blocked' : 'Checking...'}
                  </span>
                </div>

                <div className={`flex items-center justify-between p-4 rounded-lg ${
                  micStatus === 'granted' ? 'bg-green-50' : micStatus === 'denied' ? 'bg-red-50' : 'bg-gray-50'
                }`}>
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    <span className="font-medium">Microphone</span>
                  </div>
                  <span className={`text-sm font-medium ${
                    micStatus === 'granted' ? 'text-green-600' : micStatus === 'denied' ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {micStatus === 'granted' ? 'Working' : micStatus === 'denied' ? 'Blocked' : 'Checking...'}
                  </span>
                </div>
              </div>

              {(cameraStatus === 'denied' || micStatus === 'denied') && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-6">
                  <p className="text-sm text-yellow-800">
                    <strong>Permission required:</strong> Please allow camera and microphone access in your browser settings, then click &quot;Test Again&quot;.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                {(cameraStatus === 'denied' || micStatus === 'denied') && (
                  <button onClick={testDevices} disabled={testingDevices} className="flex-1 py-4 rounded-xl font-semibold border-2 border-blue-600 text-blue-600 hover:bg-blue-50 transition">
                    Test Again
                  </button>
                )}
                <button
                  onClick={proceedToReady}
                  disabled={cameraStatus !== 'granted' || micStatus !== 'granted'}
                  className={`flex-1 py-4 rounded-xl font-semibold text-white transition ${
                    cameraStatus === 'granted' && micStatus === 'granted' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'
                  }`}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {currentStep === 'ready' && (
            <div className="max-w-lg mx-auto text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">You&apos;re All Set!</h2>
              <p className="text-gray-600 mb-8">
                Everything is ready for your interview. Click the button below when you&apos;re ready to begin.
              </p>

              <div className="bg-gray-50 rounded-xl p-6 mb-8 text-left">
                <h3 className="font-semibold text-gray-900 mb-4">Interview Tips:</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Speak clearly and at a moderate pace
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Ensure you&apos;re in a quiet environment
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Look at the camera when speaking
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Take your time to think before answering
                  </li>
                </ul>
              </div>

              <button onClick={startInterview} className="w-full py-4 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 transition text-lg">
                Start Interview
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
