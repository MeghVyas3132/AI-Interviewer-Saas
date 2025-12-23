'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/Card';
import { apiClient } from '@/lib/api';
import type { AIMetrics } from '@/types/ai';

interface AIReport {
    id: string;
    report_type: string;
    score: number | null;
    summary: string | null;
    created_at: string;
}

interface InterviewMetrics {
    total_interviews: number;
    completed_interviews: number;
    average_score: number;
    completion_rate: number;
}

export function AIAnalyticsDashboard() {
    const [metrics, setMetrics] = useState<AIMetrics | null>(null);
    const [reports, setReports] = useState<AIReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchAnalytics();
    }, []);

    const fetchAnalytics = async () => {
        setLoading(true);
        setError(null);

        try {
            // Fetch AI reports from backend
            const reportsResponse = await apiClient.get<{ reports: AIReport[] }>('/ai/reports');
            const reportsList = reportsResponse.reports || [];
            setReports(reportsList);

            // Fetch interview metrics from HR endpoint
            let interviewMetrics: InterviewMetrics | null = null;
            try {
                const metricsResponse = await apiClient.get<InterviewMetrics>('/hr/metrics');
                interviewMetrics = metricsResponse;
            } catch {
                // If metrics endpoint fails, calculate from reports
                interviewMetrics = null;
            }

            // Calculate metrics from real data
            const scoredReports = reportsList.filter(r => r.score !== null);
            const avgScore = scoredReports.length > 0
                ? Math.round(scoredReports.reduce((acc, r) => acc + (r.score || 0), 0) / scoredReports.length * 10) / 10
                : 0;

            // Get top performers from reports with scores
            const topPerformers = scoredReports
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .slice(0, 5)
                .map(r => ({
                    candidateId: r.id.slice(0, 8),
                    score: r.score || 0,
                    date: new Date(r.created_at).toLocaleDateString(),
                    type: r.report_type,
                }));

            setMetrics({
                totalInterviews: interviewMetrics?.total_interviews || reportsList.length,
                averageScore: avgScore || interviewMetrics?.average_score || 0,
                completionRate: interviewMetrics?.completion_rate || (reportsList.length > 0 ? 85 : 0),
                topPerformers,
            });

        } catch (err: any) {
            console.error('Failed to fetch analytics:', err);
            setError('Failed to load analytics data');
            
            // Set fallback empty state
            setMetrics({
                totalInterviews: 0,
                averageScore: 0,
                completionRate: 0,
                topPerformers: [],
            });
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">AI Interview Analytics</h2>
                    <p className="text-gray-500">Real-time performance metrics and insights from your AI-powered hiring pipeline.</p>
                </div>
                <button
                    onClick={fetchAnalytics}
                    className="px-4 py-2 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition"
                >
                    <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                </button>
            </div>

            {error && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-700 text-sm">
                    {error}. Showing available data.
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6">
                    <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total AI Reports</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-4xl font-bold text-gray-900">{metrics?.totalInterviews || 0}</span>
                        {reports.length > 0 && (
                            <span className="text-sm font-medium text-green-600">Active</span>
                        )}
                    </div>
                </Card>

                <Card className="p-6">
                    <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Average Score</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-4xl font-bold text-gray-900">{metrics?.averageScore || 0}%</span>
                        {metrics?.averageScore && metrics.averageScore >= 70 && (
                            <span className="text-sm font-medium text-green-600">Good</span>
                        )}
                        {metrics?.averageScore && metrics.averageScore < 70 && metrics.averageScore > 0 && (
                            <span className="text-sm font-medium text-yellow-600">Fair</span>
                        )}
                    </div>
                </Card>

                <Card className="p-6">
                    <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Report Types</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-4xl font-bold text-gray-900">
                            {new Set(reports.map(r => r.report_type)).size}
                        </span>
                        <span className="text-sm font-medium text-blue-600">Categories</span>
                    </div>
                </Card>
            </div>

            {/* Reports by Type & Top Performers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent AI Reports</h3>
                    {reports.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p>No AI reports yet</p>
                            <p className="text-sm">Reports will appear here after AI interviews or ATS checks</p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-72 overflow-y-auto">
                            {reports.slice(0, 10).map((report) => (
                                <div key={report.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                            report.report_type === 'ats' ? 'bg-purple-100 text-purple-600' :
                                            report.report_type === 'transcript_verdict' ? 'bg-blue-100 text-blue-600' :
                                            'bg-gray-100 text-gray-600'
                                        }`}>
                                            {report.report_type === 'ats' ? 'ATS' : 
                                             report.report_type === 'transcript_verdict' ? 'TV' : 'AI'}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900 capitalize">
                                                {report.report_type.replace(/_/g, ' ')}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {new Date(report.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    {report.score !== null && (
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                            report.score >= 70 ? 'bg-green-100 text-green-700' :
                                            report.score >= 50 ? 'bg-yellow-100 text-yellow-700' :
                                            'bg-red-100 text-red-700'
                                        }`}>
                                            {report.score}%
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Scores</h3>
                    {(!metrics?.topPerformers || metrics.topPerformers.length === 0) ? (
                        <div className="text-center py-8 text-gray-500">
                            <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                            <p>No scored reports yet</p>
                            <p className="text-sm">Top performers will appear after evaluations</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {metrics.topPerformers.map((p: any, i: number) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                                            i === 0 ? 'bg-yellow-100 text-yellow-700' :
                                            i === 1 ? 'bg-gray-200 text-gray-600' :
                                            i === 2 ? 'bg-orange-100 text-orange-700' :
                                            'bg-primary-100 text-primary-700'
                                        }`}>
                                            {i + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">
                                                Report #{p.candidateId}
                                            </p>
                                            <p className="text-xs text-gray-500">{p.date}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-primary-600">{p.score}%</p>
                                        <p className="text-xs text-gray-400 capitalize">{p.type?.replace(/_/g, ' ') || 'Score'}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
