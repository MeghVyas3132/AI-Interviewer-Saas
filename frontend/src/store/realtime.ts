// Zustand stores for real-time interview state management
import { create } from 'zustand'
import type { 
  AIMetrics, 
  FraudAlert, 
  TranscriptSegment, 
  Recommendation, 
  LiveInsight 
} from '@/types'

// Default empty metrics
const defaultMetrics: AIMetrics = {
  speechConfidence: 0,
  engagementScore: 0,
  hesitationsCount: 0,
  avgResponseTime: 0,
  headMovement: 'stable',
  videoQuality: 'good',
  authenticity: 'verified',
}

// ============== Interview Store ==============
interface InterviewState {
  currentRoundId: string | null
  isInInterview: boolean
  elapsedTime: number
  videoRoomId: string | null
  videoToken: string | null
  setCurrentRound: (roundId: string | null) => void
  setInInterview: (value: boolean) => void
  setElapsedTime: (time: number) => void
  incrementTime: () => void
  setVideoRoom: (roomId: string, token: string) => void
  clearVideoRoom: () => void
  reset: () => void
}

export const useInterviewStore = create<InterviewState>((set) => ({
  currentRoundId: null,
  isInInterview: false,
  elapsedTime: 0,
  videoRoomId: null,
  videoToken: null,
  setCurrentRound: (roundId) => set({ currentRoundId: roundId }),
  setInInterview: (value) => set({ isInInterview: value }),
  setElapsedTime: (time) => set({ elapsedTime: time }),
  incrementTime: () => set((state) => ({ elapsedTime: state.elapsedTime + 1 })),
  setVideoRoom: (roomId, token) => set({ videoRoomId: roomId, videoToken: token }),
  clearVideoRoom: () => set({ videoRoomId: null, videoToken: null }),
  reset: () => set({
    currentRoundId: null,
    isInInterview: false,
    elapsedTime: 0,
    videoRoomId: null,
    videoToken: null,
  }),
}))

// ============== AI Metrics Store (for interviewer) ==============
interface AIMetricsState {
  metrics: AIMetrics
  fraudAlerts: FraudAlert[]
  transcript: TranscriptSegment[]
  insights: LiveInsight[]
  recommendations: Recommendation[]
  updateMetrics: (metrics: Partial<AIMetrics>) => void
  addFraudAlert: (alert: FraudAlert) => void
  addTranscriptSegment: (segment: TranscriptSegment) => void
  addInsight: (insight: LiveInsight) => void
  setInsights: (insights: LiveInsight[]) => void
  setRecommendations: (recommendations: Recommendation[]) => void
  clearAlerts: () => void
  dismissAlert: (id: string) => void
  reset: () => void
}

export const useAIMetricsStore = create<AIMetricsState>((set) => ({
  metrics: defaultMetrics,
  fraudAlerts: [],
  transcript: [],
  insights: [],
  recommendations: [],
  updateMetrics: (newMetrics) =>
    set((state) => ({ metrics: { ...state.metrics, ...newMetrics } })),
  addFraudAlert: (alert) =>
    set((state) => ({ fraudAlerts: [alert, ...state.fraudAlerts].slice(0, 20) })),
  addTranscriptSegment: (segment) =>
    set((state) => ({ transcript: [...state.transcript, segment].slice(-100) })),
  addInsight: (insight) =>
    set((state) => ({ insights: [insight, ...state.insights].slice(0, 50) })),
  setInsights: (insights) => set({ insights }),
  setRecommendations: (recommendations) => set({ recommendations }),
  clearAlerts: () => set({ fraudAlerts: [] }),
  dismissAlert: (id) =>
    set((state) => ({ fraudAlerts: state.fraudAlerts.filter((a) => a.id !== id) })),
  reset: () =>
    set({
      metrics: defaultMetrics,
      fraudAlerts: [],
      transcript: [],
      insights: [],
      recommendations: [],
    }),
}))

// ============== Media Permissions Store (for candidate) ==============
interface MediaPermissionsState {
  cameraPermission: 'pending' | 'granted' | 'denied'
  microphonePermission: 'pending' | 'granted' | 'denied'
  setCameraPermission: (status: 'pending' | 'granted' | 'denied') => void
  setMicrophonePermission: (status: 'pending' | 'granted' | 'denied') => void
  checkPermissions: () => Promise<void>
  reset: () => void
}

export const useMediaPermissionsStore = create<MediaPermissionsState>((set) => ({
  cameraPermission: 'pending',
  microphonePermission: 'pending',
  setCameraPermission: (status) => set({ cameraPermission: status }),
  setMicrophonePermission: (status) => set({ microphonePermission: status }),
  checkPermissions: async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })
      stream.getTracks().forEach((track) => track.stop())
      set({ cameraPermission: 'granted', microphonePermission: 'granted' })
    } catch {
      set({ cameraPermission: 'denied', microphonePermission: 'denied' })
    }
  },
  reset: () => set({ cameraPermission: 'pending', microphonePermission: 'pending' }),
}))

// ============== Socket Connection Store ==============
interface SocketState {
  isConnected: boolean
  connectionError: string | null
  setConnected: (value: boolean) => void
  setConnectionError: (error: string | null) => void
}

export const useSocketStore = create<SocketState>((set) => ({
  isConnected: false,
  connectionError: null,
  setConnected: (value) => set({ isConnected: value }),
  setConnectionError: (error) => set({ connectionError: error }),
}))
