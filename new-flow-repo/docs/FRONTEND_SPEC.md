# Frontend Specification: AI-Assisted Interview Platform

## Overview

This document provides complete specifications for building the frontend of the AI-Assisted Interview Platform. The platform enables human interviewers to conduct video interviews while receiving real-time AI-powered insights.

**Key Principle**: AI assists but never conducts interviews. All insights are shown ONLY to the interviewer, never to the candidate.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Application                      │
├──────────────────────────┬──────────────────────────────────────┤
│   Interviewer Dashboard  │      Candidate Interface             │
│   (Rich UI + Insights)   │      (Simple GMeet-like)             │
├──────────────────────────┴──────────────────────────────────────┤
│                     VideoSDK React SDK                           │
├─────────────────────────────────────────────────────────────────┤
│                     WebSocket (Socket.io)                        │
├─────────────────────────────────────────────────────────────────┤
│                     REST API (Express)                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | React 18+ with TypeScript |
| State Management | Zustand or Redux Toolkit |
| Styling | Tailwind CSS + shadcn/ui |
| Video Conferencing | VideoSDK React SDK |
| Real-time Updates | Socket.io-client |
| HTTP Client | Axios or TanStack Query |
| Routing | React Router v6 |
| Form Handling | React Hook Form + Zod |
| Testing | Vitest + React Testing Library |

---

## User Roles & Access

### 1. Interviewer/Employee
- Full access to video interface
- AI insights panel (real-time)
- Interview controls
- Verdict submission
- Resume viewing

### 2. Candidate
- Simple video interface
- NO access to AI insights
- Basic call controls only
- Consent popup

### 3. HR Manager/Admin
- Dashboard for analytics
- Access to interview recordings
- Verdict history
- Audit logs

---

## Core Pages & Components

### Page Structure

```
/                           → Landing/Login
/login                      → Authentication
/dashboard                  → Main dashboard (role-based)
/interviews                 → Interview list
/interviews/:id             → Interview details
/interviews/:id/rounds/:roundId → Live interview room
/candidates                 → Candidate management
/analytics                  → Analytics dashboard (admin)
/settings                   → User settings
```

---

## 1. Interview Room (Most Critical)

### 1.1 Interviewer View

```typescript
// Component structure
interface InterviewRoomProps {
  roundId: string;
  interviewId: string;
}

// Layout: Split-screen
// ┌─────────────────────────────────────────────────────────┐
// │ Header: Interview Title, Timer, Controls               │
// ├────────────────────────────────┬────────────────────────┤
// │                                │    AI Insights Panel   │
// │      Video Grid               │    (Interviewer Only)  │
// │   (VideoSDK Component)         │                        │
// │                                │    ┌─────────────────┐ │
// │                                │    │ Live Alerts     │ │
// │                                │    ├─────────────────┤ │
// │                                │    │ Speech Analysis │ │
// │                                │    ├─────────────────┤ │
// │                                │    │ Recommendations │ │
// │                                │    └─────────────────┘ │
// ├────────────────────────────────┴────────────────────────┤
// │ Bottom: Resume Panel (Collapsible), Notes, Controls    │
// └─────────────────────────────────────────────────────────┘
```

#### Key Components:

```typescript
// VideoGrid.tsx
interface VideoGridProps {
  participants: Participant[];
  localParticipant: Participant;
  layout: 'grid' | 'spotlight' | 'sidebar';
}

// AIInsightsPanel.tsx
interface AIInsightsPanelProps {
  roundId: string;
  isInterviewer: boolean;  // Only render if true
}

interface Insight {
  id: string;
  category: 'fraud' | 'contradiction' | 'speech' | 'video';
  insightType: string;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  title: string;
  description: string;
  followupQuestions: string[];
  isAlert: boolean;
  timestamp: string;
}

// AlertBanner.tsx
interface AlertBannerProps {
  alert: Insight;
  onDismiss: () => void;
  onAction: (action: string) => void;
}

// ResumePanel.tsx
interface ResumePanelProps {
  candidateId: string;
  resumeData: ResumeData;
  highlightedSections?: string[];  // Highlight contradictions
}

// RecommendationCard.tsx
interface RecommendationCardProps {
  recommendation: {
    type: 'action' | 'clarification' | 'observation';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    suggestedQuestions?: string[];
    suggestedActions?: string[];
  };
  onApply: () => void;
}
```

### 1.2 Candidate View

