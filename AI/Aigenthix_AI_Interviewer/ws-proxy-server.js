// WebSocket Proxy Server for AssemblyAI
// Run this alongside your Next.js dev server: node ws-proxy-server.js

require('dotenv').config();
const WebSocket = require('ws');
const http = require('http');

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const PROXY_PORT = 9003;

if (!ASSEMBLYAI_API_KEY) {
  console.error('❌ ERROR: ASSEMBLYAI_API_KEY environment variable is not set!');
  console.error('Please set it in your .env file: ASSEMBLYAI_API_KEY=your_key_here');
  process.exit(1);
}

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (clientWs, req) => {
  console.log('Client connected from:', req.socket.remoteAddress);
  console.log('Client WebSocket readyState:', clientWs.readyState);

  // Extract sample_rate from query string (handle trailing slash)
  const urlPath = req.url.split('?')[0];
  const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
  const params = new URLSearchParams(queryString);
  const sampleRate = params.get('sample_rate') || '16000';

  console.log(`Connecting to AssemblyAI with sample_rate=${sampleRate}`);

  // Build AssemblyAI WebSocket URL with required parameters
  const assemblyUrl = new URL('wss://streaming.assemblyai.com/v3/ws');
  assemblyUrl.searchParams.set('sample_rate', sampleRate);
  assemblyUrl.searchParams.set('encoding', 'pcm_s16le');
  assemblyUrl.searchParams.set('format_turns', 'true');
  assemblyUrl.searchParams.set('speech_model', 'universal-streaming-english');

  console.log(`AssemblyAI URL: ${assemblyUrl.toString()}`);

  // Connect to AssemblyAI with Authorization header
  const assemblyWs = new WebSocket(assemblyUrl.toString(), {
    headers: {
      Authorization: ASSEMBLYAI_API_KEY,
    },
  });

  // Track if Begin message was received
  let beginReceived = false;

  // Forward messages from client to AssemblyAI
  clientWs.on('message', (data) => {
    if (assemblyWs.readyState === WebSocket.OPEN) {
      assemblyWs.send(data);
    }
  });

  // Forward messages from AssemblyAI to client
  assemblyWs.on('message', (data) => {
    const messageStr = data.toString();
    const isBegin = messageStr.includes('"type":"Begin"');
    
    if (isBegin) {
      beginReceived = true;
      console.log('✅ Received Begin message from AssemblyAI');
    }
    
    console.log('Client WebSocket state:', clientWs.readyState, 'OPEN=', WebSocket.OPEN);
    
    if (clientWs.readyState === WebSocket.OPEN) {
      // Log all messages for debugging
      console.log('Forwarding AssemblyAI message to client:', messageStr.substring(0, 200));
      try {
        clientWs.send(data);
        if (isBegin) {
          console.log('✅ Begin message sent to client successfully');
        }
      } catch (error) {
        console.error('Error sending message to client:', error);
      }
    } else {
      console.warn('❌ Client WebSocket not open, cannot forward message. State:', clientWs.readyState);
      console.warn('Message that was dropped:', messageStr.substring(0, 100));
    }
  });

  // Handle errors
  clientWs.on('error', (error) => {
    console.error('Client WebSocket error:', error);
    assemblyWs.close();
  });

  assemblyWs.on('error', (error) => {
    console.error('AssemblyAI WebSocket error:', error.message || error);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ 
        type: 'error', 
        message: 'AssemblyAI connection error: ' + (error.message || 'Unknown error')
      }));
    }
    clientWs.close();
  });

  // Handle close
  clientWs.on('close', (code, reason) => {
    console.log(`Client disconnected: Code ${code}, Reason: ${reason || 'None'}, Begin received: ${beginReceived}`);
    if (!beginReceived) {
      console.warn('⚠️ Client disconnected before receiving Begin message!');
    }
    assemblyWs.close();
  });

  assemblyWs.on('close', (code, reason) => {
    console.log(`AssemblyAI disconnected: Code ${code}, Reason: ${reason || 'None'}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code, reason);
    }
  });

  assemblyWs.on('open', () => {
    console.log('Connected to AssemblyAI');
  });
});

server.listen(PROXY_PORT,'0.0.0.0', () => {
  console.log(`WebSocket proxy server running on ws://localhost:${PROXY_PORT}`);
  console.log('Connect your client to: ws://ocl.bnhverse.tech:9003?sample_rate=16000');
});
