import { VOICE_CONFIG, resolveSTTOptions } from "./voiceConfig.js";

/** Decode arbitrary recorder chunks into fixed duration, mono S16_LE PCM frames. */
export class PcmFrameDecoder {
  constructor(options = {}) {
    this.options = resolveSTTOptions(options);
    this.frameBytes = Math.round(
      this.options.sampleRate * this.options.channels * VOICE_CONFIG.VAD.bytesPerSample *
      this.options.frameDurationMs / 1000,
    );
    this.headerBuffer = Buffer.alloc(0);
    this.pcmBuffer = Buffer.alloc(0);
    this.inputFormatKnown = false;
    this.wav = false;
    this.wavDataFound = false;
    this.formatChunkFound = false;
  }

  push(input) {
    if (!Buffer.isBuffer(input) || input.length === 0) return [];
    let pcm = input;
    if (!this.inputFormatKnown) {
      this.headerBuffer = Buffer.concat([this.headerBuffer, input]);
      if (this.headerBuffer.length < 4) return [];
      this.wav = this.headerBuffer.toString("ascii", 0, 4) === VOICE_CONFIG.VAD.wavHeaderTag;
      if (!this.wav) {
        this.inputFormatKnown = true;
        pcm = this.headerBuffer;
        this.headerBuffer = Buffer.alloc(0);
      } else {
        pcm = this._extractWaveData();
        if (pcm === null) return [];
      }
    }

    if (this.wav && !this.wavDataFound) {
      this.headerBuffer = Buffer.concat([this.headerBuffer, pcm]);
      pcm = this._extractWaveData();
      if (pcm === null) return [];
    }
    return this._extractFrames(pcm);
  }

  _extractWaveData() {
    const data = this.headerBuffer;
    if (data.length < 12) return null;
    if (data.toString("ascii", 8, 12) !== "WAVE") {
      throw Object.assign(new Error("Unsupported WAV container."), { code: "INVALID_AUDIO_WAV" });
    }

    let offset = 12;
    let fmt = this.formatChunkFound;
    while (offset + 8 <= data.length) {
      const id = data.toString("ascii", offset, offset + 4);
      const size = data.readUInt32LE(offset + 4);
      const payload = offset + 8;
      if (id === "data") {
        if (!fmt) throw Object.assign(new Error("WAV data chunk precedes its format chunk."), { code: "INVALID_AUDIO_WAV" });
        this.wavDataFound = true;
        this.inputFormatKnown = true;
        const pcm = data.subarray(payload);
        this.headerBuffer = Buffer.alloc(0);
        return pcm;
      }
      if (size > VOICE_CONFIG.VAD.maxHeaderBytes || payload + size > data.length) break;
      if (id === "fmt ") {
        if (size < 16) throw Object.assign(new Error("Invalid WAV format chunk."), { code: "INVALID_AUDIO_WAV" });
        const format = data.readUInt16LE(payload);
        const channels = data.readUInt16LE(payload + 2);
        const sampleRate = data.readUInt32LE(payload + 4);
        const bitsPerSample = data.readUInt16LE(payload + 14);
        if (format !== 1 || channels !== this.options.channels || sampleRate !== this.options.sampleRate || bitsPerSample !== 16) {
          throw Object.assign(new Error("WAV audio format does not match the configured PCM input."), { code: "INVALID_AUDIO_FORMAT" });
        }
        fmt = true;
        this.formatChunkFound = true;
      }
      offset = payload + size + (size % 2);
      if (offset > VOICE_CONFIG.VAD.maxHeaderBytes) {
        throw Object.assign(new Error("WAV header exceeds supported size."), { code: "INVALID_AUDIO_WAV" });
      }
    }
    if (data.length === VOICE_CONFIG.VAD.maxHeaderBytes) {
      throw Object.assign(new Error("WAV data chunk was not found."), { code: "INVALID_AUDIO_WAV" });
    }
    return null;
  }

  _extractFrames(pcm) {
    if (!pcm?.length) return [];
    this.pcmBuffer = Buffer.concat([this.pcmBuffer, pcm]);
    const frames = [];
    while (this.pcmBuffer.length >= this.frameBytes) {
      frames.push(this.pcmBuffer.subarray(0, this.frameBytes));
      this.pcmBuffer = this.pcmBuffer.subarray(this.frameBytes);
    }
    return frames;
  }

  flush() {
    if (!this.inputFormatKnown) {
      throw Object.assign(new Error("Audio ended before a valid WAV or PCM stream was available."), { code: "INVALID_AUDIO" });
    }
    if (this.pcmBuffer.length % VOICE_CONFIG.VAD.bytesPerSample !== 0) {
      throw Object.assign(new Error("Audio ended on an incomplete PCM sample."), { code: "INVALID_AUDIO" });
    }
    if (this.pcmBuffer.length === 0) return [];
    const remainder = this.pcmBuffer;
    this.pcmBuffer = Buffer.alloc(0);
    return [remainder];
  }
}

/** Frame-energy VAD with adaptive noise floor, start/continue hysteresis and endpointing. */
export class VadDetector {
  constructor(options = {}) {
    this.options = resolveSTTOptions(options);
    this.decoder = new PcmFrameDecoder(this.options);
    this.reset();
  }

