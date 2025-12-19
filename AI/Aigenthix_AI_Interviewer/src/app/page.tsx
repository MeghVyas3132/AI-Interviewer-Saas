import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FileText, MessageCircleQuestion, Mic, ArrowRight, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 px-6 py-12 lg:px-12 lg:py-20">
        <section className="max-w-6xl mx-auto text-center mb-12">
          <div className="mb-6">
            <div className="inline-block mb-8">
              <div className="text-center">
                <img
                  src="/logo.png"
                  alt="Aigenthix Logo"
                  className="mx-auto mb-3 max-h-52 lg:max-h-84 object-contain"
                />
              </div>
            </div>
          </div>
          <h1 className="text-5xl lg:text-6xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 mb-6 leading-tight">
            Welcome to Aigenthix AI Powered Coach
          </h1>
          <p className="text-lg lg:text-xl text-gray-700 max-w-4xl mx-auto leading-relaxed mb-10 font-semibold">
            Your personal AI-powered coach to help you ace your next exam or interview. Analyze your resume, generate tailored questions, and practice with a mock interview to get real-time feedback.
          </p>
          <Button
            asChild
            size="lg"
            className="rounded-full px-8 py-6 text-[16px] font-semibold bg-[#4F63F0] hover:bg-[#4556E8] text-white shadow-[0_8px_24px_rgba(79,99,240,0.35)] hover:shadow-[0_12px_32px_rgba(79,99,240,0.45)] transition-all duration-200 border-0 h-14"
          >
            <Link href="/prepare">
              <span className="inline-flex items-center gap-3">
                Start Your Preparation 
                <ArrowRight className="w-5 h-5" />
              </span>
            </Link>
          </Button>
        </section>

        <section className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="bg-white rounded-2xl border border-slate-200 shadow-[0_10px_30px_rgba(0,0,0,0.06)] hover:shadow-[0_16px_40px_rgba(0,0,0,0.10)] transition-shadow duration-300">
            <CardContent className="p-8">
              <div className="w-14 h-14 rounded-2xl bg-white shadow-[0_6px_18px_rgba(0,0,0,0.08)] flex items-center justify-center mb-6">
                <FileText className="w-7 h-7 text-blue-600" />
              </div>
              <CardTitle className="text-xl font-extrabold text-slate-900 mb-3">Resume Role Mapper</CardTitle>
              <CardDescription className="text-slate-600 leading-relaxed">
                Upload your resume to extract key skills and experiences. Our AI matches your profile to target job roles, giving you a clear picture of your strengths.
              </CardDescription>
            </CardContent>
          </Card>
          <Card className="bg-white rounded-2xl border border-slate-200 shadow-[0_10px_30px_rgba(0,0,0,0.06)] hover:shadow-[0_16px_40px_rgba(0,0,0,0.10)] transition-shadow duration-300">
            <CardContent className="p-8">
              <div className="w-14 h-14 rounded-2xl bg-white shadow-[0_6px_18px_rgba(0,0,0,0.08)] flex items-center justify-center mb-6">
                <MessageCircleQuestion className="w-7 h-7 text-indigo-600" />
              </div>
              <CardTitle className="text-xl font-extrabold text-slate-900 mb-3">Question Generator</CardTitle>
              <CardDescription className="text-slate-600 leading-relaxed">
                Get a list of role- and company-specific interview questions. Our AI generates questions adapted to your resume for a truly personalized practice session.
              </CardDescription>
            </CardContent>
          </Card>
          <Card className="bg-white rounded-2xl border border-slate-200 shadow-[0_10px_30px_rgba(0,0,0,0.06)] hover:shadow-[0_16px_40px_rgba(0,0,0,0.10)] transition-shadow duration-300">
            <CardContent className="p-8">
              <div className="w-14 h-14 rounded-2xl bg-white shadow-[0_6px_18px_rgba(0,0,0,0.08)] flex items-center justify-center mb-6">
                <Mic className="w-7 h-7 text-purple-600" />
              </div>
              <CardTitle className="text-xl font-extrabold text-slate-900 mb-3">Spoken Mock Interviews</CardTitle>
              <CardDescription className="text-slate-600 leading-relaxed">
                Practice your answers in a realistic, spoken mock interview. Receive instant, AI-driven feedback on your content, tone, and clarity to improve your performance.
              </CardDescription>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
