# Frontend Integration Guide

## AI-Assisted Interview Platform - Frontend Developer Guide

**Purpose:** Detailed guide for frontend integration with AI services  
**Audience:** Frontend developers  
**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Project Structure](#2-project-structure)
3. [Video Integration (VideoSDK)](#3-video-integration-videosdk)
4. [WebSocket Integration](#4-websocket-integration)
5. [AI Insights Panel](#5-ai-insights-panel)
6. [Media Capture for Analysis](#6-media-capture-for-analysis)
7. [User Role Separation](#7-user-role-separation)
8. [Component Reference](#8-component-reference)
9. [State Management](#9-state-management)
10. [Testing](#10-testing)

---

## 1. Architecture Overview

### Frontend ↔ Backend Communication

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Application                      │
├──────────────────────────┬──────────────────────────────────────┤
│   Interviewer Dashboard  │      Candidate Interface             │
│   (Rich UI + Insights)   │      (Simple GMeet-like)             │
├──────────────────────────┴──────────────────────────────────────┤
│                     VideoSDK React SDK                           │
├─────────────────────────────────────────────────────────────────┤
│                     WebSocket (Socket.io-client)                 │
├─────────────────────────────────────────────────────────────────┤
│                     REST API (Axios/Fetch)                       │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API Gateway (localhost:3000)                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Integration Points

| Layer | Technology | Purpose |
|-------|------------|---------|
| Video | VideoSDK React SDK | Video conferencing |
| Real-time | Socket.io-client | Insights, alerts, events |
| REST | Axios | Round management, verdicts |
| State | Zustand | Global application state |

---

## 2. Project Structure

```
frontend/src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Landing page
│   ├── candidate/
│   │   ├── dashboard/page.tsx    # Candidate dashboard
│   │   └── interview/page.tsx    # Candidate interview view
│   ├── interviewer/
│   │   ├── dashboard/page.tsx    # Interviewer dashboard
│   │   ├── interview/page.tsx    # Interviewer interview view
│   │   └── verdict/page.tsx      # Verdict submission
│   └── hr/
│       └── dashboard/page.tsx    # HR dashboard
│
├── components/
│   ├── ui/                       # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Badge.tsx
│   │   ├── Modal.tsx
│   │   └── ProgressBar.tsx
│   └── video/                    # Video components
│       ├── VideoSDKProvider.tsx  # Meeting context
│       ├── MeetingRoom.tsx       # Main video room
│       ├── ParticipantView.tsx   # Single participant
│       ├── InterviewerMeeting.tsx # Interviewer view
│       └── CandidateMeeting.tsx  # Candidate view
│
├── hooks/
│   ├── useSocket.ts              # WebSocket connection
│   ├── useInsights.ts            # AI insights subscription
│   ├── useMediaCapture.ts        # Audio/video capture
│   ├── useWebRTC.ts              # WebRTC utilities
│   └── useStreamPublisher.ts     # Media stream publishing
│
├── services/
│   ├── api.ts                    # REST API client
│   └── socket.ts                 # Socket.io client
│
├── store/
│   └── index.ts                  # Zustand store
│
├── types/
│   └── index.ts                  # TypeScript definitions
│
└── lib/
    ├── api.ts                    # API helpers
    ├── utils.ts                  # Utility functions
    └── mock-data.ts              # Development mock data
```

---

## 3. Video Integration (VideoSDK)

### Installation

```bash
npm install @videosdk.live/react-sdk
```

### Provider Setup

```typescript
// components/video/VideoSDKProvider.tsx
import { MeetingProvider } from "@videosdk.live/react-sdk";

interface VideoProviderProps {
  meetingId: string;
  participantId: string;
  token: string;
  children: React.ReactNode;
  onMeetingJoin?: () => void;
  onMeetingLeave?: () => void;
}

export const VideoProvider: React.FC<VideoProviderProps> = ({
  meetingId,
  participantId,
  token,
  children,
  onMeetingJoin,
  onMeetingLeave
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
      joinWithoutUserInteraction
    >
      {children}
    </MeetingProvider>
  );
};
```

### Meeting Room Component

```typescript
// components/video/MeetingRoom.tsx
import { useMeeting, useParticipant } from "@videosdk.live/react-sdk";
import { useEffect } from "react";

interface MeetingRoomProps {
  onParticipantJoined?: (participantId: string) => void;
  onParticipantLeft?: (participantId: string) => void;
}

export const MeetingRoom: React.FC<MeetingRoomProps> = ({
  onParticipantJoined,
  onParticipantLeft
}) => {
  const { 
    join, 
    leave, 
    participants, 
    localParticipant 
  } = useMeeting({
    onMeetingJoined: () => {
      console.log("Meeting joined");
    },
    onMeetingLeft: () => {
      console.log("Meeting left");
    },
    onParticipantJoined: (participant) => {
      onParticipantJoined?.(participant.id);
    },
    onParticipantLeft: (participant) => {
      onParticipantLeft?.(participant.id);
    }
  });

  useEffect(() => {
    join();
    return () => {
      leave();
    };
  }, []);

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Local participant */}
      <ParticipantView 
        participantId={localParticipant.id} 
        isLocal={true}
      />
      
      {/* Remote participants */}
      {[...participants.keys()].map(participantId => (
        <ParticipantView 
          key={participantId}
          participantId={participantId}
          isLocal={false}
        />
      ))}
    </div>
  );
};
```

### Participant View Component

```typescript
// components/video/ParticipantView.tsx
import { useParticipant } from "@videosdk.live/react-sdk";
import { useEffect, useRef } from "react";

interface ParticipantViewProps {
  participantId: string;
  isLocal: boolean;
}

export const ParticipantView: React.FC<ParticipantViewProps> = ({
  participantId,
  isLocal
}) => {
  const { 
    webcamStream, 
    micStream, 
    webcamOn, 
    micOn,
    displayName 
  } = useParticipant(participantId);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Attach video stream
  useEffect(() => {
    if (videoRef.current && webcamStream && webcamOn) {
      const mediaStream = new MediaStream();
      mediaStream.addTrack(webcamStream.track);
      videoRef.current.srcObject = mediaStream;
      videoRef.current.play().catch(console.error);
    }
  }, [webcamStream, webcamOn]);

  // Attach audio stream (not for local participant)
  useEffect(() => {
    if (audioRef.current && micStream && micOn && !isLocal) {
      const mediaStream = new MediaStream();
      mediaStream.addTrack(micStream.track);
      audioRef.current.srcObject = mediaStream;
      audioRef.current.play().catch(console.error);
    }
  }, [micStream, micOn, isLocal]);

  return (
    <div className="relative bg-gray-900 rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="w-full h-full object-cover"
      />
      
      {!isLocal && <audio ref={audioRef} autoPlay />}
      
      {/* Participant info overlay */}
      <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded">
        <span className="text-white text-sm">{displayName}</span>
        {!micOn && <span className="ml-2">🔇</span>}
      </div>
    </div>
  );
};
```

---

## 4. WebSocket Integration

### Socket Hook

```typescript
// hooks/useSocket.ts
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseSocketOptions {
  token: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export const useSocket = (options: UseSocketOptions) => {
  const { token, onConnect, onDisconnect, onError } = options;
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000', {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      setIsConnected(true);
      onConnect?.();
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      onDisconnect?.();
    });

    socket.on('connect_error', (error) => {
      onError?.(error);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [token]);

  const emit = (event: string, data: any) => {
    socketRef.current?.emit(event, data);
  };

  const on = (event: string, callback: (data: any) => void) => {
    socketRef.current?.on(event, callback);
    return () => {
      socketRef.current?.off(event, callback);
    };
  };

  const joinInterview = (roundId: string) => {
    emit('join-interview', { roundId });
  };

  const leaveInterview = () => {
    emit('leave-interview', {});
  };

  return {
    socket: socketRef.current,
    isConnected,
    emit,
    on,
    joinInterview,
    leaveInterview,
  };
};
```

### Usage in Interview Room

```typescript
// app/interviewer/interview/page.tsx
'use client';

import { useSocket } from '@/hooks/useSocket';
import { useInsights } from '@/hooks/useInsights';
import { useEffect } from 'react';

export default function InterviewerInterview() {
  const { roundId } = useParams();
  const token = useAuthToken();
  
  const { 
    socket, 
    isConnected, 
    joinInterview, 
    leaveInterview 
  } = useSocket({
    token,
    onConnect: () => console.log('Socket connected'),
    onDisconnect: () => console.log('Socket disconnected'),
  });

  // Join interview room on mount
  useEffect(() => {
    if (isConnected && roundId) {
      joinInterview(roundId);
    }
    
    return () => {
      leaveInterview();
    };
  }, [isConnected, roundId]);

  return (
    <div className="flex h-screen">
      {/* Video area */}
      <div className="flex-1">
        <VideoProvider meetingId={meetingId} token={videoToken}>
          <MeetingRoom />
        </VideoProvider>
      </div>
      
      {/* AI Insights panel - ONLY for interviewers */}
      <div className="w-96 border-l">
        <AIInsightsPanel roundId={roundId} />
      </div>
    </div>
  );
}
```

---

## 5. AI Insights Panel

### Insights Hook

```typescript
// hooks/useInsights.ts
import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';
import type { Insight } from '@/types';

interface UseInsightsOptions {
  roundId: string;
  token: string;
}

export const useInsights = (options: UseInsightsOptions) => {
  const { roundId, token } = options;
  const [insights, setInsights] = useState<Insight[]>([]);
  const [alerts, setAlerts] = useState<Insight[]>([]);
  
  const { on, isConnected } = useSocket({ token });

  useEffect(() => {
    if (!isConnected) return;

    // Listen for individual insights
    const unsubInsight = on('insight', (insight: Insight) => {
      setInsights(prev => [insight, ...prev].slice(0, 50)); // Keep last 50
      
      if (insight.isAlert) {
        setAlerts(prev => [insight, ...prev]);
      }
    });

    // Listen for batched insights
    const unsubBatch = on('insights-batch', (batch: Insight[]) => {
      setInsights(prev => [...batch, ...prev].slice(0, 50));
      
      const newAlerts = batch.filter(i => i.isAlert);
      if (newAlerts.length > 0) {
        setAlerts(prev => [...newAlerts, ...prev]);
      }
    });

    // Listen for fraud alerts
    const unsubFraud = on('fraud-alert', (alert: any) => {
      const fraudInsight: Insight = {
        id: `fraud-${Date.now()}`,
        roundId,
        category: 'fraud',
        insightType: alert.type,
        severity: alert.severity.toLowerCase(),
        confidence: alert.confidence || 0.95,
        title: alert.type.replace('_', ' '),
        description: alert.message,
        evidence: [],
        followupQuestions: [],
        isAlert: true,
        timestamp: new Date().toISOString(),
      };
      
      setAlerts(prev => [fraudInsight, ...prev]);
    });

    return () => {
      unsubInsight();
      unsubBatch();
      unsubFraud();
    };
  }, [isConnected, roundId]);

  const dismissAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  return {
    insights,
    alerts,
    dismissAlert,
    clearAlerts,
    hasUnreadAlerts: alerts.length > 0,
  };
};
```

### AI Insights Panel Component

```typescript
// components/insights/AIInsightsPanel.tsx
import { useInsights } from '@/hooks/useInsights';
import { Card, Badge } from '@/components/ui';

interface AIInsightsPanelProps {
  roundId: string;
  token: string;
}

export const AIInsightsPanel: React.FC<AIInsightsPanelProps> = ({
  roundId,
  token
}) => {
  const { 
    insights, 
    alerts, 
    dismissAlert, 
    hasUnreadAlerts 
  } = useInsights({ roundId, token });

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <h2 className="text-lg font-semibold flex items-center">
          AI Insights
          {hasUnreadAlerts && (
            <Badge variant="destructive" className="ml-2">
              {alerts.length}
            </Badge>
          )}
        </h2>
        <p className="text-sm text-gray-500">
          Real-time analysis • Visible only to you
        </p>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="p-4 border-b bg-red-50">
          <h3 className="text-sm font-medium text-red-800 mb-2">
            Active Alerts
          </h3>
          {alerts.map(alert => (
            <AlertCard 
              key={alert.id}
              alert={alert}
              onDismiss={() => dismissAlert(alert.id)}
            />
          ))}
        </div>
      )}

      {/* Insights List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {insights.map(insight => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
        
        {insights.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            <p>Analyzing interview...</p>
            <p className="text-sm">Insights will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
};
```

### Insight Card Component

```typescript
// components/insights/InsightCard.tsx
import { Insight } from '@/types';
import { Card, Badge } from '@/components/ui';

interface InsightCardProps {
  insight: Insight;
}

const severityColors = {
  low: 'bg-blue-100 text-blue-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800',
};

const categoryIcons = {
  speech: '🎤',
  video: '📹',
  fraud: '⚠️',
  contradiction: '📋',
};

export const InsightCard: React.FC<InsightCardProps> = ({ insight }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="p-3">
      <div className="flex items-start gap-2">
        <span className="text-xl">{categoryIcons[insight.category]}</span>
        
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium">{insight.title}</h4>
            <Badge className={severityColors[insight.severity]}>
              {insight.severity}
            </Badge>
            <span className="text-xs text-gray-400">
              {Math.round(insight.confidence * 100)}%
            </span>
          </div>
          
          <p className="text-sm text-gray-600 mt-1">
            {insight.description}
          </p>
          
          {/* Follow-up questions */}
          {insight.followupQuestions.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-sm text-blue-600 hover:underline"
              >
                {expanded ? 'Hide' : 'Show'} suggested questions
              </button>
              
              {expanded && (
                <ul className="mt-2 space-y-1">
                  {insight.followupQuestions.map((q, i) => (
                    <li key={i} className="text-sm bg-blue-50 p-2 rounded">
                      "{q}"
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
      
      <div className="text-xs text-gray-400 mt-2">
        {new Date(insight.timestamp).toLocaleTimeString()}
      </div>
    </Card>
  );
};
```

---

## 6. Media Capture for Analysis

### Media Capture Hook

```typescript
// hooks/useMediaCapture.ts
import { useRef, useCallback, useEffect } from 'react';
import { useSocket } from './useSocket';

interface UseMediaCaptureOptions {
  roundId: string;
  token: string;
  captureInterval?: number;  // ms between captures
  enabled?: boolean;
}

export const useMediaCapture = (options: UseMediaCaptureOptions) => {
  const { 
    roundId, 
    token, 
    captureInterval = 200,  // 5 FPS
    enabled = true 
  } = options;
  
  const { emit, isConnected } = useSocket({ token });
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout>();

  // Capture video frame
  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    ctx.drawImage(video, 0, 0);
    
    // Convert to base64 JPEG
    return canvas.toDataURL('image/jpeg', 0.7);
  }, []);

  // Send frame to backend
  const sendFrame = useCallback(() => {
    if (!isConnected || !enabled) return;
    
    const frame = captureFrame();
    if (frame) {
      emit('video-frame', {
        roundId,
        frame: frame.split(',')[1],  // Remove data:image/jpeg;base64, prefix
        timestamp: Date.now(),
      });
    }
  }, [isConnected, enabled, roundId, captureFrame, emit]);

  // Start/stop capture loop
  useEffect(() => {
    if (enabled && isConnected) {
      captureIntervalRef.current = setInterval(sendFrame, captureInterval);
    }
    
    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
    };
  }, [enabled, isConnected, captureInterval, sendFrame]);

  return {
    videoRef,
    canvasRef,
    captureFrame,
  };
};
```

### Audio Capture Hook

```typescript
// hooks/useAudioCapture.ts
import { useRef, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';

interface UseAudioCaptureOptions {
  roundId: string;
  token: string;
  sampleRate?: number;
  chunkInterval?: number;  // ms between chunks
  enabled?: boolean;
}

export const useAudioCapture = (options: UseAudioCaptureOptions) => {
  const {
    roundId,
    token,
    sampleRate = 16000,
    chunkInterval = 250,  // 4 chunks per second
    enabled = true
  } = options;

  const { emit, isConnected } = useSocket({ token });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const startCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && isConnected && enabled) {
          // Convert blob to base64
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            emit('audio-chunk', {
              roundId,
              chunk: base64,
              timestamp: Date.now(),
              sampleRate,
            });
          };
          reader.readAsDataURL(event.data);
        }
      };

      mediaRecorder.start(chunkInterval);
      mediaRecorderRef.current = mediaRecorder;
    } catch (error) {
      console.error('Failed to start audio capture:', error);
    }
  }, [roundId, emit, isConnected, enabled, sampleRate, chunkInterval]);

  const stopCapture = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      startCapture();
    }
    return () => {
      stopCapture();
    };
  }, [enabled, startCapture, stopCapture]);

  return {
    startCapture,
    stopCapture,
  };
};
```

---

## 7. User Role Separation

### CRITICAL: Role-Based Rendering

```typescript
// IMPORTANT: AI features visible ONLY to interviewers

// ❌ WRONG - Never show AI to candidates
function InterviewRoom({ user }) {
  return (
    <div>
      <VideoGrid />
      <AIInsightsPanel />  {/* Candidates should never see this! */}
    </div>
  );
}

// ✅ CORRECT - Role-based rendering
function InterviewRoom({ user }) {
  const isInterviewer = user.role === 'interviewer' || user.role === 'hr';
  
  return (
    <div className="flex">
      <div className="flex-1">
        <VideoGrid />
      </div>
      
      {/* ONLY render for interviewers */}
      {isInterviewer && (
        <div className="w-96">
          <AIInsightsPanel />
        </div>
      )}
    </div>
  );
}
```

### Candidate View (Simple)

```typescript
// app/candidate/interview/page.tsx
'use client';

export default function CandidateInterview() {
  // NO AI imports
  // NO insights hooks
  // Simple, clean interface
  
  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Header - minimal */}
      <header className="p-4 flex items-center justify-between">
        <img src="/logo.png" alt="Company" className="h-8" />
        <span className="text-white">Technical Interview</span>
      </header>

      {/* Video - full screen */}
      <main className="flex-1">
        <VideoProvider meetingId={meetingId} token={token}>
          <CandidateMeetingRoom />
        </VideoProvider>
      </main>

      {/* Controls - minimal */}
      <footer className="p-4 flex justify-center gap-4">
        <MicButton />
        <CameraButton />
        <EndCallButton />
      </footer>
    </div>
  );
}

// No AI panel, no insights, no recommendations
```

### Interviewer View (Rich)

```typescript
// app/interviewer/interview/page.tsx
'use client';

export default function InterviewerInterview() {
  const { insights, alerts } = useInsights({ roundId, token });
  
  return (
    <div className="flex h-screen">
      {/* Left: Video + Resume */}
      <div className="flex-1 flex flex-col">
        {/* Video area */}
        <div className="flex-1">
          <VideoProvider meetingId={meetingId} token={token}>
            <InterviewerMeetingRoom />
          </VideoProvider>
        </div>
        
        {/* Resume panel (collapsible) */}
        <ResumePanel candidateId={candidateId} />
      </div>

      {/* Right: AI Insights Panel */}
      <div className="w-96 border-l border-gray-200">
        <AIInsightsPanel roundId={roundId} token={token} />
      </div>
    </div>
  );
}
```

---

## 8. Component Reference

### UI Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `Button` | `components/ui/Button.tsx` | Action buttons |
| `Card` | `components/ui/Card.tsx` | Content containers |
| `Badge` | `components/ui/Badge.tsx` | Status indicators |
| `Modal` | `components/ui/Modal.tsx` | Dialogs and popups |
| `ProgressBar` | `components/ui/ProgressBar.tsx` | Progress indicators |

### Video Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `VideoSDKProvider` | `components/video/VideoSDKProvider.tsx` | Meeting context |
| `MeetingRoom` | `components/video/MeetingRoom.tsx` | Main video container |
| `ParticipantView` | `components/video/ParticipantView.tsx` | Single video tile |
| `InterviewerMeeting` | `components/video/InterviewerMeeting.tsx` | Interviewer layout |
| `CandidateMeeting` | `components/video/CandidateMeeting.tsx` | Candidate layout |

### Insights Components (Create if needed)

| Component | Purpose |
|-----------|---------|
| `AIInsightsPanel` | Main insights container |
| `InsightCard` | Individual insight display |
| `AlertCard` | High-priority alert display |
| `RecommendationCard` | AI recommendation display |
| `FollowUpQuestions` | Suggested questions list |

---

## 9. State Management

### Zustand Store

```typescript
// store/index.ts
import { create } from 'zustand';
import type { User, Insight, Round } from '@/types';

interface AppState {
  // Auth
  user: User | null;
  token: string | null;
  setUser: (user: User, token: string) => void;
  clearUser: () => void;

  // Interview
  currentRound: Round | null;
  setCurrentRound: (round: Round) => void;
  
  // Insights
  insights: Insight[];
  alerts: Insight[];
  addInsight: (insight: Insight) => void;
  addInsights: (insights: Insight[]) => void;
  dismissAlert: (id: string) => void;
  clearInsights: () => void;
  
  // UI
  isInsightsPanelOpen: boolean;
  toggleInsightsPanel: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Auth
  user: null,
  token: null,
  setUser: (user, token) => set({ user, token }),
  clearUser: () => set({ user: null, token: null }),

  // Interview
  currentRound: null,
  setCurrentRound: (round) => set({ currentRound: round }),

  // Insights
  insights: [],
  alerts: [],
  addInsight: (insight) => set((state) => ({
    insights: [insight, ...state.insights].slice(0, 50),
    alerts: insight.isAlert 
      ? [insight, ...state.alerts] 
      : state.alerts,
  })),
  addInsights: (insights) => set((state) => ({
    insights: [...insights, ...state.insights].slice(0, 50),
    alerts: [
      ...insights.filter(i => i.isAlert),
      ...state.alerts
    ],
  })),
  dismissAlert: (id) => set((state) => ({
    alerts: state.alerts.filter(a => a.id !== id),
  })),
  clearInsights: () => set({ insights: [], alerts: [] }),

  // UI
  isInsightsPanelOpen: true,
  toggleInsightsPanel: () => set((state) => ({
    isInsightsPanelOpen: !state.isInsightsPanelOpen,
  })),
}));
```

---

## 10. Testing

### Component Testing

```typescript
// __tests__/InsightCard.test.tsx
import { render, screen } from '@testing-library/react';
import { InsightCard } from '@/components/insights/InsightCard';

const mockInsight = {
  id: '1',
  roundId: 'round-1',
  category: 'speech' as const,
  insightType: 'confidence',
  severity: 'medium' as const,
  confidence: 0.85,
  title: 'Low confidence detected',
  description: 'Candidate showed hesitation',
  evidence: [],
  followupQuestions: ['Can you elaborate?'],
  isAlert: false,
  timestamp: new Date().toISOString(),
};

describe('InsightCard', () => {
  it('renders insight title', () => {
    render(<InsightCard insight={mockInsight} />);
    expect(screen.getByText('Low confidence detected')).toBeInTheDocument();
  });

  it('shows severity badge', () => {
    render(<InsightCard insight={mockInsight} />);
    expect(screen.getByText('medium')).toBeInTheDocument();
  });

  it('shows confidence percentage', () => {
    render(<InsightCard insight={mockInsight} />);
    expect(screen.getByText('85%')).toBeInTheDocument();
  });
});
```

### Integration Testing

```typescript
// __tests__/useInsights.test.tsx
import { renderHook, act } from '@testing-library/react';
import { useInsights } from '@/hooks/useInsights';

// Mock socket.io
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    connected: true,
  })),
}));

describe('useInsights', () => {
  it('initializes with empty insights', () => {
    const { result } = renderHook(() => 
      useInsights({ roundId: 'test', token: 'token' })
    );
    
    expect(result.current.insights).toEqual([]);
    expect(result.current.alerts).toEqual([]);
  });

  // Add more tests...
});
```

---

*For backend integration details, see [SERVICE_INTEGRATION.md](./SERVICE_INTEGRATION.md)*
