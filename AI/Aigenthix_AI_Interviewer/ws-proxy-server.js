// WebSocket Proxy Server for AssemblyAI Streaming STT.

require('dotenv').config();
const WebSocket = require('ws');
const http = require('http');

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const PROXY_PORT = Number(process.env.PORT || process.env.WS_PROXY_PORT || 9003);

const DEFAULT_SAMPLE_RATE = 16000;
const ASSEMBLYAI_STREAMING_MODEL =
  process.env.ASSEMBLYAI_STREAMING_MODEL || 'universal-streaming-english';
const ASSEMBLYAI_STREAMING_ENCODING =
  process.env.ASSEMBLYAI_STREAMING_ENCODING || 'pcm_s16le';
const ASSEMBLYAI_FORMAT_TURNS =
  (process.env.ASSEMBLYAI_FORMAT_TURNS || 'false').toLowerCase() === 'true';

if (!ASSEMBLYAI_API_KEY) {
  console.error('ERROR: ASSEMBLYAI_API_KEY environment variable is not set.');
  console.error('Set it in your environment before starting ws-proxy-server.js');
  process.exit(1);
}

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (clientWs, req) => {
  const queryString = req.url && req.url.includes('?') ? req.url.split('?')[1] : '';
  const params = new URLSearchParams(queryString || '');
  const sampleRate = Number(params.get('sample_rate') || DEFAULT_SAMPLE_RATE) || DEFAULT_SAMPLE_RATE;
  const audioLogEvery = Number(process.env.ASSEMBLYAI_AUDIO_LOG_EVERY || 50);
  const minFrameBytes = Number(process.env.ASSEMBLYAI_MIN_FRAME_BYTES || 1600);
  let audioChunkCount = 0;
  let ignoredControlCount = 0;
  let audioBatchBuffer = Buffer.alloc(0);
  const clientAddr = req.socket?.remoteAddress || 'unknown';

  console.log(`[WS Proxy] Client connected from ${clientAddr} (sample_rate=${sampleRate})`);

  const assemblyUrl = new URL('wss://streaming.assemblyai.com/v3/ws');
  assemblyUrl.searchParams.set('sample_rate', String(sampleRate));
  assemblyUrl.searchParams.set('speech_model', ASSEMBLYAI_STREAMING_MODEL);
  assemblyUrl.searchParams.set('encoding', ASSEMBLYAI_STREAMING_ENCODING);
  if (ASSEMBLYAI_FORMAT_TURNS) {
    assemblyUrl.searchParams.set('format_turns', 'true');
  }

  const assemblyWs = new WebSocket(assemblyUrl.toString(), {
    headers: {
      Authorization: ASSEMBLYAI_API_KEY,
    },
  });

  const pendingAudio = [];

  const forwardAudioChunk = (chunk) => {
    if (!chunk || chunk.length === 0) return;
    audioBatchBuffer = Buffer.concat([audioBatchBuffer, chunk]);
    if (audioBatchBuffer.length < minFrameBytes) {
      return;
    }
    assemblyWs.send(audioBatchBuffer);
    audioBatchBuffer = Buffer.alloc(0);
  };

  const flushPending = () => {
    while (pendingAudio.length && assemblyWs.readyState === WebSocket.OPEN) {
      const chunk = pendingAudio.shift();
      forwardAudioChunk(chunk);
    }
  };

  assemblyWs.on('open', () => {
    console.log('[WS Proxy] AssemblyAI upstream connected');
    flushPending();
  });

  assemblyWs.on('message', (data) => {
    if (clientWs.readyState !== WebSocket.OPEN) return;
    if (Buffer.isBuffer(data)) {
      clientWs.send(data.toString());
      return;
    }
    clientWs.send(data);
  });

  assemblyWs.on('close', (code, reason) => {
    console.warn(`[WS Proxy] AssemblyAI upstream closed (code=${code}, reason=${reason?.toString() || 'n/a'})`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code, reason?.toString());
    }
  });

  assemblyWs.on('error', (err) => {
    console.error('AssemblyAI WS error:', err);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({
        type: 'error',
        message: 'AssemblyAI streaming error',
      }));
    }
  });

  clientWs.on('message', (data, isBinary) => {
    if (isBinary && data?.length) {
      audioChunkCount += 1;
      if (audioChunkCount === 1 || audioChunkCount % audioLogEvery === 0) {
        console.log(`[WS Proxy] Audio chunk #${audioChunkCount} (${data.length} bytes)`);
      }
    }
    if (assemblyWs.readyState !== WebSocket.OPEN) {
      if (isBinary && data?.length) {
        pendingAudio.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
      }
      return;
    }

    if (!isBinary) {
      try {
        const payload = JSON.parse(data.toString());
        if (payload?.type === 'Terminate') {
          assemblyWs.send(JSON.stringify(payload));
          return;
        }

        // Ignore app-level control frames (heartbeat/speech_state/session_config).
        ignoredControlCount += 1;
        if (ignoredControlCount <= 3 || ignoredControlCount % 20 === 0) {
          console.log(`[WS Proxy] Ignored control frame type="${payload?.type || 'unknown'}"`);
        }
      } catch {
        // Ignore non-JSON control messages
      }
      return;
    }

    if (!data || data.length === 0) return;
    forwardAudioChunk(Buffer.isBuffer(data) ? data : Buffer.from(data));
  });

  clientWs.on('close', (code, reason) => {
    console.log(`[WS Proxy] Client closed (code=${code}, reason=${reason?.toString() || 'n/a'})`);
    if (assemblyWs.readyState === WebSocket.OPEN) {
      assemblyWs.send(JSON.stringify({ type: 'Terminate' }));
      assemblyWs.close();
    }
  });
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`AssemblyAI WebSocket proxy server running on 0.0.0.0:${PROXY_PORT}`);
});
