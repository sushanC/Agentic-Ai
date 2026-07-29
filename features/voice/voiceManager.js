import { VoiceStateMachine } from "./VoiceStateMachine.js";
import { VoiceQueue } from "./VoiceQueue.js";
import { listen } from "./sttService.js";
import { generateTTS } from "./ttsService.js";
import { routeRequest } from "../../services/toolRouter.js";
import { addMessage } from "../chat/index.js";
import { updateMemory } from "../memory/index.js";
import { updateSummary } from "../../services/summaryService.js";
import { incrementStat } from "../../storage/statsStorage.js";
import { loadSettings } from "../settings/index.js";
import { beginRequest, endRequest } from "../../services/developerBridge.js";
import { perfMonitor } from "./VoicePerformanceMonitor.js";
import { voiceMetrics } from "./VoicePerformanceMetrics.js";
import { shouldExtractMemory } from "./VoiceLatencyOptimizer.js";
import { VoicePipelineOptimizer } from "./VoicePipelineOptimizer.js";
import { VOICE_CONFIG } from "./voiceConfig.js";
import { voiceEvents } from "./VoiceEventEmitter.js";
import { voiceResponseProcessor } from "./VoiceResponseProcessor.js";

/**
 * VoiceManager.js
 *
 * High-level orchestrator for the Jarvis Voice Pipeline.
 * Coordinates listening (STT), AI routing, response sanitization/preprocessing,
 * speech synthesis (TTS), and audio playback queueing.
 *
 * Delegates event emission to VoiceEventEmitter, response processing to VoiceResponseProcessor,
 * and configuration defaults to voiceConfig.
 */
class VoiceManager {
  /**
   * @param {object} [deps] - Injected dependencies
   * @param {VoiceStateMachine} [deps.stateMachine]
   * @param {VoiceQueue} [deps.queue]
   * @param {VoiceEventEmitter} [deps.events]
   * @param {VoiceResponseProcessor} [deps.responseProcessor]
   */
  constructor(deps = {}) {
    this.events = deps.events || voiceEvents;
    this.responseProcessor = deps.responseProcessor || voiceResponseProcessor;

    this.stateMachine = deps.stateMachine || new VoiceStateMachine((state, oldState) => this._onStateChange(state, oldState));
    this.queue = deps.queue || new VoiceQueue();
    this.pipelineOptimizer = new VoicePipelineOptimizer(this.queue);

    this.settings = null;
    this.isActive = false;
    this.conversationTimer = null;
    this.currentText = null;
    this.currentReply = null;
    this.playbackActive = false;

    // Bind playback queue event listeners
    this.queue.onPlayStart = () => {
      perfMonitor.end("playbackStartup");
      voiceMetrics.end("playbackStartup");
      if (!this.playbackActive) {
        this.playbackActive = true;
        perfMonitor.start("playback");
        voiceMetrics.start("playback");
      }
    };

    this.queue.onEmpty = () => {
      if (this.playbackActive) {
        perfMonitor.end("playback");
        this.playbackActive = false;
      }
      perfMonitor.end("total");
      this._finalizeTimings();

      if (this.isActive && this.settings?.conversationMode) {
        console.log("[VoiceManager] Continuous conversation active. Resuming listening...");
        this.startListening();
      } else {
        this.stateMachine.transitionTo("idle");
      }
    };

    this.queue.onError = (err) => {
      console.error("[VoiceManager] Queue playback error:", err);
      this.stateMachine.transitionTo("error");
    };
  }

  /**
   * Initialize voice manager settings.
   */
  async init() {
    this.settings = await loadSettings();
  }

  /**
   * Reload settings from disk.
   */
  async reloadSettings() {
    this.settings = await loadSettings();
    console.log("[VoiceManager] Settings reloaded:", this.settings);
  }

  /**
   * Toggle Voice Assistant activation.
   */
  async toggleVoiceMode() {
    await this.init();
    if (this.isActive) {
      this.stopVoiceMode();
    } else {
      this.startVoiceMode();
    }
  }

  /**
   * Start Voice Mode.
   */
  async startVoiceMode() {
    await this.init();
    this.isActive = true;
    console.log("[VoiceManager] Jarvis Voice Assistant activated.");
    this.events.emitVoiceStarted();

    if (this.settings?.conversationMode) {
      this.events.emitConversationStarted();
    }

    this.startListening();
  }