```typescript
// Simple, clean interface
// ┌─────────────────────────────────────────────────────────┐
// │ Header: Company Logo, Interview Title                  │
// ├─────────────────────────────────────────────────────────┤
// │                                                         │
// │                    Video Grid                           │
// │              (Interviewer + Self)                       │
// │                                                         │
// ├─────────────────────────────────────────────────────────┤
// │ Bottom: Mic, Camera, Screen Share, Leave Call          │
// └─────────────────────────────────────────────────────────┘

// NO AI insights, NO recommendations, NO resume panel
```

### 1.3 Consent Popup (Required for Indian Market)

```typescript
// Show BEFORE joining the call
interface ConsentPopupProps {
  onAccept: () => void;
  onDecline: () => void;
  companyName: string;
}

// Content:
// - Video recording notice
// - AI analysis disclosure
// - Data retention policy
// - Privacy policy link
```

---

## 2. VideoSDK Integration

### 2.1 Installation

```bash
npm install @videosdk.live/react-sdk
```

### 2.2 Context Setup

```typescript
// src/contexts/VideoContext.tsx
import { MeetingProvider, useMeeting, useParticipant } from "@videosdk.live/react-sdk";

interface VideoContextProps {
  meetingId: string;
  participantId: string;
  token: string;
  onMeetingJoin: () => void;
  onMeetingLeave: () => void;
}

export const VideoProvider: React.FC<VideoContextProps> = ({
  meetingId,
  participantId,
  token,
  children
}) => {
  return (
    <MeetingProvider
      config={{
        meetingId,
        participantId,
        name: participantId,
        micEnabled: true,
        webcamEnabled: true,
        maxResolution: "hd",
        multiStream: true,
      }}
      token={token}
    >
      {children}
    </MeetingProvider>
  );
};
```

### 2.3 Media Stream Capture (For Analysis)

```typescript
// src/hooks/useMediaCapture.ts
import { useRef, useCallback } from 'react';

export const useMediaCapture = (participantId: string) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Capture video frame for analysis
  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.7);  // Base64 frame
  }, []);
  
  return { videoRef, canvasRef, captureFrame };
};
```

### 2.4 Room Creation Flow

```typescript
// Room is created by employee/interviewer, NOT candidate
// API call to create VideoSDK room

interface CreateRoomResponse {
  roomId: string;
  candidateLink: string;  // Simple join link for candidate
  interviewerToken: string;
  candidateToken: string;
}

// POST /api/v1/rounds/:roundId/create-room
const createRoom = async (roundId: string): Promise<CreateRoomResponse> => {
  const response = await api.post(`/rounds/${roundId}/create-room`);
  return response.data;
};
```

---

## 3. WebSocket Integration (Real-time Insights)

### 3.1 Socket Setup

```typescript
// src/services/socket.ts
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const connectSocket = (token: string): Socket => {
  socket = io(import.meta.env.VITE_API_URL, {
    auth: { token },
    transports: ['websocket'],
  });
  
  socket.on('connect', () => {
    console.log('Socket connected');
  });
  
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
  
  return socket;
};

export const joinInterviewRoom = (roundId: string) => {
  socket?.emit('interview:join', { roundId });
};

export const leaveInterviewRoom = (roundId: string) => {
  socket?.emit('interview:leave', { roundId });
};

export const getSocket = () => socket;
```

### 3.2 Insight Listener Hook

```typescript
// src/hooks/useInsights.ts
import { useState, useEffect, useCallback } from 'react';
import { getSocket } from '../services/socket';

export const useInsights = (roundId: string, isInterviewer: boolean) => {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [alerts, setAlerts] = useState<Insight[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  
  useEffect(() => {
    // Only listen if interviewer
    if (!isInterviewer) return;
    
    const socket = getSocket();
    if (!socket) return;
    
    // Listen for aggregated insights
    socket.on('insight:aggregated', (data: InsightBatch) => {
      // Update insights
      setInsights(prev => [...data.insights, ...prev].slice(0, 50));
      
      // Extract alerts
      const newAlerts = data.insights.filter(i => i.isAlert);
      setAlerts(prev => [...newAlerts, ...prev].slice(0, 10));
      
      // Update recommendations
      setRecommendations(data.recommendations);
    });
    
    // Listen for real-time alerts (high priority)
    socket.on('insight:alert', (alert: Insight) => {
      setAlerts(prev => [alert, ...prev].slice(0, 10));
    });
    
    return () => {
      socket.off('insight:aggregated');
      socket.off('insight:alert');
    };
  }, [roundId, isInterviewer]);
  
  const dismissAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }, []);
  
  return { insights, alerts, recommendations, dismissAlert };
};
```

