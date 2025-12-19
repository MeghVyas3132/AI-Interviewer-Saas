'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import type { AIInterviewSession } from '@/types/ai';

interface InterviewSessionProps {
    sessionId: string;
    candidateId: string;
    mode?: 'voice' | 'text';
    proctoringMode?: 'proctored' | 'unproctored';
}

/**
 * Minimal AI Interview Session Component
 * 
 * This is a lightweight wrapper that embeds the full AI interview functionality
 * For Phase 1, it uses an iframe to the AI service
 * Future phases will replace this with direct component rendering
 */
export function InterviewSession({
    sessionId,
    candidateId,
    mode = 'voice',
    proctoringMode,
}: InterviewSessionProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Verify session exists
        const verifySession = async () => {
            try {
                // In future, we'll call aiServiceClient.getInterviewSession(sessionId)
                setLoading(false);
            } catch (err) {
                setError('Failed to load interview session');
                setLoading(false);
            }
        };

        verifySession();
    }, [sessionId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
            </div>
        );
    }

    if (error) {
        return (
            <Card className="p-8 text-center">
                <div className="text-red-600 mb-4">{error}</div>
                <Button onClick={() => router.back()}>Go Back</Button>
            </Card>
        );
    }

    // Phase 1: Use iframe (temporary)
    // Phase 2+: Replace with direct component rendering
    const interviewUrl = `${process.env.NEXT_PUBLIC_AI_SERVICE_URL || 'http://localhost:3001'}/interview/${sessionId}?embedded=true`;

    return (
        <div className="w-full h-screen flex flex-col">
            <iframe
                src={interviewUrl}
                title="AI Interview Session"
                className="w-full flex-1 border-none"
                allow="microphone; camera; fullscreen"
                style={{ minHeight: '100vh' }}
            />
        </div>
    );
}
