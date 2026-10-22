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
    this.initTimeout = null;
    this.requestTimeout = null;
    this.isReady = false;
    this.stdoutBuffer = "";
  }

  /**
   * Initialize the Whisper Python daemon.
   * @returns {Promise<boolean>}
   */
  init() {
    if (this.whisperDaemon) return this.daemonInitPromise || Promise.resolve(this.isReady);

    this.daemonInitPromise = new Promise((resolve) => {
      let settled = false;
      const finish = (ready) => {
        if (settled) return;
        settled = true;
        this.isReady = ready;
        clearTimeout(this.initTimeout);
        this.initTimeout = null;
        resolve(ready);
      };
      console.log("[STT] Starting Whisper Daemon...");

      this.whisperDaemon = spawn(pythonPath, [scriptPath], {
        cwd: path.dirname(scriptPath)
      });

      this.initTimeout = setTimeout(() => {
        console.error("[STT] Whisper daemon readiness timed out.");
        this.whisperDaemon?.kill("SIGTERM");
        finish(false);
      }, 120000);

      this.whisperDaemon.stdout.on("data", (data) => {
        this.stdoutBuffer += data.toString();
        let newline;
        while ((newline = this.stdoutBuffer.indexOf("\n")) !== -1) {
          const raw = this.stdoutBuffer.slice(0, newline).trim();
          this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
          if (!raw) continue;
          if (raw === "READY") {
            console.log("[STT] Whisper Daemon loaded and READY.");
            finish(true);
            continue;
          }

          try {
            const parsed = JSON.parse(raw);
            if (this.currentResolve) {
              clearTimeout(this.requestTimeout);
              this.requestTimeout = null;
              this.currentResolve(parsed);
              this.currentResolve = null;
            }
          } catch {
            console.error("[STT] Failed to parse Whisper response", { code: "INVALID_RESPONSE" });
            if (this.currentResolve) {
              clearTimeout(this.requestTimeout);
              this.requestTimeout = null;
              this.currentResolve({ text: "", error: "Speech recognition returned an invalid response." });
              this.currentResolve = null;
            }
          }
        }
      });

      this.whisperDaemon.stderr.on("data", (data) => {
        const msg = data.toString().trim();
        console.warn("[STT] Whisper daemon emitted diagnostic output", { characterCount: msg.length });
      });

      this.whisperDaemon.on("close", (code) => {
        console.log(`[STT] Whisper Daemon process exited with code ${code}`);
        if (!settled) finish(false);
        if (this.currentResolve) {
          clearTimeout(this.requestTimeout);
          this.requestTimeout = null;
          this.currentResolve({ text: "", error: "Whisper daemon exited unexpectedly." });
          this.currentResolve = null;
        }
        this.whisperDaemon = null;
        this.daemonInitPromise = null;
        this.isReady = false;
      });

      this.whisperDaemon.on("error", (err) => {
        console.error("[STT] Whisper daemon process failed", { code: err.code || "PROCESS_ERROR" });
        this.whisperDaemon = null;
        this.daemonInitPromise = null;
        this.isReady = false;
        finish(false);
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
    const ready = await this.init();

    if (!ready || !this.whisperDaemon) {
      throw new Error("Whisper daemon is not running.");
    }

    return new Promise((resolve) => {
      if (this.currentResolve) {
        resolve({ text: "", error: "Speech recognition is already processing audio." });
        return;
      }
      this.currentResolve = resolve;
      this.requestTimeout = setTimeout(() => {
        if (this.currentResolve !== resolve) return;
        this.currentResolve = null;
        this.requestTimeout = null;
        resolve({ text: "", error: "Speech recognition timed out." });
      }, 120000);

      const config = {
        audio_file: audioFilePath,
        language: options.language || "en",
        beam_size: options.beamSize || 5
      };

      console.log(`[STT] Sending file to Whisper Daemon (BeamSize: ${config.beam_size}, Lang: ${config.language})...`);
      try {
        this.whisperDaemon.stdin.write(JSON.stringify(config) + "\n", (error) => {
          if (!error || this.currentResolve !== resolve) return;
          clearTimeout(this.requestTimeout);
          this.requestTimeout = null;
          this.currentResolve = null;
          resolve({ text: "", error: "Could not send audio to speech recognition." });
        });
      } catch {
        clearTimeout(this.requestTimeout);
        this.requestTimeout = null;
        this.currentResolve = null;
        resolve({ text: "", error: "Could not send audio to speech recognition." });
      }
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
      this.isReady = false;
      clearTimeout(this.initTimeout);
      clearTimeout(this.requestTimeout);
      this.initTimeout = null;
      this.requestTimeout = null;
      if (this.currentResolve) this.currentResolve({ text: "", aborted: true });
      this.currentResolve = null;
      console.log("[STT] Whisper Daemon terminated.");
    }
  }
}

// Global singleton instance for STT service
export const whisperDaemonManager = new WhisperDaemonManager();
