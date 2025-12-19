"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Shield, ShieldOff, ArrowRight, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModeSelectionProps {
  onModeSelect: (mode: "proctored" | "unproctored") => void;
}

export function ModeSelection({ onModeSelect }: ModeSelectionProps) {
  const [selectedMode, setSelectedMode] = useState<"proctored" | "unproctored" | null>(null);

  const handleContinue = () => {
    if (selectedMode) {
      onModeSelect(selectedMode);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Choose Interview Mode
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Select your preferred interview experience. This setting will determine the monitoring level during your interview session.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Proctored Mode Card */}
          <Card 
            className={cn(
              "cursor-pointer transition-all duration-200 hover:shadow-lg",
              selectedMode === "proctored" 
                ? "ring-2 ring-red-500 bg-red-50" 
                : "hover:ring-2 hover:ring-red-300"
            )}
            onClick={() => setSelectedMode("proctored")}
          >
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 p-3 bg-red-100 rounded-full w-fit">
                <Shield className="h-8 w-8 text-red-600" />
              </div>
              <CardTitle className="text-2xl text-gray-900">
                Proctored Mode (Strict)
              </CardTitle>
              <Badge variant="destructive" className="mx-auto mt-2">
                🔴 Strict Monitoring
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <p className="text-gray-600 mb-4">
                  Full monitoring with strict anti-cheating measures
                </p>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">Fullscreen Required</p>
                    <p className="text-sm text-gray-600">Must stay in fullscreen mode</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">No Tab Switching</p>
                    <p className="text-sm text-gray-600">Cannot switch tabs or minimize window</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">Auto-Termination</p>
                    <p className="text-sm text-gray-600">Interview ends if rules are violated</p>
                  </div>
                </div>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-4">
                <p className="text-sm text-red-800 font-medium">
                  ⚠️ Tab switching and minimizing not allowed
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Unproctored Mode Card */}
          <Card 
            className={cn(
              "cursor-pointer transition-all duration-200 hover:shadow-lg",
              selectedMode === "unproctored" 
                ? "ring-2 ring-green-500 bg-green-50" 
                : "hover:ring-2 hover:ring-green-300"
            )}
            onClick={() => setSelectedMode("unproctored")}
          >
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 p-3 bg-green-100 rounded-full w-fit">
                <ShieldOff className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle className="text-2xl text-gray-900">
                Unproctored Mode (Flexible)
              </CardTitle>
              <Badge variant="secondary" className="mx-auto mt-2 bg-green-100 text-green-800">
                🟢 Flexible Monitoring
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <p className="text-gray-600 mb-4">
                  Relaxed monitoring with flexible browser usage
                </p>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">Tab Switching Allowed</p>
                    <p className="text-sm text-gray-600">Can switch tabs freely</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">Window Minimizing OK</p>
                    <p className="text-sm text-gray-600">Can minimize or resize window</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">Auto-Resume</p>
                    <p className="text-sm text-gray-600">Automatically resumes when focused</p>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-4">
                <p className="text-sm text-green-800 font-medium">
                  ✅ You can switch tabs or minimize freely
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mt-8">
          <Button
            onClick={handleContinue}
            disabled={!selectedMode}
            size="lg"
            className="px-8 py-3 text-lg"
          >
            Continue to Interview
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          
          {selectedMode && (
            <p className="text-sm text-gray-600 mt-4">
              Selected: <span className="font-medium">
                {selectedMode === "proctored" ? "🔴 Proctored Mode" : "🟢 Unproctored Mode"}
              </span>
            </p>
          )}
        </div>

        <div className="text-center mt-6">
          <p className="text-sm text-gray-500">
            You can change this setting anytime before starting the interview
          </p>
        </div>
      </div>
    </div>
  );
}
