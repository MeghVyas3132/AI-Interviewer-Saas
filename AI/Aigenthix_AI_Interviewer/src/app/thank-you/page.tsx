"use client";

import { CheckCircle2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export default function ThankYouPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Clear email interview session flags when user views thank-you page
    // This allows them to navigate away normally
    if (typeof window !== 'undefined') {
      localStorage.removeItem('isEmailInterviewSession');
      localStorage.removeItem('emailInterviewToken');
    }
    setMounted(true);
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-6 overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50"></div>
      
      {/* Decorative wave patterns */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200/20 rounded-full blur-3xl motion-safe:animate-pulse motion-reduce:animate-none"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-200/20 rounded-full blur-3xl motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-200/10 rounded-full blur-3xl motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center max-w-3xl w-full text-center">
        {/* Logo */}
        <div 
          className={cn(
            "mb-8 transition-all duration-1000 ease-out",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-8"
          )}
          style={{ transitionDelay: mounted ? '0ms' : '0ms' }}
        >
          <div className="relative w-32 h-32 mx-auto mb-4">
            <div className="absolute inset-0 bg-white rounded-2xl shadow-xl flex items-center justify-center p-4">
              <Image 
                src="/logo.png" 
                alt="AigenthixAI Powered Coach Logo" 
                width={96}
                height={96}
                className="object-contain"
                priority
              />
            </div>
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 via-purple-400/20 to-indigo-400/20 rounded-2xl blur-xl -z-10 motion-safe:animate-pulse motion-reduce:animate-none"></div>
          </div>
        </div>

        {/* Success Icon */}
        <div 
          className={cn(
            "mb-8 transition-all duration-1000 ease-out",
            mounted ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-8 scale-95"
          )}
          style={{ transitionDelay: mounted ? '300ms' : '0ms' }}
        >
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-green-400 rounded-full blur-2xl opacity-30 motion-safe:animate-ping motion-reduce:animate-none"></div>
            <div className="relative bg-gradient-to-br from-green-400 to-emerald-500 rounded-full p-6 shadow-2xl hover:scale-110 transition-transform duration-300">
              <CheckCircle2 className="w-16 h-16 text-white" strokeWidth={2.5} />
            </div>
          </div>
        </div>

        {/* Main Title */}
        <h1 
          className={cn(
            "text-5xl md:text-6xl font-headline font-extrabold mb-6 transition-all duration-1000 ease-out",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}
          style={{ transitionDelay: mounted ? '500ms' : '0ms' }}
        >
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600">
            Thank You for Your Interview
          </span>
          <span className="inline-block ml-3 text-4xl md:text-5xl motion-safe:animate-bounce motion-reduce:animate-none">🤝</span>
        </h1>

        {/* Main Message */}
        <div 
          className={cn(
            "mb-8 space-y-4 transition-all duration-1000 ease-out",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}
          style={{ transitionDelay: mounted ? '700ms' : '0ms' }}
        >
          <p className="text-xl md:text-2xl text-gray-700 max-w-2xl mx-auto leading-relaxed font-medium">
            Your responses have been successfully submitted. The complete interview summary and report have been sent to the admin.
          </p>
        </div>

        {/* Footer Message */}
        <div 
          className={cn(
            "transition-all duration-1000 ease-out",
            mounted ? "opacity-100" : "opacity-0"
          )}
          style={{ transitionDelay: mounted ? '900ms' : '0ms' }}
        >
          <p className="text-base md:text-lg text-gray-500 max-w-xl mx-auto leading-relaxed">
            You may now safely close this window or navigate away.
          </p>
        </div>

        {/* Decorative elements */}
        <div 
          className={cn(
            "mt-12 flex items-center justify-center gap-2 transition-all duration-1000 ease-out",
            mounted ? "opacity-100" : "opacity-0"
          )}
          style={{ transitionDelay: mounted ? '1100ms' : '0ms' }}
        >
          <Sparkles className="w-5 h-5 text-blue-400 motion-safe:animate-pulse motion-reduce:animate-none" />
          <div className="w-1 h-1 bg-purple-400 rounded-full motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-1 h-1 bg-indigo-400 rounded-full motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: '0.4s' }}></div>
          <Sparkles className="w-5 h-5 text-purple-400 motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: '0.6s' }} />
        </div>
      </div>
    </div>
  );
}

