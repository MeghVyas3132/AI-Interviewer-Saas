"use client";

import { XCircle } from "lucide-react";

export default function InvalidSessionPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-6 bg-gradient-to-br from-red-50 to-orange-50">
      <div className="max-w-2xl w-full opacity-0 animate-[fadeInUp_0.6s_ease-out_0s_forwards]">
        <div className="scale-0 animate-[zoomIn_0.5s_ease-out_0.2s_forwards]">
          <XCircle className="w-20 h-20 text-red-600 mx-auto mb-6" />
        </div>
        
        <h1 className="text-3xl font-bold mb-4 text-red-600">
          Invalid or Expired Session
        </h1>
        
        <p className="text-gray-700 mb-6 max-w-lg mx-auto text-lg leading-relaxed">
          The interview link you're trying to access is invalid or has expired.
        </p>
        
        <p className="text-gray-600 mb-8 text-sm">
          Please contact the administrator for a new interview link.
        </p>
      </div>
    </div>
  );
}

