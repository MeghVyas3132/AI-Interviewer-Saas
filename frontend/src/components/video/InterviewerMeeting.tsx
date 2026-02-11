'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { MeetingProvider, useMeeting, useParticipant } from '@videosdk.live/react-sdk'
import type { AIMetrics, LiveInsight, Recommendation } from '@/types'

interface InterviewerMeetingProps {
  meetingId: string
  token: string
  participantName: string
  roundId: string
  insights?: LiveInsight[]
  recommendations?: Recommendation[]
  metrics?: AIMetrics
  resumeUrl?: string
  onLeave?: () => void
}

// Participant Tile Component
function ParticipantTile({ participantId, size = 'normal' }: { participantId: string; size?: 'normal' | 'small' | 'pip' }) {
  const { webcamStream, micStream, webcamOn, micOn, isLocal, displayName } = useParticipant(participantId)
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const animRef = useRef<number | null>(null)

  useEffect(() => {
    const videoElement = videoRef.current
    if (!videoElement) return

    if (webcamOn && webcamStream) {
      const track = webcamStream.track
      if (track) {
        const mediaStream = new MediaStream()
        mediaStream.addTrack(track)
        videoElement.srcObject = mediaStream
        videoElement.play().catch((err: unknown) => {
          console.error(`[ParticipantTile] Video play error:`, err)
        })
      }
    } else {
      videoElement.srcObject = null
    }
  }, [webcamStream, webcamOn])

  useEffect(() => {
    const audioElement = audioRef.current
    if (!audioElement) return

    if (micOn && micStream && !isLocal) {
      const track = micStream.track
      if (track) {
        const mediaStream = new MediaStream()
        mediaStream.addTrack(track)
        audioElement.srcObject = mediaStream
        audioElement.play().catch((err: unknown) => {
          console.error(`[ParticipantTile] Audio play error:`, err)
        })
      }
    } else {
      audioElement.srcObject = null
    }
  }, [micStream, micOn, isLocal])

  // Speech detection via audio analysis
  useEffect(() => {
    if (micStream && micOn) {
      const track = micStream.track
      if (!track) return
      
      try {
        audioCtxRef.current = new AudioContext()
        const analyser = audioCtxRef.current.createAnalyser()
        const mediaStream = new MediaStream()
        mediaStream.addTrack(track)
        const source = audioCtxRef.current.createMediaStreamSource(mediaStream)
        source.connect(analyser)
        analyser.fftSize = 256
        const check = () => {
          const data = new Uint8Array(analyser.frequencyBinCount)
          analyser.getByteFrequencyData(data)
          setIsSpeaking(data.reduce((a, b) => a + b) / data.length > 20)
          animRef.current = requestAnimationFrame(check)
        }
        check()
      } catch (e) {
        console.error('[ParticipantTile] Audio context error:', e)
      }
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      audioCtxRef.current?.close().catch(() => {})
    }
  }, [micStream, micOn])

  const initials = (displayName || 'U').charAt(0).toUpperCase()
  const isPip = size === 'pip'
  const isSmall = size === 'small'

  return (
    <div className={`
      relative overflow-hidden h-full transition-all duration-300 group
      ${isPip ? 'rounded-xl' : 'rounded-2xl'}
      ${isSpeaking ? 'ring-[3px] ring-blue-400 shadow-lg shadow-blue-400/20' : 'ring-1 ring-gray-600'}
      bg-gray-700
    `}>
      {webcamOn && webcamStream ? (
        <video 
          ref={videoRef} 
          data-local={isLocal ? 'true' : 'false'} 
          autoPlay 
          playsInline 
          muted={isLocal} 
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300"
          style={{ transform: isLocal ? 'scaleX(-1)' : 'none' }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
          <div className={`
            rounded-full flex items-center justify-center transition-all duration-300
            ${isPip ? 'w-12 h-12' : isSmall ? 'w-16 h-16' : 'w-24 h-24'}
            ${isSpeaking ? 'scale-110 ring-4 ring-blue-400/30 animate-pulse' : ''}
            bg-gradient-to-br from-gray-600 to-gray-700
          `}>
            <span className={`font-medium text-white ${isPip ? 'text-lg' : isSmall ? 'text-xl' : 'text-3xl'}`}>{initials}</span>
          </div>
        </div>
      )}
      
      <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent ${isPip ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {isSpeaking && (
              <div className="flex gap-0.5 items-end h-3">
                <div className="w-0.5 bg-blue-400 rounded-full animate-pulse" style={{ height: '30%' }} />
                <div className="w-0.5 bg-blue-400 rounded-full animate-pulse" style={{ height: '60%', animationDelay: '0.1s' }} />
                <div className="w-0.5 bg-blue-400 rounded-full animate-pulse" style={{ height: '100%', animationDelay: '0.2s' }} />
              </div>
            )}
            <span className={`text-white font-medium truncate ${isPip ? 'text-[10px]' : 'text-xs'}`}>
              {displayName || 'Participant'} {isLocal && <span className="text-gray-400">(You)</span>}
            </span>
          </div>
          {!micOn && (
            <div className="p-1 bg-red-500 rounded-full animate-pulse">
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </div>
          )}
        </div>
      </div>
      {!isLocal && <audio ref={audioRef} autoPlay playsInline />}
    </div>
  )
}

// AI Insights Panel Component
function InsightsPanel({ 
  insights, 
  recommendations, 
  metrics, 
  resumeUrl 
}: { 
  insights?: LiveInsight[]
  recommendations?: Recommendation[]
  metrics?: AIMetrics
  resumeUrl?: string 
}) {
  const [activeTab, setActiveTab] = useState<'ai' | 'resume'>('ai')
  
  const getSeverityColor = (severity?: string) => {
    switch (severity?.toLowerCase()) {
      case 'high':
      case 'alert': return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'medium':
      case 'warning': return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      case 'low':
      case 'info': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      default: return 'bg-gray-700 text-gray-400 border-gray-600'
    }
  }

  return (
    <div className="w-80 bg-gray-800 rounded-2xl overflow-hidden flex flex-col ring-1 ring-gray-700 shadow-xl">
      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('ai')}
          className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
            activeTab === 'ai' 
              ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-400/5' 
              : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            AI Analysis
          </span>
        </button>
        <button
          onClick={() => setActiveTab('resume')}
          className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
            activeTab === 'resume' 
              ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-400/5' 
              : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Resume
          </span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'ai' ? (
          <>
            {/* Metrics Summary */}
            {metrics && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  Real-time Metrics
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-700/50 rounded-xl p-3 text-center">
                    <div className="text-xs text-gray-400 mb-1">Speech</div>
                    <div className="text-sm font-semibold text-white">{metrics.speechConfidence}%</div>
                  </div>
                  <div className="bg-gray-700/50 rounded-xl p-3 text-center">
                    <div className="text-xs text-gray-400 mb-1">Engagement</div>
                    <div className="text-sm font-semibold text-white">{metrics.engagementScore}%</div>
                  </div>
                  <div className="bg-gray-700/50 rounded-xl p-3 text-center">
                    <div className="text-xs text-gray-400 mb-1">Head Movement</div>
                    <div className="text-sm font-semibold text-white capitalize">{metrics.headMovement}</div>
                  </div>
                  <div className="bg-gray-700/50 rounded-xl p-3 text-center">
                    <div className="text-xs text-gray-400 mb-1">Authenticity</div>
                    <div className={`text-sm font-semibold capitalize ${
                      metrics.authenticity === 'verified' ? 'text-emerald-400' :
                      metrics.authenticity === 'suspicious' ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {metrics.authenticity}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Live Insights */}
            {insights && insights.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  Live Insights ({insights.length})
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {insights.slice(0, 5).map((insight) => (
                    <div 
                      key={insight.id} 
                      className={`px-3 py-2 rounded-lg border ${getSeverityColor(insight.severity)}`}
                    >
                      <div className="text-sm font-medium">{insight.title}</div>
                      <div className="text-xs opacity-75 mt-1">{insight.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {recommendations && recommendations.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  Recommendations
                </h3>
                <div className="space-y-2">
                  {recommendations.slice(0, 3).map((rec, i) => (
                    <div key={i} className="bg-gray-700/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          rec.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                          rec.priority === 'medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-600 text-gray-300'
                        }`}>
                          {rec.priority}
                        </span>
                        <span className="text-xs text-gray-400">{rec.type}</span>
                      </div>
                      <div className="text-sm text-white">{rec.title}</div>
                      {rec.suggestedQuestions && rec.suggestedQuestions.length > 0 && (
                        <div className="mt-2 text-xs text-cyan-400">
                          💡 Ask: {rec.suggestedQuestions[0]}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {(!insights || insights.length === 0) && (!metrics) && (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center mb-3 animate-pulse">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-sm">AI analysis will appear here</p>
                <p className="text-xs text-gray-500 mt-1">Waiting for interview to start...</p>
              </div>
            )}
          </>
        ) : (
          <div className="h-full">
            {resumeUrl ? (
              <iframe src={resumeUrl} className="w-full h-full min-h-[500px] rounded-xl bg-white" title="Resume" />
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm">No resume uploaded</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Meeting View Component
function MeetingView({ 
  insights, 
  recommendations, 
  metrics, 
  resumeUrl,
  onLeave 
}: { 
  insights?: LiveInsight[]
  recommendations?: Recommendation[]
  metrics?: AIMetrics
  resumeUrl?: string
  onLeave?: () => void
}) {
  const [joined, setJoined] = useState(false)
  const [ready, setReady] = useState(false)

  const { 
    join, 
    leave, 
    toggleMic, 
    toggleWebcam, 
    toggleScreenShare, 
    localParticipant, 
    participants, 
    meetingId, 
    localMicOn, 
    localWebcamOn, 
    localScreenShareOn 
  } = useMeeting({
    onMeetingJoined: () => {
      console.log('[InterviewerMeeting] Meeting joined successfully, meetingId:', meetingId)
      console.log('[InterviewerMeeting] toggleMic available:', !!toggleMic)
      console.log('[InterviewerMeeting] toggleWebcam available:', !!toggleWebcam)
      setReady(true)
    },
    onMeetingLeft: () => { 
      console.log('[InterviewerMeeting] Meeting left')
      setReady(false)
      onLeave?.()
    },
    onError: (e: unknown) => console.error('[InterviewerMeeting] Meeting error:', e),
    onParticipantJoined: (participant: unknown) => console.log('[InterviewerMeeting] Participant joined:', participant),
    onParticipantLeft: (participant: unknown) => console.log('[InterviewerMeeting] Participant left:', participant),
  })

  useEffect(() => { 
    if (!joined) { 
      console.log('[InterviewerMeeting] Joining meeting...')
      join()
      setJoined(true)
    } 
  }, [join, joined])

  // Debug current state
  useEffect(() => {
    console.log('[InterviewerMeeting] State update - ready:', ready, 'localMicOn:', localMicOn, 'localWebcamOn:', localWebcamOn)
  }, [ready, localMicOn, localWebcamOn])

  const doToggleMic = useCallback(async () => { 
    console.log('[InterviewerMeeting] Toggle mic called, ready:', ready, 'toggleMic exists:', !!toggleMic, 'localMicOn:', localMicOn)
    try {
      // Request mic permission if turning on
      if (!localMicOn) {
        await navigator.mediaDevices.getUserMedia({ audio: true })
      }
      if (toggleMic) {
        toggleMic()
        console.log('[InterviewerMeeting] toggleMic executed')
      } else {
        console.error('[InterviewerMeeting] toggleMic is undefined')
      }
    } catch (err) {
      console.error('[InterviewerMeeting] Error toggling mic:', err)
      alert('Could not access microphone. Please check browser permissions.')
    }
  }, [ready, toggleMic, localMicOn])

  const doToggleWebcam = useCallback(async () => { 
    console.log('[InterviewerMeeting] Toggle webcam called, ready:', ready, 'toggleWebcam exists:', !!toggleWebcam, 'localWebcamOn:', localWebcamOn)
    try {
      // Request camera permission if turning on
      if (!localWebcamOn) {
        await navigator.mediaDevices.getUserMedia({ video: true })
      }
      if (toggleWebcam) {
        toggleWebcam()
        console.log('[InterviewerMeeting] toggleWebcam executed')
      } else {
        console.error('[InterviewerMeeting] toggleWebcam is undefined')
      }
    } catch (err) {
      console.error('[InterviewerMeeting] Error toggling webcam:', err)
      alert('Could not access camera. Please check browser permissions.')
    }
  }, [ready, toggleWebcam, localWebcamOn])

  const doToggleScreen = useCallback(() => { 
    console.log('[InterviewerMeeting] Toggle screen called, ready:', ready)
    if (toggleScreenShare) {
      try {
        toggleScreenShare()
      } catch (err) {
        console.error('[InterviewerMeeting] Error toggling screen share:', err)
      }
    }
  }, [ready, toggleScreenShare])

  const doLeave = useCallback(() => { 
    console.log('[InterviewerMeeting] Leave called, ready:', ready)
    try {
      if (leave) {
        leave()
        console.log('[InterviewerMeeting] leave executed')
      } else {
        console.error('[InterviewerMeeting] leave is undefined, calling onLeave directly')
        onLeave?.()
      }
    } catch (err) {
      console.error('[InterviewerMeeting] Error leaving:', err)
      onLeave?.()
    }
  }, [ready, leave, onLeave])

  const allIds = useMemo(() => [...participants.keys()], [participants])
  const remoteId = useMemo(() => allIds.find((id: string) => id !== localParticipant?.id) || null, [allIds, localParticipant])

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col overflow-hidden">
      {/* Main Area */}
      <div className="flex-1 p-4 flex gap-4 min-h-0">
        {/* Video Section */}
        <div className="flex-1 flex gap-4 min-w-0">
          <div className="flex-1 flex gap-4">
            {localParticipant && (
              <div className="flex-1">
                <ParticipantTile participantId={localParticipant.id} />
              </div>
            )}
            {remoteId ? (
              <div className="flex-1">
                <ParticipantTile participantId={remoteId} />
              </div>
            ) : (
              <div className="flex-1 rounded-2xl bg-gray-700 ring-1 ring-gray-600 flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <div className="w-20 h-20 rounded-full bg-gray-600 mx-auto mb-4 flex items-center justify-center">
                    <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <p className="font-medium">Waiting for candidate...</p>
                  <p className="text-sm text-gray-500 mt-1">{meetingId}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI Insights Panel */}
        <InsightsPanel 
          insights={insights} 
          recommendations={recommendations}
          metrics={metrics}
          resumeUrl={resumeUrl} 
        />
      </div>

      {/* Control Bar */}
      <div className="h-20 bg-gray-900 flex items-center justify-center px-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={doToggleMic} 
            className={`
              px-4 py-3 rounded-full flex items-center gap-2 transition-all duration-200
              ${localMicOn ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}
            `}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
            <span className="text-sm font-medium hidden sm:inline">{localMicOn ? 'Mute' : 'Unmute'}</span>
          </button>

          <button 
            onClick={doToggleWebcam} 
            className={`
              px-4 py-3 rounded-full flex items-center gap-2 transition-all duration-200
              ${localWebcamOn ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}
            `}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
            <span className="text-sm font-medium hidden sm:inline">{localWebcamOn ? 'Stop video' : 'Start video'}</span>
          </button>

          <button 
            onClick={doToggleScreen} 
            className={`
              px-4 py-3 rounded-full flex items-center gap-2 transition-all duration-200
              ${localScreenShareOn ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'}
            `}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4z"/>
            </svg>
            <span className="text-sm font-medium hidden sm:inline">{localScreenShareOn ? 'Stop' : 'Present'}</span>
          </button>

          <div className="w-px h-8 bg-gray-600 mx-2" />

          <button 
            onClick={doLeave} 
            className="px-5 py-3 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center gap-2 transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
            </svg>
            <span className="text-sm font-medium">Leave</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// Main Interviewer Meeting Component
export default function InterviewerMeeting({ 
  meetingId, 
  token, 
  participantName, 
  roundId,
  insights, 
  recommendations,
  metrics,
  resumeUrl,
  onLeave 
}: InterviewerMeetingProps) {
  return (
    <MeetingProvider 
      config={{ 
        meetingId, 
        micEnabled: false, 
        webcamEnabled: false, 
        name: participantName, 
        debugMode: process.env.NODE_ENV === 'development' 
      }} 
      token={token}
    >
      <MeetingView 
        insights={insights} 
        recommendations={recommendations}
        metrics={metrics}
        resumeUrl={resumeUrl}
        onLeave={onLeave}
      />
    </MeetingProvider>
  )
}
