'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Database, BookOpen, FileText, Users, LogOut, Shield, Loader2, RefreshCw, Calendar, TrendingUp, Settings2 } from 'lucide-react';
import { ExamManager } from '@/components/admin/exam-manager';
import { SubcategoryManager } from '@/components/admin/subcategory-manager';
import { QuestionManager } from '@/components/admin/question-manager';
import { CATQuestionManager } from '@/components/admin/cat-question-manager';
import { ExamConfigManager } from '@/components/admin/exam-config-manager';
import { CandidateManager } from '@/components/admin/candidate-manager';
import { InterviewSessionManager } from '@/components/admin/interview-session-manager';

interface DashboardStats {
  totalExams: number;
  totalSubcategories: number;
  totalQuestions: number;
  totalCATQuestions: number;
  totalExamConfigs: number;
  totalCandidates: number;
  totalInterviewSessions: number;
}

interface AdminUser {
  username: string;
  isAuthenticated: boolean;
}

export default function AdminPanel() {
  const [stats, setStats] = useState<DashboardStats>({
    totalExams: 0,
    totalSubcategories: 0,
    totalQuestions: 0,
    totalCATQuestions: 0,
    totalExamConfigs: 0,
    totalCandidates: 0,
    totalInterviewSessions: 0
  });
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<AdminUser | null>(null);
  const router = useRouter();

  // Check authentication on component mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/admin/auth/me');
      const data = await response.json();
      
      if (data.success) {
        setUser(data.user);
      } else {
        router.push('/admin/login');
        return;
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      router.push('/admin/login');
      return;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
      router.push('/admin/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  useEffect(() => {
    if (user?.isAuthenticated) {
      fetchStats();
    }
  }, [user]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const [examsRes, subcategoriesRes, questionsRes, catQuestionsRes, examConfigsRes, candidatesRes, sessionsRes] = await Promise.all([
        fetch('/api/admin/exams-postgres'),
        fetch('/api/admin/subcategories-postgres'),
        fetch('/api/admin/questions-postgres'),
        fetch('/api/admin/cat-questions-postgres'),
        fetch('/api/admin/exam-configs-postgres'),
        fetch('/api/admin/candidates'),
        fetch('/api/admin/interview-sessions')
      ]);

      const [exams, subcategories, questions, catQuestions, examConfigs, candidates, sessions] = await Promise.all([
        examsRes.json(),
        subcategoriesRes.json(),
        questionsRes.json(),
        catQuestionsRes.json(),
        examConfigsRes.json(),
        candidatesRes.json(),
        sessionsRes.json()
      ]);

      setStats({
        totalExams: exams.data?.length || 0,
        totalSubcategories: subcategories.data?.length || 0,
        totalQuestions: questions.pagination?.total || questions.data?.length || 0,
        totalCATQuestions: catQuestions.pagination?.total || catQuestions.data?.length || 0,
        totalExamConfigs: examConfigs.data?.length || 0,
        totalCandidates: candidates.data?.length || 0,
        totalInterviewSessions: sessions.data?.length || 0
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchStats();
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!user?.isAuthenticated) {
    return null; // Will redirect to login
  }

  // Stats card configuration with colors and icons
  const statsConfig = [
    { 
      key: 'totalExams' as keyof DashboardStats, 
      label: 'Total Exams', 
      description: 'Active exams',
      icon: Database,
      gradient: 'from-blue-500 to-blue-600',
      bgGradient: 'from-blue-50 to-blue-100'
    },
    { 
      key: 'totalSubcategories' as keyof DashboardStats, 
      label: 'Subcategories', 
      description: 'Question categories',
      icon: BookOpen,
      gradient: 'from-purple-500 to-purple-600',
      bgGradient: 'from-purple-50 to-purple-100'
    },
    { 
      key: 'totalQuestions' as keyof DashboardStats, 
      label: 'Questions', 
      description: 'Interview questions',
      icon: FileText,
      gradient: 'from-indigo-500 to-indigo-600',
      bgGradient: 'from-indigo-50 to-indigo-100'
    },
    { 
      key: 'totalCATQuestions' as keyof DashboardStats, 
      label: 'Time provided Questions', 
      description: 'CAT-specific questions',
      icon: Users,
      gradient: 'from-pink-500 to-pink-600',
      bgGradient: 'from-pink-50 to-pink-100'
    },
    { 
      key: 'totalExamConfigs' as keyof DashboardStats, 
      label: 'Exam Configs', 
      description: 'Configured exams',
      icon: Settings2,
      gradient: 'from-teal-500 to-teal-600',
      bgGradient: 'from-teal-50 to-teal-100'
    },
    { 
      key: 'totalCandidates' as keyof DashboardStats, 
      label: 'Candidate', 
      description: 'Total candidates',
      icon: Users,
      gradient: 'from-orange-500 to-orange-600',
      bgGradient: 'from-orange-50 to-orange-100'
    },
    { 
      key: 'totalInterviewSessions' as keyof DashboardStats, 
      label: 'Interview Scheduler', 
      description: 'Interview sessions',
      icon: Calendar,
      gradient: 'from-green-500 to-green-600',
      bgGradient: 'from-green-50 to-green-100'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40">
      {/* Enhanced Header */}
      <div className="bg-white/80 backdrop-blur-lg shadow-md border-b border-slate-200/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 gap-4">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl blur opacity-50"></div>
                <div className="relative bg-gradient-to-r from-blue-600 to-indigo-600 p-2 rounded-xl">
                  <Shield className="h-6 w-6 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Admin Panel
                </h1>
                <p className="text-sm text-gray-600 mt-0.5">Manage interview questions, exams, and subcategories</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center space-x-2 hover:bg-blue-50 border-blue-200 hover:border-blue-300 transition-all duration-200"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
              </Button>
              <Badge variant="outline" className="flex items-center space-x-1 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                <Shield className="h-3 w-3 text-blue-600" />
                <span className="text-blue-700 font-medium">Admin</span>
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="flex items-center space-x-2 hover:bg-red-50 border-red-200 hover:border-red-300 transition-all duration-200"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Enhanced Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4 md:gap-6 mb-8">
          {statsConfig.map((stat, index) => {
            const Icon = stat.icon;
            const value = stats[stat.key];
            return (
              <Card 
                key={stat.key}
                className="group relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-white/90 backdrop-blur-sm"
              >
                {/* Gradient Background on Hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${stat.bgGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10`} />
                
                {/* Decorative gradient accent */}
                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${stat.gradient} opacity-5 group-hover:opacity-10 rounded-full blur-2xl transition-opacity duration-300`} />
                
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-10">
                  <CardTitle className="text-sm font-semibold text-gray-700 group-hover:text-gray-900 transition-colors">
                    {stat.label}
                  </CardTitle>
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${stat.gradient} shadow-md group-hover:shadow-lg transition-all duration-300 group-hover:scale-110`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className="text-3xl font-bold mb-1 bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent group-hover:from-gray-900 group-hover:to-gray-800 transition-all">
                    {loading ? (
                      <span className="inline-block w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    ) : (
                      value.toLocaleString()
                    )}
                  </div>
                  <p className="text-xs text-gray-600 group-hover:text-gray-700 transition-colors font-medium">
                    {stat.description}
                  </p>
                </CardContent>
                
                {/* Bottom accent line */}
                <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${stat.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
              </Card>
            );
          })}
        </div>

        {/* Enhanced Management Tabs */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-lg border border-slate-200/50 p-6">
          <Tabs defaultValue="exams" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 bg-slate-100/50 p-1 rounded-xl">
              <TabsTrigger 
                value="exams"
                className="data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-blue-600 transition-all duration-200 rounded-lg font-medium"
              >
                Exams
              </TabsTrigger>
              <TabsTrigger 
                value="subcategories"
                className="data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-purple-600 transition-all duration-200 rounded-lg font-medium"
              >
                Subcategories
              </TabsTrigger>
              <TabsTrigger 
                value="questions"
                className="data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-indigo-600 transition-all duration-200 rounded-lg font-medium"
              >
                Questions
              </TabsTrigger>
              <TabsTrigger 
                value="cat-questions"
                className="data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-pink-600 transition-all duration-200 rounded-lg font-medium text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">Time provided Questions</span>
                <span className="sm:hidden">CAT Questions</span>
              </TabsTrigger>
              <TabsTrigger 
                value="exam-configs"
                className="data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-teal-600 transition-all duration-200 rounded-lg font-medium text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">Exam Configs</span>
                <span className="sm:hidden">Configs</span>
              </TabsTrigger>
              <TabsTrigger 
                value="candidates"
                className="data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-orange-600 transition-all duration-200 rounded-lg font-medium"
              >
                Candidates
              </TabsTrigger>
              <TabsTrigger 
                value="interview-scheduler"
                className="data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-green-600 transition-all duration-200 rounded-lg font-medium text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">Interview Scheduler</span>
                <span className="sm:hidden">Scheduler</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="exams" className="mt-6 animate-fade-in">
              <ExamManager onUpdate={fetchStats} />
            </TabsContent>

            <TabsContent value="subcategories" className="mt-6 animate-fade-in">
              <SubcategoryManager onUpdate={fetchStats} />
            </TabsContent>

            <TabsContent value="questions" className="mt-6 animate-fade-in">
              <QuestionManager onUpdate={fetchStats} />
            </TabsContent>

            <TabsContent value="cat-questions" className="mt-6 animate-fade-in">
              <CATQuestionManager onUpdate={fetchStats} />
            </TabsContent>

            <TabsContent value="exam-configs" className="mt-6 animate-fade-in">
              <ExamConfigManager onUpdate={fetchStats} />
            </TabsContent>

            <TabsContent value="candidates" className="mt-6 animate-fade-in">
              <CandidateManager onUpdate={fetchStats} />
            </TabsContent>

            <TabsContent value="interview-scheduler" className="mt-6 animate-fade-in">
              <InterviewSessionManager onUpdate={fetchStats} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}