### 3.3 Media Stream Publisher

```typescript
// src/hooks/useStreamPublisher.ts
// Sends video frames and audio chunks to backend for analysis

export const useStreamPublisher = (roundId: string, captureFrame: () => string | null) => {
  const intervalRef = useRef<NodeJS.Timer | null>(null);
  
  const startPublishing = useCallback(() => {
    const socket = getSocket();
    if (!socket) return;
    
    // Capture and send frame every 2 seconds
    intervalRef.current = setInterval(() => {
      const frame = captureFrame();
      if (frame) {
        socket.emit('video:frame', {
          roundId,
          frame,
          timestamp: Date.now()
        });
      }
    }, 2000);
  }, [roundId, captureFrame]);
  
  const stopPublishing = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);
  
  return { startPublishing, stopPublishing };
};
```

---

## 4. REST API Integration

### 4.1 API Client Setup

```typescript
// src/services/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 30000,
});

// Auth interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle auth expiry
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

### 4.2 API Endpoints

```typescript
// Interview Rounds
GET    /api/v1/rounds                    // List all rounds
GET    /api/v1/rounds/:id                // Get round details
POST   /api/v1/rounds                    // Create new round
PATCH  /api/v1/rounds/:id/start          // Start round
PATCH  /api/v1/rounds/:id/end            // End round
POST   /api/v1/rounds/:id/create-room    // Create VideoSDK room

// Verdicts
POST   /api/v1/verdicts                  // Submit verdict
GET    /api/v1/verdicts/round/:roundId   // Get verdicts for round
PATCH  /api/v1/verdicts/:id              // Update verdict

// Insights (historical)
GET    /api/v1/insights/round/:roundId   // Get insights for round

// Resume
GET    /api/v1/resumes/candidate/:id     // Get candidate resume
POST   /api/v1/resumes                   // Upload resume

// Recommendations
GET    /api/v1/recommendations/:roundId  // Get AI recommendations
```

### 4.3 Type Definitions

```typescript
// src/types/index.ts

export interface InterviewRound {
  id: string;
  interviewId: string;
  roundNumber: number;
  roundType: 'technical' | 'behavioral' | 'hr' | 'culture_fit' | 'final';
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  scheduledAt: string;
  startedAt?: string;
  endedAt?: string;
  videosdkMeetingId?: string;
  interviewerId: string;
  candidateId: string;
}

export interface Insight {
  id: string;
  roundId: string;
  category: 'fraud' | 'contradiction' | 'speech' | 'video';
  insightType: string;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  title: string;
  description: string;
  evidence: string[];
  sourceServices: string[];
  followupQuestions: string[];
  isAlert: boolean;
  createdAt: string;
}

export interface Recommendation {
  type: 'action' | 'clarification' | 'observation';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  suggestedQuestions?: string[];
  suggestedActions?: string[];
  relatedInsightId?: string;
}

export interface Verdict {
  id: string;
  roundId: string;
  interviewerId: string;
  decision: 'proceed' | 'reject' | 'on_hold' | 'needs_discussion';
  technicalScore?: number;
  communicationScore?: number;
  overallScore?: number;
  notes: string;
  aiContributions?: string[];
  createdAt: string;
}

export interface ResumeData {
  candidateId: string;
  personalInfo: {
    name: string;
    email: string;
    phone?: string;
    location?: string;
    linkedinUrl?: string;
    githubUrl?: string;
  };
  experience: Array<{
    company: string;
    title: string;
    location?: string;
    startDate: string;
    endDate?: string;
    isCurrent: boolean;
    description: string;
    highlights: string[];
    technologies: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string;
    field: string;
    startDate: string;
    endDate?: string;
    gpa?: string;
  }>;
  skills: {
    programming: string[];
    frameworks: string[];
    databases: string[];
    tools: string[];
    soft: string[];
  };
  projects: Array<{
    name: string;
    description: string;
    technologies: string[];
    url?: string;
    highlights: string[];
  }>;
  certifications: Array<{
    name: string;
    issuer: string;
    issueDate: string;
    expiryDate?: string;
    credentialId?: string;
  }>;
}
```

---

## 5. UI Components (shadcn/ui)

### 5.1 Alert Components

```typescript
// src/components/insights/AlertBanner.tsx
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AlertBannerProps {
  alert: Insight;
  onDismiss: () => void;
  onViewDetails: () => void;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  alert,
  onDismiss,
  onViewDetails
}) => {
  const severityColors = {
    high: 'border-red-500 bg-red-50',
    medium: 'border-yellow-500 bg-yellow-50',
    low: 'border-blue-500 bg-blue-50'
  };
  
  return (
    <Alert className={`${severityColors[alert.severity]} animate-pulse-once`}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        {alert.title}
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>{alert.description}</span>
        <Button variant="link" size="sm" onClick={onViewDetails}>
          Details <ChevronRight className="h-4 w-4" />
        </Button>
      </AlertDescription>
    </Alert>
  );
};
```

### 5.2 Insights Panel

```typescript
// src/components/insights/InsightsPanel.tsx
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface InsightsPanelProps {
  insights: Insight[];
  recommendations: Recommendation[];
  alerts: Insight[];
  onDismissAlert: (id: string) => void;
}

