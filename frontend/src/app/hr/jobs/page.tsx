'use client'

import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

interface Job {
  id: string;
  title: string;
  description: string;
  department?: string;
  created_at?: string;
}

interface Question {
  id: string;
  text: string;
}

export default function HRJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Job>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [generationQueued, setGenerationQueued] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Record<string, Question[]>>({});
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<Job[]>('/jobs');
      setJobs(data || []);
    } catch (err: any) {
      setError('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchJobs(); }, []);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editingId) {
        await apiClient.put(`/jobs/${editingId}`, form);
      } else {
        await apiClient.post('/jobs', form);
      }
      setShowForm(false);
      setForm({});
      setEditingId(null);
      fetchJobs();
    } catch (err: any) {
      setError('Failed to save job');
    }
  };

  const handleEdit = (job: Job) => {
    setForm(job);
    setEditingId(job.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this job?')) return;
    try {
      await apiClient.delete(`/jobs/${id}`);
      if (selectedJobId === id) setSelectedJobId(null);
      fetchJobs();
    } catch {
      setError('Failed to delete job');
    }
  };

  const handleGenerateQuestions = async (id: string) => {
    setGeneratingFor(id);
    setGenerationQueued(null);
    try {
      await apiClient.post(`/jobs/${id}/generate-questions`, {});
      setGenerationQueued(id);
      // Auto-refresh questions after a delay
      setTimeout(() => {
        if (selectedJobId === id) {
          fetchQuestions(id);
        }
        setGenerationQueued(null);
      }, 15000);
    } catch {
      setError('Failed to queue question generation');
    } finally {
      setGeneratingFor(null);
    }
  };

  const fetchQuestions = async (id: string) => {
    setQuestionsLoading(true);
    try {
      const data = await apiClient.get<Question[]>(`/jobs/${id}/questions`);
      // Clean up question text - remove any JSON artifacts
      const cleanedData = (data || []).map(q => ({
        ...q,
        text: q.text.replace(/^\{?"questions":\s*\[?"?|"?\]?\}?$/g, '').trim()
      })).filter(q => q.text.length > 10);
      setQuestions(qs => ({ ...qs, [id]: cleanedData }));
    } catch {
      setQuestions(qs => ({ ...qs, [id]: [] }));
    } finally {
      setQuestionsLoading(false);
    }
  };

  const handleViewQuestions = (job: Job) => {
    setSelectedJobId(job.id);
    if (!questions[job.id]) {
      fetchQuestions(job.id);
    }
  };

  const selectedJob = jobs.find(j => j.id === selectedJobId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <a href="/hr" className="p-2 hover:bg-gray-100 rounded-lg transition">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </a>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Job Openings</h1>
                <p className="text-sm text-gray-500">Manage job roles and AI-generated interview questions</p>
              </div>
            </div>
            <button 
              className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-xl font-medium transition flex items-center gap-2"
              onClick={() => { setShowForm(true); setForm({}); setEditingId(null); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Job
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Generation Queued Banner */}
        {generationQueued && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"></div>
            <div>
              <p className="font-medium">Question generation in progress</p>
              <p className="text-sm text-blue-600">Estimated time: ~15 seconds. Questions will appear automatically.</p>
            </div>
          </div>
        )}

        {/* Add/Edit Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-900">{editingId ? 'Edit Job' : 'Create New Job'}</h2>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Job Title</label>
                  <input 
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-transparent transition" 
                    name="title" 
                    placeholder="e.g. Senior Software Engineer"
                    value={form.title || ''} 
                    onChange={handleFormChange} 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea 
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-transparent transition min-h-[120px]" 
                    name="description" 
                    placeholder="Describe the role, responsibilities, and requirements..."
                    value={form.description || ''} 
                    onChange={handleFormChange} 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Department (Optional)</label>
                  <input 
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-transparent transition" 
                    name="department" 
                    placeholder="e.g. Engineering, Marketing, Sales"
                    value={form.department || ''} 
                    onChange={handleFormChange} 
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    className="flex-1 px-4 py-3 border border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition"
                    onClick={() => { setShowForm(false); setForm({}); setEditingId(null); }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-4 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition"
                  >
                    {editingId ? 'Update Job' : 'Create Job'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Jobs List */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">All Jobs ({jobs.length})</h2>
            
            {loading ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-brand-500 border-t-transparent mx-auto mb-4"></div>
                <p className="text-gray-500">Loading jobs...</p>
              </div>
            ) : jobs.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <p className="text-gray-500 mb-4">No jobs created yet</p>
                <button 
                  className="text-brand-600 font-medium hover:underline"
                  onClick={() => { setShowForm(true); setForm({}); setEditingId(null); }}
                >
                  Create your first job
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {jobs.map(job => (
                  <div 
                    key={job.id} 
                    className={`bg-white rounded-2xl border transition cursor-pointer ${
                      selectedJobId === job.id 
                        ? 'border-brand-500 ring-2 ring-brand-100' 
                        : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
                    }`}
                    onClick={() => handleViewQuestions(job)}
                  >
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 text-lg">{job.title}</h3>
                          {job.department && (
                            <span className="inline-block mt-1 px-2.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                              {job.department}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleEdit(job); }}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(job.id); }}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-600 text-sm line-clamp-2 mb-4">{job.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">
                          {questions[job.id]?.length || 0} questions
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleGenerateQuestions(job.id); }}
                          disabled={generatingFor === job.id}
                          className="flex items-center gap-2 px-3 py-1.5 bg-brand-50 text-brand-600 text-sm font-medium rounded-lg hover:bg-brand-100 transition disabled:opacity-50"
                        >
                          {generatingFor === job.id ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border border-brand-600 border-t-transparent"></div>
                              Generating...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              Generate Questions
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Questions Panel */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {selectedJob ? `Questions for "${selectedJob.title}"` : 'Interview Questions'}
            </h2>
            
            {!selectedJobId ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-gray-500">Select a job to view its interview questions</p>
              </div>
            ) : questionsLoading ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-brand-500 border-t-transparent mx-auto mb-4"></div>
                <p className="text-gray-500">Loading questions...</p>
              </div>
            ) : (questions[selectedJobId] || []).length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <p className="text-gray-500 mb-4">No questions generated yet</p>
                <button
                  onClick={() => handleGenerateQuestions(selectedJobId)}
                  disabled={generatingFor === selectedJobId}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition disabled:opacity-50"
                >
                  {generatingFor === selectedJobId ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Generating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Generate AI Questions
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-2">
                {(questions[selectedJobId] || []).map((q, idx) => (
                  <div 
                    key={q.id} 
                    className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition"
                  >
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-8 h-8 bg-brand-100 text-brand-600 rounded-full flex items-center justify-center font-semibold text-sm">
                        {idx + 1}
                      </div>
                      <p className="text-gray-800 leading-relaxed flex-1">{q.text}</p>
                    </div>
                  </div>
                ))}
                
                {/* Refresh button */}
                <div className="pt-4 flex justify-center">
                  <button
                    onClick={() => fetchQuestions(selectedJobId)}
                    className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh Questions
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
