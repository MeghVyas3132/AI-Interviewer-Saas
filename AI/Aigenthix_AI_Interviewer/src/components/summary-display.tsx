"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { getInterviewSummary, clearAllData, getQuestions, getExamConfig, type InterviewData } from "@/lib/data-store";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { ThumbsUp, Lightbulb, BarChart, ArrowLeft, Smile, RefreshCw, Clock, CheckCircle, TrendingUp, AlertCircle, Download, RotateCcw, X } from "lucide-react";
import { ScoreCircle } from "./ui/score-circle";
import { cn } from "@/lib/utils";

const getScoreColor = (score: number) => {
    if (score >= 8) return "text-green-500";
    if (score >= 6) return "text-yellow-400";
    if (score >= 4) return "text-orange-400";
    return "text-red-500";
};

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// Helper function to get minimum questions based on exam type (same as interview-session.tsx)
const getMinQuestionsForExam = (jobRole: string, company?: string, subcategoryName?: string): number => {
  const role = jobRole.toLowerCase();
  // HR interviews require 10 questions (1 resume-based + 1 technical resume + 8 general HR)
  if (role === 'hr' || (role === 'interview' && (company?.toLowerCase() === 'hr' || subcategoryName?.toLowerCase() === 'hr'))) {
    return 10;
  }
  if (role.includes('neet')) return 8;
  if (role.includes('jee')) return 9;
  if (role.includes('cat') || role.includes('mba')) return 7;
  return 8; // Default for other exams
};

const extractStrengths = (summary: InterviewData[]) => {
  const strengths: string[] = [];
  const realAnswers = summary.filter(item => item.isRealQuestion);
  
  if (realAnswers.length === 0) return strengths;

  // Calculate average scores for each category
  const avgScores = {
    ideas: realAnswers.reduce((sum, item) => sum + (item.feedback.ideasScore || 0), 0) / realAnswers.length,
    organization: realAnswers.reduce((sum, item) => sum + (item.feedback.organizationScore || 0), 0) / realAnswers.length,
    accuracy: realAnswers.reduce((sum, item) => sum + (item.feedback.accuracyScore || 0), 0) / realAnswers.length,
    voice: realAnswers.reduce((sum, item) => sum + (item.feedback.voiceScore || 0), 0) / realAnswers.length,
    grammar: realAnswers.reduce((sum, item) => sum + (item.feedback.grammarScore || 0), 0) / realAnswers.length,
    stopWords: realAnswers.reduce((sum, item) => sum + (item.feedback.stopWordsScore || 0), 0) / realAnswers.length,
  };

  // Calculate overall interview average
  const overallAvg = Object.values(avgScores).reduce((sum, score) => sum + score, 0) / Object.values(avgScores).length;

  // Identify top performing areas (scores >= 6.5) and add contextual strengths
  const scoreEntries = Object.entries(avgScores).sort(([,a], [,b]) => b - a);
  
  for (const [category, score] of scoreEntries) {
    if (score >= 6.5 && strengths.length < 4) {
      switch (category) {
        case 'ideas':
          if (score >= 8) strengths.push("Strong technical knowledge and innovative thinking");
          else if (score >= 7) strengths.push("Good examples from project experience");
          else strengths.push("Clear understanding of technical concepts");
          break;
        case 'organization':
          if (score >= 8) strengths.push("Exceptionally well-structured responses");
          else if (score >= 7) strengths.push("Well-organized and logical flow of ideas");
          else strengths.push("Good structure in most answers");
          break;
        case 'accuracy':
          if (score >= 8) strengths.push("Highly accurate and precise information");
          else if (score >= 7) strengths.push("Accurate technical details and facts");
          else strengths.push("Generally accurate responses");
          break;
        case 'voice':
          if (score >= 8) strengths.push("Excellent communication and confidence");
          else if (score >= 7) strengths.push("Clear communication and articulation");
          else strengths.push("Good speaking clarity");
          break;
        case 'grammar':
          if (score >= 8) strengths.push("Excellent grammar and fluency");
          else if (score >= 7) strengths.push("Strong language skills and fluency");
          else strengths.push("Good grammar and expression");
          break;
        case 'stopWords':
          if (score >= 8) strengths.push("Professional demeanor throughout");
          else if (score >= 7) strengths.push("Confident and professional presentation");
          else strengths.push("Generally professional communication");
          break;
      }
    }
  }

  // Add overall performance strengths
  if (overallAvg >= 8 && strengths.length < 4) {
    strengths.push("Consistently high-quality responses across all areas");
  } else if (overallAvg >= 7 && strengths.length < 4) {
    strengths.push("Strong overall interview performance");
  }

  // Add completion-based strengths
  if (realAnswers.length >= 8 && strengths.length < 4) {
    strengths.push("Completed comprehensive interview assessment");
  }

  return strengths.slice(0, 4);
};

