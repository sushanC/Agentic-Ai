import recorder from "node-record-lpcm16";
import fs from "fs";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.resolve(__dirname, "..", "..", "speech_to_text.py");
const pythonPath = path.resolve(__dirname, "..", "..", "venv", "bin", "python");

let whisperDaemon = null;
let currentResolve = null;
let daemonInitPromise = null;

/**
 * Initialize the Whisper Python daemon.
 */
export function initSTT() {
  if (whisperDaemon) return daemonInitPromise;

  daemonInitPromise = new Promise((resolve) => {
    console.log("[STT] Starting Whisper Daemon...");
    
    whisperDaemon = spawn(pythonPath, [scriptPath], {
      cwd: path.dirname(scriptPath)
    });

    whisperDaemon.stdout.on("data", (data) => {
      const raw = data.toString().trim();
      if (raw === "READY") {
        console.log("[STT] Whisper Daemon loaded and READY.");
        resolve(true);
        return;
      }

      try {
        const parsed = JSON.parse(raw);
        if (currentResolve) {
          currentResolve(parsed);
          currentResolve = null;
        }
      } catch (e) {
        console.error("[STT] Error parsing Whisper output:", raw, e);
        if (currentResolve) {
          currentResolve({ text: "", error: raw });
          currentResolve = null;
        }
      }
    });

    whisperDaemon.stderr.on("data", (data) => {
      const msg = data.toString().trim();
      console.warn("[STT Daemon Debug/Error]:", msg);
    });

    whisperDaemon.on("close", (code) => {
      console.log(`[STT] Whisper Daemon process exited with code ${code}`);
      whisperDaemon = null;
      daemonInitPromise = null;
    });

    whisperDaemon.on("error", (err) => {
      console.error("[STT] Whisper Daemon process error:", err);
      whisperDaemon = null;
      daemonInitPromise = null;
      resolve(false);
    });
  });

  return daemonInitPromise;
}

/**
 * Shutdown the Whisper Daemon.
 */
export function shutdownSTT() {
  if (whisperDaemon) {
    whisperDaemon.stdin.end();
    whisperDaemon.kill("SIGTERM");
    whisperDaemon = null;
    daemonInitPromise = null;
    console.log("[STT] Whisper Daemon terminated.");
  }
}

/**
 * Record audio and transcribe it.
 * @param {object} options
 * @param {string} options.language - "en", "auto", or other ISO code
 * @param {number} options.silenceTimeout - duration of silence in seconds to trigger auto stop
 * @param {number} options.maxRecordingTime - max duration of recording in seconds
 * @param {number} options.noiseTolerance - amplitude RMS threshold for speech detection
 * @param {number} options.noSpeechTimeout - duration of silence before speech start to timeout
 * @param {string} options.device - input device identifier
 * @param {number} options.beamSize - Whisper beam search size (default 5 for accuracy)
 * @returns {Promise<{text: string, detected_language?: string, language_probability?: number, confidence?: number, duration?: number, error?: string}>}
 */
