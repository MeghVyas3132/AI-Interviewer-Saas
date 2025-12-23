'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function ScheduleInterviewPage() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<string>('');
  const [selectedJob, setSelectedJob] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Fetch candidates and jobs for the company
    const fetchData = async () => {
      setLoading(true);
      try {
        // Try HR endpoint first, fallback to /candidates if needed
        let candidateData = [];
        try {
          candidateData = await apiClient.get('/hr/candidates');
        } catch {
          candidateData = await apiClient.get('/candidates');
        }
        setCandidates(candidateData || []);
        // Fetch jobs for the company
        let jobData = [];
        try {
          jobData = await apiClient.get('/jobs');
        } catch {
          jobData = [];
        }
        setJobs(jobData || []);
      } catch (err: any) {
        setError('Failed to load candidates or jobs');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      // Pass job_id as well if backend supports it, else just candidate
      const resp = await apiClient.post(`/hr/interviews/generate-ai-token/${selectedCandidate}`, { job_id: selectedJob });
      setResult(resp);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to schedule interview');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-10">
      <div className="flex items-center gap-4 mb-6">
        <a href="/hr" className="text-gray-500 hover:text-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </a>
        <h1 className="section-title">Schedule AI Interview</h1>
      </div>
      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div>
          <label className="block mb-2 font-medium">Select Candidate</label>
          <select
            className="input-field w-full"
            value={selectedCandidate}
            onChange={e => setSelectedCandidate(e.target.value)}
            required
          >
            <option value="">-- Select --</option>
            {candidates.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.first_name || c.name} {c.last_name || ''} ({c.email})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block mb-2 font-medium">Select Job Opening</label>
          <select
            className="input-field w-full"
            value={selectedJob}
            onChange={e => setSelectedJob(e.target.value)}
            required
          >
            <option value="">-- Select --</option>
            {jobs.map((j: any) => (
              <option key={j.id} value={j.id}>
                {j.title || j.name}
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn-primary w-full"
          type="submit"
          disabled={loading || !selectedCandidate || !selectedJob}
        >
          {loading ? 'Scheduling...' : 'Add Interview for this Job Opening'}
        </button>
        {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
      </form>
      {result && (
        <div className="card mt-6 p-4">
          <div className="font-semibold mb-2">Interview Scheduled!</div>
          <div className="mb-2">Interview Room Link:</div>
          <a
            href={`/interview-room/${result.token}`}
            className="text-brand-600 underline break-all"
            target="_blank"
            rel="noopener noreferrer"
          >
            {window.location.origin}/interview-room/{result.token}
          </a>
          <div className="mt-2 text-xs text-gray-500">Share this link with the candidate to start the interview.</div>
        </div>
      )}
    </div>
  );
}
