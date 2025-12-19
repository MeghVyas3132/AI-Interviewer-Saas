"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RestrictedAccessPage() {
  const router = useRouter();

  useEffect(() => {
    // Auto-redirect to interview-ended if user is in a token session
    const pathname = window.location.pathname;
    const tokenMatch = pathname.match(/\/interview\/([a-zA-Z0-9]+)/);
    if (tokenMatch) {
      // User is in a token session, redirect to interview-ended
      router.push('/interview-ended');
    }
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-6 bg-gradient-to-br from-red-50 to-orange-50">
      <div className="max-w-2xl w-full opacity-0 animate-[fadeInUp_0.6s_ease-out_0s_forwards]">
        <div className="scale-0 animate-[zoomIn_0.5s_ease-out_0.2s_forwards]">
          <AlertTriangle className="w-20 h-20 text-red-600 mx-auto mb-6" />
        </div>
        
        <h1 className="text-3xl font-bold mb-4 text-red-600">
          Restricted Access
        </h1>
        
        <p className="text-gray-700 mb-6 max-w-lg mx-auto text-lg leading-relaxed">
          You're currently in a secure interview session.  
          Access to other pages is disabled for privacy reasons.
        </p>
        
        <p className="text-gray-600 text-sm">
          Please complete your interview session to access the full application.
        </p>
      </div>
    </div>
  );
}

