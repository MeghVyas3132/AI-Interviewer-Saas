'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { authApi } from '@/services/api';
import { Users, Briefcase, User, Loader2 } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRoleSelect = async (role: 'hr' | 'employee' | 'candidate') => {
    setLoading(role);
    setError(null);
    
    try {
      // Map role to email and backend role
      const roleMap = {
        hr: { email: 'hr@test.com', backendRole: 'HR' },
        employee: { email: 'interviewer@test.com', backendRole: 'EMPLOYEE' },
        candidate: { email: 'candidate@test.com', backendRole: 'CANDIDATE' },
      };
      
      const { email, backendRole } = roleMap[role];
      
      // Call dev-login API
      const response = await authApi.devLogin(email, backendRole);
      
      // Store token and user info
      login(response.user, response.token);
      
      // Navigate to appropriate dashboard
      switch (role) {
        case 'hr':
          router.push('/hr/dashboard');
          break;
        case 'employee':
          router.push('/interviewer/dashboard');
          break;
        case 'candidate':
          router.push('/candidate/dashboard');
          break;
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      setError(err.response?.data?.error || 'Failed to login. Please ensure backend is running.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            AI Interview Assistant
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Real-time AI-powered interview metrics for better hiring decisions.
            Select your role to continue.
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Powered by <span className="font-semibold text-primary-600">Aigenthix</span>
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-center">
            {error}
          </div>
        )}

        {/* Role Selection */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* HR */}
          <button
            onClick={() => handleRoleSelect('hr')}
            disabled={loading !== null}
            className="bg-white rounded-xl p-8 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 text-left group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-200 transition-colors">
              {loading === 'hr' ? (
                <Loader2 className="w-7 h-7 text-purple-600 animate-spin" />
              ) : (
                <Users className="w-7 h-7 text-purple-600" />
              )}
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">HR Manager</h2>
            <p className="text-gray-600 text-sm">
              View interview reports, candidate assessments, and AI-generated summaries.
            </p>
            <div className="mt-4 text-purple-600 font-medium text-sm group-hover:underline">
              {loading === 'hr' ? 'Logging in...' : 'Login as HR →'}
            </div>
          </button>

          {/* Interviewer */}
          <button
            onClick={() => handleRoleSelect('employee')}
            disabled={loading !== null}
            className="bg-white rounded-xl p-8 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 text-left group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
              {loading === 'employee' ? (
                <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
              ) : (
                <Briefcase className="w-7 h-7 text-blue-600" />
              )}
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Interviewer</h2>
            <p className="text-gray-600 text-sm">
              Conduct interviews with real-time AI insights, transcript, and fraud detection.
            </p>
            <div className="mt-4 text-blue-600 font-medium text-sm group-hover:underline">
              {loading === 'employee' ? 'Logging in...' : 'Login as Interviewer →'}
            </div>
          </button>

          {/* Candidate */}
          <button
            onClick={() => handleRoleSelect('candidate')}
            disabled={loading !== null}
            className="bg-white rounded-xl p-8 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 text-left group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
              {loading === 'candidate' ? (
                <Loader2 className="w-7 h-7 text-green-600 animate-spin" />
              ) : (
                <User className="w-7 h-7 text-green-600" />
              )}
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Candidate</h2>
            <p className="text-gray-600 text-sm">
              Join scheduled interviews with a simple video call experience.
            </p>
            <div className="mt-4 text-green-600 font-medium text-sm group-hover:underline">
              {loading === 'candidate' ? 'Logging in...' : 'Login as Candidate →'}
            </div>
          </button>
        </div>

        {/* Footer Note */}
        <div className="text-center mt-12 text-sm text-gray-500">
          <p>This is an alpha testing environment for internal use only.</p>
          <p className="mt-1 text-xs">Backend: http://localhost:3000</p>
        </div>
      </div>
    </main>
  );
}
