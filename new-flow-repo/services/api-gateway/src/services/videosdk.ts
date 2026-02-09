import axios from 'axios';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';

interface VideoSDKRoom {
  meetingId: string;
  token: string;
}

/**
 * Create a new VideoSDK meeting room
 */
export const createVideoSDKRoom = async (): Promise<VideoSDKRoom> => {
  try {
    // Generate VideoSDK token
    const token = generateVideoSDKToken();

    // Create meeting room
    const response = await axios.post(
      `${config.videoSdk.apiEndpoint}/rooms`,
      {},
      {
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
      }
    );

    const meetingId = response.data.roomId;

    logger.info('VideoSDK room created', { meetingId });

    return {
      meetingId,
      token,
    };
  } catch (error) {
    logger.error('Failed to create VideoSDK room', { error });
    throw new Error('Failed to create video meeting room');
  }
};

/**
 * Generate VideoSDK JWT token
 * Permissions should be array: ['allow_join'], ['allow_join', 'allow_mod']
 */
export const generateVideoSDKToken = (options?: {
  allowJoin?: boolean;
  allowMod?: boolean;
}): string => {
  const perms = options || { allowJoin: true, allowMod: true };
  const permissions: string[] = [];
  
  if (perms.allowJoin) permissions.push('allow_join');
  if (perms.allowMod) permissions.push('allow_mod');
  
  const payload = {
    apikey: config.videoSdk.apiKey,
    permissions,
  };

  const token = jwt.sign(payload, config.videoSdk.secret, {
    expiresIn: '24h',
    algorithm: 'HS256',
  });

  return token;
};

/**
 * Generate token for a specific participant
 * Uses standard API format that works with all VideoSDK features
 */
export const generateParticipantToken = (
  meetingId: string,
  participantId: string,
  role: 'interviewer' | 'candidate'
): string => {
  const permissions: string[] = ['allow_join'];
  if (role === 'interviewer') {
    permissions.push('allow_mod'); // Only interviewer can moderate
  }

  // Use simpler token format without version 2 for better compatibility
  const payload = {
    apikey: config.videoSdk.apiKey,
    permissions,
  };

  const token = jwt.sign(payload, config.videoSdk.secret, {
    expiresIn: '4h', // Token valid for interview duration
    algorithm: 'HS256',
  });

  logger.info('Generated VideoSDK participant token', {
    meetingId,
    participantId,
    role,
    permissions,
  });

  return token;
};

/**
 * Validate a meeting room exists
 */
export const validateMeetingRoom = async (meetingId: string): Promise<boolean> => {
  try {
    const token = generateVideoSDKToken();

    const response = await axios.get(
      `${config.videoSdk.apiEndpoint}/rooms/validate/${meetingId}`,
      {
        headers: {
          Authorization: token,
        },
      }
    );

    return response.data.roomId === meetingId;
  } catch (error) {
    logger.error('Failed to validate VideoSDK room', { meetingId, error });
    return false;
  }
};

/**
 * End a meeting room
 */
export const endMeetingRoom = async (meetingId: string): Promise<void> => {
  try {
    const token = generateVideoSDKToken();

    await axios.post(
      `${config.videoSdk.apiEndpoint}/rooms/deactivate`,
      { roomId: meetingId },
      {
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info('VideoSDK room ended', { meetingId });
  } catch (error) {
    logger.error('Failed to end VideoSDK room', { meetingId, error });
  }
};
