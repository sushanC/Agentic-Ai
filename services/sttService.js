import recorder from "node-record-lpcm16";
import fs from "fs";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.resolve(__dirname, "..", "speech_to_text.py");
const pythonPath = path.resolve(__dirname, "..", "venv", "bin", "python");

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
    
    // Spawn speech_to_text.py in daemon mode (no arguments)
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

      // Handle JSON output from the daemon
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
 * @param {number} options.silenceThreshold - amplitude threshold for silence detection
 * @param {string} options.device - input device identifier
 * @returns {Promise<{text: string, detected_language?: string, language_probability?: number, error?: string}>}
 */
export async function listen(options = {}) {
  // Ensure the Whisper model is loaded and daemon is ready
  await initSTT();

  const {
    language = "en",
    silenceTimeout = 2,
    maxRecordingTime = 15,
    silenceThreshold = 0.3,
    device = null
  } = options;

  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `samgpt-audio-${randomUUID()}.wav`);
    const fileStream = fs.createWriteStream(tempFile);


const recOptions = {
  recorder: os.platform() === "linux" ? "arecord" : "sox",
  sampleRate: 16000,
  threshold: silenceThreshold,
  silence: silenceTimeout.toString(),
  verbose: false
};

    if (device && device !== "default") {
      recOptions.device = device;
    }

    console.log(`[STT] Starting recording to ${tempFile}...`);

    let recording;
    try {
      recording = recorder.record(recOptions);
      console.log("[STT] Recorder started");
    } catch (err) {
      console.error("[STT] Failed to start recorder:", err);
      fs.unlink(tempFile, () => {});
      reject(err);
      return;
    }

    const recStream = recording.stream();
    console.log("[STT] Stream created");
    recStream.pipe(fileStream);

    let maxTimeTimeout = null;
    let finished = false;

    const cleanupAndResolve = () => {
      if (finished) return;
      finished = true;

      console.log("[STT] Stopping recording and preparing transcription...");

      if (maxTimeTimeout) {
        clearTimeout(maxTimeTimeout);
      }

      try {
        recording.stop();
      } catch (e) {
        console.warn("[STT] Error stopping recorder:", e);
      }

      fileStream.end();

      // Give a tiny buffer for file handles to close, then send to Whisper Daemon
      setTimeout(() => {
        if (!fs.existsSync(tempFile)) {
          resolve({ text: "", error: "Audio file not created" });
          return;
        }

        if (!whisperDaemon) {
          console.error("[STT] Whisper daemon died before transcription.");
          fs.unlink(tempFile, () => {});
          resolve({ text: "", error: "Whisper daemon not running" });
          return;
        }

        currentResolve = (res) => {
          // Delete temp audio file automatically
          fs.unlink(tempFile, (err) => {
            if (err) console.warn("[STT] Temp file unlink failed:", err.message);
          });
          resolve(res);
        };

        const config = { audio_file: tempFile, language };
        whisperDaemon.stdin.write(JSON.stringify(config) + "\n");
      }, 200);
    };

    // Auto stop when node-record-lpcm16 stream ends (detects silence based on config)
    recStream.on("end", () => {
      console.log("[STT] Recording stream end event.");
      cleanupAndResolve();
    });

    recStream.on("error", (err) => {
      console.error("[STT] Record stream error:", err);
      cleanupAndResolve();
    });

    // Enforce max recording time limit
    if (maxRecordingTime > 0) {
      maxTimeTimeout = setTimeout(() => {
        console.log("[STT] Max recording time limit reached.");
        cleanupAndResolve();
      }, maxRecordingTime * 1000);
    }
  });
}