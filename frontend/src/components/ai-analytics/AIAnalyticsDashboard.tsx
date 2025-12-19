'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/Card';
import { aiServiceClient } from '@/services/ai-service-client';
import type { AIMetrics } from '@/types/ai';

export function AIAnalyticsDashboard() {
    const [metrics, setMetrics] = useState<AIMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const data = await aiServiceClient.getInterviewMetrics();
                setMetrics(data);
                setLoading(false);
            } catch (err) {
                console.error('Failed to fetch metrics:', err);
                // Fallback or error state
                setError('Failed to load real-time analytics. Showing simulated data.');
                setMetrics({
                    totalInterviews: 156,
                    averageScore: 78.4,
                    completionRate: 92.5,
                    topPerformers: [
                        { candidateId: '1', score: 95, date: '2023-11-20' },
                        { candidateId: '2', score: 92, date: '2023-11-19' },
                        { candidateId: '3', score: 90, date: '2023-11-18' },
                    ]
                });
                setLoading(false);
            }
        };

        fetchMetrics();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">AI Interview Analytics</h2>
                <p className="text-gray-500">Real-time performance metrics and insights from your AI-powered hiring pipeline.</p>
            </div>

            {error && (
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-lg text-amber-700 text-sm flex items-center gap-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6">
                    <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total AI Interviews</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-4xl font-bold text-gray-900">{metrics?.totalInterviews}</span>
                        <span className="text-sm font-medium text-green-600">↑ 12%</span>
                    </div>
                </Card>

                <Card className="p-6">
                    <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Average Match Score</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-4xl font-bold text-gray-900">{metrics?.averageScore}%</span>
                        <span className="text-sm font-medium text-blue-600">Stable</span>
                    </div>
                </Card>

                <Card className="p-6">
                    <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Completion Rate</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-4xl font-bold text-gray-900">{metrics?.completionRate}%</span>
                        <span className="text-sm font-medium text-green-600">↑ 5%</span>
                    </div>
                </Card>
            </div>

            {/* Charts / Details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Distribution</h3>
                    <div className="h-64 flex items-end justify-between gap-2">
                        {[35, 45, 65, 85, 95, 75, 55].map((h, i) => (
                            <div key={i} className="flex-1 bg-primary-100 group relative">
                                <div
                                    className="bg-primary-600 w-full rounded-t-sm group-hover:bg-primary-500 transition-all cursor-pointer"
                                    style={{ height: `${h}%` }}
                                />
                                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                    {h}%
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 flex justify-between text-xs text-gray-400">
                        <span>Mon</span>
                        <span>Tue</span>
                        <span>Wed</span>
                        <span>Thu</span>
                        <span>Fri</span>
                        <span>Sat</span>
                        <span>Sun</span>
                    </div>
                </Card>

                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Performing Candidates (AI Evaluation)</h3>
                    <div className="space-y-4">
                        {metrics?.topPerformers.map((p, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-xs">
                                        {i + 1}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">Candidate ID: {p.candidateId}</p>
                                        <p className="text-xs text-gray-500">{p.date}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-bold text-primary-600">{p.score}%</p>
                                    <p className="text-xs text-gray-400">Match</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
}
