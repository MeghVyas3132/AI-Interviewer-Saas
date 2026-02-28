'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/Card';
import { apiClient } from '@/lib/api';

interface AIConfig {
    id: string | null;
    company_id: string;
    min_passing_score: number;
    min_ats_score: number;
    auto_reject_below: number | null;
    require_employee_review: boolean;
    ats_enabled: boolean;
    ai_verdict_enabled: boolean;
}

interface AIConfigManagerProps {
    readOnly?: boolean;
}

export function AIConfigManager({ readOnly = false }: AIConfigManagerProps) {
    const [config, setConfig] = useState<AIConfig>({
        id: null,
        company_id: '',
        min_passing_score: 70,
        min_ats_score: 60,
        auto_reject_below: null,
        require_employee_review: true,
        ats_enabled: true,
        ai_verdict_enabled: true,
    });
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const data = await apiClient.get<AIConfig>('/ai/config');
            if (data) {
                setConfig(data);
            }
        } catch (err) {
            console.error('Failed to load AI config:', err);
        }
    };

    const handleSaveConfig = async () => {
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            await apiClient.put('/ai/config', {
                min_passing_score: config.min_passing_score,
                min_ats_score: config.min_ats_score,
                auto_reject_below: config.auto_reject_below,
                require_employee_review: config.require_employee_review,
                ats_enabled: config.ats_enabled,
                ai_verdict_enabled: config.ai_verdict_enabled,
            });
            setSuccess('AI settings saved successfully!');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">AI Configuration</h2>
                    <p className="text-gray-500">Configure AI evaluation thresholds and settings</p>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 border-b border-gray-200">
                <button
                    className="px-4 py-2 text-sm font-medium border-b-2 transition-colors border-brand-500 text-brand-600"
                >
                    AI Settings
                </button>
            </div>

            {/* Success/Error Messages */}
            {success && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl">
                    {success}
                </div>
            )}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Scoring Thresholds */}
                    <Card className="p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-brand-100 rounded-lg flex items-center justify-center">
                                <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">Scoring Thresholds</h3>
                                <p className="text-sm text-gray-500">Set minimum scores for AI evaluations</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {/* Minimum Passing Score */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Minimum Passing Score (%)
                                </label>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="range"
                                        min="50"
                                        max="100"
                                        value={config.min_passing_score}
                                        onChange={(e) => setConfig(prev => ({
                                            ...prev,
                                            min_passing_score: parseInt(e.target.value)
                                        }))}
                                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
                                    />
                                    <span className="w-14 text-center font-bold text-brand-600 text-lg">
                                        {config.min_passing_score}%
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Candidates must score at least this to pass the AI interview
                                </p>
                            </div>

                            {/* Minimum ATS Score */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Minimum ATS Score (%)
                                </label>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="range"
                                        min="40"
                                        max="100"
                                        value={config.min_ats_score}
                                        onChange={(e) => setConfig(prev => ({
                                            ...prev,
                                            min_ats_score: parseInt(e.target.value)
                                        }))}
                                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
                                    />
                                    <span className="w-14 text-center font-bold text-brand-600 text-lg">
                                        {config.min_ats_score}%
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Minimum resume ATS score for candidates to proceed
                                </p>
                            </div>

                            {/* Auto Reject Threshold */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Auto-Reject Below Score (optional)
                                </label>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="number"
                                        min="0"
                                        max="50"
                                        value={config.auto_reject_below || ''}
                                        placeholder="None"
                                        onChange={(e) => setConfig(prev => ({
                                            ...prev,
                                            auto_reject_below: e.target.value ? parseInt(e.target.value) : null
                                        }))}
                                        className="w-24 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                                    />
                                    <span className="text-gray-500">%</span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Automatically reject candidates below this score (leave empty to disable)
                                </p>
                            </div>
                        </div>
                    </Card>

                    {/* Feature Settings */}
                    <Card className="p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">Feature Settings</h3>
                                <p className="text-sm text-gray-500">Enable or disable AI features</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {/* Require Employee Review */}
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                <div>
                                    <h4 className="font-medium text-gray-900">Require Employee Review</h4>
                                    <p className="text-sm text-gray-500">Employees must review AI decisions before final verdict</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={config.require_employee_review}
                                        onChange={(e) => setConfig(prev => ({
                                            ...prev,
                                            require_employee_review: e.target.checked
                                        }))}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                                </label>
                            </div>

                            {/* ATS Enabled */}
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                <div>
                                    <h4 className="font-medium text-gray-900">ATS Resume Checking</h4>
                                    <p className="text-sm text-gray-500">Analyze resumes with AI before interviews</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={config.ats_enabled}
                                        onChange={(e) => setConfig(prev => ({
                                            ...prev,
                                            ats_enabled: e.target.checked
                                        }))}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                                </label>
                            </div>

                            {/* AI Verdict Enabled */}
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                <div>
                                    <h4 className="font-medium text-gray-900">AI Verdict Generation</h4>
                                    <p className="text-sm text-gray-500">Automatically generate verdicts after interviews</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={config.ai_verdict_enabled}
                                        onChange={(e) => setConfig(prev => ({
                                            ...prev,
                                            ai_verdict_enabled: e.target.checked
                                        }))}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                                </label>
                            </div>
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={handleSaveConfig}
                            disabled={saving}
                            className="w-full mt-6 px-4 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
                        >
                            {saving ? 'Saving...' : 'Save AI Settings'}
                        </button>
                    </Card>
                </div>
        </div>
    );
}
