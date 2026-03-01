class PCM16WorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.chunkSize = 640; // 40ms at 16kHz
    this.buffer = new Float32Array(0);
    this.port.onmessage = (event) => {
      const message = event?.data || {};
      if (typeof message.chunkSize === 'number' && message.chunkSize > 0) {
        this.chunkSize = Math.max(320, Math.min(1600, Math.floor(message.chunkSize)));
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const channelData = input[0];
    if (!channelData || channelData.length === 0) {
      return true;
    }

    const merged = new Float32Array(this.buffer.length + channelData.length);
    merged.set(this.buffer, 0);
    merged.set(channelData, this.buffer.length);
    this.buffer = merged;

    while (this.buffer.length >= this.chunkSize) {
      const frame = this.buffer.slice(0, this.chunkSize);
      this.buffer = this.buffer.slice(this.chunkSize);

      let peak = 0;
      let sumSquares = 0;
      const int16 = new Int16Array(frame.length);
      for (let i = 0; i < frame.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, frame[i]));
        const abs = Math.abs(sample);
        if (abs > peak) peak = abs;
        sumSquares += sample * sample;
        int16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }
      const rms = Math.sqrt(sumSquares / frame.length);
      this.port.postMessage(
        {
          type: 'pcm_chunk',
          rms,
          peak,
          sampleRate: this.targetSampleRate,
          sampleCount: int16.length,
          pcm: int16.buffer,
        },
        [int16.buffer],
      );
    }

    return true;
  }
}

registerProcessor('pcm16-worklet-processor', PCM16WorkletProcessor);
