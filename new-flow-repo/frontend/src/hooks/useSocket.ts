// Custom hook for WebSocket connection management
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  connectSocket,
  disconnectSocket,
  getSocket,
  isSocketConnected,
  SocketConfig,
} from '@/services/socket';

interface UseSocketOptions {
  token: string;
  autoConnect?: boolean;
}

interface UseSocketReturn {
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  error: Error | null;
}

export const useSocket = ({
  token,
  autoConnect = true,
}: UseSocketOptions): UseSocketReturn => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const hasConnected = useRef(false);

  const connect = useCallback(() => {
    if (!token || hasConnected.current) return;

    const config: SocketConfig = {
      token,
      onConnect: () => {
        setIsConnected(true);
        setError(null);
        console.log('[useSocket] Connected');
      },
      onDisconnect: (reason) => {
        setIsConnected(false);
        console.log('[useSocket] Disconnected:', reason);
      },
      onError: (err) => {
        setError(err);
        console.error('[useSocket] Error:', err);
      },
    };

    connectSocket(config);
    hasConnected.current = true;
  }, [token]);

  const disconnect = useCallback(() => {
    disconnectSocket();
    setIsConnected(false);
    hasConnected.current = false;
  }, []);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect && token) {
      connect();
    }

    return () => {
      // Don't disconnect on unmount to allow socket reuse
      // disconnect();
    };
  }, [autoConnect, token, connect]);

  // Sync connection state
  useEffect(() => {
    const checkConnection = () => {
      setIsConnected(isSocketConnected());
    };

    const interval = setInterval(checkConnection, 1000);
    return () => clearInterval(interval);
  }, []);

  return {
    isConnected,
    connect,
    disconnect,
    error,
  };
};
