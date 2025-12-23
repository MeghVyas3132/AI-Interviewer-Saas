'use client'

import React, { useState, useEffect, useRef } from 'react'

interface ProctoringRulesModalProps {
  isOpen: boolean
  onAccept: () => void
  onDecline: () => void
}

export default function ProctoringRulesModal({
  isOpen,
  onAccept,
  onDecline,
}: ProctoringRulesModalProps) {
  const [cameraGranted, setCameraGranted] = useState(false)
  const [micGranted, setMicGranted] = useState(false)
  const [rulesAccepted, setRulesAccepted] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!isOpen) {
      // Cleanup on close
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      setCameraGranted(false)
      setMicGranted(false)
      setRulesAccepted(false)
      setError(null)
    }
  }, [isOpen])

  const requestPermissions = async () => {
    setChecking(true)
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })

      streamRef.current = stream
      setCameraGranted(true)
      setMicGranted(true)

      // Show video preview
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Camera and microphone access is required for the interview. Please grant permissions and try again.')
      } else if (err.name === 'NotFoundError') {
        setError('No camera or microphone found. Please connect a camera and microphone.')
      } else {
        setError(`Failed to access camera/microphone: ${err.message}`)
      }
    } finally {
      setChecking(false)
    }
  }

  const handleAccept = () => {
    // Keep the stream running for the interview
    onAccept()
  }

  const handleDecline = () => {
    // Stop the stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    onDecline()
  }

  const canProceed = cameraGranted && micGranted && rulesAccepted

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-primary-600 to-primary-700">
          <h2 className="text-xl font-bold text-white flex items-center">
            <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Interview Proctoring Rules
          </h2>
          <p className="text-primary-100 text-sm mt-1">
            Please review and accept the following rules before starting your interview.
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Camera Preview */}
          <div className="mb-6">
            <div className="bg-gray-900 rounded-xl overflow-hidden aspect-video max-w-sm mx-auto mb-4">
              {cameraGranted ? (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <svg className="w-16 h-16 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm">Camera preview</p>
                  </div>
                </div>
              )}
            </div>

            {/* Permission Status */}
            <div className="flex justify-center gap-4 mb-4">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                cameraGranted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                <svg className={`w-4 h-4 ${cameraGranted ? 'text-green-500' : 'text-gray-400'}`} fill="currentColor" viewBox="0 0 20 20">
                  {cameraGranted ? (
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  ) : (
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  )}
                </svg>
                Camera
              </div>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                micGranted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                <svg className={`w-4 h-4 ${micGranted ? 'text-green-500' : 'text-gray-400'}`} fill="currentColor" viewBox="0 0 20 20">
                  {micGranted ? (
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  ) : (
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  )}
                </svg>
                Microphone
              </div>
            </div>

            {!cameraGranted && !micGranted && (
              <div className="text-center">
                <button
                  onClick={requestPermissions}
                  disabled={checking}
                  className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-xl transition"
                >
                  {checking ? (
                    <span className="flex items-center">
                      <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Checking...
                    </span>
                  ) : (
                    'Enable Camera & Microphone'
                  )}
                </button>
              </div>
            )}

            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Rules */}
          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Interview Rules
            </h3>
            <ul className="space-y-3 text-sm text-gray-700">
              <li className="flex items-start">
                <svg className="w-5 h-5 mr-2 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span><strong>Do not switch tabs</strong> - The system will detect and log any tab switches</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 mr-2 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span><strong>Do not switch windows</strong> - Stay in the interview window at all times</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 mr-2 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span><strong>Keep your camera on</strong> - Your video will be recorded for review</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 mr-2 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span><strong>Keep your microphone on</strong> - Speak clearly when answering questions</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 mr-2 text-blue-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span><strong>Ensure good lighting</strong> - Your face should be clearly visible</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 mr-2 text-blue-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span><strong>Find a quiet space</strong> - Minimize background noise and distractions</span>
              </li>
            </ul>
          </div>

          {/* Acceptance Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={rulesAccepted}
              onChange={(e) => setRulesAccepted(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">
              I understand and agree to follow the interview rules. I consent to being recorded during this interview.
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
          <button
            onClick={handleDecline}
            className="px-6 py-2.5 text-gray-600 hover:text-gray-800 font-medium transition"
          >
            Cancel
          </button>
          <button
            onClick={handleAccept}
            disabled={!canProceed}
            className={`px-8 py-2.5 rounded-xl font-semibold transition ${
              canProceed
                ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-100'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            Start Interview
          </button>
        </div>
      </div>
    </div>
  )
}
