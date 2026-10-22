import { emitDevEvent } from "../../services/developerBridge.js";

/**
 * VoiceEventEmitter.js
 *
 * Unified event bridge for Voice feature telemetry and Electron IPC state updates.
 * Centralizes IPC process messages and Developer Console logging.
 */
export class VoiceEventEmitter {
  /**
   * Notify Electron main process of Voice state machine transition.
   * @param {string} state - New state name
   * @param {string} oldState - Previous state name
   * @param {string|null} text - Active user transcript
   * @param {string|null} reply - Active assistant reply
   */
  emitStateChange(state, oldState, text = null, reply = null, error = null) {
    if (typeof process.send === "function") {
      process.send({
        type: "VOICE_STATE_CHANGE",
        payload: {
          state,
          oldState,
          text: state === "thinking" ? text : null,
          reply: state === "speaking" ? reply : null,
          error: state === "error" ? error : null
        }
      });
    }
  }

  /**
   * Emit voice activation start event.
   */
  emitVoiceStarted() {
    emitDevEvent("VoiceStarted", { msg: "Jarvis voice assistant active" });
  }

  /**
   * Emit voice deactivation event.
   * @param {string} reason
   */
  emitVoiceStopped(reason = "User manual deactivate") {
    emitDevEvent("VoiceStopped", { reason });
  }

  emitGreetingGenerated() { emitDevEvent("VoiceGreetingGenerated", { ok: true }); }
  emitGreetingPlaybackFinished() { emitDevEvent("VoiceGreetingPlaybackFinished", { ok: true }); }
  emitVoiceError(code) { emitDevEvent("VoiceError", { code }); }

  /**
   * Emit continuous conversation session start.
   */
  emitConversationStarted() {
    emitDevEvent("ConversationStarted", { msg: "Continuous conversation started" });
  }

  /**
   * Emit continuous conversation session end.
   * @param {string} reason
   */
  emitConversationEnded(reason = "Conversation session ended") {
    emitDevEvent("ConversationEnded", { reason });
  }

  /**
   * Emit listening session started.
   */
  emitListeningStarted() {
    emitDevEvent("ListeningStarted", { timestamp: new Date().toISOString() });
  }

  /**
   * Emit speech recognized event.
   * @param {string} text
   */
  emitSpeechRecognized(text) {
    emitDevEvent("SpeechRecognized", { characterCount: String(text || "").length });
  }

  /**
   * Emit speech recognition failure.
   * @param {string} error
   */
  emitSpeechRecognitionFailed(error) {
    const code = typeof error === "string" && /^[A-Z0-9_-]{1,64}$/.test(error)
      ? error : "SPEECH_RECOGNITION_FAILED";
    emitDevEvent("SpeechRecognitionFailed", { code });
  }

  /**
   * Emit AI pipeline start.
   * @param {string} prompt
   */
  emitAIStarted(prompt) {
    emitDevEvent("AIStarted", { characterCount: String(prompt || "").length });
  }

  /**
   * Emit AI pipeline finish.
   * @param {number} latencyMs
   * @param {string} reply
   */
  emitAIFinished(latencyMs, reply) {
    emitDevEvent("AIFinished", { latencyMs, characterCount: String(reply || "").length });
  }

  /**
   * Emit TTS synthesis start.
   * @param {string} text
   */
  emitTTSStarted(text) {
    emitDevEvent("TTSStarted", { characterCount: String(text || "").length });
  }

  /**
   * Emit TTS synthesis finish.
   * @param {number} latencyMs
   * @param {number} characters
   */
  emitTTSFinished(latencyMs, characters) {
    emitDevEvent("TTSFinished", { latencyMs, characters });
  }

  /**
   * Emit audio playback cancellation.
   * @param {string} reason
   */
  emitPlaybackCancelled(reason) {
    emitDevEvent("PlaybackCancelled", { reason });
  }

  /**
   * Emit summary of full request metrics.
   * @param {object} metrics
   * @param {boolean} success
   */
  emitFullRequestSummary(metrics, success = true) {
    emitDevEvent("FullRequestSummary", {
      latencyMs: metrics.total || 0,
      success,
      payload: {
        listeningLatency: metrics.recording || 0,
        aiLatency: metrics.aiPipeline || 0,
        ttsLatency: metrics.tts || 0,
        playbackDuration: metrics.playback || 0,
        totalDuration: metrics.total || 0,
        playbackStartupLatency: metrics.playbackStartup || 0
      }
    });
  }
}

// Global singleton instance
export const voiceEvents = new VoiceEventEmitter();