  /**
   * Stop Voice Mode.
   */
  stopVoiceMode() {
    this.isActive = false;
    this.stopSpeaking();
    this._clearConversationTimer();
    this.stateMachine.transitionTo("idle");
    console.log("[VoiceManager] Jarvis Voice Assistant deactivated.");
    this.events.emitVoiceStopped("User manual deactivate");

    if (this.settings?.conversationMode) {
      this.events.emitConversationEnded("User deactivated voice mode");
    }
  }

  /**
   * Start recording input from the user.
   */
  async startListening() {
    await this.init();

    // Interruption check: If speaking, cancel active playback
    if (this.stateMachine.state === "speaking") {
      console.log("[VoiceManager] Interruption: New request started while speaking. Stopping playback.");
      this.queue.cancel();
      this.events.emitPlaybackCancelled("User interrupted with new request");
    }

    if (!this.stateMachine.transitionTo("listening")) {
      return;
    }

    // Reset active transcripts for the new request
    this.currentText = null;
    this.currentReply = null;

    // Start tracking session lifecycle timings
    const sessionId = `voice-${Date.now()}`;
    perfMonitor.startSession(sessionId);

    // Begin logical request context
    beginRequest();
    this.events.emitListeningStarted();

    // Handle Conversation Mode timeout timer
    this._startConversationTimer();

    try {
      console.log("[VoiceManager] Calling listen()");

      perfMonitor.start("recording");
      const result = await listen({
        language: this.settings?.language || VOICE_CONFIG.STT.language,
        silenceTimeout: this.settings?.silenceTimeout || VOICE_CONFIG.STT.silenceTimeout,
        maxRecordingTime: this.settings?.maxRecordingTime || VOICE_CONFIG.STT.maxRecordingTime,
        noiseTolerance: this.settings?.noiseTolerance || VOICE_CONFIG.STT.noiseTolerance,
        noSpeechTimeout: this.settings?.noSpeechTimeout || VOICE_CONFIG.STT.noSpeechTimeout,
        device: this.settings?.microphoneSelection || "default"
      });
      perfMonitor.end("recording");

      console.log("[VoiceManager] Listen returned:", result);
      this._clearConversationTimer();

      if (result.error) {
        console.error("[VoiceManager] Speech recognition failed:", result.error);
        this.events.emitSpeechRecognitionFailed(result.error);
        this.stateMachine.transitionTo("error");
        return;
      }

      const text = result.text ? result.text.trim() : "";
      this.currentText = text;
      this.events.emitSpeechRecognized(text);

      if (!text) {
        console.log("[VoiceManager] No speech detected.");
        this.events.emitSpeechRecognitionFailed("No speech detected");

        if (this.isActive && this.settings?.conversationMode) {
          console.log("[VoiceManager] Continuous conversation active. Retrying listening...");
          this.startListening();
        } else {
          this.stateMachine.transitionTo("idle");
        }
        return;
      }

      console.log(`[VoiceManager] Recognized Speech: "${text}"`);

      // Set physical ALSA speaker output device in queue dynamically
      if (this.settings?.speakerSelection) {
        this.queue.setSpeaker(this.settings.speakerSelection);
      }

      await this.processRequest(text);

    } catch (err) {
      console.error("[VoiceManager] Listening failed:", err);
      this.events.emitSpeechRecognitionFailed(err.message);
      this.stateMachine.transitionTo("error");
    }
  }

  /**
   * Cancel active listening session.
   */
  cancelListening() {
    console.log("[VoiceManager] Cancelling listening session.");
    this._clearConversationTimer();
    this.stateMachine.transitionTo("idle");
    this.events.emitVoiceStopped("User cancelled listening");
  }

  /**
   * Stop speaking and clear playback.
   */
  stopSpeaking() {
    console.log("[VoiceManager] Stopping playback.");
    this.queue.cancel();
    this.stateMachine.transitionTo("idle");
    this.events.emitPlaybackCancelled("User stopped playback");
  }

