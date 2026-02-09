'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore, useAIMetricsStore } from '@/store';
import { mockCandidate, mockAIMetrics } from '@/lib/mock-data';
import { verdictsApi } from '@/services/api';
import { Button, Card, CardHeader, CardTitle, CardContent, Badge, ProgressBar } from '@/components/ui';
import { 
  ArrowLeft, 
  Save, 
  CheckCircle, 
  XCircle, 
  MinusCircle,
  User,
  Briefcase,
  MessageSquare,
  Star,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';
import type { HumanVerdict } from '@/types';

export default function InterviewerVerdictPage() {
  const router = useRouter();
  const params = useParams();
  const roundId = params.roundId as string;
  
  const { user } = useAuthStore();
  
  const [verdict, setVerdict] = useState<HumanVerdict>({
    roundId,
    interviewerId: user?.id || '',
    decision: 'pending',
    feedback: '',
    technicalScore: 3,
    communicationScore: 3,
    cultureFitScore: 3,
    strengths: [],
    improvements: [],
    additionalNotes: '',
    submittedAt: '',
  });
  
  const [strengthInput, setStrengthInput] = useState('');
  const [improvementInput, setImprovementInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'employee') {
      router.push('/');
    }
  }, [user, router]);

  const handleDecisionChange = (decision: HumanVerdict['decision']) => {
    setVerdict(prev => ({ ...prev, decision }));
  };

  const handleScoreChange = (field: 'technicalScore' | 'communicationScore' | 'cultureFitScore', value: number) => {
    setVerdict(prev => ({ ...prev, [field]: value }));
  };

  const addStrength = () => {
    if (strengthInput.trim()) {
      setVerdict(prev => ({ 
        ...prev, 
        strengths: [...prev.strengths, strengthInput.trim()] 
      }));
      setStrengthInput('');
    }
  };

  const removeStrength = (index: number) => {
    setVerdict(prev => ({
      ...prev,
      strengths: prev.strengths.filter((_, i) => i !== index)
    }));
  };

  const addImprovement = () => {
    if (improvementInput.trim()) {
      setVerdict(prev => ({ 
        ...prev, 
        improvements: [...(prev.improvements || []), improvementInput.trim()] 
      }));
      setImprovementInput('');
    }
  };

  const removeImprovement = (index: number) => {
    setVerdict(prev => ({
      ...prev,
      improvements: (prev.improvements || []).filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    try {
      // Map local verdict format to API format
      const apiPayload = {
        round_id: roundId,
        decision: verdict.decision === 'proceed' || verdict.decision === 'pass' ? 'proceed' : 
                  verdict.decision === 'reject' ? 'reject' : 
                  verdict.decision === 'hold' || verdict.decision === 'on_hold' ? 'on_hold' : 'needs_discussion',
        technical_score: verdict.technicalScore,
        communication_score: verdict.communicationScore,
        overall_score: Math.round((verdict.technicalScore + verdict.communicationScore + (verdict.cultureFitScore || 3)) / 3),
        notes: `${verdict.feedback || ''}\n\nStrengths: ${verdict.strengths.join(', ')}\n\nAreas for Improvement: ${(verdict.improvements || []).join(', ')}\n\nAdditional Notes: ${verdict.additionalNotes || ''}`,
        ai_contributions: [], // Could be populated from AI insights
      };

      await verdictsApi.submit(apiPayload as any);
    } catch (error) {
      console.error('Failed to submit verdict via API:', error);
      // Continue anyway for demo purposes
    }
    
    setVerdict(prev => ({
      ...prev,
      submittedAt: new Date().toISOString()
    }));
    
    setIsSubmitted(true);
    setIsSubmitting(false);
  };

  const ScoreSelector = ({ 
    label, 
    value, 
    onChange 
  }: { 
    label: string; 
    value: number; 
    onChange: (v: number) => void;
  }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-500">{value}/5</span>
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            onClick={() => onChange(score)}
            className={`w-10 h-10 rounded-lg flex items-center justify-center font-medium transition-colors ${
              value >= score
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
            }`}
          >
            {score}
          </button>
        ))}
      </div>
    </div>
  );

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6 text-center">
          <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-success-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Verdict Submitted
          </h1>
          <p className="text-gray-600 mb-6">
            Your feedback has been recorded successfully. HR will review the combined assessment.
          </p>
          <Button onClick={() => router.push('/interviewer/dashboard')}>
            Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => router.push('/interviewer/dashboard')}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Back
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Interview Verdict</h1>
              <p className="text-sm text-gray-600">Provide your assessment for {mockCandidate.name}</p>
            </div>
          </div>
          <Button 
            onClick={handleSubmit}
            isLoading={isSubmitting}
            leftIcon={<Save className="w-4 h-4" />}
            disabled={verdict.decision === 'pending'}
          >
            Submit Verdict
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Candidate Info & AI Summary */}
          <div className="space-y-6">
            {/* Candidate Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5 text-primary-600" />
                  Candidate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <h3 className="font-semibold text-gray-900">{mockCandidate.name}</h3>
                <p className="text-sm text-gray-600">{mockCandidate.email}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {mockCandidate.resumeJson.skills.slice(0, 5).map((skill, i) => (
                    <Badge key={i} variant="info" size="sm">{skill}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* AI Metrics Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-primary-600" />
                  AI Analysis Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Speech Confidence</span>
                    <span className="font-medium">{mockAIMetrics.speechConfidence}%</span>
                  </div>
                  <ProgressBar value={mockAIMetrics.speechConfidence} size="sm" />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Engagement Score</span>
                    <span className="font-medium">{mockAIMetrics.engagementScore}%</span>
                  </div>
                  <ProgressBar value={mockAIMetrics.engagementScore} size="sm" />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Hesitations</span>
                  <span className="font-medium">{mockAIMetrics.hesitationsCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Avg Response Time</span>
                  <span className="font-medium">{mockAIMetrics.avgResponseTime}s</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Authenticity</span>
                  <Badge variant={mockAIMetrics.authenticity === 'verified' ? 'success' : 'warning'}>
                    {mockAIMetrics.authenticity}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Verdict Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Decision */}
            <Card>
              <CardHeader>
                <CardTitle>Your Decision</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <button
                    onClick={() => handleDecisionChange('pass')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      verdict.decision === 'pass'
                        ? 'border-success-500 bg-success-50'
                        : 'border-gray-200 hover:border-success-300'
                    }`}
                  >
                    <ThumbsUp className={`w-8 h-8 mx-auto mb-2 ${
                      verdict.decision === 'pass' ? 'text-success-600' : 'text-gray-400'
                    }`} />
                    <span className={`block font-medium ${
                      verdict.decision === 'pass' ? 'text-success-700' : 'text-gray-700'
                    }`}>
                      Pass
                    </span>
                    <span className="text-xs text-gray-500">Proceed to next round</span>
                  </button>
                  
                  <button
                    onClick={() => handleDecisionChange('hold')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      verdict.decision === 'hold'
                        ? 'border-warning-500 bg-warning-50'
                        : 'border-gray-200 hover:border-warning-300'
                    }`}
                  >
                    <MinusCircle className={`w-8 h-8 mx-auto mb-2 ${
                      verdict.decision === 'hold' ? 'text-warning-600' : 'text-gray-400'
                    }`} />
                    <span className={`block font-medium ${
                      verdict.decision === 'hold' ? 'text-warning-700' : 'text-gray-700'
                    }`}>
                      Hold
                    </span>
                    <span className="text-xs text-gray-500">Need more evaluation</span>
                  </button>
                  
                  <button
                    onClick={() => handleDecisionChange('reject')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      verdict.decision === 'reject'
                        ? 'border-danger-500 bg-danger-50'
                        : 'border-gray-200 hover:border-danger-300'
                    }`}
                  >
                    <ThumbsDown className={`w-8 h-8 mx-auto mb-2 ${
                      verdict.decision === 'reject' ? 'text-danger-600' : 'text-gray-400'
                    }`} />
                    <span className={`block font-medium ${
                      verdict.decision === 'reject' ? 'text-danger-700' : 'text-gray-700'
                    }`}>
                      Reject
                    </span>
                    <span className="text-xs text-gray-500">Not suitable</span>
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Scores */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-primary-600" />
                  Evaluation Scores
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <ScoreSelector 
                  label="Technical Skills" 
                  value={verdict.technicalScore!} 
                  onChange={(v) => handleScoreChange('technicalScore', v)} 
                />
                <ScoreSelector 
                  label="Communication" 
                  value={verdict.communicationScore!} 
                  onChange={(v) => handleScoreChange('communicationScore', v)} 
                />
                <ScoreSelector 
                  label="Culture Fit" 
                  value={verdict.cultureFitScore!} 
                  onChange={(v) => handleScoreChange('cultureFitScore', v)} 
                />
              </CardContent>
            </Card>

            {/* Feedback */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary-600" />
                  Detailed Feedback
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* General Feedback */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    General Feedback
                  </label>
                  <textarea
                    value={verdict.feedback}
                    onChange={(e) => setVerdict(prev => ({ ...prev, feedback: e.target.value }))}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Provide your overall assessment of the candidate..."
                  />
                </div>

                {/* Strengths */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Key Strengths
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={strengthInput}
                      onChange={(e) => setStrengthInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addStrength()}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="Add a strength..."
                    />
                    <Button onClick={addStrength} variant="secondary">Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {verdict.strengths.map((strength, i) => (
                      <Badge key={i} variant="success" className="cursor-pointer" onClick={() => removeStrength(i)}>
                        {strength} ×
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Areas for Improvement */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Areas for Improvement
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={improvementInput}
                      onChange={(e) => setImprovementInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addImprovement()}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="Add an area for improvement..."
                    />
                    <Button onClick={addImprovement} variant="secondary">Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(verdict.improvements || []).map((improvement, i) => (
                      <Badge key={i} variant="warning" className="cursor-pointer" onClick={() => removeImprovement(i)}>
                        {improvement} ×
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Additional Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Additional Notes (Optional)
                  </label>
                  <textarea
                    value={verdict.additionalNotes}
                    onChange={(e) => setVerdict(prev => ({ ...prev, additionalNotes: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Any additional observations or notes..."
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
