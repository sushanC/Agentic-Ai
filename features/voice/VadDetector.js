import { VOICE_CONFIG } from "./voiceConfig.js";

/**
 * VadDetector.js
 *
 * Isolated Voice Activity Detection (VAD) engine.
 * Processes 16-bit LE PCM audio chunks and manages speech detection state,
 * ambient noise floor calibration, threshold clamping, and silence timeouts.
 */
export class VadDetector {
  /**
   * @param {object} [options]
   * @param {number} [options.noiseTolerance] - Base RMS threshold for speech
   * @param {number} [options.silenceTimeout] - Silence duration (seconds) to end speech
   * @param {number} [options.noSpeechTimeout] - Initial no-speech timeout (seconds)
   */
  constructor(options = {}) {
    this.noiseTolerance = options.noiseTolerance ?? VOICE_CONFIG.STT.noiseTolerance;
    this.silenceTimeout = options.silenceTimeout ?? VOICE_CONFIG.STT.silenceTimeout;
    this.noSpeechTimeout = options.noSpeechTimeout ?? VOICE_CONFIG.STT.noSpeechTimeout;

    this.reset();
  }

  /**
   * Reset VAD detector state for a new recording session.
   */
  reset() {
    this.voiceActive = false;
    this.silenceDuration = 0;
    this.totalDuration = 0;
    this.totalBytesStreamed = 0;
    this.consecutiveSpeechChunks = 0;
    this.maxRmsObserved = 0;
    this.ambientNoiseSum = 0;
    this.ambientNoiseChunks = 0;
    this.ambientLocked = false;
    this.wavHeaderBuffer = Buffer.alloc(0);
    this.wavDataStarted = false;
  }

  /**
   * Process a single audio chunk emitted by the recording stream.
   *
   * @param {Buffer} chunk - Audio buffer chunk
   * @returns {object} Processing result containing metrics and event triggers
   */
  processChunk(chunk) {
    if (!chunk || !Buffer.isBuffer(chunk) || chunk.length === 0) {
      return { isHeader: false, isSpeech: false, speechDetected: false, endOfSpeech: false, noSpeechTimeout: false };
    }

    this.totalBytesStreamed += chunk.length;

    // Recorder streams can split RIFF headers across arbitrary chunks. Buffer
    // until the WAV data chunk is found so header bytes never look like speech.
    let pcmChunk = chunk;
    if (!this.wavDataStarted) {
      this.wavHeaderBuffer = Buffer.concat([this.wavHeaderBuffer, chunk]);
      const buffered = this.wavHeaderBuffer;
      if (buffered.length < 4) return this._headerResult();
      if (buffered.toString("ascii", 0, 4) !== VOICE_CONFIG.VAD.wavHeaderTag) {
        this.wavDataStarted = true;
        pcmChunk = buffered;
        this.wavHeaderBuffer = Buffer.alloc(0);
      } else {
        if (buffered.length < 12) return this._headerResult();
        let offset = 12;
        let dataOffset = -1;
        while (offset + 8 <= buffered.length) {
          const chunkId = buffered.toString("ascii", offset, offset + 4);
          const chunkSize = buffered.readUInt32LE(offset + 4);
          if (chunkId === "data") {
            dataOffset = offset + 8;
            break;
          }
          const nextOffset = offset + 8 + chunkSize + (chunkSize % 2);
          if (nextOffset > buffered.length) break;
          offset = nextOffset;
        }
        if (dataOffset < 0) return this._headerResult();
        this.wavDataStarted = true;
        pcmChunk = buffered.subarray(dataOffset);
        this.wavHeaderBuffer = Buffer.alloc(0);
        if (pcmChunk.length === 0) return this._headerResult();
      }
    }

    return this._processPcm(pcmChunk);
  }

  _headerResult() {
    return { isHeader: true, isSpeech: false, speechDetected: false, endOfSpeech: false, noSpeechTimeout: false };
  }

  _processPcm(chunk) {

    // 2. Compute 16-bit LE PCM RMS energy
    let sumSquares = 0;
    let count = 0;

    for (let i = 0; i < chunk.length; i += VOICE_CONFIG.VAD.bytesPerSample) {
      if (i + 1 < chunk.length) {
        const sample = chunk.readInt16LE(i);
        sumSquares += sample * sample;
        count++;
      }
    }

    if (count === 0) {
      return { isHeader: false, isSpeech: false, speechDetected: false, endOfSpeech: false, noSpeechTimeout: false };
    }

    const rms = Math.sqrt(sumSquares / count);
    if (rms > this.maxRmsObserved) {
      this.maxRmsObserved = rms;
    }

    const chunkDuration = chunk.length / VOICE_CONFIG.VAD.bytesPerSecond;
    this.totalDuration += chunkDuration;

    // 3. Freeze ambient noise learning as soon as speech or loud audio occurs
    if (rms >= this.noiseTolerance || this.voiceActive) {
      this.ambientLocked = true;
    }

    // 4. Calibrate ambient noise floor ONLY during initial quiet chunks
    if (!this.voiceActive && !this.ambientLocked && rms < this.noiseTolerance && this.ambientNoiseChunks < VOICE_CONFIG.VAD.maxAmbientChunks) {
      this.ambientNoiseSum += rms;
      this.ambientNoiseChunks++;
    }

    const ambientFloor = this.ambientNoiseChunks > 0 ? (this.ambientNoiseSum / this.ambientNoiseChunks) : 100;

    // 5. Compute clamped dynamic threshold strictly within configured bounds
    const rawThreshold = ambientFloor * VOICE_CONFIG.VAD.ambientMultiplier;
    const dynamicThreshold = Math.min(
      Math.max(this.noiseTolerance, rawThreshold),
      VOICE_CONFIG.VAD.maxDynamicThreshold
    );

    const isSpeech = rms > dynamicThreshold;
    let speechDetected = false;
    let endOfSpeech = false;
    let noSpeechTimeoutOccurred = false;

    if (isSpeech) {
      this.consecutiveSpeechChunks++;
      if (!this.voiceActive) {
        this.voiceActive = true;
        speechDetected = true;
      }
      this.silenceDuration = 0;
    } else {
      this.consecutiveSpeechChunks = 0;
      if (this.voiceActive) {
        this.silenceDuration += chunkDuration;
        if (this.silenceDuration >= this.silenceTimeout) {
          endOfSpeech = true;
        }
      } else {
        if (this.totalDuration >= this.noSpeechTimeout) {
          noSpeechTimeoutOccurred = true;
        }
      }
    }

    return {
      isHeader: false,
      rms,
      ambientFloor,
      dynamicThreshold,
      isSpeech,
      speechDetected,
      endOfSpeech,
      noSpeechTimeout: noSpeechTimeoutOccurred,
      speechChunkCount: this.consecutiveSpeechChunks,
      voiceActive: this.voiceActive,
      silenceDuration: this.silenceDuration,
      totalDuration: this.totalDuration
    };
  }
}
