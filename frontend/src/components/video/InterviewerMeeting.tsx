'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Cookies from 'js-cookie'
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

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.stunprotocol.org:3478' },
  ],
}

function getAuthToken(): string {
  if (typeof window !== 'undefined') {
    return Cookies.get('access_token') || ''
  }
  return ''
}

async function postSignal(roundId: string, type: string, data: object) {
  const authToken = getAuthToken()
  try {
    await fetch('/api/realtime/rounds/' + roundId + '/signal', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + authToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type, data }),
    })
  } catch (err) {
    console.error('[InterviewerMeeting] postSignal error:', err)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pollSignals(roundId: string): Promise<Array<{ type: string; data: any; from_role: string }>> {
  const authToken = getAuthToken()
  try {
    const res = await fetch('/api/realtime/rounds/' + roundId + '/signal', {
      headers: { 'Authorization': 'Bearer ' + authToken },
    })
    const json = await res.json()
    return json.messages || []
  } catch {
    return []
  }
}

async function postPresence(roundId: string) {
  const authToken = getAuthToken()
  try {
    await fetch('/api/realtime/rounds/' + roundId + '/presence', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + authToken,
        'Content-Type': 'application/json',
      },
    })
  } catch (err) {
    console.error('[InterviewerMeeting] postPresence error:', err)
  }
}