  reset() {
    this.voiceActive = false;
    this.silenceDuration = 0;
    this.totalDuration = 0;
    this.speechDuration = 0;
    this.speechStartMs = null;
    this.speechDetectionLatencyMs = null;
    this.speechEndMs = null;
    this.maxRmsObserved = 0;
    this.noiseFrames = [];
    this.candidateSpeechMs = 0;
    this.hadShortSpeechCandidate = false;
    this.framesProcessed = 0;
  }

  processChunk(chunk) {
    const frames = this.decoder.push(chunk).map(frame => this._processFrame(frame));
    return this._summarize(frames);
  }

  flush() {
    const frames = this.decoder.flush().map(frame => this._processFrame(frame));
    return this._summarize(frames);
  }

  _processFrame(pcm) {
    const sampleCount = Math.floor(pcm.length / VOICE_CONFIG.VAD.bytesPerSample);
    if (!sampleCount) return { pcm, rms: 0, durationMs: 0, speech: false };
    let sumSquares = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      const sample = pcm.readInt16LE(index * VOICE_CONFIG.VAD.bytesPerSample);
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / sampleCount);
    const durationMs = pcm.length / (this.options.sampleRate * this.options.channels * VOICE_CONFIG.VAD.bytesPerSample) * 1000;
    const beforeMs = this.totalDuration;
    this.totalDuration += durationMs;
    this.framesProcessed += 1;
    this.maxRmsObserved = Math.max(this.maxRmsObserved, rms);

    const noiseFloor = this._noiseFloor();
    const startThreshold = Math.min(
      VOICE_CONFIG.VAD.maxDynamicThreshold,
      Math.max(this.options.noiseTolerance, noiseFloor * this.options.noiseMultiplier),
    );
    const calibration = beforeMs < this.options.noiseCalibrationMs;
    const strongDuringCalibration = rms >= this.options.noiseTolerance * 4;
    const isSpeech = rms >= startThreshold && (!calibration || strongDuringCalibration);
    let speechStarted = false;
    let endOfSpeech = false;

    if (!this.voiceActive) {
      if (isSpeech) {
        this.candidateSpeechMs += durationMs;
        if (this.candidateSpeechMs >= this.options.minimumSpeechMs) {
          this.voiceActive = true;
          this.speechDuration = this.candidateSpeechMs;
          this.speechStartMs = Math.max(0, this.totalDuration - this.candidateSpeechMs);
          this.speechDetectionLatencyMs = this.totalDuration - this.speechStartMs;
          speechStarted = true;
          this.silenceDuration = 0;
        }
      } else {
        if (this.candidateSpeechMs > 0) this.hadShortSpeechCandidate = true;
        this.candidateSpeechMs = 0;
        this._rememberNoise(rms);
      }
    } else {
      const continuationThreshold = Math.max(
        this.options.noiseTolerance * this.options.continuationThresholdRatio,
        startThreshold * this.options.continuationThresholdRatio,
      );
      if (rms >= continuationThreshold) {
        this.speechDuration += durationMs;
        this.silenceDuration = 0;
      } else {
        this.silenceDuration += durationMs;
        if (this.silenceDuration >= this.options.silenceTimeout * 1000) {
          endOfSpeech = true;
          this.speechEndMs = this.totalDuration - this.silenceDuration;
          this.voiceActive = false;
        }
      }
    }

    return {
      pcm,
      rms,
      durationMs,
      isSpeech,
      speechStarted,
      voiceActive: this.voiceActive,
      endOfSpeech,
      noSpeechTimeout: !this.voiceActive && this.totalDuration >= this.options.noSpeechTimeout * 1000,
      silenceDuration: this.silenceDuration,
      totalDuration: this.totalDuration,
      speechDuration: this.speechDuration,
      noiseFloor,
      startThreshold,
      hadShortSpeechCandidate: this.hadShortSpeechCandidate,
    };
  }

  _noiseFloor() {
    if (!this.noiseFrames.length) return 0;
    const sorted = [...this.noiseFrames].sort((left, right) => left - right);
    return sorted[Math.floor(sorted.length / 2)];
  }

  _rememberNoise(rms) {
    this.noiseFrames.push(rms);
    if (this.noiseFrames.length > VOICE_CONFIG.VAD.maxAmbientFrames) this.noiseFrames.shift();
  }

  _summarize(frames) {
    const last = frames.at(-1) || {};
    return {
      frames,
      count: frames.length,
      isHeader: !frames.length && !this.decoder.inputFormatKnown,
      speechDetected: frames.some(frame => frame.speechStarted),
      speechStarted: frames.some(frame => frame.speechStarted),
      endOfSpeech: frames.some(frame => frame.endOfSpeech),
      noSpeechTimeout: frames.some(frame => frame.noSpeechTimeout),
      isSpeech: Boolean(last.isSpeech),
      voiceActive: this.voiceActive,
      rms: last.rms,
      maxRmsObserved: this.maxRmsObserved,
      totalDuration: this.totalDuration / 1000,
      silenceDuration: this.silenceDuration / 1000,
      speechDuration: this.speechDuration / 1000,
      speechStartMs: this.speechStartMs,
      speechDetectionLatencyMs: this.speechDetectionLatencyMs,
      ambientFloor: last.noiseFloor || this._noiseFloor(),
      dynamicThreshold: last.startThreshold,
      hadShortSpeechCandidate: this.hadShortSpeechCandidate,
    };
  }
}
