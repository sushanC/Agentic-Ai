import recorder from "node-record-lpcm16";
import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { finished } from "stream/promises";
import { VOICE_CONFIG } from "./voiceConfig.js";
import { VadDetector } from "./VadDetector.js";
import { whisperDaemonManager } from "./WhisperDaemon.js";

export function finishRecordingStream(stream) {
  const completion = finished(stream);
  stream.end();
  return completion;
}

export function classifyCapturedAudio(fileSize, minimumBytes, voiceActive) {
  if (fileSize <= minimumBytes) return "AUDIO_TOO_SHORT";
  if (!voiceActive) return "NO_SPEECH_DETECTED";
  return null;
}

/**
 * Initialize the Whisper Python daemon.
 * Public API wrapper preserving module contract.
 */
export function initSTT() {
  return whisperDaemonManager.init();
}

/**
 * Shutdown the Whisper Daemon.
 * Public API wrapper preserving module contract.
 */
export function shutdownSTT() {
  whisperDaemonManager.shutdown();
}

/**
 * Record audio from the microphone and transcribe it via Whisper.
 *
 * Uses VadDetector for real-time Voice Activity Detection and silence timeout detection.
 * Delegates transcription to WhisperDaemonManager.
 *
 * @param {object} [options]
 * @param {string} [options.language="en"] - ISO language code
 * @param {number} [options.silenceTimeout=1.2] - Duration of silence in seconds to auto-stop recording
 * @param {number} [options.maxRecordingTime=15] - Maximum recording duration limit in seconds
 * @param {number} [options.noiseTolerance=300] - Base RMS amplitude threshold for speech detection
 * @param {number} [options.noSpeechTimeout=5.0] - Timeout in seconds if no speech is detected at start
 * @param {string} [options.device="default"] - Microphone input device identifier
 * @param {number} [options.beamSize=5] - Whisper beam search size
 * @returns {Promise<{text: string, detected_language?: string, language_probability?: number, confidence?: number, duration?: number, error?: string}>}
 */
