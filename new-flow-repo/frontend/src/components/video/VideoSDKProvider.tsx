'use client';

import { MeetingProvider, MeetingConsumer, useMeeting, useParticipant } from '@videosdk.live/react-sdk';
import { ReactNode, createContext, useContext, useState, useEffect } from 'react';

interface VideoSDKContextType {
  meetingId: string | null;
  token: string | null;
  participantId: string | null;
  isJoined: boolean;
  error: string | null;
}

const VideoSDKContext = createContext<VideoSDKContextType>({
  meetingId: null,
  token: null,
  participantId: null,
  isJoined: false,
  error: null,
});

export const useVideoSDK = () => useContext(VideoSDKContext);

interface VideoSDKProviderProps {
  children: ReactNode;
  meetingId: string;
  token: string;
  participantName: string;
  participantId: string;
  micEnabled?: boolean;
  webcamEnabled?: boolean;
  onMeetingJoined?: () => void;
  onMeetingLeft?: () => void;
  onParticipantJoined?: (participant: any) => void;
  onParticipantLeft?: (participant: any) => void;
  onError?: (error: any) => void;
}

export function VideoSDKProvider({
  children,
  meetingId,
  token,
  participantName,
  participantId,
  micEnabled = true,
  webcamEnabled = true,
  onMeetingJoined,
  onMeetingLeft,
  onParticipantJoined,
  onParticipantLeft,
  onError,
}: VideoSDKProviderProps) {
  const [isJoined, setIsJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!meetingId || !token) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading video meeting...</p>
        </div>
      </div>
    );
  }

  return (
    <MeetingProvider
      config={{
        meetingId,
        micEnabled,
        webcamEnabled,
        name: participantName,
        participantId,
        debugMode: process.env.NODE_ENV === 'development',
      }}
      token={token}
      joinWithoutUserInteraction={false}
    >
      <VideoSDKContext.Provider
        value={{
          meetingId,
          token,
          participantId,
          isJoined,
          error,
        }}
      >
        <MeetingConsumer>
          {() => (
            <MeetingEventHandler
              onMeetingJoined={() => {
                setIsJoined(true);
                onMeetingJoined?.();
              }}
              onMeetingLeft={() => {
                setIsJoined(false);
                onMeetingLeft?.();
              }}
              onParticipantJoined={onParticipantJoined}
              onParticipantLeft={onParticipantLeft}
              onError={(err) => {
                setError(err?.message || 'Meeting error');
                onError?.(err);
              }}
            >
              {children}
            </MeetingEventHandler>
          )}
        </MeetingConsumer>
      </VideoSDKContext.Provider>
    </MeetingProvider>
  );
}

// Internal component to handle meeting events
function MeetingEventHandler({
  children,
  onMeetingJoined,
  onMeetingLeft,
  onParticipantJoined,
  onParticipantLeft,
  onError,
}: {
  children: ReactNode;
  onMeetingJoined?: () => void;
  onMeetingLeft?: () => void;
  onParticipantJoined?: (participant: any) => void;
  onParticipantLeft?: (participant: any) => void;
  onError?: (error: any) => void;
}) {
  const { join, leave, meetingId } = useMeeting({
    onMeetingJoined,
    onMeetingLeft,
    onParticipantJoined,
    onParticipantLeft,
    onError,
  });

  return <>{children}</>;
}

export { useMeeting, useParticipant };
