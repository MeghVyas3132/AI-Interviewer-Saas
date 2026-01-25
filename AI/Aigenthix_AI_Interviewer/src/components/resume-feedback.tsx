"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, AlertCircle, Star, TrendingUp, FileText, Target, Lightbulb, Wrench, ChevronDown, ChevronRight } from "lucide-react";
import { AnalyzeResumeOutput } from "@/ai/flows/resume-analyzer";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ResumeFeedbackProps {
  analysis: AnalyzeResumeOutput;
}

export function ResumeFeedback({ analysis }: ResumeFeedbackProps) {
  const [isDetailedFeedbackOpen, setIsDetailedFeedbackOpen] = useState(false);
  
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getRatingStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
      />
    ));
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 4) return "text-green-600";
    if (rating >= 3) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Resume Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
            <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-6 text-center">
              <div className="text-[28px] leading-none font-extrabold text-blue-600">{analysis.atsScore}%</div>
              <div className="mt-2 text-xs text-blue-700 font-medium">ATS Score</div>
              <div className="mt-3 h-2 w-full rounded-full bg-blue-200">
                <div className="h-2 rounded-full bg-blue-600" style={{ width: `${analysis.atsScore}%` }} />
              </div>
            </div>
            <div className="rounded-2xl border border-green-200 bg-green-50/60 p-6 text-center">
              <div className="text-[28px] leading-none font-extrabold text-green-600">
                {Math.round((Object.values(analysis.sectionRatings).reduce((a, b) => a + b, 0) / Object.keys(analysis.sectionRatings).length) * 10) / 10}
              </div>
              <div className="mt-2 text-xs text-green-700 font-medium">Avg Rating</div>
              <div className="mt-2 flex justify-center">{getRatingStars(Math.round(Object.values(analysis.sectionRatings).reduce((a, b) => a + b, 0) / Object.keys(analysis.sectionRatings).length))}</div>
            </div>
            <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-6 text-center">
              <div className="text-[28px] leading-none font-extrabold text-purple-600">{analysis.skills.length}</div>
              <div className="mt-2 text-xs text-purple-700 font-medium">Skills Found</div>
              <div className="text-[11px] text-purple-600 mt-1">Technical & Soft</div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-6 text-center">
              <div className="text-[28px] leading-none font-extrabold text-orange-600">{analysis.strengths.length}</div>
              <div className="mt-2 text-xs text-orange-700 font-medium">Key Strengths</div>
              <div className="text-[11px] text-orange-600 mt-1">Identified</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comprehensive Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Comprehensive Resume Analysis
          </CardTitle>
          <CardDescription>
            Complete overview of your resume content and structure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analysis.candidateName && (
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground mb-1">Candidate Name</h4>
                <p className="text-lg font-medium">{analysis.candidateName}</p>
              </div>
            )}
            
            {analysis.experienceSummary && (
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground mb-1">Experience Overview</h4>
                <p className="text-sm leading-relaxed">{analysis.experienceSummary}</p>
              </div>
            )}
            
            {analysis.comprehensiveSummary && (
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground mb-1">Full Resume Summary</h4>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{analysis.comprehensiveSummary}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ATS Score Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            ATS Compatibility Score
          </CardTitle>
          <CardDescription>
            How well your resume will perform with Applicant Tracking Systems
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className={`text-2xl font-bold ${getScoreColor(analysis.atsScore)}`}>
                {analysis.atsScore}/100
              </span>
              <Badge variant={analysis.atsScore >= 80 ? "default" : analysis.atsScore >= 60 ? "secondary" : "destructive"}>
                {analysis.atsScore >= 80 ? "Excellent" : analysis.atsScore >= 60 ? "Good" : "Needs Improvement"}
              </Badge>
            </div>
            <Progress value={analysis.atsScore} className="h-3" />
            <p className="text-sm text-muted-foreground">
              {analysis.atsScore >= 80 
                ? "Your resume is well-optimized for ATS systems!" 
                : analysis.atsScore >= 60 
                ? "Your resume has good ATS compatibility but could be improved." 
                : "Your resume needs significant improvements for ATS compatibility."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Section Ratings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5" />
            Section Ratings
          </CardTitle>
          <CardDescription>
            Detailed breakdown of each resume section
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {Object.entries(analysis.sectionRatings).map(([section, rating]) => (
              <div key={section} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <span className="capitalize font-medium">{section}</span>
                  <div className="flex">{getRatingStars(rating)}</div>
                </div>
                <span className={`font-semibold ${getRatingColor(rating)}`}>
                  {rating}/5
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Key Skills */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Key Skills Identified
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {analysis.skills.map((skill, i) => (
              <Badge key={i} variant="secondary">{skill}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Strengths */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-5 h-5" />
            Resume Strengths
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {analysis.strengths.map((strength, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>{strength}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Areas for Improvement */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="w-5 h-5" />
            Areas for Improvement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {analysis.areasForImprovement.map((area, i) => (
              <li key={i} className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>{area}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Detailed Feedback */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5" />
            Actionable Feedback
          </CardTitle>
          <CardDescription>
            Specific suggestions to improve your resume
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Collapsible open={isDetailedFeedbackOpen} onOpenChange={setIsDetailedFeedbackOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto font-normal">
                <span className="text-left">
                  {isDetailedFeedbackOpen ? "Hide detailed feedback" : "Show detailed feedback"}
                </span>
                {isDetailedFeedbackOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-6 mt-4">
              {/* Grammar & Style */}
              {analysis.feedback.grammar.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Wrench className="w-4 h-4" />
                    Grammar & Style
                  </h4>
                  <ul className="space-y-1 text-sm">
                    {analysis.feedback.grammar.map((suggestion, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ATS Optimization */}
              {analysis.feedback.ats.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    ATS Optimization
                  </h4>
                  <ul className="space-y-1 text-sm">
                    {analysis.feedback.ats.map((suggestion, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Content Enhancement */}
              {analysis.feedback.content.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Content Enhancement
                  </h4>
                  <ul className="space-y-1 text-sm">
                    {analysis.feedback.content.map((suggestion, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Formatting */}
              {analysis.feedback.formatting.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Formatting & Structure
                  </h4>
                  <ul className="space-y-1 text-sm">
                    {analysis.feedback.formatting.map((suggestion, i) => (
                                             <li key={i} className="flex items-start gap-2">
                         <span className="text-blue-500">•</span>
                         <span>{suggestion}</span>
                       </li>
                    ))}
                  </ul>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Experience Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Experience Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{analysis.experienceSummary}</p>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5" />
            Next Steps
          </CardTitle>
          <CardDescription>
            Recommended actions based on your resume analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {analysis.atsScore < 80 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800">Optimize for ATS</p>
                  <p className="text-amber-700">Focus on the ATS optimization suggestions above to improve your score.</p>
                </div>
              </div>
            )}
            {Object.values(analysis.sectionRatings).some(rating => rating < 3) && (
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <TrendingUp className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-blue-800">Improve Weak Sections</p>
                  <p className="text-blue-700">Focus on sections with ratings below 3 stars for maximum impact.</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-green-800">Ready for Interview</p>
                <p className="text-green-700">Your resume analysis is complete. Proceed to generate interview questions.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 