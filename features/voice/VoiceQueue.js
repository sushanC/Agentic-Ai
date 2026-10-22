import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const FFPLAY_CANDIDATES = Object.freeze(["/usr/bin/ffplay", "/usr/local/bin/ffplay"]);

export function resolveFfplayPath(fileSystem = fs, configuredPath = process.env.SAMGPT_FFPLAY_PATH) {
  if (configuredPath && !path.isAbsolute(configuredPath)) return null;
  const candidates = configuredPath ? [configuredPath] : FFPLAY_CANDIDATES;
  for (const candidate of candidates) {
    try {
      fileSystem.accessSync(candidate, fileSystem.constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

/**
 * VoiceQueue.js
 *
 * Manages the sequential playback of synthesized TTS audio files using ffplay.
 * Prevents overlapping audio, supports pause/resume via OS signals, and handles cancellation.
 */
export class VoiceQueue {
  constructor({
    spawnProcess = spawn,
    removeFile = (file, callback) => fs.unlink(file, callback),
    playerPath = resolveFfplayPath(),
    playbackTimeoutMs = 45000
  } = {}) {
    this.spawnProcess = spawnProcess;
    this.removeFile = removeFile;
    this.playerPath = playerPath;
    this.playbackTimeoutMs = playbackTimeoutMs;
    this.queue = [];
    this.currentProcess = null;
    this.currentFile = null;
    this.isPlaying = false;
    this.isPaused = false;

    // Callbacks
    this.onPlayStart = null;
    this.onPlayFinish = null;
    this.onEmpty = null;
    this.onError = null;
    this.speakerSelection = null;
    this.drainWaiters = [];
  }

  /**
   * Enqueue a new audio file for playback.
   * @param {string} filePath - Path to the synthesized audio file.
   */
  enqueue(filePath) {
    this.queue.push(filePath);
    console.log(`[VoiceQueue] Enqueued: ${filePath}. Queue length: ${this.queue.length}`);
    if (!this.isPlaying && !this.isPaused) {
      this._playNext();
    }
  }

  enqueueBatch(filePaths) {
    if (!Array.isArray(filePaths) || filePaths.length === 0) return Promise.resolve();
    this.queue.push(...filePaths);
    const drained = new Promise(resolve => this.drainWaiters.push(resolve));
    if (!this.isPlaying && !this.isPaused) this._playNext();
    return drained;
  }

  /**
   * Pause the currently playing audio.
   */
  pause() {
    if (!this.isPlaying || this.isPaused || !this.currentProcess) return;

    try {
      this.currentProcess.kill("SIGSTOP");
      this.isPaused = true;
      console.log("[VoiceQueue] Playback paused (SIGSTOP sent to ffplay).");
    } catch (err) {
      console.error("[VoiceQueue] Failed to pause playback:", err);
      if (this.onError) this.onError(err);
    }
  }

  /**
   * Resume the paused audio.
   */
  resume() {
    if (!this.isPaused || !this.currentProcess) return;

    try {
      this.currentProcess.kill("SIGCONT");
      this.isPaused = false;
      console.log("[VoiceQueue] Playback resumed (SIGCONT sent to ffplay).");
    } catch (err) {
      console.error("[VoiceQueue] Failed to resume playback:", err);
      if (this.onError) this.onError(err);
    }
  }

  /**
   * Cancel all playback, kill ffplay, clear the queue, and delete temporary files.
   */
  cancel() {
    console.log("[VoiceQueue] Cancelling playback and clearing queue...");

    // Kill active process
    if (this.currentProcess) {
      try {
        this.currentProcess.kill("SIGKILL");
      } catch (e) {
        // ignore
      }
      this.currentProcess = null;
    }

    // Clean up current file
    if (this.currentFile) {
      this._deleteFile(this.currentFile);
      this.currentFile = null;
    }

    // Clean up queued files
    while (this.queue.length > 0) {
      const file = this.queue.shift();
      this._deleteFile(file);
    }

    this.isPlaying = false;
    this.isPaused = false;
    this._resolveDrainWaiters({ completed: false });

    if (this.onPlayFinish) {
      this.onPlayFinish();
    }
  }

  /**
   * Alias for cancel() for backward compatibility.
   */
  stop() {
    this.cancel();
  }

  /**
   * Alias for cancel() for backward compatibility.
   */
  clear() {
    this.cancel();
  }

  /**
   * Set the physical speaker output device.
   * @param {string} device - ALSA device identifier
   */
  setSpeaker(device) {
    this.speakerSelection = device;
  }

  discard(filePath) {
    if (filePath) this._deleteFile(filePath);
  }

  /**
   * Play the next item in the queue.
   * @private
   */
  _playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.currentFile = null;
      console.log("[VoiceQueue] Queue is empty.");
      this._resolveDrainWaiters({ completed: true });
      if (this.onEmpty) this.onEmpty();
      return;
    }

    this.isPlaying = true;
    const filePath = this.queue.shift();
    this.currentFile = filePath;
    console.log("[VoiceQueue] Playing audio");

    if (!this.playerPath) {
      const error = new Error("ffplay was not found. Install it or set SAMGPT_FFPLAY_PATH.");
      error.code = "FFPLAY_NOT_FOUND";
      this._failPlayback(null, filePath, error);
      return;
    }

    try {
      const env = { ...process.env };
      if (this.speakerSelection && this.speakerSelection !== "default") {
        env.AUDIODEV = this.speakerSelection;
        env.PULSE_SINK = this.speakerSelection;
      }

      const player = this.spawnProcess(this.playerPath, [
        "-nodisp",
        "-autoexit",
        "-probesize", "32",
        "-analyzeduration", "0",
        "-loglevel", "quiet",
        filePath
      ], { env, stdio: ["ignore", "ignore", "pipe"] });
      this.currentProcess = player;
      let settled = false;
      let stderr = "";
      const fail = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(hangTimeout);
        this._failPlayback(player, filePath, error);
      };

      player.stderr?.on("data", chunk => {
        stderr = (stderr + chunk.toString()).slice(-2048);
      });

      player.once("spawn", () => {
        if (this.currentProcess === player && this.isPlaying && this.onPlayStart) this.onPlayStart(filePath);
      });

      // Playback hang watchdog: force terminate after 45 seconds of a single sentence chunk
      const hangTimeout = setTimeout(() => {
        if (this.currentProcess === player) {
          console.warn("[VoiceQueue] Playback hang detected. Force terminating.");
          try {
            player.kill("SIGKILL");
          } catch (e) {}
          const error = new Error("ffplay playback timed out.");
          error.code = "FFPLAY_TIMEOUT";
          fail(error);
        }
      }, this.playbackTimeoutMs);

      player.on("close", (code) => {
        clearTimeout(hangTimeout);
        console.log(`[VoiceQueue] Playback process closed with code ${code}`);
        this._deleteFile(filePath);
        if (settled) return;
        settled = true;
        if (this.currentProcess !== player) return;
        this.currentProcess = null;
        this.currentFile = null;

        if (code !== 0 && this.isPlaying) {
          const deviceFailure = /audio|device|pulse|pipewire|alsa/i.test(stderr);
          const error = new Error(deviceFailure
            ? "ffplay could not use the configured audio output device."
            : `ffplay exited with code ${code ?? "unknown"}.`);
          error.code = deviceFailure ? "AUDIO_OUTPUT_UNAVAILABLE" : "AUDIO_PLAYBACK_FAILED";
          this._failPlayback(null, null, error, false);
          return;
        }

        // Play next file if we were not paused or cancelled
        if (this.isPlaying) {
          this._playNext();
        }
      });

      player.on("error", (err) => {
        const error = new Error(`ffplay could not start (${err?.code || "PROCESS_ERROR"}).`);
        error.code = "FFPLAY_SPAWN_FAILED";
        fail(error);
      });
    } catch (err) {
      const error = new Error(`ffplay could not start (${err?.code || "PROCESS_ERROR"}).`);
      error.code = "FFPLAY_SPAWN_FAILED";
      this._failPlayback(null, filePath, error);
    }
  }

  /**
   * Safely delete a temporary file.
   * @param {string} filePath
   * @private
   */
  _deleteFile(filePath) {
    this.removeFile(filePath, (err) => {
      if (err && err.code !== "ENOENT") {
        console.warn(`[VoiceQueue] Failed to delete temp file ${filePath}:`, err.message);
      } else {
        console.log(`[VoiceQueue] Deleted temp file: ${filePath}`);
      }
    });
  }

  _resolveDrainWaiters(result) {
    for (const resolve of this.drainWaiters.splice(0)) resolve(result);
  }

  _failPlayback(player, filePath, error, deleteCurrent = true) {
    if (player && this.currentProcess !== player) return;
    if (filePath) this._deleteFile(filePath);
    if (this.currentFile === filePath || !filePath) this.currentFile = null;
    this.currentProcess = null;
    this.isPlaying = false;
    this.isPaused = false;
    while (this.queue.length) this._deleteFile(this.queue.shift());
    if (deleteCurrent && this.currentFile) {
      this._deleteFile(this.currentFile);
      this.currentFile = null;
    }
    console.error("[VoiceQueue] Audio playback failed", { code: error?.code || "PLAYBACK_ERROR" });
    this._resolveDrainWaiters({ completed: false });
    this.onError?.(error);
  }
}
