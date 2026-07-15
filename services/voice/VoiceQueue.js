import { spawn } from "child_process";
import fs from "fs";

/**
 * VoiceQueue.js
 *
 * Manages the sequential playback of synthesized TTS audio files using ffplay.
 * Prevents overlapping audio, supports pause/resume via OS signals, and handles cancellation.
 */
export class VoiceQueue {
  constructor() {
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
    
    if (this.onPlayFinish) {
      this.onPlayFinish();
    }
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
      if (this.onEmpty) this.onEmpty();
      return;
    }

    this.isPlaying = true;
    this.currentFile = this.queue.shift();
    console.log(`[VoiceQueue] Playing: ${this.currentFile}`);

    if (this.onPlayStart) {
      this.onPlayStart(this.currentFile);
    }

    try {
      this.currentProcess = spawn("ffplay", [
        "-nodisp",
        "-autoexit",
        "-loglevel", "quiet",
        this.currentFile
      ]);

      this.currentProcess.on("close", (code) => {
        console.log(`[VoiceQueue] Playback process closed with code ${code}`);
        this.currentProcess = null;
        
        // Delete current file after it finishes playing
        if (this.currentFile) {
          this._deleteFile(this.currentFile);
          this.currentFile = null;
        }

        // Play next file if we were not paused or cancelled
        if (this.isPlaying) {
          this._playNext();
        }
      });

      this.currentProcess.on("error", (err) => {
        console.error("[VoiceQueue] Playback process error:", err);
        if (this.onError) this.onError(err);
        this.currentProcess = null;
        if (this.currentFile) {
          this._deleteFile(this.currentFile);
          this.currentFile = null;
        }
        this._playNext();
      });
    } catch (err) {
      console.error("[VoiceQueue] Error spawning ffplay:", err);
      if (this.onError) this.onError(err);
      this.isPlaying = false;
      this._playNext();
    }
  }

  /**
   * Safely delete a temporary file.
   * @param {string} filePath
   * @private
   */
  _deleteFile(filePath) {
    fs.unlink(filePath, (err) => {
      if (err && err.code !== "ENOENT") {
        console.warn(`[VoiceQueue] Failed to delete temp file ${filePath}:`, err.message);
      } else {
        console.log(`[VoiceQueue] Deleted temp file: ${filePath}`);
      }
    });
  }
}
