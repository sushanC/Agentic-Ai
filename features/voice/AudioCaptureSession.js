import { VOICE_CONFIG } from "./voiceConfig.js";

function frameDurationMs(frame, options) {
  return frame.length / (options.sampleRate * options.channels * VOICE_CONFIG.VAD.bytesPerSample) * 1000;
}

export function pcmRms(pcm) {
  const count = Math.floor(pcm.length / VOICE_CONFIG.VAD.bytesPerSample);
  if (!count) return 0;
  let sumSquares = 0;
  for (let index = 0; index < count; index += 1) {
    const value = pcm.readInt16LE(index * VOICE_CONFIG.VAD.bytesPerSample);
    sumSquares += value * value;
  }
  return Math.sqrt(sumSquares / count);
}

export function buildPcmWav(pcm, options) {
  if (!Buffer.isBuffer(pcm) || pcm.length === 0 || pcm.length % 2 !== 0) {
    throw Object.assign(new Error("Captured PCM is empty or incomplete."), { code: "INVALID_AUDIO" });
  }
  const header = Buffer.alloc(44);
  const byteRate = options.sampleRate * options.channels * VOICE_CONFIG.VAD.bytesPerSample;
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(options.channels, 22);
  header.writeUInt32LE(options.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(options.channels * VOICE_CONFIG.VAD.bytesPerSample, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Bounded utterance buffer with circular pre-roll and explicit fallback mode. */
export class AudioCaptureSession {
  constructor({ vad, decoder, options, fallbackReason = null }) {
    this.vad = vad;
    this.decoder = decoder;
    this.options = options;
    this.fallbackReason = fallbackReason;
    this.fallback = Boolean(fallbackReason);
    this.started = false;
    this.done = false;
    this.cancelled = false;
    this.elapsedMs = 0;
    this.capturedMs = 0;
    this.speechStartMs = null;
    this.endSilenceMs = 0;
    this.completionReason = null;
    this.hadShortSpeechCandidate = false;
    this.preRoll = [];
    this.preRollMs = 0;
    this.capturedFrames = [];
  }

  processChunk(chunk) {
    if (this.done || this.cancelled) return this._result([]);
    const frames = this.fallback
      ? this.decoder.push(chunk).map(pcm => ({ pcm, durationMs: frameDurationMs(pcm, this.options) }))
      : this.vad.processChunk(chunk).frames;
    this._acceptFrames(frames);
    return this._result(frames);
  }

  flush() {
    if (this.done || this.cancelled) return this._result([]);
    const frames = this.fallback
      ? this.decoder.flush().map(pcm => ({ pcm, durationMs: frameDurationMs(pcm, this.options) }))
      : this.vad.flush().frames;
    this._acceptFrames(frames);
    return this._result(frames);
  }

  cancel() {
    this.cancelled = true;
    this.done = true;
    this.completionReason = "CANCELLED";
    this.preRoll.length = 0;
    this.capturedFrames.length = 0;
    this.capturedMs = 0;
  }

  _acceptFrames(frames) {
    for (const frame of frames) {
      if (this.done || this.cancelled) break;
      const pcm = frame.pcm;
      const durationMs = frame.durationMs ?? frameDurationMs(pcm, this.options);
      this.elapsedMs += durationMs;
      this.hadShortSpeechCandidate ||= Boolean(frame.hadShortSpeechCandidate);

      if (this.fallback) {
        this._appendCaptured(pcm, durationMs);
        if (this.elapsedMs >= Math.min(this.options.vadFallbackCaptureMs, this.options.maxRecordingTime * 1000)) {
          this._finish("VAD_FALLBACK_DURATION");
        }
      } else {
        if (!this.started) {
          this._appendPreRoll(pcm, durationMs);
          if (frame.speechStarted) {
            this.started = true;
            this.speechStartMs = this.vad.speechStartMs;
            this.capturedFrames = this.preRoll.map(item => item.pcm);
            this.capturedMs = this.preRollMs;
            this.preRoll.length = 0;
            this.preRollMs = 0;
          }
          if (frame.noSpeechTimeout) {
            this._finish(this.hadShortSpeechCandidate ? "SHORT_SPEECH" : "NO_SPEECH");
          }
        } else {
          this._appendCaptured(pcm, durationMs);
          if (frame.endOfSpeech) {
            this.endSilenceMs = this.vad.silenceDuration;
            this._finish("ENDPOINT_SILENCE");
          }
        }
      }

      if (this.elapsedMs >= this.options.maxRecordingTime * 1000) {
        this._finish("MAX_RECORDING_DURATION");
      }
    }
  }

  _appendPreRoll(pcm, durationMs) {
    if (this.options.preRollMs <= 0) return;
    this.preRoll.push({ pcm, durationMs });
    this.preRollMs += durationMs;
    while (this.preRoll.length > 1 && this.preRollMs > this.options.preRollMs) {
      this.preRollMs -= this.preRoll.shift().durationMs;
    }
  }

  _appendCaptured(pcm, durationMs) {
    if (this.capturedMs + durationMs > this.options.maxRecordingTime * 1000) {
      const remainingMs = this.options.maxRecordingTime * 1000 - this.capturedMs;
      const maxBytes = Math.floor(remainingMs * this.options.sampleRate * this.options.channels * 2 / 1000) & ~1;
      if (maxBytes > 0) {
        const limited = pcm.subarray(0, maxBytes);
        this.capturedFrames.push(limited);
        this.capturedMs += frameDurationMs(limited, this.options);
      }
      return;
    }
    this.capturedFrames.push(pcm);
    this.capturedMs += durationMs;
  }

  _finish(reason) {
    this.done = true;
    this.completionReason = reason;
  }

  getPcm() {
    return Buffer.concat(this.capturedFrames);
  }

  getMetrics() {
    return Object.freeze({
      fallback: this.fallback,
      fallbackReason: this.fallbackReason,
      speechStartMs: this.speechStartMs,
      speechDetectionLatencyMs: this.vad?.speechDetectionLatencyMs ?? null,
      endpointSilenceMs: this.endSilenceMs,
      totalCaptureMs: this.elapsedMs,
      capturedAudioMs: this.capturedMs,
      completionReason: this.completionReason,
      canceled: this.cancelled,
    });
  }

  _result(frames) {
    return {
      frames,
      done: this.done,
      reason: this.completionReason,
      speechStarted: this.started,
      fallback: this.fallback,
      metrics: this.getMetrics(),
    };
  }
}
