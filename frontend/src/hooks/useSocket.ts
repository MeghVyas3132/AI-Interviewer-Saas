// Custom hook for WebSocket connection management
// Socket.io is DISABLED - this hook provides compatibility stubs
import { useState, useCallback } from 'react'
import {
  connectSocket,
  disconnectSocket,
  isSocketConnected,
  SocketConfig,
} from '@/services/socket'

interface UseSocketOptions {
  token: string
  autoConnect?: boolean
}

interface UseSocketReturn {
  isConnected: boolean
  connect: () => void
  disconnect: () => void
  error: Error | null
}

export const useSocket = ({
  token,
  autoConnect = true,
}: UseSocketOptions): UseSocketReturn => {
  const [isConnected] = useState(false)
  const [error] = useState<Error | null>(null)

  const connect = useCallback(() => {
    if (!token) return

    const config: SocketConfig = {
      token,
      onConnect: () => {},
      onDisconnect: () => {},
      onError: () => {},
    }

    // Socket.io is disabled - this returns null
    connectSocket(config)
  }, [token])

  const disconnect = useCallback(() => {
    disconnectSocket()
  }, [])

  return {
    isConnected,
    connect,
    disconnect,
    error,
  }
}