export async function listen(options = {}) {
  // Ensure the Whisper model is loaded and daemon is ready
  await initSTT();

  const {
    language = "en",
    silenceTimeout = 1.2,
    maxRecordingTime = 15,
    noiseTolerance = 300,
    noSpeechTimeout = 5.0,
    device = "default",
    beamSize = 5
  } = options;

  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `samgpt-audio-${randomUUID()}.wav`);
    const fileStream = fs.createWriteStream(tempFile);

    const recOptions = {
      recorder: os.platform() === "linux" ? "arecord" : "sox",
      sampleRate: 16000,
      channels: 1,
      audioType: "wav",
      verbose: false
    };

    if (device && device !== "default") {
      recOptions.device = device;
    }

    console.log(`[STT] Starting recording to ${tempFile} (Device: ${device}, BeamSize: ${beamSize})...`);

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
    recStream.pipe(fileStream);

    let maxTimeTimeout = null;
    let finished = false;
    let isStopping = false;
    let voiceActive = false;
    let silenceDuration = 0;
    let totalDuration = 0;
    let totalBytesStreamed = 0;
    let consecutiveSpeechChunks = 0;
    let maxRmsObserved = 0;
    let ambientNoiseSum = 0;
    let ambientNoiseChunks = 0;
    let ambientLocked = false;

    const cleanupAndResolve = () => {
      if (finished) return;
      finished = true;
      isStopping = true;

      console.log(`[STT] Stopping recording. Total duration: ${totalDuration.toFixed(2)}s, Peak RMS: ${maxRmsObserved.toFixed(1)}, VoiceActive: ${voiceActive}`);

      if (maxTimeTimeout) {
        clearTimeout(maxTimeTimeout);
      }

      try {
        if (recording.process) {
          recording.process.kill("SIGINT");
        } else {
          recording.stop();
        }
      } catch (e) {
        console.warn("[STT] Error stopping recorder process:", e.message);
      }

      fileStream.end();

      setTimeout(() => {
        if (!fs.existsSync(tempFile)) {
          resolve({ text: "", error: "Audio file not created" });
          return;
        }

        const stats = fs.statSync(tempFile);
        console.log(`[STT] Audio file saved: ${tempFile} (${stats.size} bytes)`);

        if (stats.size <= 44 + 4000) {
          console.log("[STT VAD] Insufficient or empty audio recorded, skipping Whisper transcription.");
          fs.unlink(tempFile, () => {});
          resolve({ text: "", confidence: 1.0, duration: 0.0 });
          return;
        }

        if (!voiceActive) {
          console.log("[STT VAD] No speech activity detected during session, skipping Whisper.");
          fs.unlink(tempFile, () => {});
          resolve({ text: "", confidence: 1.0, duration: 0.0 });
          return;
        }

        if (!whisperDaemon) {
          console.error("[STT] Whisper daemon is not running.");
          fs.unlink(tempFile, () => {});
          resolve({ text: "", error: "Whisper daemon not running" });
          return;
        }

        currentResolve = (res) => {
          if (res.text) {
            console.log(`[STT Transcription Success] "${res.text}" (Lang: ${res.detected_language}, Prob: ${res.language_probability?.toFixed(2)}, Conf: ${res.confidence?.toFixed(2)}, Processing: ${res.processing_duration?.toFixed(2)}s)`);
          } else {
            console.log("[STT Transcription] No text transcribed or rejected by quality filter.");
          }

          fs.unlink(tempFile, (err) => {
            if (err) console.warn("[STT] Temp file cleanup warning:", err.message);
          });
          resolve(res);
        };

        const config = { 
          audio_file: tempFile, 
          language, 
          beam_size: beamSize 
        };
        
        console.log(`[STT] Sending file to Whisper Daemon (BeamSize: ${beamSize}, Lang: ${language})...`);
        whisperDaemon.stdin.write(JSON.stringify(config) + "\n");
      }, 80);
    };

    // Voice Activity Detection (VAD) with WAV header handling, noise locking & per-chunk logging
    recStream.on("data", (chunk) => {
      // Check if this initial chunk is the 44-byte RIFF header emitted by node-record-lpcm16
      if (totalBytesStreamed === 0 && chunk.length === 44 && chunk.toString("utf-8", 0, 4) === "RIFF") {
        totalBytesStreamed += 44;
        console.log("[STT VAD] WAV header chunk received (44 bytes). Skipped from RMS calculation.");
        return;
      }
      totalBytesStreamed += chunk.length;

      let sumSquares = 0;
      let count = 0;

      for (let i = 0; i < chunk.length; i += 2) {
        if (i + 1 < chunk.length) {
          const sample = chunk.readInt16LE(i);
          sumSquares += sample * sample;
          count++;
        }
      }

      if (count > 0) {
        const rms = Math.sqrt(sumSquares / count);
        if (rms > maxRmsObserved) {
          maxRmsObserved = rms;
        }

        const chunkDuration = chunk.length / 32000;
        totalDuration += chunkDuration;

        // Freeze ambient noise learning immediately if speech or loud audio (RMS >= noiseTolerance) is detected
        if (rms >= noiseTolerance || voiceActive) {
          ambientLocked = true;
        }

        // Accumulate ambient noise floor ONLY during initial quiet silence before speech
        if (!voiceActive && !ambientLocked && rms < noiseTolerance && ambientNoiseChunks < 10) {
          ambientNoiseSum += rms;
          ambientNoiseChunks++;
        }

        const ambientFloor = ambientNoiseChunks > 0 ? (ambientNoiseSum / ambientNoiseChunks) : 100;
        // Clamp adaptive threshold to safe production range [noiseTolerance (300), 600]
        const dynamicThreshold = Math.min(Math.max(noiseTolerance, ambientFloor * 1.5), 600);

        const isSpeech = rms > dynamicThreshold;

        if (isSpeech) {
          consecutiveSpeechChunks++;
          if (!voiceActive) {
            console.log(`[STT VAD] Speech detected (RMS: ${rms.toFixed(1)} > Threshold: ${dynamicThreshold.toFixed(1)} at t=${totalDuration.toFixed(2)}s)`);
            voiceActive = true;
          }
          silenceDuration = 0;
        } else {
          consecutiveSpeechChunks = 0;
          if (voiceActive) {
            silenceDuration += chunkDuration;
            if (silenceDuration >= silenceTimeout) {
              console.log(`[STT VAD] End of speech detected (Silence: ${silenceDuration.toFixed(2)}s >= ${silenceTimeout}s). Stopping recording.`);
              cleanupAndResolve();
            }
          } else {
            if (totalDuration >= noSpeechTimeout) {
              console.log(`[STT VAD] No speech detected within ${noSpeechTimeout}s timeout. Stopping.`);
              cleanupAndResolve();
            }
          }
        }

        // Per-chunk diagnostic logging
        console.log(`[VAD Chunk] RMS: ${rms.toFixed(1)}, ambientFloor: ${ambientFloor.toFixed(1)}, dynamicThreshold: ${dynamicThreshold.toFixed(1)}, isSpeech: ${isSpeech}, speechChunkCount: ${consecutiveSpeechChunks}, voiceActive: ${voiceActive}, silenceDuration: ${silenceDuration.toFixed(2)}s, totalDuration: ${totalDuration.toFixed(2)}s`);
      }
    });

    recStream.on("end", () => {
      console.log("[STT] Recording stream ended naturally.");
      cleanupAndResolve();
    });

    recStream.on("error", (err) => {
      const errMsg = String(err || "");
      if (isStopping || errMsg.includes("exited with error code") || errMsg.includes("SIGINT") || errMsg.includes("SIGTERM")) {
        console.log("[STT] Recorder stream closed (normal termination).");
      } else {
        console.error("[STT] Recorder stream error:", err);
      }
      cleanupAndResolve();
    });

    if (maxRecordingTime > 0) {
      maxTimeTimeout = setTimeout(() => {
        console.log(`[STT] Reached max recording limit of ${maxRecordingTime}s.`);
        cleanupAndResolve();
      }, maxRecordingTime * 1000);
    }
  });
}
