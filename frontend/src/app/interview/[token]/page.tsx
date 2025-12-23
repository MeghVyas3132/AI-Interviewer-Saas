'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Calendar, Clock, User, Briefcase, AlertCircle, CheckCircle, Upload, ArrowLeft } from 'lucide-react';

interface InterviewSession {
  id: number;
  candidate_id: string;
  token: string;
  status: string;
  scheduled_time?: string;
  scheduled_end_time?: string;
  expires_at: string;
  questions_generated?: any[];
  interview_mode?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  job_title?: string;
  is_active: boolean;
}

export default function InterviewLandingPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Validate session on mount
  useEffect(() => {
    const validateSession = async () => {
      try {
        setLoading(true);
        setError(null);

        // Call our backend proxy to validate the token
        const response = await fetch(`/api/interview/validate/${token}`);
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || 'Invalid interview session');
          if (data.scheduledTime) {
            // Show scheduled time info
            setSession({
              id: 0,
              candidate_id: '',
              token: token,
              status: 'pending',
              scheduled_time: data.scheduledTime,
              scheduled_end_time: data.scheduledEndTime,
              expires_at: new Date().toISOString(),
              is_active: true
            });
          }
          setLoading(false);
          return;
        }

        setSession(data.session);
        setLoading(false);
      } catch (err) {
        console.error('Validation error:', err);
        setError('Failed to validate interview session');
        setLoading(false);
      }
    };

    if (token) {
      validateSession();
    }
  }, [token]);

  const handleStartInterview = useCallback(async () => {
    setIsStarting(true);
    // Navigate to the actual interview room
    router.push(`/interview/${token}/room`);
  }, [token, router]);

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return 'Not scheduled';
    return new Date(isoString).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Validating interview session...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Interview Not Available</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          
          {session?.scheduled_time && (
            <div className="bg-blue-50 rounded-lg p-4 mb-6 text-left">
              <h3 className="font-medium text-blue-900 mb-2">Scheduled Time</h3>
              <div className="flex items-center text-blue-700 mb-1">
                <Calendar className="h-4 w-4 mr-2" />
                <span className="text-sm">{formatDateTime(session.scheduled_time)}</span>
              </div>
              {session.scheduled_end_time && (
                <div className="flex items-center text-blue-700">
                  <Clock className="h-4 w-4 mr-2" />
                  <span className="text-sm">Until {formatDateTime(session.scheduled_end_time)}</span>
                </div>
              )}
            </div>
          )}
          
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Check Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">AI</span>
            </div>
            <span className="font-semibold text-gray-900">AI Interviewer</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Hero Section */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-white">
            <h1 className="text-3xl font-bold mb-2">Welcome to Your Interview</h1>
            <p className="text-blue-100">You're about to begin an AI-powered interview session</p>
          </div>

          {/* Session Details */}
          <div className="p-8">
            {/* Candidate Info */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <User className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Candidate</p>
                  <p className="font-semibold text-gray-900">
                    {session?.first_name} {session?.last_name}
                  </p>
                  <p className="text-sm text-gray-600">{session?.email}</p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                  <Briefcase className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Position</p>
                  <p className="font-semibold text-gray-900">{session?.job_title || 'Interview'}</p>
                  <p className="text-sm text-gray-600">
                    {session?.questions_generated?.length || 0} questions prepared
                  </p>
                </div>
              </div>
            </div>

            {/* Schedule Info */}
            {session?.scheduled_time && (
              <div className="bg-blue-50 rounded-xl p-4 mb-8">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  <span className="font-medium text-blue-900">Interview Window</span>
                </div>
                <p className="text-blue-700 ml-7">
                  {formatDateTime(session.scheduled_time)}
                  {session.scheduled_end_time && (
                    <> — {formatDateTime(session.scheduled_end_time)}</>
                  )}
                </p>
              </div>
            )}

            {/* Instructions */}
            <div className="mb-8">
              <h3 className="font-semibold text-gray-900 mb-4">Before You Begin</h3>
              <ul className="space-y-3">
                {[
                  'Ensure you have a stable internet connection',
                  'Find a quiet place with good lighting',
                  'Test your microphone and camera',
                  'Have your resume ready for reference',
                  'The interview typically takes 20-30 minutes',
                ].map((item, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-gray-600">
                    <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Start Button */}
            <button
              onClick={handleStartInterview}
              disabled={isStarting}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isStarting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Starting Interview...
                </>
              ) : (
                <>Start Interview</>
              )}
            </button>

            <p className="text-center text-sm text-gray-500 mt-4">
              By starting, you agree to the interview being recorded for evaluation purposes.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