async function checkPresence(roundId: string): Promise<boolean> {
  const authToken = getAuthToken()
  try {
    const res = await fetch('/api/realtime/rounds/' + roundId + '/presence', {
      headers: { 'Authorization': 'Bearer ' + authToken },
    })
    const json = await res.json()
    return json.peer_online || false
  } catch {
    return false
  }
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

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'ai' ? (
          <>
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
                          Ask: {rec.suggestedQuestions[0]}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

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

// Main Interviewer Meeting Component
export default function InterviewerMeeting({
  meetingId,
  participantName,
  roundId,
  insights,
  recommendations,
  metrics,
  resumeUrl,
  onLeave
}: InterviewerMeetingProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [connected, setConnected] = useState(false)
  const [peerOnline, setPeerOnline] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [connectionState, setConnectionState] = useState('new')

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const presenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const iceCandidatesQueue = useRef<RTCIceCandidate[]>([])
  const hasCreatedOffer = useRef(false)
  const mountedRef = useRef(true)

  // Initialize local media
  useEffect(() => {
    mountedRef.current = true
    let stream: MediaStream | null = null

    const init = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return }
        setLocalStream(stream)
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
        }
      } catch (err) {
        console.error('[InterviewerMeeting] getUserMedia error:', err)
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return }
          setLocalStream(stream)
        } catch (err2) {
          console.error('[InterviewerMeeting] Audio-only also failed:', err2)
        }
      }
    }

    init()
    return () => {
      mountedRef.current = false
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // Setup RTCPeerConnection and signaling
  useEffect(() => {
    if (!localStream) return

    const pc = new RTCPeerConnection(ICE_SERVERS)
    pcRef.current = pc

    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream)
    })

    const remoteMs = new MediaStream()
    setRemoteStream(remoteMs)

    pc.ontrack = (event) => {
      console.log('[InterviewerMeeting] Got remote track:', event.track.kind)
      remoteMs.addTrack(event.track)
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteMs
      }
      setConnected(true)
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        postSignal(roundId, 'ice-candidate', { candidate: event.candidate.toJSON() })
      }
    }

    pc.onconnectionstatechange = () => {
      console.log('[InterviewerMeeting] Connection state:', pc.connectionState)
      setConnectionState(pc.connectionState)
      if (pc.connectionState === 'connected') setConnected(true)
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') setConnected(false)
    }

    // Start presence heartbeat
    postPresence(roundId)
    presenceIntervalRef.current = setInterval(() => {
      postPresence(roundId)
      checkPresence(roundId).then(online => {
        if (mountedRef.current) setPeerOnline(online)
      })
    }, 3000)

    // Start signal polling
    pollIntervalRef.current = setInterval(async () => {
      if (!mountedRef.current) return
      const messages = await pollSignals(roundId)

      for (const msg of messages) {
        try {
          if (msg.type === 'answer') {
            if (pc.signalingState === 'have-local-offer') {
              console.log('[InterviewerMeeting] Received answer from candidate')
              await pc.setRemoteDescription(new RTCSessionDescription(msg.data as RTCSessionDescriptionInit))

              for (const ic of iceCandidatesQueue.current) {
                await pc.addIceCandidate(ic)
              }
              iceCandidatesQueue.current = []
            }
          } else if (msg.type === 'ice-candidate') {
            const candidateData = (msg.data as { candidate?: RTCIceCandidateInit }).candidate
            if (candidateData) {
              const candidate = new RTCIceCandidate(candidateData)
              if (pc.remoteDescription) {
                await pc.addIceCandidate(candidate)
              } else {
                iceCandidatesQueue.current.push(candidate)
              }
            }
          }
        } catch (err) {
          console.error('[InterviewerMeeting] Signal processing error:', err)
        }
      }
    }, 1000)

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      if (presenceIntervalRef.current) clearInterval(presenceIntervalRef.current)
      pc.close()
    }
  }, [localStream, roundId])

  // Interviewer creates the offer when peer comes online
  useEffect(() => {
    if (peerOnline && pcRef.current && !hasCreatedOffer.current && localStream) {
      hasCreatedOffer.current = true
      const pc = pcRef.current

      console.log('[InterviewerMeeting] Peer is online, creating offer...')

      const createOffer = async () => {
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          await postSignal(roundId, 'offer', offer)
          console.log('[InterviewerMeeting] Offer sent to candidate')
        } catch (err) {
          console.error('[InterviewerMeeting] Error creating offer:', err)
          hasCreatedOffer.current = false
        }
      }

      createOffer()
    }
  }, [peerOnline, localStream, roundId])

  const toggleMic = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
      setMicOn(prev => !prev)
    }
  }, [localStream])

  const toggleCam = useCallback(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
      setCamOn(prev => !prev)
    }
  }, [localStream])

  const handleLeave = useCallback(() => {
    if (pcRef.current) pcRef.current.close()
    localStream?.getTracks().forEach(t => t.stop())
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    if (presenceIntervalRef.current) clearInterval(presenceIntervalRef.current)
    onLeave?.()
  }, [localStream, onLeave])

  const initials = (participantName || 'I').charAt(0).toUpperCase()

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col overflow-hidden">
      {/* Status bar */}
      <div className="h-8 bg-gray-800/50 flex items-center justify-center px-4 text-xs text-gray-400">
        Meeting: {meetingId} {' | '}
        {peerOnline ? ' Candidate is online' : ' Waiting for candidate...'} {' | '}
        {connected ? ' Connected' : connectionState === 'connecting' ? ' Connecting...' : ' Waiting'}
      </div>

      {/* Main Area */}
      <div className="flex-1 p-4 flex gap-4 min-h-0">
        {/* Video Section */}
        <div className="flex-1 flex gap-4 min-w-0">
          {/* Local video */}
          <div className="flex-1 relative rounded-2xl overflow-hidden bg-gray-700 ring-1 ring-gray-600">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            {!camOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center">
                  <span className="text-3xl font-medium text-white">{initials}</span>
                </div>
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
              <span className="text-xs text-white font-medium">{participantName} (You)</span>
            </div>
          </div>

          {/* Remote video */}
          <div className="flex-1 relative rounded-2xl overflow-hidden bg-gray-700 ring-1 ring-gray-600">
            {connected && remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <div className="w-20 h-20 rounded-full bg-gray-600 mx-auto mb-4 flex items-center justify-center">
                    <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <p className="font-medium">
                    {peerOnline ? 'Connecting to candidate...' : 'Waiting for candidate...'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">{meetingId}</p>
                  {peerOnline && (
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                      <span className="text-sm text-blue-400">Establishing WebRTC connection...</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {connected && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
                <span className="text-xs text-white font-medium">Candidate</span>
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
            onClick={toggleMic}
            className={`px-4 py-3 rounded-full flex items-center gap-2 transition-all duration-200
              ${micOn ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
            <span className="text-sm font-medium hidden sm:inline">{micOn ? 'Mute' : 'Unmute'}</span>
          </button>

          <button
            onClick={toggleCam}
            className={`px-4 py-3 rounded-full flex items-center gap-2 transition-all duration-200
              ${camOn ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
            <span className="text-sm font-medium hidden sm:inline">{camOn ? 'Stop video' : 'Start video'}</span>
          </button>

          <div className="w-px h-8 bg-gray-600 mx-2" />

          <button
            onClick={handleLeave}
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
