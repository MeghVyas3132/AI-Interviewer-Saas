import type { NextApiRequest, NextApiResponse } from 'next';
import WebSocket from 'ws';

// This endpoint acts as a proxy for AssemblyAI WebSocket
// It handles authentication server-side since browsers can't set custom headers on WebSocket
export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Upgrade HTTP connection to WebSocket
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check if this is a WebSocket upgrade request
  if (req.headers.upgrade !== 'websocket') {
    return res.status(400).json({ error: 'WebSocket upgrade required' });
  }

  const API_KEY = process.env.ASSEMBLYAI_API_KEY;
  
  if (!API_KEY) {
    return res.status(500).json({ error: 'Missing ASSEMBLYAI_API_KEY environment variable' });
  }
  
  // Create WebSocket connection to AssemblyAI
  const assemblyWs = new WebSocket(
    'wss://streaming.assemblyai.com/v3/ws?sample_rate=16000',
    {
      headers: {
        Authorization: API_KEY,
      },
    }
  );

  // Handle upgrade
  const server = (res as any).socket.server;
  const wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', (request: any, socket: any, head: any) => {
    if (request.url === '/api/assemblyai/stream') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        // Proxy messages between client and AssemblyAI
        ws.on('message', (data) => {
          if (assemblyWs.readyState === WebSocket.OPEN) {
            assemblyWs.send(data);
          }
        });

        assemblyWs.on('message', (data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        });

        // Handle errors and closing
        ws.on('close', () => {
          assemblyWs.close();
        });

        assemblyWs.on('close', () => {
          ws.close();
        });

        ws.on('error', (err) => {
          console.error('Client WebSocket error:', err);
          assemblyWs.close();
        });

        assemblyWs.on('error', (err) => {
          console.error('AssemblyAI WebSocket error:', err);
          ws.close();
        });
      });
    }
  });
}

export const config = {
  api: {
    bodyParser: false,
  },
};