  /**
   * Send transcribed user request through the AI routing pipeline.
   * @param {string} text - Transcribed user input
   */
  async processRequest(text) {
    if (!this.stateMachine.transitionTo("processing")) {
      return;
    }

    perfMonitor.start("aiPipeline");
    voiceMetrics.start("cie");
    voiceMetrics.setMetadata("text", text);
    this.events.emitAIStarted(text);

    try {
      // Core AI pipeline integration (CIE -> Tool Router -> MSE -> Model)
      await addMessage("user", text);

      if (shouldExtractMemory(text)) {
        await updateMemory(text);
      } else {
        console.log("[VoiceManager] Shortcut/greeting query detected. Skipping memory extraction.");
      }

      voiceMetrics.end("cie");
      voiceMetrics.start("toolRouter");
      voiceMetrics.start("mse");
      voiceMetrics.start("provider");

      const result = await routeRequest(text, "voice");
      const reply = result.answer;

      voiceMetrics.end("toolRouter");
      voiceMetrics.end("mse");
      voiceMetrics.end("provider");

      await addMessage("assistant", reply);
      await updateSummary();
      await incrementStat("messages");

      perfMonitor.end("aiPipeline");
      this.events.emitAIFinished(perfMonitor.getMetrics().aiPipeline || 0, reply);

      this.currentReply = reply;
      voiceMetrics.setMetadata("reply", reply);

      // Process raw AI reply into clean, TTS-preprocessed speech
      const cleanReply = this.responseProcessor.process(reply);
      console.log("[VoiceManager] Sanitized reply for TTS:", cleanReply.slice(0, 120));

      // Transition to speaking and synthesize speech
      this.stateMachine.transitionTo("speaking");
      await this.synthesizeAndSpeak(cleanReply);

    } catch (err) {
      console.error("[VoiceManager] Processing query failed:", err);
      this.stateMachine.transitionTo("error");
    }
  }

  /**
   * Synthesize AI answer using TTS and queue it.
   * @param {string} replyText - Clean, speech-friendly text
   */
  async synthesizeAndSpeak(replyText) {
    perfMonitor.start("tts");
    voiceMetrics.start("tts");
    perfMonitor.start("playbackStartup");
    voiceMetrics.start("playbackStartup");
    this.events.emitTTSStarted(replyText);

    try {
      // Split preprocessed text into sentence chunks for low-latency playback
      const chunks = this.responseProcessor.split(replyText);

      for (const sentence of chunks) {
        const trimmed = sentence.trim();
        if (!trimmed) continue;

        const audioFile = await generateTTS(trimmed, {
          voiceSelection: this.settings?.voiceSelection || VOICE_CONFIG.TTS.voiceSelection,
          speechSpeed: this.settings?.speechSpeed || VOICE_CONFIG.TTS.speechSpeed,
          speechPitch: this.settings?.speechPitch || VOICE_CONFIG.TTS.speechPitch,
          speechVolume: this.settings?.speechVolume || VOICE_CONFIG.TTS.speechVolume
        });
        this.queue.enqueue(audioFile);
      }

      perfMonitor.end("tts");
      voiceMetrics.end("tts");
      this.events.emitTTSFinished(perfMonitor.getMetrics().tts || 0, replyText.length);

    } catch (err) {
      console.error("[VoiceManager] TTS synthesis failed:", err);
      this.stateMachine.transitionTo("error");
    }
  }

  /**
   * Finalize latency statistics and log them to Developer Events.
   * @private
   */
  _finalizeTimings() {
    const metrics = perfMonitor.getMetrics();
    voiceMetrics.end("total");
    console.log("[VoiceManager] timings finalized:", metrics);

    voiceMetrics.emitToConsole();
    this.events.emitFullRequestSummary(metrics, this.stateMachine.state !== "error");
    endRequest();
  }

  /**
   * Handle state changes by notifying Electron main process via VoiceEventEmitter.
   * @private
   */
  _onStateChange(state, oldState) {
    this.events.emitStateChange(state, oldState, this.currentText, this.currentReply);

    if (state === "error") {
      setTimeout(() => this.stateMachine.transitionTo("idle"), VOICE_CONFIG.TIMEOUTS.errorRecoveryDelay);
    }
  }

  /**
   * Start timeout timer for continuous conversation.
   * @private
   */
  _startConversationTimer() {
    this._clearConversationTimer();

    if (!this.settings?.conversationMode) return;

    const timeoutSec = this.settings?.conversationTimeout || VOICE_CONFIG.TIMEOUTS.conversationModeTimeout;

    this.conversationTimer = setTimeout(() => {
      console.log(`[VoiceManager] Conversation timed out after ${timeoutSec}s of silence.`);
      this.events.emitConversationEnded("Silence timeout reached");
      this.stopVoiceMode();
    }, timeoutSec * 1000);
  }

  /**
   * Clear conversation timer.
   * @private
   */
  _clearConversationTimer() {
    if (this.conversationTimer) {
      clearTimeout(this.conversationTimer);
      this.conversationTimer = null;
    }
  }
}

// Export default singleton instance
export const voiceManager = new VoiceManager();
