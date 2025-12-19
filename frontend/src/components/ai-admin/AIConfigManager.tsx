'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { aiServiceClient } from '@/services/ai-service-client';
import type { AIExam, AISubcategory } from '@/types/ai';

export function AIConfigManager() {
    const [exams, setExams] = useState<AIExam[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchExams = async () => {
            try {
                const data = await aiServiceClient.getExams();
                setExams(data);
                setLoading(false);
            } catch (err) {
                console.error('Failed to fetch exams:', err);
                setError('Failed to load AI configurations. Ensure the AI service is running on port 3001.');
                setLoading(false);
            }
        };

        fetchExams();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
        );
    }

    if (error) {
        return (
            <Card className="p-8 text-center bg-red-50 border-red-100">
                <div className="text-red-600 mb-4">{error}</div>
                <Button onClick={() => window.location.reload()}>Retry</Button>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">AI Interview Templates</h2>
                    <p className="text-gray-500">Manage your AI-powered interview configurations and question banks.</p>
                </div>
                <Button onClick={() => window.open(`${process.env.NEXT_PUBLIC_AI_SERVICE_URL || 'http://localhost:3001'}/admin/exams`, '_blank')}>
                    Open Advanced Editor
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {exams.map((exam) => (
                    <div key={exam.id}>
                        <Card className="hover:shadow-md transition-shadow">
                            <div className="p-1">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">{exam.name}</h3>
                                <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                                    {exam.description || 'No description provided.'}
                                </p>
                                <div className="flex items-center justify-between mt-auto">
                                    <span className="text-xs font-medium px-2 py-1 bg-blue-50 text-blue-600 rounded-full">
                                        {exam.subcategories?.length || 0} Categories
                                    </span>
                                    <button
                                        className="text-primary-600 text-sm font-medium hover:underline"
                                        onClick={() => window.open(`${process.env.NEXT_PUBLIC_AI_SERVICE_URL || 'http://localhost:3001'}/admin/exams/${exam.id}`, '_blank')}
                                    >
                                        Edit Config
                                    </button>
                                </div>
                            </div>
                        </Card>
                    </div>
                ))}

                <Card className="border-dashed border-2 flex items-center justify-center p-8 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => window.open(`${process.env.NEXT_PUBLIC_AI_SERVICE_URL || 'http://localhost:3001'}/admin/exams/new`, '_blank')}>
                    <div className="text-center">
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                        <p className="text-sm font-medium text-gray-900">Create New Template</p>
                    </div>
                </Card>
            </div>
        </div>
    );
}
