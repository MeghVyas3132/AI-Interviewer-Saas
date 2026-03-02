// WebSocket Proxy Server for AssemblyAI with server-side VAD endpointing.

require('dotenv').config();
const WebSocket = require('ws');
const http = require('http');

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const PROXY_PORT = Number(process.env.WS_PROXY_PORT || 9003);

const DEFAULT_SAMPLE_RATE = 16000;
const HEARTBEAT_INTERVAL_MS = 15000;
const HEARTBEAT_TIMEOUT_MS = 45000;
const CLIENT_INACTIVITY_CLOSE_MS = 90000;
const AUDIO_QUEUE_LIMIT = 60;
const BASELINE_ENERGY_THRESHOLD = Number(process.env.VAD_ENERGY_THRESHOLD || 0.0085);
const MIN_ASSEMBLY_CHUNK_MS = Number(process.env.MIN_ASSEMBLY_CHUNK_MS || 50);
const TARGET_ASSEMBLY_CHUNK_MS = Number(process.env.TARGET_ASSEMBLY_CHUNK_MS || 80);

if (!ASSEMBLYAI_API_KEY) {
  console.error('ERROR: ASSEMBLYAI_API_KEY environment variable is not set.');
  console.error('Set it in your environment before starting ws-proxy-server.js');
  process.exit(1);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeHintTerms(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const hints = [];
  for (const item of input) {
    const normalized = String(item || '').trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    hints.push(normalized);
    if (hints.length >= 100) break;
  }
  return hints;
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function applyPhraseHintCorrections(transcript, hintTerms) {
  if (!transcript || !hintTerms.length) return transcript;
  const words = transcript.split(/\s+/);
  const corrected = words.map((rawWord) => {
    const stripped = rawWord.replace(/[^a-zA-Z0-9+#.]/g, '').toLowerCase();
    if (!stripped || stripped.length < 4) return rawWord;

    let bestHint = '';
    let bestDistance = Infinity;
    for (const hint of hintTerms) {
      if (Math.abs(hint.length - stripped.length) > 2) continue;
      const distance = levenshteinDistance(stripped, hint);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestHint = hint;
      }
      if (bestDistance === 0) break;
    }

    if (!bestHint) return rawWord;
    const distanceRatio = bestDistance / Math.max(stripped.length, 1);
    if (bestDistance > 1 && distanceRatio > 0.24) return rawWord;

    if (/^[A-Z]/.test(rawWord)) {
      return bestHint.charAt(0).toUpperCase() + bestHint.slice(1);
    }
    return bestHint;
  });

  return corrected.join(' ');
}

function extractConfidence(message) {
  if (typeof message.confidence === 'number') {
    return clamp(message.confidence, 0, 1);
  }
  if (!Array.isArray(message.words)) {
    return null;
  }
  const confidences = message.words
    .map((word) => (typeof word?.confidence === 'number' ? word.confidence : null))
    .filter((value) => typeof value === 'number');
  if (confidences.length === 0) return null;
  const avg = confidences.reduce((acc, cur) => acc + cur, 0) / confidences.length;
  return clamp(avg, 0, 1);
}

function computeRmsFromPcm16(buffer) {
  if (!buffer || buffer.length < 2) return 0;
  const sampleCount = Math.floor(buffer.length / 2);
  if (sampleCount <= 0) return 0;
  let sumSquares = 0;
  for (let offset = 0; offset < sampleCount * 2; offset += 2) {
    const value = buffer.readInt16LE(offset) / 32768;
    sumSquares += value * value;
  }
  return Math.sqrt(sumSquares / sampleCount);
}

function wordCount(text) {
  const cleaned = String(text || '').trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

function adaptiveSilenceMs(emaWordsPerSecond) {
  if (!emaWordsPerSecond || !Number.isFinite(emaWordsPerSecond)) {
    return 1200;
  }
  const suggested = 1800 - (emaWordsPerSecond - 1.8) * 420;
  return Math.round(clamp(suggested, 600, 1800));
}

function shouldTreatAsSpeech(rms, threshold) {
  return rms >= threshold;
}

function sendJson(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (clientWs, req) => {
  const queryString = req.url && req.url.includes('?') ? req.url.split('?')[1] : '';
  const params = new URLSearchParams(queryString || '');
  const sampleRate = Number(params.get('sample_rate') || DEFAULT_SAMPLE_RATE) || DEFAULT_SAMPLE_RATE;

  console.log(`Client connected: ${req.socket.remoteAddress || 'unknown'} sample_rate=${sampleRate}`);

  const assemblyUrl = new URL('wss://streaming.assemblyai.com/v3/ws');
  assemblyUrl.searchParams.set('sample_rate', String(sampleRate));
  assemblyUrl.searchParams.set('encoding', 'pcm_s16le');
  assemblyUrl.searchParams.set('format_turns', 'true');
  assemblyUrl.searchParams.set('speech_model', 'universal-streaming-english');

  const assemblyWs = new WebSocket(assemblyUrl.toString(), {
    headers: {
      Authorization: ASSEMBLYAI_API_KEY,
    },
  });

  const state = {
    assemblyReady: false,
    beginReceived: false,
    phraseHints: [],
    audioQueue: [],
    pendingAssemblyAudio: Buffer.alloc(0),
    lastClientMessageAt: Date.now(),
    lastClientAudioAt: Date.now(),
    lastAssemblyMessageAt: Date.now(),
    lastVADUpdateSentAt: 0,
    vadState: 'idle',
    vadThreshold: BASELINE_ENERGY_THRESHOLD,
    speechStartAt: 0,
    silenceStartAt: 0,
    hasSpeechInCurrentTurn: false,
    hasSentFinalizeForTurn: false,
    wordsPerSecondEma: 2.1,
    lastFinalTurnAt: 0,
    pingTimer: null,
    watchdogTimer: null,
  };

  const pushVADUpdate = (extra = {}) => {
    const now = Date.now();
    if (now - state.lastVADUpdateSentAt < 120 && extra.force !== true) return;
    state.lastVADUpdateSentAt = now;
    sendJson(clientWs, {
      type: 'proxy_vad',
      state: state.vadState,
      adaptive_silence_ms: adaptiveSilenceMs(state.wordsPerSecondEma),
      threshold: Number(state.vadThreshold.toFixed(5)),
      timestamp_ms: now,
      ...extra,
    });
  };

  const setVADState = (nextState, extra = {}) => {
    if (state.vadState === nextState) return;
    state.vadState = nextState;
    pushVADUpdate({ ...extra, force: true });
  };

  const flushQueuedAudio = () => {
    if (!state.assemblyReady || assemblyWs.readyState !== WebSocket.OPEN) return;
    while (state.audioQueue.length > 0) {
      const chunk = state.audioQueue.shift();
      enqueueAudioForAssembly(chunk);
    }
    flushPendingAssemblyAudio(true);
  };

  const bytesPerMs = (sampleRate * 2) / 1000; // pcm_s16le mono => 2 bytes/sample
  const minAssemblyChunkBytes = Math.max(2, Math.floor(bytesPerMs * clamp(MIN_ASSEMBLY_CHUNK_MS, 50, 1000)));
  const targetAssemblyChunkBytes = Math.max(
    minAssemblyChunkBytes,
    Math.floor(bytesPerMs * clamp(TARGET_ASSEMBLY_CHUNK_MS, 50, 1000)),
  );

  const flushPendingAssemblyAudio = (force = false) => {
    if (!state.assemblyReady || assemblyWs.readyState !== WebSocket.OPEN) return;
    if (state.pendingAssemblyAudio.length === 0) return;
    if (!force && state.pendingAssemblyAudio.length < minAssemblyChunkBytes) return;

    while (state.pendingAssemblyAudio.length >= targetAssemblyChunkBytes) {
      const packet = state.pendingAssemblyAudio.subarray(0, targetAssemblyChunkBytes);
      assemblyWs.send(packet);
      state.pendingAssemblyAudio = state.pendingAssemblyAudio.subarray(targetAssemblyChunkBytes);
    }

    if (state.pendingAssemblyAudio.length >= minAssemblyChunkBytes) {
      assemblyWs.send(state.pendingAssemblyAudio);
      state.pendingAssemblyAudio = Buffer.alloc(0);
    }
  };

  const enqueueAudioForAssembly = (chunkBuffer) => {
    if (!chunkBuffer || chunkBuffer.length === 0) return;

    if (state.pendingAssemblyAudio.length === 0) {
      state.pendingAssemblyAudio = Buffer.from(chunkBuffer);
    } else {
      state.pendingAssemblyAudio = Buffer.concat([state.pendingAssemblyAudio, chunkBuffer]);
    }

    flushPendingAssemblyAudio(false);
  };

  const updateVADWithAudioChunk = (chunkBuffer) => {
    const now = Date.now();
    const rms = computeRmsFromPcm16(chunkBuffer);
    const speechNow = shouldTreatAsSpeech(rms, state.vadThreshold);

    state.lastClientAudioAt = now;

    if (speechNow) {
      state.hasSpeechInCurrentTurn = true;
      state.hasSentFinalizeForTurn = false;
      state.silenceStartAt = 0;
      if (!state.speechStartAt) {
        state.speechStartAt = now;
      }
      setVADState('speech', { rms: Number(rms.toFixed(5)) });
      return;
    }

    if (state.vadState === 'speech') {
      state.silenceStartAt = now;
      setVADState('silence_grace', { rms: Number(rms.toFixed(5)) });
      return;
    }

    if (state.vadState !== 'silence_grace') {
      return;
    }

    const silenceMs = state.silenceStartAt ? now - state.silenceStartAt : 0;
    const requiredSilenceMs = adaptiveSilenceMs(state.wordsPerSecondEma);

    if (
      silenceMs >= requiredSilenceMs &&
      state.hasSpeechInCurrentTurn &&
      !state.hasSentFinalizeForTurn
    ) {
      state.hasSentFinalizeForTurn = true;
      setVADState('finalize', {
        rms: Number(rms.toFixed(5)),
        silence_ms: silenceMs,
      });
      sendJson(clientWs, {
        type: 'proxy_endpoint',
        action: 'finalize',
        silence_ms: silenceMs,
        adaptive_silence_ms: requiredSilenceMs,
        timestamp_ms: now,
      });
      setVADState('idle', { force: true });
      state.speechStartAt = 0;
      state.silenceStartAt = 0;
      state.hasSpeechInCurrentTurn = false;
    }
  };

  const handleClientControlMessage = (message) => {
    if (!message || typeof message !== 'object') return false;

    const messageType = String(message.type || '').trim();
    if (!messageType) return false;

    if (messageType === 'heartbeat' || messageType === 'ping') {
      sendJson(clientWs, {
        type: 'heartbeat_ack',
        server_ts: Date.now(),
      });
      return true;
    }

    if (messageType === 'session_config') {
      state.phraseHints = normalizeHintTerms(message.phrase_hints);
      if (typeof message.energy_threshold === 'number') {
        state.vadThreshold = clamp(message.energy_threshold, 0.003, 0.04);
      }
      sendJson(clientWs, {
        type: 'session_config_ack',
        hint_count: state.phraseHints.length,
        threshold: state.vadThreshold,
      });
      return true;
    }

    if (messageType === 'speech_state') {
      const speechState = String(message.state || '').toLowerCase();
      if (speechState === 'paused') {
        setVADState('idle', { force: true });
      }
      return true;
    }

    if (messageType === 'terminate') {
      if (assemblyWs.readyState === WebSocket.OPEN) {
        sendJson(assemblyWs, { type: 'Terminate' });
      }
      return true;
    }

    return false;
  };

  clientWs.on('message', (rawData, isBinary) => {
    state.lastClientMessageAt = Date.now();

    if (!isBinary) {
      const asString = Buffer.isBuffer(rawData) ? rawData.toString('utf8') : String(rawData || '');
      const parsed = safeJsonParse(asString);
      if (parsed && handleClientControlMessage(parsed)) {
        return;
      }
      if (assemblyWs.readyState === WebSocket.OPEN) {
        assemblyWs.send(asString);
      }
      return;
    }

    const chunkBuffer = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);
    updateVADWithAudioChunk(chunkBuffer);

    if (state.assemblyReady && assemblyWs.readyState === WebSocket.OPEN) {
      enqueueAudioForAssembly(chunkBuffer);
    } else {
      state.audioQueue.push(chunkBuffer);
      if (state.audioQueue.length > AUDIO_QUEUE_LIMIT) {
        state.audioQueue.shift();
      }
    }
  });

  assemblyWs.on('open', () => {
    console.log('Connected to AssemblyAI realtime API');
  });

  assemblyWs.on('message', (rawData, isBinary) => {
    state.lastAssemblyMessageAt = Date.now();

    if (isBinary) {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(rawData, { binary: true });
      }
      return;
    }

    const text = Buffer.isBuffer(rawData) ? rawData.toString('utf8') : String(rawData || '');
    const parsed = safeJsonParse(text);
    if (!parsed) {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(text);
      }
      return;
    }

    if (parsed.type === 'Begin') {
      state.beginReceived = true;
      state.assemblyReady = true;
      flushQueuedAudio();
    }

    if (parsed.type === 'Turn') {
      const transcriptText = typeof parsed.transcript === 'string' ? parsed.transcript : '';
      if (transcriptText && state.phraseHints.length > 0) {
        parsed.transcript = applyPhraseHintCorrections(transcriptText, state.phraseHints);
      }
      const confidence = extractConfidence(parsed);
      const now = Date.now();
      if (parsed.end_of_turn === true) {
        const words = wordCount(transcriptText);
        if (words > 0) {
          const elapsedMs = state.lastFinalTurnAt > 0 ? Math.max(now - state.lastFinalTurnAt, 600) : 1600;
          const localWps = words / (elapsedMs / 1000);
          state.wordsPerSecondEma = state.wordsPerSecondEma * 0.7 + localWps * 0.3;
          state.lastFinalTurnAt = now;
        }
      }
      if (confidence !== null) {
        parsed.proxy_confidence = confidence;
      }
      if (typeof parsed.turn_order === 'number' && !parsed.segment_id) {
        parsed.segment_id = `turn-${parsed.turn_order}`;
      }
      parsed.proxy_received_at_ms = now;
    }

    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(parsed));
    }
  });

  const cleanup = () => {
    if (state.pingTimer) {
      clearInterval(state.pingTimer);
      state.pingTimer = null;
    }
    if (state.watchdogTimer) {
      clearInterval(state.watchdogTimer);
      state.watchdogTimer = null;
    }
    state.pendingAssemblyAudio = Buffer.alloc(0);
  };

  state.pingTimer = setInterval(() => {
    if (clientWs.readyState !== WebSocket.OPEN) return;
    sendJson(clientWs, {
      type: 'heartbeat',
      server_ts: Date.now(),
    });
  }, HEARTBEAT_INTERVAL_MS);

  state.watchdogTimer = setInterval(() => {
    const now = Date.now();
    if (now - state.lastClientMessageAt > CLIENT_INACTIVITY_CLOSE_MS) {
      console.warn('Closing stale client websocket due to inactivity.');
      clientWs.close(1001, 'client_inactive');
      return;
    }
    if (now - state.lastClientMessageAt > HEARTBEAT_TIMEOUT_MS) {
      sendJson(clientWs, {
        type: 'heartbeat_request',
        server_ts: now,
      });
    }
  }, 5000);

  clientWs.on('error', (error) => {
    console.error('Client WebSocket error:', error);
    cleanup();
    assemblyWs.close();
  });

  assemblyWs.on('error', (error) => {
    console.error('AssemblyAI WebSocket error:', error?.message || error);
    sendJson(clientWs, {
      type: 'error',
      message: `AssemblyAI connection error: ${error?.message || 'unknown'}`,
    });
    cleanup();
    clientWs.close();
  });

  clientWs.on('close', (code, reason) => {
    console.log(`Client disconnected: code=${code} reason=${reason || 'none'} begin_received=${state.beginReceived}`);
    cleanup();
    assemblyWs.close();
  });

  assemblyWs.on('close', (code, reason) => {
    console.log(`AssemblyAI disconnected: code=${code} reason=${reason || 'none'}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code || 1000, reason || 'assembly_closed');
    }
    cleanup();
  });
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`WebSocket proxy server running on 0.0.0.0:${PROXY_PORT}`);
});
