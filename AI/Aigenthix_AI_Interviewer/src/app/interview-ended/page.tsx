"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function InterviewEndedPage() {
  const router = useRouter();

  useEffect(() => {
    // Check if this is an email-based interview session
    // If so, redirect to thank-you page instead
    if (typeof window !== 'undefined') {
      const isEmailSession = localStorage.getItem('isEmailInterviewSession') === 'true';
      const abandonRedirectUrl = sessionStorage.getItem('abandonRedirectUrl');
      
      if (isEmailSession || abandonRedirectUrl) {
        // Clear session flags
        localStorage.removeItem('isEmailInterviewSession');
        localStorage.removeItem('emailInterviewToken');
        sessionStorage.removeItem('abandonRedirectUrl');
        
        // Redirect to thank-you page
        router.replace('/thank-you');
      }
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-2xl font-semibold">Interview Ended</h1>
        <p className="text-muted-foreground">
          Your interview has ended because the session lost focus or fullscreen was
          exited. You can return to preparation to start a new interview.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/prepare">
            <Button>Go to Preparation</Button>
          </Link>
          <Link href="/">
            <Button variant="outline">Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}


