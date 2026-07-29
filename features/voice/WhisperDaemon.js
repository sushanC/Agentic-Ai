import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.resolve(__dirname, "..", "..", "speech_to_text.py");
const pythonPath = path.resolve(__dirname, "..", "..", "venv", "bin", "python");

/**
 * WhisperDaemon.js
 *
 * Manages the Python Whisper daemon child process for Speech-to-Text transcription.
 * Handles process lifecycle, READY handshake, and JSON RPC IPC over stdin/stdout.
 */
export class WhisperDaemonManager {
  constructor() {
    this.whisperDaemon = null;
    this.currentResolve = null;
    this.daemonInitPromise = null;
  }

  /**
   * Initialize the Whisper Python daemon.
   * @returns {Promise<boolean>}
   */
  init() {
    if (this.whisperDaemon) return this.daemonInitPromise;

    this.daemonInitPromise = new Promise((resolve) => {
      console.log("[STT] Starting Whisper Daemon...");

      this.whisperDaemon = spawn(pythonPath, [scriptPath], {
        cwd: path.dirname(scriptPath)
      });

      this.whisperDaemon.stdout.on("data", (data) => {
        const raw = data.toString().trim();
        if (raw === "READY") {
          console.log("[STT] Whisper Daemon loaded and READY.");
          resolve(true);
          return;
        }

        try {
          const parsed = JSON.parse(raw);
          if (this.currentResolve) {
            this.currentResolve(parsed);
            this.currentResolve = null;
          }
        } catch (e) {
          console.error("[STT] Error parsing Whisper output:", raw, e);
          if (this.currentResolve) {
            this.currentResolve({ text: "", error: raw });
            this.currentResolve = null;
          }
        }
      });

      this.whisperDaemon.stderr.on("data", (data) => {
        const msg = data.toString().trim();
        console.warn("[STT Daemon Debug/Error]:", msg);
      });

      this.whisperDaemon.on("close", (code) => {
        console.log(`[STT] Whisper Daemon process exited with code ${code}`);
        this.whisperDaemon = null;
        this.daemonInitPromise = null;
      });

      this.whisperDaemon.on("error", (err) => {
        console.error("[STT] Whisper Daemon process error:", err);
        this.whisperDaemon = null;
        this.daemonInitPromise = null;
        resolve(false);
      });
    });

    return this.daemonInitPromise;
  }

  /**
   * Transcribe an audio file using the running Whisper daemon.
   * @param {string} audioFilePath
   * @param {object} [options]
   * @param {string} [options.language]
   * @param {number} [options.beamSize]
   * @returns {Promise<object>}
   */
  async transcribe(audioFilePath, options = {}) {
    await this.init();

    if (!this.whisperDaemon) {
      throw new Error("Whisper daemon is not running.");
    }

    return new Promise((resolve) => {
      this.currentResolve = resolve;

      const config = {
        audio_file: audioFilePath,
        language: options.language || "en",
        beam_size: options.beamSize || 5
      };

      console.log(`[STT] Sending file to Whisper Daemon (BeamSize: ${config.beam_size}, Lang: ${config.language})...`);
      this.whisperDaemon.stdin.write(JSON.stringify(config) + "\n");
    });
  }

  /**
   * Shutdown the Whisper Daemon.
   */
  shutdown() {
    if (this.whisperDaemon) {
      this.whisperDaemon.stdin.end();
      this.whisperDaemon.kill("SIGTERM");
      this.whisperDaemon = null;
      this.daemonInitPromise = null;
      console.log("[STT] Whisper Daemon terminated.");
    }
  }
}

// Global singleton instance for STT service
export const whisperDaemonManager = new WhisperDaemonManager();
