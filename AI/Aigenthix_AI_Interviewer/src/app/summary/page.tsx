"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SummaryDisplay } from "@/components/summary-display";

export default function SummaryPage() {
    const router = useRouter();

    useEffect(() => {
        // Block access for email-based interview sessions (token-based)
        // They should see thank-you page instead
        if (typeof window !== 'undefined') {
            const isEmailSession = localStorage.getItem('isEmailInterviewSession') === 'true';
            
            if (isEmailSession) {
                // Clear session flags and redirect to thank-you
                localStorage.removeItem('isEmailInterviewSession');
                localStorage.removeItem('emailInterviewToken');
                router.replace('/thank-you');
            }
        }
    }, [router]);

    return (
        <div className="container mx-auto px-4 py-8 bg-transparent">
            <header className="mb-8 text-center">
                <h1 className="text-4xl font-headline font-bold text-primary">Interview Summary</h1>
                <p className="text-muted-foreground mt-2 text-lg">Here's a breakdown of your performance. Use this feedback to improve for your next interview!</p>
            </header>
            <SummaryDisplay />
        </div>
    )
}