const extractAreasForImprovement = (summary: InterviewData[]) => {
  const improvements: string[] = [];
  const realAnswers = summary.filter(item => item.isRealQuestion);
  
  if (realAnswers.length === 0) return improvements;

  // Calculate average scores for each category
  const avgScores = {
    ideas: realAnswers.reduce((sum, item) => sum + (item.feedback.ideasScore || 0), 0) / realAnswers.length,
    organization: realAnswers.reduce((sum, item) => sum + (item.feedback.organizationScore || 0), 0) / realAnswers.length,
    accuracy: realAnswers.reduce((sum, item) => sum + (item.feedback.accuracyScore || 0), 0) / realAnswers.length,
    voice: realAnswers.reduce((sum, item) => sum + (item.feedback.voiceScore || 0), 0) / realAnswers.length,
    grammar: realAnswers.reduce((sum, item) => sum + (item.feedback.grammarScore || 0), 0) / realAnswers.length,
    stopWords: realAnswers.reduce((sum, item) => sum + (item.feedback.stopWordsScore || 0), 0) / realAnswers.length,
  };

  // Calculate overall interview average
  const overallAvg = Object.values(avgScores).reduce((sum, score) => sum + score, 0) / Object.values(avgScores).length;

  // Identify lowest performing areas (scores < 6.5) and provide targeted improvements
  const scoreEntries = Object.entries(avgScores).sort(([,a], [,b]) => a - b);
  
  for (const [category, score] of scoreEntries) {
    if (score < 6.5 && improvements.length < 4) {
      switch (category) {
        case 'ideas':
          if (score < 4) improvements.push("Provide more specific examples and technical details");
          else if (score < 5.5) improvements.push("Practice behavioral question responses");
          else improvements.push("Work on concise answers (avoid rambling)");
          break;
        case 'organization':
          if (score < 4) improvements.push("Work on structuring responses more clearly");
          else if (score < 5.5) improvements.push("Use the STAR method for behavioral questions");
          else improvements.push("Improve logical flow between ideas");
          break;
        case 'accuracy':
          if (score < 4) improvements.push("Focus on providing more accurate information");
          else if (score < 5.5) improvements.push("Double-check technical facts before responding");
          else improvements.push("Be more precise with technical terminology");
          break;
        case 'voice':
          if (score < 4) improvements.push("Practice speaking more clearly and confidently");
          else if (score < 5.5) improvements.push("Work on voice modulation and pace");
          else improvements.push("Reduce hesitation and speak with more confidence");
          break;
        case 'grammar':
          if (score < 4) improvements.push("Improve grammar and reduce filler words");
          else if (score < 5.5) improvements.push("Practice fluent expression of complex ideas");
          else improvements.push("Polish sentence structure and clarity");
          break;
        case 'stopWords':
          if (score < 4) improvements.push("Avoid excessive use of filler words");
          else if (score < 5.5) improvements.push("Practice pausing instead of using filler words");
          else improvements.push("Maintain professional tone throughout");
          break;
      }
    }
  }

  // Add specific feedback-based improvements
  const commonFeedbackPatterns = realAnswers.map(item => [
    item.feedback.contentFeedback,
    item.feedback.clarityFeedback,
    item.feedback.toneFeedback
  ].join(' ').toLowerCase());

  const feedbackText = commonFeedbackPatterns.join(' ');

  if (feedbackText.includes('rambling') && improvements.length < 4) {
    improvements.push("Work on concise answers (avoid rambling)");
  }
  if (feedbackText.includes('specific') && feedbackText.includes('example') && improvements.length < 4) {
    improvements.push("Provide more specific metrics in examples");
  }
  if (feedbackText.includes('confident') && improvements.length < 4) {
    improvements.push("Prepare more questions for the interviewer");
  }

  // Add overall improvement if performance is generally low
  if (overallAvg < 5 && improvements.length < 4) {
    improvements.push("Focus on comprehensive interview preparation");
  }

  return improvements.slice(0, 4);
};

const ScoringDetailRow = ({ label, score, justification }: { label: string; score: number; justification: string }) => {
    return (
        <div className="flex items-start gap-4">
            <ScoreCircle score={score} size={36} strokeWidth={4} showText={false} />
            <div className="flex-1">
                <div className="flex items-center justify-between w-full">
                    <h6 className="font-semibold text-sm">{label}</h6>
                    <span className={cn("text-sm font-bold", getScoreColor(score))}>{score}/10</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{justification}</p>
            </div>
        </div>
    );
};