export async function listen(options = {}) {
  // Ensure the Whisper daemon is initialized and ready
  const ready = await initSTT();
  if (!ready) {
    throw Object.assign(
      new Error("Speech recognition is unavailable."),
      { code: "WHISPER_MODEL_UNAVAILABLE" },
    );
  }

  const {
    language = VOICE_CONFIG.STT.language,
    silenceTimeout = VOICE_CONFIG.STT.silenceTimeout,
    maxRecordingTime = VOICE_CONFIG.STT.maxRecordingTime,
    noiseTolerance = VOICE_CONFIG.STT.noiseTolerance,
    noSpeechTimeout = VOICE_CONFIG.STT.noSpeechTimeout,
    device = "default",
    beamSize = VOICE_CONFIG.STT.beamSize,
    signal,
    onCaptureStarted,
    isMuted = () => false
  } = options;

  if (signal?.aborted) return { text: "", aborted: true };

  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `samgpt-audio-${randomUUID()}.wav`);
    const fileStream = fs.createWriteStream(tempFile, { mode: 0o600 });

    const recOptions = {
      recorder: os.platform() === "linux" ? "arecord" : "sox",
      sampleRate: VOICE_CONFIG.STT.sampleRate,
      channels: VOICE_CONFIG.STT.channels,
      audioType: VOICE_CONFIG.STT.audioType,
      verbose: false
    };

    if (device && device !== "default") {
      recOptions.device = device;
    }

    console.log(`[STT] Starting recording (Device: ${device}, BeamSize: ${beamSize})...`);

    let recording;
    try {
      recording = recorder.record(recOptions);
      console.log("[STT] Recorder process started successfully.");
    } catch (err) {
      console.error("[STT] Failed to start recorder:", err);
      fs.unlink(tempFile, () => {});
      reject(err);
      return;
    }

    const recStream = recording.stream();
    const vad = new VadDetector({ noiseTolerance, silenceTimeout, noSpeechTimeout });
    let maxTimeTimeout = null;
    let finished = false;
    let isStopping = false;
    let abortHandler;
    let captureStarted = false;

    const cleanupAndResolve = (captureError = null) => {
      if (finished) return;
      finished = true;
      isStopping = true;

      console.log(`[STT] Stopping recording. Total duration: ${vad.totalDuration.toFixed(2)}s, Peak RMS: ${vad.maxRmsObserved.toFixed(1)}, VoiceActive: ${vad.voiceActive}`);

      if (maxTimeTimeout) {
        clearTimeout(maxTimeTimeout);
      }
      if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);

      try {
        if (recording.process) {
          recording.process.kill("SIGINT");
        } else {
          recording.stop();
        }
      } catch (e) {
        console.warn("[STT] Error stopping recorder process:", e.message);
      }

      // Wait for the Writable's finish callback: a fixed sleep cannot guarantee
      // that the final WAV bytes have reached disk before Whisper opens it.
      finishRecordingStream(fileStream).then(async () => {
        if (signal?.aborted) {
          fs.unlink(tempFile, () => {});
          resolve({ text: "", aborted: true });
          return;
        }

        if (captureError) {
          fs.unlink(tempFile, () => {});
          resolve({ text: "", code: "AUDIO_CAPTURE_FAILED", error: "AUDIO_CAPTURE_FAILED" });
          return;
        }

        if (!fs.existsSync(tempFile)) {
          resolve({ text: "", code: "AUDIO_CAPTURE_FAILED", error: "AUDIO_CAPTURE_FAILED" });
          return;
        }

        const stats = fs.statSync(tempFile);
        console.log(`[STT] Audio file saved: ${tempFile} (${stats.size} bytes)`);

        const captureCode = classifyCapturedAudio(
          stats.size,
          VOICE_CONFIG.STT.minValidAudioBytes,
          vad.voiceActive,
        );
        if (captureCode === "AUDIO_TOO_SHORT") {
          console.log("[STT VAD] Insufficient or empty audio recorded, skipping Whisper transcription.");
          fs.unlink(tempFile, () => {});
          resolve({ text: "", code: "AUDIO_TOO_SHORT", error: "AUDIO_TOO_SHORT", duration: 0.0 });
          return;
        }

        if (captureCode === "NO_SPEECH_DETECTED") {
          console.log("[STT VAD] No speech activity detected during session, skipping Whisper.");
          fs.unlink(tempFile, () => {});
          resolve({ text: "", code: "NO_SPEECH_DETECTED", error: "NO_SPEECH_DETECTED", duration: vad.totalDuration });
          return;
        }

        try {
          const result = await whisperDaemonManager.transcribe(tempFile, { language, beamSize });
          if (result.text) {
            console.log("[STT] Transcription completed", { characterCount: result.text?.length || 0, language: result.detected_language, processingSeconds: result.processing_duration });
          } else {
            console.log("[STT Transcription] No text transcribed or rejected by quality filter.");
          }

          fs.unlink(tempFile, (err) => {
            if (err) console.warn("[STT] Temp file cleanup warning:", err.message);
          });
          if (result.error) {
            const code = typeof result.code === "string" && /^[A-Z0-9_-]{1,64}$/.test(result.code)
              ? result.code
              : "TRANSCRIPTION_FAILED";
            resolve({ ...result, code, error: code });
          } else if (!result.text?.trim()) {
            resolve({ ...result, code: "TRANSCRIPTION_EMPTY", error: "TRANSCRIPTION_EMPTY" });
          } else {
            resolve(result);
          }
        } catch (err) {
          console.error("[STT] Whisper transcription failed:", err.message);
          fs.unlink(tempFile, () => {});
          resolve({ text: "", code: "TRANSCRIPTION_FAILED", error: "TRANSCRIPTION_FAILED" });
        }
      }).catch(() => {
        fs.unlink(tempFile, () => {});
        resolve({ text: "", code: "AUDIO_CAPTURE_FAILED", error: "AUDIO_CAPTURE_FAILED" });
      });
    };

    // Voice Activity Detection (VAD) audio stream handler
    recStream.on("data", (chunk) => {
      if (finished) return;
      if (!captureStarted && chunk?.length) {
        captureStarted = true;
        onCaptureStarted?.();
      }
      const isWaveHeader = vad.totalBytesStreamed === 0 &&
        chunk.length === VOICE_CONFIG.VAD.wavHeaderLength &&
        chunk.toString("utf-8", 0, 4) === VOICE_CONFIG.VAD.wavHeaderTag;
      const audioToStore = !isWaveHeader && isMuted()
        ? Buffer.alloc(chunk.length)
        : chunk;
      const vadInput = isWaveHeader || !isMuted() ? chunk : audioToStore;
      const vadResult = vad.processChunk(vadInput);
      if (!fileStream.write(audioToStore)) {
        recStream.pause();
        fileStream.once("drain", () => {
          if (!finished) recStream.resume();
        });
      }

      if (vadResult.isHeader) {
        console.log("[STT VAD] WAV header chunk received (44 bytes). Skipped from RMS calculation.");
        return;
      }

      if (vadResult.speechDetected) {
        console.log(`[STT VAD] Speech detected (RMS: ${vadResult.rms.toFixed(1)} > Threshold: ${vadResult.dynamicThreshold.toFixed(1)} at t=${vadResult.totalDuration.toFixed(2)}s)`);
      }

      if (vadResult.endOfSpeech) {
        console.log(`[STT VAD] End of speech detected (Silence: ${vadResult.silenceDuration.toFixed(2)}s >= ${silenceTimeout}s). Stopping recording.`);
        cleanupAndResolve();
        return;
      }

      if (vadResult.noSpeechTimeout) {
        console.log(`[STT VAD] No speech detected within ${noSpeechTimeout}s timeout. Stopping.`);
        cleanupAndResolve();
        return;
      }

      // Per-chunk diagnostic logging
      if (vadResult.count > 0 || vadResult.rms !== undefined) {
        console.log(`[VAD Chunk] RMS: ${vadResult.rms.toFixed(1)}, ambientFloor: ${vadResult.ambientFloor.toFixed(1)}, dynamicThreshold: ${vadResult.dynamicThreshold.toFixed(1)}, isSpeech: ${vadResult.isSpeech}, speechChunkCount: ${vadResult.speechChunkCount}, voiceActive: ${vadResult.voiceActive}, silenceDuration: ${vadResult.silenceDuration.toFixed(2)}s, totalDuration: ${vadResult.totalDuration.toFixed(2)}s`);
      }
    });

    recStream.on("end", () => {
      console.log("[STT] Recording stream ended naturally.");
      cleanupAndResolve();
    });

    recStream.on("error", (err) => {
      const errMsg = String(err || "");
      if (isStopping || errMsg.includes("SIGINT") || errMsg.includes("SIGTERM")) {
        console.log("[STT] Recorder stream closed (normal termination).");
      } else {
        console.error("[STT] Recorder stream error", { code: err?.code || "RECORDER_STREAM_ERROR" });
        cleanupAndResolve(err);
      }
    });

    fileStream.on("error", (err) => cleanupAndResolve(err));

    if (maxRecordingTime > 0) {
      maxTimeTimeout = setTimeout(() => {
        console.log(`[STT] Reached max recording limit of ${maxRecordingTime}s.`);
        cleanupAndResolve();
      }, maxRecordingTime * 1000);
    }

    abortHandler = () => cleanupAndResolve();
    signal?.addEventListener("abort", abortHandler, { once: true });
    if (signal?.aborted) abortHandler();
  });
}
