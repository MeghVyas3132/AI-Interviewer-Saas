"use client";

import { PrepareFlow } from "@/components/prepare-flow";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { clearAllData, endInterviewSession } from "@/lib/data-store";

export default function PreparePage() {
    const handleStartFresh = () => {
        // Clear all data and end any active sessions
        endInterviewSession();
        clearAllData();
        // Reload the page to start completely fresh
        window.location.reload();
    };

    return (
        <div className="container mx-auto px-4 py-8 bg-transparent">
            <header className="mb-8">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-4xl font-headline font-bold text-primary">Interview Preparation</h1>
                        <p className="text-muted-foreground mt-2 text-lg">Follow the steps below to get ready for your mock interview.</p>
                    </div>
                    <Button 
                        variant="outline" 
                        onClick={handleStartFresh}
                        className="flex items-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Start Fresh
                    </Button>
                </div>
            </header>
            <PrepareFlow />
        </div>
    )
}