export function SummaryDisplay() {
  const [summary, setSummary] = useState<InterviewData[] | null>(null);
  const [minQuestionsRequired, setMinQuestionsRequired] = useState(10); // Default fallback
  const [configuredQuestionLimit, setConfiguredQuestionLimit] = useState<number>(0); // 0 means no limit configured
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const data = getInterviewSummary();
    setSummary(data);
    
    // Debug: Log reference question IDs
    if (data && data.length > 0) {
      console.log('📊 Summary data loaded with reference IDs:');
      data.forEach((item, index) => {
        if (item.referenceQuestionIds && item.referenceQuestionIds.length > 0) {
          console.log(`  Q${index + 1}: ${item.question.substring(0, 50)}... -> IDs: [${item.referenceQuestionIds.join(', ')}]`);
        } else {
          console.log(`  Q${index + 1}: ${item.question.substring(0, 50)}... -> No reference IDs`);
        }
      });
    }
    
    // Get job role to calculate minimum questions required
    const questionsData = getQuestions();
    if (questionsData?.jobRole) {
      const minQuestions = getMinQuestionsForExam(questionsData.jobRole);
      setMinQuestionsRequired(minQuestions);
    }
    
    // Check for exam configuration
    const examConfig = getExamConfig();
    if (examConfig && examConfig.numQuestions > 0) {
      console.log(`Summary: Found exam configuration with ${examConfig.numQuestions} questions`);
      setConfiguredQuestionLimit(examConfig.numQuestions);
    } else {
      console.log('Summary: No exam configuration found, using default minimum');
      setConfiguredQuestionLimit(0);
    }
  }, []);

  const handleStartNewInterview = () => {
    clearAllData();
    router.push('/prepare');
  };

  const handleCategoryClick = (category: string) => {
    setSelectedCategory(category);
    setIsCategoryModalOpen(true);
  };

  const getCategoryDisplayName = (category: string) => {
    const displayNames: Record<string, string> = {
      'general-knowledge': 'General Knowledge',
      'academics': 'Academics',
      'work-experience': 'Work Experience',
      'about-self': 'About Self'
    };
    return displayNames[category] || category;
  };

  const getCategoryQuestions = (category: string) => {
    if (!summary) return [];
    return summary.filter(item => item.isRealQuestion && item.questionCategory === category);
  };

  const handleDownload = async () => {
    if (!summary) return;
    
    try {
      // Dynamically import html2pdf only when needed
      const html2pdf = (await import('html2pdf.js')).default;
      
      // Create comprehensive HTML content
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Interview Summary Report</title>
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px;
            background: white;
          }
          .header { 
            text-align: center; 
            border-bottom: 3px solid #2563eb; 
            padding-bottom: 20px; 
            margin-bottom: 30px;
          }
          .header h1 { 
            color: #1e40af; 
            font-size: 28px; 
            margin: 0 0 10px 0;
          }
          .header .date { 
            color: #6b7280; 
            font-size: 16px;
          }
          .overall-score { 
            text-align: center; 
            background: #f8fafc; 
            padding: 20px; 
            border-radius: 12px; 
            margin: 20px 0; 
            border: 2px solid #e2e8f0;
          }
          .score-circle { 
            width: 120px; 
            height: 120px; 
            border-radius: 50%; 
            border: 8px solid #2563eb; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            margin: 0 auto 15px; 
            font-size: 32px; 
            font-weight: bold; 
            color: #2563eb;
          }
          .disqualified { 
            border-color: #dc2626; 
            color: #dc2626;
          }
          .question-section { 
            margin: 30px 0; 
            border: 1px solid #e5e7eb; 
            border-radius: 8px; 
            overflow: hidden;
          }
          .question-header { 
            background: #f3f4f6; 
            padding: 15px; 
            font-weight: bold; 
            font-size: 16px; 
            border-bottom: 1px solid #e5e7eb;
          }
          .question-content { 
            padding: 20px;
          }
          .answer-section { 
            background: #f9fafb; 
            padding: 15px; 
            border-radius: 6px; 
            margin: 15px 0; 
            border-left: 4px solid #3b82f6;
          }
          .feedback-section { 
            margin: 20px 0;
          }
          .feedback-item { 
            display: flex; 
            align-items: flex-start; 
            margin: 15px 0; 
            padding: 15px; 
            background: #f8fafc; 
            border-radius: 6px;
          }
          .feedback-icon { 
            background: #dbeafe; 
            padding: 8px; 
            border-radius: 50%; 
            margin-right: 15px; 
            min-width: 40px; 
            text-align: center;
          }
          .feedback-content h5 { 
            margin: 0 0 8px 0; 
            color: #1e40af; 
            font-size: 16px;
          }
          .feedback-content p { 
            margin: 0; 
            color: #4b5563; 
            font-size: 14px;
          }
          .scoring-grid { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 15px; 
            margin: 20px 0;
          }
          .score-item { 
            display: flex; 
            align-items: center; 
            padding: 12px; 
            background: #f1f5f9; 
            border-radius: 6px; 
            border: 1px solid #e2e8f0;
          }
          .score-circle-small { 
            width: 36px; 
            height: 36px; 
            border-radius: 50%; 
            border: 3px solid #2563eb; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            font-size: 12px; 
            font-weight: bold; 
            margin-right: 12px;
          }
          .score-details { 
            flex: 1;
          }
          .score-label { 
            font-weight: 600; 
            font-size: 14px; 
            margin-bottom: 4px;
          }
          .score-value { 
            font-weight: bold; 
            font-size: 14px;
          }
          .score-justification { 
            font-size: 12px; 
            color: #6b7280; 
            margin-top: 4px;
          }
          .overall-score-item { 
            background: #f0f9ff; 
            border: 2px solid #0ea5e9; 
            padding: 15px; 
            border-radius: 8px; 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin-top: 20px;
          }
          .overall-score-label { 
            font-weight: bold; 
            font-size: 16px;
          }
          .overall-score-value { 
            font-size: 24px; 
            font-weight: bold; 
            color: #2563eb;
          }
          .page-break { 
            page-break-before: always;
          }
          @media print {
            body { margin: 0; padding: 15px; }
            .page-break { page-break-before: always; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Interview Summary Report</h1>
          <div class="date">Generated on ${new Date().toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</div>
        </div>

        <div class="overall-score">
          ${showDisqualified ? `
            <div class="score-circle disqualified">0</div>
            <h3 style="color: #dc2626; margin: 0;">Disqualified / Incomplete</h3>
            <p style="color: #6b7280; margin: 10px 0 0 0;">
              ${requiredQuestions > minQuestionsRequired 
                ? `You did not complete all ${requiredQuestions} required questions. No score is available.`
                : 'You did not answer the minimum required number of real interview questions. No score is available.'
              }
            </p>
          ` : `
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin: 20px 0;">
              <div style="text-align: center; background: #f0f9ff; padding: 20px; border-radius: 8px;">
                <div class="score-circle">${finalScore.toFixed(1)}</div>
                <p style="margin: 5px 0; color: #6b7280;">/ 10 · overall</p>
                <h3 style="color: #1e40af; margin: 5px 0;">Final score</h3>
              </div>
              <div style="text-align: center; background: #f0fdf4; padding: 20px; border-radius: 8px;">
                <div class="score-circle" style="border-color: #16a34a; color: #16a34a;">${presentationScore.toFixed(1)}</div>
                <p style="margin: 5px 0; color: #6b7280;">/ 5 · avg of 3</p>
                <h3 style="color: #16a34a; margin: 5px 0;">Score for presentation</h3>
              </div>
              <div style="text-align: center; background: #faf5ff; padding: 20px; border-radius: 8px;">
                <div class="score-circle" style="border-color: #9333ea; color: #9333ea;">${responseScore.toFixed(1)}</div>
                <p style="margin: 5px 0; color: #6b7280;">/ 10 · avg of all questions</p>
                <h3 style="color: #9333ea; margin: 5px 0;">Score for responses</h3>
              </div>
            </div>
            
            <div style="margin: 30px 0; background: #f9fafb; padding: 20px; border-radius: 8px;">
              <h3 style="color: #1e40af; margin: 0 0 15px 0;">Presentation</h3>
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; text-align: center;">
                <div>
                  <h4 style="margin: 0 0 10px 0; color: #6b7280;">Physical appearance</h4>
                  <div style="font-size: 24px; font-weight: bold; margin-bottom: 5px;">${avgPresentationScores.physicalAppearance.toFixed(1)} / 5</div>
                </div>
                <div>
                  <h4 style="margin: 0 0 10px 0; color: #6b7280;">Body language</h4>
                  <div style="font-size: 24px; font-weight: bold; margin-bottom: 5px;">${avgPresentationScores.bodyLanguage.toFixed(1)} / 5</div>
                </div>
                <div>
                  <h4 style="margin: 0 0 10px 0; color: #6b7280;">Confidence</h4>
                  <div style="font-size: 24px; font-weight: bold; margin-bottom: 5px;">${avgPresentationScores.confidence.toFixed(1)} / 5</div>
                </div>
              </div>
              <p style="text-align: center; color: #6b7280; margin: 15px 0 0 0; font-size: 12px;">
                Average = (appearance + body language + confidence) / 3
              </p>
            </div>
            
            <div style="margin: 30px 0; background: #f9fafb; padding: 20px; border-radius: 8px;">
              <h3 style="color: #1e40af; margin: 0 0 15px 0;">Responses</h3>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div style="background: #fefce8; padding: 15px; border-radius: 6px; text-align: center;">
                  <h4 style="margin: 0 0 10px 0; font-weight: 600;">General Knowledge</h4>
                  <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">Average: ${categoryAverages['general-knowledge'].toFixed(1)} / 10</div>
                  <div style="color: #6b7280; font-size: 12px;">Questions: ${categoryScores['general-knowledge'].length}</div>
                </div>
                <div style="background: #f0fdf4; padding: 15px; border-radius: 6px; text-align: center;">
                  <h4 style="margin: 0 0 10px 0; font-weight: 600;">Academics</h4>
                  <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">Average: ${categoryAverages['academics'].toFixed(1)} / 10</div>
                  <div style="color: #6b7280; font-size: 12px;">Questions: ${categoryScores['academics'].length}</div>
                </div>
                <div style="background: #f0f9ff; padding: 15px; border-radius: 6px; text-align: center;">
                  <h4 style="margin: 0 0 10px 0; font-weight: 600;">Work-ex</h4>
                  <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">Average: ${categoryAverages['work-experience'].toFixed(1)} / 10</div>
                  <div style="color: #6b7280; font-size: 12px;">Questions: ${categoryScores['work-experience'].length}</div>
                </div>
                <div style="background: #faf5ff; padding: 15px; border-radius: 6px; text-align: center;">
                  <h4 style="margin: 0 0 10px 0; font-weight: 600;">About self</h4>
                  <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">Average: ${categoryAverages['about-self'].toFixed(1)} / 10</div>
                  <div style="color: #6b7280; font-size: 12px;">Questions: ${categoryScores['about-self'].length}</div>
                </div>
              </div>
            </div>
          `}
        </div>

        ${summary.map((item, index) => `
          <div class="question-section">
            <div class="question-header">
              ${index + 1}. ${item.question}
              ${item.responseType ? `
                <div style="margin-top: 8px; display: inline-block;">
                  <span style="font-size: 11px; padding: 4px 8px; border-radius: 12px; font-weight: 600; ${
                    item.responseType === 'spoken' 
                      ? 'background-color: #dcfce7; color: #166534; border: 1px solid #86efac;' 
                      : item.responseType === 'typed'
                      ? 'background-color: #dbeafe; color: #1e40af; border: 1px solid #93c5fd;'
                      : 'background-color: #f3e8ff; color: #6b21a8; border: 1px solid #c4b5fd;'
                  }">
                    ${item.responseType === 'spoken' ? '🎤 Spoken' : item.responseType === 'typed' ? '⌨️ Typed' : '🎤⌨️ Mixed'}
                  </span>
                </div>
              ` : ''}
              ${item.referenceQuestionIds && item.referenceQuestionIds.length > 0 ? `
                <div style="margin-top: 8px; font-size: 10px; color: #6b7280; font-family: 'Courier New', monospace;">
                  Reference Question IDs: ${item.referenceQuestionIds.join(', ')}
                </div>
              ` : ''}
            </div>
            <div class="question-content">
              <div class="answer-section">
                <h4 style="margin: 0 0 10px 0; color: #1e40af;">
                  Your Answer:
                  ${item.responseType ? `
                    <span style="font-size: 11px; padding: 4px 8px; border-radius: 12px; font-weight: 600; margin-left: 8px; ${
                      item.responseType === 'spoken' 
                        ? 'background-color: #dcfce7; color: #166534; border: 1px solid #86efac;' 
                        : item.responseType === 'typed'
                        ? 'background-color: #dbeafe; color: #1e40af; border: 1px solid #93c5fd;'
                        : 'background-color: #f3e8ff; color: #6b21a8; border: 1px solid #c4b5fd;'
                    }">
                      ${item.responseType === 'spoken' ? '🎤 Spoken Response' : item.responseType === 'typed' ? '⌨️ Typed Response' : '🎤⌨️ Mixed Response'}
                    </span>
                  ` : ''}
                </h4>
                <p style="margin: 0; color: #4b5563;">${item.answer}</p>
              </div>

              <div class="feedback-section">
                <h4 style="margin: 0 0 15px 0; color: #1e40af;">AI Feedback:</h4>
                
                <div class="feedback-item">
                  <div class="feedback-icon">👍</div>
                  <div class="feedback-content">
                    <h5>Content</h5>
                    <p>${item.feedback.contentFeedback}</p>
                  </div>
                </div>

                <div class="feedback-item">
                  <div class="feedback-icon">💡</div>
                  <div class="feedback-content">
                    <h5>Clarity</h5>
                    <p>${item.feedback.clarityFeedback}</p>
                  </div>
                </div>

                <div class="feedback-item">
                  <div class="feedback-icon">📊</div>
                  <div class="feedback-content">
                    <h5>Tone</h5>
                    <p>${item.feedback.toneFeedback}</p>
                  </div>
                </div>

                ${item.feedback.visualFeedback ? `
                  <div class="feedback-item">
                    <div class="feedback-icon">😊</div>
                    <div class="feedback-content">
                      <h5>Visuals</h5>
                      <p>${item.feedback.visualFeedback}</p>
                    </div>
                  </div>
                ` : ''}

                ${item.isRealQuestion ? `
                  <div style="margin-top: 25px;">
                    <h5 style="margin: 0 0 15px 0; color: #1e40af; font-size: 16px;">Scoring Breakdown</h5>
                    <div class="scoring-grid">
                      <div class="score-item">
                        <div class="score-circle-small">${item.feedback.ideasScore}</div>
                        <div class="score-details">
                          <div class="score-label">Ideas</div>
                          <div class="score-value">${item.feedback.ideasScore}/10</div>
                          <div class="score-justification">${item.feedback.ideasJustification}</div>
                        </div>
                      </div>
                      <div class="score-item">
                        <div class="score-circle-small">${item.feedback.organizationScore}</div>
                        <div class="score-details">
                          <div class="score-label">Organization</div>
                          <div class="score-value">${item.feedback.organizationScore}/10</div>
                          <div class="score-justification">${item.feedback.organizationJustification}</div>
                        </div>
                      </div>
                      <div class="score-item">
                        <div class="score-circle-small">${item.feedback.accuracyScore}</div>
                        <div class="score-details">
                          <div class="score-label">Accuracy</div>
                          <div class="score-value">${item.feedback.accuracyScore}/10</div>
                          <div class="score-justification">${item.feedback.accuracyJustification}</div>
                        </div>
                      </div>
                      <div class="score-item">
                        <div class="score-circle-small">${item.feedback.voiceScore}</div>
                        <div class="score-details">
                          <div class="score-label">Voice</div>
                          <div class="score-value">${item.feedback.voiceScore}/10</div>
                          <div class="score-justification">${item.feedback.voiceJustification}</div>
                        </div>
                      </div>
                      <div class="score-item">
                        <div class="score-circle-small">${item.feedback.grammarScore}</div>
                        <div class="score-details">
                          <div class="score-label">Grammar & Fluency</div>
                          <div class="score-value">${item.feedback.grammarScore}/10</div>
                          <div class="score-justification">${item.feedback.grammarJustification}</div>
                        </div>
                      </div>
                      <div class="score-item">
                        <div class="score-circle-small">${item.feedback.stopWordsScore}</div>
                        <div class="score-details">
                          <div class="score-label">Stop Words</div>
                          <div class="score-value">${item.feedback.stopWordsScore}/10</div>
                          <div class="score-justification">${item.feedback.stopWordsJustification}</div>
                        </div>
                      </div>
                    </div>
                    <div class="overall-score-item">
                      <span class="overall-score-label">Overall Answer Score</span>
                      <span class="overall-score-value">${item.feedback.overallScore}/10</span>
                    </div>
                  </div>
                ` : `
                  <div style="margin-top: 20px; padding: 15px; background: #f3f4f6; border-radius: 6px; text-align: center; color: #6b7280;">
                    This is a general question and was not scored.
                  </div>
                `}
              </div>
            </div>
          </div>
        `).join('')}

        <div style="margin-top: 40px; padding: 20px; background: #f8fafc; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">
            This report was generated by AI Interviewer. All feedback and scoring is based on AI analysis of your interview responses.
          </p>
        </div>
      </body>
      </html>
    `;

    // Convert HTML to PDF and download
    const element = document.createElement('div');
    element.innerHTML = htmlContent;
    document.body.appendChild(element);

    const opt = {
      margin: [10, 10, 10, 10],
      filename: `interview-summary-${new Date().toISOString().slice(0,10)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

      html2pdf().set(opt).from(element).save().then(() => {
        document.body.removeChild(element);
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  if (!summary) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="text-center">
        <CardHeader>
          <CardTitle className="font-headline">No Summary Found</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-6">
            It looks like you haven't completed an interview yet. Go to the prepare page to get started.
          </p>
          <Button asChild>
            <Link href="/prepare">
                <span className="inline-flex items-center gap-2">
                    <ArrowLeft/>
                    Back to Preparation
                </span>
            </Link>
          </Button>
        </CardContent>
      </Card>
      </div>
    );
  }

  // Filter to only real interview questions (those marked as real questions)
  // Include all real questions, even if they have 0 score (for better analysis)
  const realAnswers = summary.filter(
    (item) => item.isRealQuestion
  );

  // Check for disqualification
  const isDisqualified = summary.some(
    (item) => item.feedback && item.feedback.isDisqualified
  );

  // If disqualified or not enough real answers, show "Disqualified/Incomplete"
  const requiredQuestions = configuredQuestionLimit > 0 ? configuredQuestionLimit : minQuestionsRequired;
  const showDisqualified =
    isDisqualified || realAnswers.length < requiredQuestions;

  // Calculate category-wise scores
  const categoryScores = {
    'general-knowledge': realAnswers.filter(item => item.questionCategory === 'general-knowledge'),
    'academics': realAnswers.filter(item => item.questionCategory === 'academics'),
    'work-experience': realAnswers.filter(item => item.questionCategory === 'work-experience'),
    'about-self': realAnswers.filter(item => item.questionCategory === 'about-self')
  };

  const categoryAverages = {
    'general-knowledge': categoryScores['general-knowledge'].length > 0 
      ? categoryScores['general-knowledge'].reduce((sum, item) => sum + (item.feedback.overallScore || 0), 0) / categoryScores['general-knowledge'].length 
      : 0,
    'academics': categoryScores['academics'].length > 0 
      ? categoryScores['academics'].reduce((sum, item) => sum + (item.feedback.overallScore || 0), 0) / categoryScores['academics'].length 
      : 0,
    'work-experience': categoryScores['work-experience'].length > 0 
      ? categoryScores['work-experience'].reduce((sum, item) => sum + (item.feedback.overallScore || 0), 0) / categoryScores['work-experience'].length 
      : 0,
    'about-self': categoryScores['about-self'].length > 0 
      ? categoryScores['about-self'].reduce((sum, item) => sum + (item.feedback.overallScore || 0), 0) / categoryScores['about-self'].length 
      : 0
  };

  // Calculate presentation scores (average of all real answers)
  // Include all real answers for presentation scoring, defaulting missing scores to 3 (neutral)
  const presentationScores = realAnswers;
  
  const avgPresentationScores = {
    physicalAppearance: presentationScores.length > 0 
      ? presentationScores.reduce((sum, item) => sum + (item.feedback.physicalAppearanceScore || 3), 0) / presentationScores.length 
      : 3, // Default to 3 if no data
    bodyLanguage: presentationScores.length > 0 
      ? presentationScores.reduce((sum, item) => sum + (item.feedback.bodyLanguageScore || 3), 0) / presentationScores.length 
      : 3, // Default to 3 if no data
    confidence: presentationScores.length > 0 
      ? presentationScores.reduce((sum, item) => sum + (item.feedback.confidenceScore || 3), 0) / presentationScores.length 
      : 3 // Default to 3 if no data
  };

  // Calculate average response score (from all categories)
  const totalCategoryQuestions = Object.values(categoryScores).reduce((sum, questions) => sum + questions.length, 0);
  const totalCategoryScore = Object.entries(categoryAverages).reduce((sum, [category, avg]) => {
    const categoryQuestionCount = categoryScores[category as keyof typeof categoryScores].length;
    return sum + (avg * categoryQuestionCount);
  }, 0);
  
  const avgResponseScore = totalCategoryQuestions > 0 ? totalCategoryScore / totalCategoryQuestions : 3; // Default to 3 if no questions

  // Calculate presentation average (1-5 scale)
  const avgPresentationScore = realAnswers.length > 0 
    ? Object.values(avgPresentationScores).reduce((sum, score) => sum + score, 0) / 3 
    : 3; // Default to 3 if no real answers

  // Calculate final score: 0.8 * (avg responses) + 0.4 * (presentation)
  // Ensure minimum score of 1 for active interviews
  const calculatedFinalScore = (0.8 * avgResponseScore) + (0.4 * avgPresentationScore * 2); // multiply by 2 to convert 1-5 to 1-10 scale
  const finalScore = showDisqualified ? 0 : Math.max(1, Math.round(calculatedFinalScore));
  const responseScore = showDisqualified ? 0 : Math.max(1, Math.round(avgResponseScore));
  const presentationScore = showDisqualified ? 0 : Math.max(1, Math.round(avgPresentationScore));

  // For backward compatibility, use final score as overall interview score
  const overallInterviewScore = showDisqualified ? 0 : finalScore;

  // Debug logging for scoring
  console.log('Summary Display Scoring Debug:', {
    totalSummaryLength: summary.length,
    realAnswersLength: realAnswers.length,
    minQuestionsRequired,
    showDisqualified,
    categoryAverages,
    avgPresentationScores,
    avgResponseScore,
    avgPresentationScore,
    finalScore,
    responseScore,
    presentationScore
  });

  // Calculate interview duration based on number of questions answered
  // Estimate: ~2 minutes per question + 2 minutes setup time
  const estimatedDurationMinutes = Math.max(2, (summary.length * 2) + 2);
  const interviewDuration = formatDuration(estimatedDurationMinutes * 60);

  // Get strengths and areas for improvement
  const strengths = extractStrengths(summary);
  const areasForImprovement = extractAreasForImprovement(summary);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        
        {/* Reference Question IDs - Consolidated Display */}
        {summary && summary.length > 0 && (() => {
          // Collect all unique reference question IDs from all questions
          const allReferenceIds = new Set<number>();
          summary.forEach(item => {
            if (item.referenceQuestionIds && item.referenceQuestionIds.length > 0) {
              item.referenceQuestionIds.forEach(id => allReferenceIds.add(id));
            }
          });
          
          const sortedIds = Array.from(allReferenceIds).sort((a, b) => a - b);
          
          return sortedIds.length > 0 ? (
            <div className="mb-4 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
              <h3 className="text-sm font-bold mb-2 text-yellow-900">🔍 Reference Question IDs:</h3>
              <div className="text-sm font-mono text-yellow-800">
                [{sortedIds.join(', ')}]
              </div>
            </div>
          ) : null;
        })()}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* Interview Feedback Header */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <BarChart className="w-6 h-6 text-blue-600" />
                  <div>
                    <CardTitle className="text-xl">Interview Feedback</CardTitle>
                    <CardDescription>A detailed analysis of your performance.</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Summary Cards Row - New Layout */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Final Score Card */}
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-6 text-center">
                  <div className="text-5xl font-bold text-blue-600 mb-2">
                    {showDisqualified ? "0" : finalScore.toFixed(1)}
                  </div>
                  <p className="text-sm text-gray-600 font-medium">/ 10 · overall</p>
                  <h3 className="text-lg font-semibold text-blue-700 mt-2">Final score</h3>
                </CardContent>
              </Card>

              {/* Score for Presentation Card */}
              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-6 text-center">
                  <div className="text-5xl font-bold text-green-600 mb-2">
                    {showDisqualified ? "0" : presentationScore.toFixed(1)}
                  </div>
                  <p className="text-sm text-gray-600 font-medium">/ 5 · avg of 3</p>
                  <h3 className="text-lg font-semibold text-green-700 mt-2">Score for presentation</h3>
                </CardContent>
              </Card>

              {/* Score for Responses Card */}
              <Card className="bg-purple-50 border-purple-200">
                <CardContent className="p-6 text-center">
                  <div className="text-5xl font-bold text-purple-600 mb-2">
                    {showDisqualified ? "0" : responseScore.toFixed(1)}
                  </div>
                  <p className="text-sm text-gray-600 font-medium">/ 10 · avg of all questions</p>
                  <h3 className="text-lg font-semibold text-purple-700 mt-2">Score for responses</h3>
                </CardContent>
              </Card>
            </div>

            {/* Presentation Breakdown Section */}
            {!showDisqualified && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Presentation</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Physical Appearance */}
                    <div className="text-center">
                      <h4 className="text-sm text-gray-600 mb-2">Physical appearance</h4>
                      <div className="text-3xl font-bold mb-2">
                        {avgPresentationScores.physicalAppearance.toFixed(1)} / 5
                      </div>
                      <div className="text-xs text-gray-500">
                        {presentationScores.length > 0 && presentationScores.find(item => item.feedback.physicalAppearanceJustification)
                          ? presentationScores.find(item => item.feedback.physicalAppearanceJustification)?.feedback.physicalAppearanceJustification
                          : "00:12 Neat formal shirt"
                        }
                      </div>
                    </div>

                    {/* Body Language */}
                    <div className="text-center">
                      <h4 className="text-sm text-gray-600 mb-2">Body language</h4>
                      <div className="text-3xl font-bold mb-2">
                        {avgPresentationScores.bodyLanguage.toFixed(1)} / 5
                      </div>
                      <div className="text-xs text-gray-500">
                        {presentationScores.length > 0 && presentationScores.find(item => item.feedback.bodyLanguageJustification)
                          ? presentationScores.find(item => item.feedback.bodyLanguageJustification)?.feedback.bodyLanguageJustification
                          : "04:10 Looked away ~10s (thinking)"
                        }
                      </div>
                    </div>

                    {/* Confidence */}
                    <div className="text-center">
                      <h4 className="text-sm text-gray-600 mb-2">Confidence</h4>
                      <div className="text-3xl font-bold mb-2">
                        {avgPresentationScores.confidence.toFixed(1)} / 5
                      </div>
                      <div className="text-xs text-gray-500">
                        {presentationScores.length > 0 && presentationScores.find(item => item.feedback.confidenceJustification)
                          ? presentationScores.find(item => item.feedback.confidenceJustification)?.feedback.confidenceJustification
                          : "09:45 Steady tone in Q3"
                        }
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 text-center text-sm text-gray-600">
                    Average = (appearance + body language + confidence) / 3
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Responses Section */}
            {!showDisqualified && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Responses</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* General Knowledge */}
                    <Card 
                      className="bg-yellow-50 border-yellow-200 cursor-pointer hover:bg-yellow-100 transition-colors"
                      onClick={() => handleCategoryClick('general-knowledge')}
                    >
                      <CardContent className="p-4 text-center">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-sm">General Knowledge</h4>
                          <span className="text-xs">›</span>
                        </div>
                        <div className="text-2xl font-bold mb-1">
                          Average: {categoryAverages['general-knowledge'].toFixed(1)} / 10
                        </div>
                        <div className="text-sm text-gray-600">
                          Questions: {categoryScores['general-knowledge'].length}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Academics */}
                    <Card 
                      className="bg-green-50 border-green-200 cursor-pointer hover:bg-green-100 transition-colors"
                      onClick={() => handleCategoryClick('academics')}
                    >
                      <CardContent className="p-4 text-center">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-sm">Academics</h4>
                          <span className="text-xs">›</span>
                        </div>
                        <div className="text-2xl font-bold mb-1">
                          Average: {categoryAverages['academics'].toFixed(1)} / 10
                        </div>
                        <div className="text-sm text-gray-600">
                          Questions: {categoryScores['academics'].length}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Work Experience */}
                    <Card 
                      className="bg-blue-50 border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors"
                      onClick={() => handleCategoryClick('work-experience')}
                    >
                      <CardContent className="p-4 text-center">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-sm">Work-ex</h4>
                          <span className="text-xs">›</span>
                        </div>
                        <div className="text-2xl font-bold mb-1">
                          Average: {categoryAverages['work-experience'].toFixed(1)} / 10
                        </div>
                        <div className="text-sm text-gray-600">
                          Questions: {categoryScores['work-experience'].length}
                        </div>
                      </CardContent>
                    </Card>

                    {/* About Self */}
                    <Card 
                      className="bg-purple-50 border-purple-200 cursor-pointer hover:bg-purple-100 transition-colors"
                      onClick={() => handleCategoryClick('about-self')}
                    >
                      <CardContent className="p-4 text-center">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-sm">About self</h4>
                          <span className="text-xs">›</span>
                        </div>
                        <div className="text-2xl font-bold mb-1">
                          Average: {categoryAverages['about-self'].toFixed(1)} / 10
                        </div>
                        <div className="text-sm text-gray-600">
                          Questions: {categoryScores['about-self'].length}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Strengths Section */}
            {strengths.length > 0 && (
              <Card className="bg-green-50 border-green-200">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                    <CardTitle className="text-green-700">Strengths</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {strengths.map((strength, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                        <p className="text-green-700">{strength}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Areas for Improvement Section */}
            {areasForImprovement.length > 0 && (
              <Card className="bg-orange-50 border-orange-200">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-6 h-6 text-orange-600" />
                    <CardTitle className="text-orange-700">Areas for Improvement</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {areasForImprovement.map((improvement, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 flex-shrink-0" />
                        <p className="text-orange-700">{improvement}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Detailed Feedback Accordion */}
            <Card>
              <CardHeader>
                <CardTitle>Detailed Question-by-Question Feedback</CardTitle>
                <CardDescription>Expand each question to see detailed analysis and scoring.</CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {summary.map((item, index) => (
                    <AccordionItem value={`item-${index}`} key={index}>
                      <AccordionTrigger className="text-left hover:no-underline">
                        <div className="flex flex-col items-start w-full">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold mr-2">{index + 1}.</span>
                            <span>{item.question}</span>
                            {item.responseType && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                item.responseType === 'spoken' 
                                  ? 'bg-green-100 text-green-700 border border-green-300' 
                                  : item.responseType === 'typed'
                                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                  : 'bg-purple-100 text-purple-700 border border-purple-300'
                              }`}>
                                {item.responseType === 'spoken' ? '🎤 Spoken' : item.responseType === 'typed' ? '⌨️ Typed' : '🎤⌨️ Mixed'}
                              </span>
                            )}
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-6 pt-4">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-bold">Your Answer:</h4>
                            {item.responseType && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                item.responseType === 'spoken' 
                                  ? 'bg-green-100 text-green-700 border border-green-300' 
                                  : item.responseType === 'typed'
                                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                  : 'bg-purple-100 text-purple-700 border border-purple-300'
                              }`}>
                                {item.responseType === 'spoken' ? '🎤 Spoken Response' : item.responseType === 'typed' ? '⌨️ Typed Response' : '🎤⌨️ Mixed Response'}
                              </span>
                            )}
                          </div>
                          <p className="p-4 bg-muted/50 rounded-md text-muted-foreground">{item.answer}</p>
                        </div>
                        <div>
                          <h4 className="font-bold mb-4">AI Feedback:</h4>
                          <div className="space-y-4">
                            <div className="flex items-start gap-4">
                              <div className="bg-secondary p-2 rounded-full"><ThumbsUp className="text-primary"/></div>
                              <div>
                                <h5 className="font-semibold">Content</h5>
                                <p className="text-muted-foreground">{item.feedback.contentFeedback}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-4">
                              <div className="bg-secondary p-2 rounded-full"><Lightbulb className="text-primary"/></div>
                              <div>
                                <h5 className="font-semibold">Clarity</h5>
                                <p className="text-muted-foreground">{item.feedback.clarityFeedback}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-4">
                              <div className="bg-secondary p-2 rounded-full"><BarChart className="text-primary"/></div>
                              <div>
                                <h5 className="font-semibold">Tone</h5>
                                <p className="text-muted-foreground">{item.feedback.toneFeedback}</p>
                              </div>
                            </div>
                            {item.feedback.visualFeedback && (
                              <div className="flex items-start gap-4">
                                <div className="bg-secondary p-2 rounded-full"><Smile className="text-primary"/></div>
                                <div>
                                  <h5 className="font-semibold">Visuals</h5>
                                  <p className="text-muted-foreground">{item.feedback.visualFeedback}</p>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="mt-6">
                            <h5 className="font-bold mb-4">Scoring Breakdown</h5>
                            {item.isRealQuestion ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 p-4 border rounded-lg bg-muted/20">
                                <ScoringDetailRow label="Ideas" score={item.feedback.ideasScore} justification={item.feedback.ideasJustification} />
                                <ScoringDetailRow label="Organization" score={item.feedback.organizationScore} justification={item.feedback.organizationJustification} />
                                <ScoringDetailRow label="Accuracy" score={item.feedback.accuracyScore} justification={item.feedback.accuracyJustification} />
                                <ScoringDetailRow label="Voice" score={item.feedback.voiceScore} justification={item.feedback.voiceJustification} />
                                <ScoringDetailRow label="Grammar & Fluency" score={item.feedback.grammarScore} justification={item.feedback.grammarJustification} />
                                <ScoringDetailRow label="Stop words" score={item.feedback.stopWordsScore} justification={item.feedback.stopWordsJustification} />
                              </div>
                            ) : (
                              <div className="p-4 border rounded-lg bg-muted/20 text-center text-muted-foreground">
                                This is a general question and was not scored.
                              </div>
                            )}
                            <div className="mt-4 flex items-center justify-between p-4 rounded-lg bg-muted/50 font-bold">
                              <span>Overall Answer Score</span>
                              {item.isRealQuestion ? (
                                <span className={cn("text-2xl", getScoreColor(item.feedback.overallScore))}>
                                  {item.feedback.overallScore}/10
                                </span>
                              ) : (
                                <span className="text-2xl text-muted-foreground">
                                  Not Scored
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Disqualification Notice */}
            {showDisqualified && (
              <Card className="bg-red-50 border-red-200">
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <div className="text-2xl font-bold text-red-600">0%</div>
                  </div>
                  <h3 className="font-bold text-red-700 mb-2">Disqualified / Incomplete</h3>
                  <p className="text-sm text-red-600">
                    {configuredQuestionLimit > 0 ? (
                      <>You answered {summary.length} out of {configuredQuestionLimit} required questions. 
                      Please complete all {configuredQuestionLimit} questions to receive your interview analysis and score.</>
                    ) : (
                      <>You answered {summary.length} out of {minQuestionsRequired} minimum required questions. 
                      Please complete at least {minQuestionsRequired} questions to receive your interview analysis and score.</>
                    )}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  onClick={handleStartNewInterview} 
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Start New Interview
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/prepare">
                    Back to Preparation
                  </Link>
                </Button>
                <p className="text-xs text-gray-500 text-center">
                  This will clear all data and start fresh with a new resume upload
                </p>
              </CardContent>
            </Card>

            {/* Download Report */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Download Report</CardTitle>
              </CardHeader>
              <CardContent>
                <Button onClick={handleDownload} variant="outline" className="w-full">
                  <Download className="w-4 h-4 mr-2" />
                  Download PDF Report
                </Button>
                <p className="text-xs text-gray-500 text-center mt-2">
                  Get a comprehensive PDF with all feedback and scores
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Category Detail Modal */}
        <Dialog open={isCategoryModalOpen} onOpenChange={setIsCategoryModalOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>{selectedCategory ? getCategoryDisplayName(selectedCategory) : ''} Questions</span>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setIsCategoryModalOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogTitle>
              <DialogDescription>
                Detailed view of all questions and AI feedback for this category
              </DialogDescription>
            </DialogHeader>
            
            {selectedCategory && (
              <div className="space-y-6">
                {getCategoryQuestions(selectedCategory).length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No questions were asked in this category during your interview.</p>
                  </div>
                ) : (
                  getCategoryQuestions(selectedCategory).map((item, index) => (
                    <Card key={index} className="border-l-4 border-l-blue-500">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 pr-4">
                            <CardTitle className="text-lg font-semibold">
                              Q{index + 1}: {item.question}
                            </CardTitle>
                          </div>
                          <div className="flex-shrink-0">
                            <ScoreCircle score={item.feedback.overallScore} size={48} strokeWidth={3} />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Candidate Answer */}
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <h4 className="font-semibold text-blue-800 mb-2">Your Answer:</h4>
                          <p className="text-gray-700">{item.answer}</p>
                        </div>

                        {/* AI Feedback */}
                        <div className="space-y-3">
                          <h4 className="font-semibold text-gray-800">AI Feedback:</h4>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-green-50 p-3 rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <ThumbsUp className="w-4 h-4 text-green-600" />
                                <h5 className="font-semibold text-green-800">Content</h5>
                              </div>
                              <p className="text-sm text-green-700">{item.feedback.contentFeedback}</p>
                            </div>

                            <div className="bg-blue-50 p-3 rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <Lightbulb className="w-4 h-4 text-blue-600" />
                                <h5 className="font-semibold text-blue-800">Clarity</h5>
                              </div>
                              <p className="text-sm text-blue-700">{item.feedback.clarityFeedback}</p>
                            </div>

                            <div className="bg-purple-50 p-3 rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <BarChart className="w-4 h-4 text-purple-600" />
                                <h5 className="font-semibold text-purple-800">Tone</h5>
                              </div>
                              <p className="text-sm text-purple-700">{item.feedback.toneFeedback}</p>
                            </div>
                          </div>

                          {item.feedback.visualFeedback && (
                            <div className="bg-yellow-50 p-3 rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <Smile className="w-4 h-4 text-yellow-600" />
                                <h5 className="font-semibold text-yellow-800">Visual Presentation</h5>
                              </div>
                              <p className="text-sm text-yellow-700">{item.feedback.visualFeedback}</p>
                            </div>
                          )}
                        </div>

                        {/* Detailed Scoring */}
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h5 className="font-semibold text-gray-800 mb-3">Detailed Scoring</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <ScoringDetailRow label="Ideas" score={item.feedback.ideasScore} justification={item.feedback.ideasJustification} />
                            <ScoringDetailRow label="Organization" score={item.feedback.organizationScore} justification={item.feedback.organizationJustification} />
                            <ScoringDetailRow label="Accuracy" score={item.feedback.accuracyScore} justification={item.feedback.accuracyJustification} />
                            <ScoringDetailRow label="Voice" score={item.feedback.voiceScore} justification={item.feedback.voiceJustification} />
                            <ScoringDetailRow label="Grammar & Fluency" score={item.feedback.grammarScore} justification={item.feedback.grammarJustification} />
                            <ScoringDetailRow label="Stop Words" score={item.feedback.stopWordsScore} justification={item.feedback.stopWordsJustification} />
                          </div>
                          
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-gray-800">Overall Score</span>
                              <span className={cn("text-xl font-bold", getScoreColor(item.feedback.overallScore))}>
                                {item.feedback.overallScore}/10
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