export const InsightsPanel: React.FC<InsightsPanelProps> = ({
  insights,
  recommendations,
  alerts,
  onDismissAlert
}) => {
  return (
    <div className="h-full flex flex-col bg-background border-l">
      {/* Alerts at top */}
      {alerts.length > 0 && (
        <div className="p-2 space-y-2 border-b">
          {alerts.map(alert => (
            <AlertBanner
              key={alert.id}
              alert={alert}
              onDismiss={() => onDismissAlert(alert.id)}
              onViewDetails={() => {/* scroll to insight */}}
            />
          ))}
        </div>
      )}
      
      {/* Tabbed content */}
      <Tabs defaultValue="live" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="live">
            Live
            <Badge variant="secondary" className="ml-2">
              {insights.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="recommendations">
            Suggestions
          </TabsTrigger>
          <TabsTrigger value="all">
            All
          </TabsTrigger>
        </TabsList>
        
        <ScrollArea className="flex-1">
          <TabsContent value="live" className="p-2 space-y-2">
            {insights.slice(0, 10).map(insight => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </TabsContent>
          
          <TabsContent value="recommendations" className="p-2 space-y-2">
            {recommendations.map((rec, i) => (
              <RecommendationCard key={i} recommendation={rec} />
            ))}
          </TabsContent>
          
          <TabsContent value="all" className="p-2">
            {/* Grouped by category */}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
};
```

### 5.3 Insight Card

```typescript
// src/components/insights/InsightCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export const InsightCard: React.FC<{ insight: Insight }> = ({ insight }) => {
  const categoryIcons = {
    fraud: '🚨',
    contradiction: '⚠️',
    speech: '🎙️',
    video: '📹'
  };
  
  return (
    <Card className="shadow-sm">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <span>{categoryIcons[insight.category]}</span>
            {insight.title}
          </CardTitle>
          <div className="flex gap-1">
            <Badge variant={insight.severity === 'high' ? 'destructive' : 'secondary'}>
              {insight.severity}
            </Badge>
            <Badge variant="outline">
              {Math.round(insight.confidence * 100)}%
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="py-2 px-3">
        <p className="text-sm text-muted-foreground">{insight.description}</p>
        
        {insight.followupQuestions.length > 0 && (
          <Collapsible className="mt-2">
            <CollapsibleTrigger className="text-xs text-primary">
              Suggested questions →
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 space-y-1">
              {insight.followupQuestions.map((q, i) => (
                <p key={i} className="text-xs bg-muted p-2 rounded">
                  "{q}"
                </p>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
};
```

### 5.4 Verdict Form

```typescript
// src/components/verdict/VerdictForm.tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const verdictSchema = z.object({
  decision: z.enum(['proceed', 'reject', 'on_hold', 'needs_discussion']),
  technicalScore: z.number().min(1).max(5).optional(),
  communicationScore: z.number().min(1).max(5).optional(),
  overallScore: z.number().min(1).max(5).optional(),
  notes: z.string().min(10, "Please provide detailed notes"),
});

type VerdictFormData = z.infer<typeof verdictSchema>;

interface VerdictFormProps {
  roundId: string;
  aiInsightsSummary?: string[];
  onSubmit: (data: VerdictFormData) => void;
}

export const VerdictForm: React.FC<VerdictFormProps> = ({
  roundId,
  aiInsightsSummary,
  onSubmit
}) => {
  const form = useForm<VerdictFormData>({
    resolver: zodResolver(verdictSchema),
    defaultValues: {
      decision: 'on_hold',
      notes: '',
    }
  });
  
  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* Decision radio buttons */}
      {/* Score sliders */}
      {/* Notes textarea */}
      {/* AI Insights summary (read-only) */}
      {/* Submit button */}
    </form>
  );
};
```

---

## 6. State Management

### 6.1 Zustand Stores

```typescript
// src/stores/interviewStore.ts
import { create } from 'zustand';

interface InterviewState {
  currentRound: InterviewRound | null;
  participants: Participant[];
  isRecording: boolean;
  
  // Actions
  setCurrentRound: (round: InterviewRound) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (id: string) => void;
  setRecording: (isRecording: boolean) => void;
  reset: () => void;
}

export const useInterviewStore = create<InterviewState>((set) => ({
  currentRound: null,
  participants: [],
  isRecording: false,
  
  setCurrentRound: (round) => set({ currentRound: round }),
  addParticipant: (participant) => set((state) => ({
    participants: [...state.participants, participant]
  })),
  removeParticipant: (id) => set((state) => ({
    participants: state.participants.filter(p => p.id !== id)
  })),
  setRecording: (isRecording) => set({ isRecording }),
  reset: () => set({ currentRound: null, participants: [], isRecording: false }),
}));

// src/stores/insightStore.ts
interface InsightState {
  insights: Insight[];
  alerts: Insight[];
  recommendations: Recommendation[];
  
  addInsight: (insight: Insight) => void;
  addAlert: (alert: Insight) => void;
  dismissAlert: (id: string) => void;
  setRecommendations: (recs: Recommendation[]) => void;
  clear: () => void;
}

export const useInsightStore = create<InsightState>((set) => ({
  insights: [],
  alerts: [],
  recommendations: [],
  
  addInsight: (insight) => set((state) => ({
    insights: [insight, ...state.insights].slice(0, 100)
  })),
  addAlert: (alert) => set((state) => ({
    alerts: [alert, ...state.alerts].slice(0, 10)
  })),
  dismissAlert: (id) => set((state) => ({
    alerts: state.alerts.filter(a => a.id !== id)
  })),
  setRecommendations: (recommendations) => set({ recommendations }),
  clear: () => set({ insights: [], alerts: [], recommendations: [] }),
}));
```

---

## 7. Environment Variables

```bash
# .env.example

# API
VITE_API_URL=http://localhost:3000/api/v1

# VideoSDK
VITE_VIDEOSDK_TOKEN_ENDPOINT=/api/v1/video/token

# Feature Flags
VITE_ENABLE_INSIGHTS=true
VITE_ENABLE_RECORDING=true

# Analytics (optional)
VITE_POSTHOG_KEY=
VITE_SENTRY_DSN=
```

---

## 8. Error Handling & Loading States

### 8.1 Error Boundary

```typescript
// src/components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  // Standard error boundary implementation
}
```

### 8.2 Loading Skeletons

```typescript
// Use shadcn/ui Skeleton for all loading states
// src/components/skeletons/InsightsSkeleton.tsx
// src/components/skeletons/VideoGridSkeleton.tsx
```

---

## 9. Accessibility Requirements

- Keyboard navigation for all controls
- ARIA labels for dynamic content
- Screen reader announcements for alerts
- Focus management in modals
- Color contrast compliance (WCAG 2.1 AA)
- Captions support for audio (future)

---

## 10. Testing Strategy

### 10.1 Unit Tests
- Component rendering
- Hook behavior
- Store actions

### 10.2 Integration Tests
- API integration
- WebSocket events
- VideoSDK mocking

### 10.3 E2E Tests (Playwright)
- Interview flow
- Verdict submission
- Role-based access

---

## 11. Performance Considerations

1. **Virtual scrolling** for insight lists
2. **Debounce** insight updates (100ms)
3. **Lazy load** components with React.lazy
4. **Memoize** expensive computations
5. **Web Workers** for heavy processing
6. **Optimize re-renders** with React.memo

---

## 12. Deployment

```bash
# Build
npm run build

# Preview
npm run preview

# Docker
docker build -t interview-frontend .
docker run -p 80:80 interview-frontend
```

---

## Questions for Backend Team

1. What's the WebSocket event naming convention?
2. Is there pagination for insights API?
3. How to handle VideoSDK token refresh?
4. What's the max frame rate for video analysis?
5. Are there rate limits on the insights endpoint?

---

## Contact

For backend API questions, contact the backend team.
For VideoSDK issues, refer to: https://docs.videosdk.live/
