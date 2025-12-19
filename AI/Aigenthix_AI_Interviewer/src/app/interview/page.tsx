"use client";

import { InterviewSession } from "@/components/interview-session";
import { ModeSelection } from "@/components/mode-selection";
import { useState, useEffect } from "react";
import { getProctoringMode, setProctoringMode } from "@/lib/data-store";

export default function InterviewPage() {
    const [showModeSelection, setShowModeSelection] = useState(true);
    const [proctoringMode, setProctoringModeState] = useState<"proctored" | "unproctored" | null>(null);

    // Check if mode was already selected
    useEffect(() => {
        const savedMode = getProctoringMode();
        if (savedMode) {
            setProctoringModeState(savedMode);
            setShowModeSelection(false);
        }
    }, []);

    const handleModeSelect = (mode: "proctored" | "unproctored") => {
        setProctoringMode(mode);
        setProctoringModeState(mode);
        setShowModeSelection(false);
    };

    if (showModeSelection) {
        return (
            <div className="w-full h-screen">
                <ModeSelection onModeSelect={handleModeSelect} />
            </div>
        );
    }

    return (
        <div className="w-full h-screen">
            <InterviewSession proctoringMode={proctoringMode} />
        </div>
    );
}
