'use client';

import { useState, useEffect } from 'react';
import { useMeeting } from '@videosdk.live/react-sdk';
import { ParticipantView } from './ParticipantView';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Phone, 
  Monitor,
  MonitorOff,
  Users,
  Settings,
  Loader2
} from 'lucide-react';

interface MeetingRoomProps {
  onLeave?: () => void;
  localParticipantName?: string;
  showControls?: boolean;
  className?: string;
}

export function MeetingRoom({
  onLeave,
  localParticipantName = 'You',
  showControls = true,
  className = '',
}: MeetingRoomProps) {
  const [isJoining, setIsJoining] = useState(true);
  const [hasJoined, setHasJoined] = useState(false);
  
  const {
    join,
    leave,
    toggleMic,
    toggleWebcam,
    toggleScreenShare,
    localMicOn,
    localWebcamOn,
    localScreenShareOn,
    participants,
    meetingId,
    localParticipant,
  } = useMeeting({
    onMeetingJoined: () => {
      console.log('[VideoSDK] Meeting joined successfully');
      setIsJoining(false);
      setHasJoined(true);
    },
    onMeetingLeft: () => {
      console.log('[VideoSDK] Meeting left');
      setHasJoined(false);
      onLeave?.();
    },
    onParticipantJoined: (participant) => {
      console.log('[VideoSDK] Participant joined:', participant.displayName);
    },
    onParticipantLeft: (participant) => {
      console.log('[VideoSDK] Participant left:', participant.displayName);
    },
    onError: (error) => {
      console.error('[VideoSDK] Error:', error);
      setIsJoining(false);
    },
  });

  // Auto-join meeting on mount
  useEffect(() => {
    if (!hasJoined) {
      console.log('[VideoSDK] Joining meeting:', meetingId);
      join();
    }
  }, []);

  // Convert participants map to array
  const participantList = [...participants.keys()];
  const remoteParticipants = participantList.filter(
    (id) => id !== localParticipant?.id
  );

  const handleEndCall = () => {
    leave();
    onLeave?.();
  };

  if (isJoining) {
    return (
      <div className={`flex items-center justify-center h-full bg-gray-900 ${className}`}>
        <div className="text-center text-white">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" />
          <p className="text-lg">Joining meeting...</p>
          <p className="text-sm text-gray-400 mt-2">Meeting ID: {meetingId}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-gray-900 ${className}`}>
      {/* Video Grid */}
      <div className="flex-1 p-4">
        <div className={`grid gap-4 h-full ${
          remoteParticipants.length === 0 
            ? 'grid-cols-1' 
            : remoteParticipants.length === 1 
              ? 'grid-cols-2' 
              : 'grid-cols-2 lg:grid-cols-3'
        }`}>
          {/* Local Participant (You) */}
          {localParticipant && (
            <ParticipantView
              participantId={localParticipant.id}
              isLocal={true}
              className="aspect-video"
              showName={true}
            />
          )}

          {/* Remote Participants */}
          {remoteParticipants.map((participantId) => (
            <ParticipantView
              key={participantId}
              participantId={participantId}
              isLocal={false}
              className="aspect-video"
              showName={true}
            />
          ))}

          {/* Waiting for others */}
          {remoteParticipants.length === 0 && (
            <div className="aspect-video bg-gray-800 rounded-lg flex items-center justify-center">
              <div className="text-center text-gray-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg">Waiting for others to join...</p>
                <p className="text-sm mt-2 text-gray-500">
                  Share the meeting ID: <span className="font-mono bg-gray-700 px-2 py-1 rounded">{meetingId}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Control Bar */}
      {showControls && (
        <div className="bg-gray-800 border-t border-gray-700 p-4">
          <div className="flex items-center justify-center gap-4">
            {/* Mic Toggle */}
            <button
              onClick={() => toggleMic()}
              className={`p-4 rounded-full transition-colors ${
                localMicOn
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-red-600 hover:bg-red-500 text-white'
              }`}
              title={localMicOn ? 'Mute microphone' : 'Unmute microphone'}
            >
              {localMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
            </button>

            {/* Webcam Toggle */}
            <button
              onClick={() => toggleWebcam()}
              className={`p-4 rounded-full transition-colors ${
                localWebcamOn
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-red-600 hover:bg-red-500 text-white'
              }`}
              title={localWebcamOn ? 'Turn off camera' : 'Turn on camera'}
            >
              {localWebcamOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
            </button>

            {/* Screen Share Toggle */}
            <button
              onClick={() => toggleScreenShare()}
              className={`p-4 rounded-full transition-colors ${
                localScreenShareOn
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
              title={localScreenShareOn ? 'Stop sharing' : 'Share screen'}
            >
              {localScreenShareOn ? <MonitorOff className="w-6 h-6" /> : <Monitor className="w-6 h-6" />}
            </button>

            {/* End Call */}
            <button
              onClick={handleEndCall}
              className="p-4 rounded-full bg-red-600 hover:bg-red-500 text-white transition-colors"
              title="End call"
            >
              <Phone className="w-6 h-6 rotate-[135deg]" />
            </button>
          </div>

          {/* Participant Count */}
          <div className="text-center mt-3 text-gray-400 text-sm">
            <Users className="w-4 h-4 inline-block mr-1" />
            {participantList.length} participant{participantList.length !== 1 ? 's' : ''} in meeting
          </div>
        </div>
      )}
    </div>
  );
}

export default MeetingRoom;
