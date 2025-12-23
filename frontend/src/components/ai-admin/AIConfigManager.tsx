'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/Card';
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

export function AIConfigManager() {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(false);
    const [questionsLoading, setQuestionsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [generatingFor, setGeneratingFor] = useState<string | null>(null);

    useEffect(() => {
        fetchJobs();
    }, []);

    const fetchJobs = async () => {
        setLoading(true);
        try {
            const data = await apiClient.get<Job[]>('/jobs');
            setJobs(data || []);
        } catch (err) {
            console.error('Failed to load jobs:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchQuestions = async (jobId: string) => {
        setQuestionsLoading(true);
        try {
            const data = await apiClient.get<Question[]>(`/jobs/${jobId}/questions`);
            setQuestions(data || []);
        } catch (err) {
            console.error('Failed to load questions:', err);
            setQuestions([]);
        } finally {
            setQuestionsLoading(false);
        }
    };

    const handleSelectJob = (job: Job) => {
        setSelectedJob(job);
        fetchQuestions(job.id);
    };

    const handleGenerateQuestions = async (jobId: string) => {
        setGeneratingFor(jobId);
        try {
            await apiClient.post(`/jobs/${jobId}/generate-questions`, {});
            // Refresh questions after generation
            if (selectedJob?.id === jobId) {
                fetchQuestions(jobId);
            }
        } catch (err) {
            console.error('Failed to generate questions:', err);
        } finally {
            setGeneratingFor(null);
        }
    };

    const filteredJobs = jobs.filter(job =>
        job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (job.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (job.department || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">AI Interview Questions</h2>
                    <p className="text-gray-500">View and generate AI questions for job roles</p>
                </div>
                <a href="/hr/jobs" className="btn-primary">
                    Manage Jobs
                </a>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <input
                    type="text"
                    placeholder="Search job roles..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-3 pl-10 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
                <svg className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Job List */}
                <div className="space-y-4">
                    <h3 className="font-semibold text-gray-700">Job Roles ({filteredJobs.length})</h3>
                    
                    {loading ? (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mx-auto"></div>
                        </div>
                    ) : filteredJobs.length === 0 ? (
                        <Card className="p-6 text-center text-gray-500">
                            {searchTerm ? 'No jobs match your search' : 'No jobs created yet'}
                        </Card>
                    ) : (
                        <div className="space-y-2 max-h-[500px] overflow-y-auto">
                            {filteredJobs.map(job => (
                                <Card
                                    key={job.id}
                                    className={`p-4 cursor-pointer transition hover:shadow-md ${
                                        selectedJob?.id === job.id ? 'ring-2 ring-brand-500 bg-brand-50' : ''
                                    }`}
                                    onClick={() => handleSelectJob(job)}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <h4 className="font-semibold text-gray-900">{job.title}</h4>
                                            {job.department && (
                                                <span className="text-xs text-gray-500">{job.department}</span>
                                            )}
                                            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{job.description}</p>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleGenerateQuestions(job.id);
                                            }}
                                            disabled={generatingFor === job.id}
                                            className="ml-2 px-3 py-1.5 text-xs bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
                                        >
                                            {generatingFor === job.id ? 'Generating...' : 'Generate'}
                                        </button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                {/* Questions Panel */}
                <div className="space-y-4">
                    <h3 className="font-semibold text-gray-700">
                        {selectedJob ? `Questions for "${selectedJob.title}"` : 'Select a job to view questions'}
                    </h3>
                    
                    {selectedJob ? (
                        questionsLoading ? (
                            <div className="text-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mx-auto"></div>
                            </div>
                        ) : questions.length === 0 ? (
                            <Card className="p-6 text-center">
                                <p className="text-gray-500 mb-4">No questions generated yet</p>
                                <button
                                    onClick={() => handleGenerateQuestions(selectedJob.id)}
                                    disabled={generatingFor === selectedJob.id}
                                    className="btn-primary"
                                >
                                    {generatingFor === selectedJob.id ? 'Generating...' : 'Generate Questions'}
                                </button>
                            </Card>
                        ) : (
                            <div className="space-y-2 max-h-[500px] overflow-y-auto">
                                {questions.map((q, idx) => (
                                    <Card key={q.id} className="p-4">
                                        <div className="flex gap-3">
                                            <span className="flex-shrink-0 w-6 h-6 bg-brand-100 text-brand-600 rounded-full flex items-center justify-center text-sm font-semibold">
                                                {idx + 1}
                                            </span>
                                            <p className="text-gray-800">{q.text}</p>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )
                    ) : (
                        <Card className="p-8 text-center text-gray-400">
                            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p>Click on a job role to view its AI-generated interview questions</p>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
