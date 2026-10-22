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
export class VoiceManager {
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
    this.listen = deps.listen || listen;
    this.generateTTS = deps.generateTTS || generateTTS;
    this.routeRequest = deps.routeRequest || routeRequest;
    this.loadSettings = deps.loadSettings || loadSettings;
    this.addMessage = deps.addMessage || addMessage;
    this.updateMemory = deps.updateMemory || updateMemory;
    this.updateSummary = deps.updateSummary || updateSummary;
    this.incrementStat = deps.incrementStat || incrementStat;
    this.shouldExtractMemory = deps.shouldExtractMemory || shouldExtractMemory;

    this.stateMachine = deps.stateMachine || new VoiceStateMachine((state, oldState) => this._onStateChange(state, oldState));
    this.queue = deps.queue || new VoiceQueue();
    this.pipelineOptimizer = new VoicePipelineOptimizer(this.queue);

    this.settings = null;
    this.isActive = false;
    this.conversationTimer = null;
    this.currentText = null;
    this.currentReply = null;
    this.lastReply = null;
    this.playbackActive = false;
    this.sessionController = null;
    this.sessionGeneration = 0;
    this.startPromise = null;
    this.listenPromise = null;
    this.suppressQueueEmpty = false;
    this.isGreetingPlayback = false;
    this.microphoneMuted = false;

    // Bind playback queue event listeners
    this.queue.onPlayStart = () => {
      if (this.isGreetingPlayback) {
        if (this.stateMachine.state === "starting") this.stateMachine.transitionTo("greeting");
        return;
      }
      perfMonitor.end("playbackStartup");
      voiceMetrics.end("playbackStartup");
      if (!this.playbackActive) {
        this.playbackActive = true;
        perfMonitor.start("playback");
        voiceMetrics.start("playback");
      }
      if (this.stateMachine.state === "thinking") this.stateMachine.transitionTo("speaking");
    };

    this.queue.onEmpty = () => {
      if (this.suppressQueueEmpty) return;
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
        this.isActive = false;
        this.sessionController = null;
        this.stateMachine.transitionTo("idle");
      }
    };

    this.queue.onError = (err) => {
      console.error("[VoiceManager] Queue playback error", { code: err?.code || "PLAYBACK_ERROR" });
      this._fail(err, "AUDIO_PLAYBACK_FAILED");
    };
  }

  /**
   * Initialize voice manager settings.
   */
  async init() {
    this.settings = await this.loadSettings();
  }

  /**
   * Reload settings from disk.
   */
  async reloadSettings() {
    this.settings = await this.loadSettings();
    console.log("[VoiceManager] Settings reloaded", { keyCount: Object.keys(this.settings || {}).length });
  }

  /**
   * Toggle Voice Assistant activation.
   */
  async toggleVoiceMode() {
    if (this.isActive) {
      this.stopVoiceMode();
    } else {
      await this.startVoiceMode();
    }
  }

  /**
   * Start Voice Mode.
   */
  async startVoiceMode() {
    if (this.isActive) return this.startPromise || undefined;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this._beginVoiceMode();
    try { return await this.startPromise; } finally { this.startPromise = null; }
  }

  async _beginVoiceMode() {
    const generation = ++this.sessionGeneration;
    if (this.stateMachine.state === "error") this.stateMachine.transitionTo("idle");
    if (!this.stateMachine.transitionTo("starting")) return;
    this.isActive = true;
    this.microphoneMuted = false;
    this.sessionController = new AbortController();
    try {
      await this.init();
    } catch (err) {
      this._fail(err, "SETTINGS_LOAD_FAILED");
      return;
    }
    if (!this._isCurrent(generation)) return;
    console.log("[VoiceManager] Jarvis Voice Assistant activated.");
    this.events.emitVoiceStarted();

    if (this.settings?.conversationMode) {
      this.events.emitConversationStarted();
    }

    const greeting = String(this.settings?.voiceGreeting || VOICE_CONFIG.TTS.greeting).trim().slice(0, 240);
    if (greeting) {
      try {
        const greetingAudio = await this.generateTTS(greeting, {
          ...this._ttsOptions(),
          signal: this.sessionController?.signal
        });
        if (!this._isCurrent(generation)) { this.queue.discard?.(greetingAudio); return; }
        this.events.emitGreetingGenerated?.();
        this.suppressQueueEmpty = true;
        this.isGreetingPlayback = true;
        const playback = await this.queue.enqueueBatch([greetingAudio]);
        this.isGreetingPlayback = false;
        this.suppressQueueEmpty = false;
        if (!playback?.completed || !this._isCurrent(generation)) return;
        this.events.emitGreetingPlaybackFinished?.();
      } catch (err) {
        this.suppressQueueEmpty = false;
        if (!this._isCurrent(generation)) return;
        this._fail(err, "GREETING_FAILED");
        return;
      }
    }
    if (this._isCurrent(generation)) {
      await this.startListening();
    }
  }

  /**
   * Stop Voice Mode.
   */
  stopVoiceMode() {
    if (!this.isActive && this.stateMachine.state === "idle") return;
    this.isActive = false;
    this.sessionGeneration += 1;
    this.sessionController?.abort();
    this.sessionController = null;
    this.stateMachine.transitionTo("stopping");
    this.queue.cancel();
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
    if (!this.isActive) return;
    if (this.listenPromise) return this.listenPromise;
    this.listenPromise = this._startListening(this.sessionGeneration);
    try { return await this.listenPromise; } finally { this.listenPromise = null; }
  }

  async _startListening(generation) {
    try {
      await this.init();
    } catch (err) {
      if (this._isCurrent(generation)) this._fail(err, "SETTINGS_LOAD_FAILED");
      return;
    }
    if (!this._isCurrent(generation)) return;

    if (this.stateMachine.state !== "starting" && !this.stateMachine.transitionTo("starting")) return;

    // Interruption check: If speaking, cancel active playback
    if (this.stateMachine.state === "speaking") {
      console.log("[VoiceManager] Interruption: New request started while speaking. Stopping playback.");
      this.queue.cancel();
      this.events.emitPlaybackCancelled("User interrupted with new request");
    }

    // Reset active transcripts for the new request
    this.currentText = null;
    this.currentReply = null;

    // Start tracking session lifecycle timings
    const sessionId = `voice-${Date.now()}`;
    perfMonitor.startSession(sessionId);

    // Begin logical request context
    beginRequest();
    try {
      console.log("[VoiceManager] Calling listen()");

      perfMonitor.start("recording");
      const result = await this.listen({
        language: this.settings?.language || VOICE_CONFIG.STT.language,
        silenceTimeout: this.settings?.silenceTimeout || VOICE_CONFIG.STT.silenceTimeout,
        maxRecordingTime: this.settings?.maxRecordingTime || VOICE_CONFIG.STT.maxRecordingTime,
        noiseTolerance: this.settings?.noiseTolerance || VOICE_CONFIG.STT.noiseTolerance,
        noSpeechTimeout: this.settings?.noSpeechTimeout || VOICE_CONFIG.STT.noSpeechTimeout,
        device: this.settings?.microphoneSelection || "default",
        signal: this.sessionController?.signal,
        isMuted: () => this.microphoneMuted,
        onCaptureStarted: () => {
          if (!this._isCurrent(generation)) return;
          this.stateMachine.transitionTo("listening");
          this.events.emitListeningStarted();
          this._startConversationTimer();
        }
      });
      if (!this._isCurrent(generation)) return;
      perfMonitor.end("recording");

      this._clearConversationTimer();

      if (result.error) {
        console.error("[VoiceManager] Speech recognition failed", { code: "TRANSCRIPTION_FAILED" });
        this.events.emitSpeechRecognitionFailed(result.error);
        this._fail(new Error(result.error), "TRANSCRIPTION_FAILED");
        return;
      }

      this.stateMachine.transitionTo("transcribing");
      const text = result.text ? result.text.trim() : "";
      this.currentText = text;
      this.events.emitSpeechRecognized(text);

      if (!text) {
        console.log("[VoiceManager] No speech detected.");
        this.events.emitSpeechRecognitionFailed("No speech detected");

        if (this.isActive && this.settings?.conversationMode) {
          console.log("[VoiceManager] Continuous conversation active. Retrying listening...");
          await this.startListening();
        } else {
          this.isActive = false;
          this.stateMachine.transitionTo("idle");
        }
        return;
      }

      console.log("[VoiceManager] Speech recognized", { characterCount: text?.length || 0 });

      // Set physical ALSA speaker output device in queue dynamically
      if (this.settings?.speakerSelection) {
        this.queue.setSpeaker(this.settings.speakerSelection);
      }

      await this.processRequest(text);

    } catch (err) {
      console.error("[VoiceManager] Listening failed", { code: err?.code || "MICROPHONE_ERROR" });
      if (this._isCurrent(generation)) this._fail(err, "MICROPHONE_FAILED");
    }
  }

  /**
   * Cancel active listening session.
   */
  cancelListening() {
    console.log("[VoiceManager] Cancelling listening session.");
    this._clearConversationTimer();
    this.sessionGeneration += 1;
    this.sessionController?.abort();
    this.sessionController = null;
    this.isActive = false;
    this.stateMachine.transitionTo("interrupted");
    this.stateMachine.transitionTo("idle");
    this.events.emitVoiceStopped("User cancelled listening");
  }

  /**
   * Stop speaking and clear playback.
   */
  stopSpeaking() {
    console.log("[VoiceManager] Stopping playback.");
    if (this.isActive) {
      this.sessionGeneration += 1;
      this.sessionController?.abort();
      this.sessionController = null;
      this.isActive = false;
      this._clearConversationTimer();
      this.stateMachine.transitionTo("interrupted");
    }
    this.queue.cancel();
    this.stateMachine.transitionTo("idle");
    this.events.emitPlaybackCancelled("User stopped playback");
  }

  setMicrophoneMuted(muted) {
    if (!this.isActive || this.stateMachine.state !== "listening") return false;
    this.microphoneMuted = Boolean(muted);
    return true;
  }

  async repeatLastResponse() {
    if (!this.lastReply || (this.isActive && this.stateMachine.state !== "listening")) return false;
    if (this.isActive) {
      this.sessionController?.abort();
      this.stateMachine.transitionTo("interrupted");
      this.queue.cancel();
    }
    this.sessionGeneration += 1;
    this.sessionController = new AbortController();
    this.isActive = true;
    if (this.stateMachine.state === "error" || this.stateMachine.state === "interrupted") {
      this.stateMachine.transitionTo("idle");
    }
    if (!this.stateMachine.transitionTo("starting")) return false;
    this.stateMachine.transitionTo("thinking");
    await this.synthesizeAndSpeak(this.responseProcessor.process(this.lastReply), this.sessionGeneration);
    return true;
  }

  /**
   * Send transcribed user request through the AI routing pipeline.
   * @param {string} text - Transcribed user input
   */
  async processRequest(text) {
    const generation = this.sessionGeneration;
    if (!this.stateMachine.transitionTo("thinking")) {
      return;
    }

    perfMonitor.start("aiPipeline");
    voiceMetrics.start("cie");
    voiceMetrics.setMetadata("transcriptCharacterCount", text.length);
    this.events.emitAIStarted(text);

    try {
      // Core AI pipeline integration (CIE -> Tool Router -> MSE -> Model)
      await this.addMessage("user", text);
      if (!this._isCurrent(generation)) return;

      if (this.shouldExtractMemory(text)) {
        await this.updateMemory(text);
      } else {
        console.log("[VoiceManager] Shortcut/greeting query detected. Skipping memory extraction.");
      }

      voiceMetrics.end("cie");
      voiceMetrics.start("toolRouter");
      voiceMetrics.start("mse");
      voiceMetrics.start("provider");

      const result = await this.routeRequest(text, "voice", {
        signal: this.sessionController?.signal
      });
      if (!this._isCurrent(generation)) return;
      const reply = result.answer;

      voiceMetrics.end("toolRouter");
      voiceMetrics.end("mse");
      voiceMetrics.end("provider");

      await this.addMessage("assistant", reply);
      if (!this._isCurrent(generation)) return;
      await this.updateSummary();
      await this.incrementStat("messages");

      perfMonitor.end("aiPipeline");
      this.events.emitAIFinished(perfMonitor.getMetrics().aiPipeline || 0, reply);

      this.currentReply = reply;
      this.lastReply = reply;
      voiceMetrics.setMetadata("replyCharacterCount", String(reply || "").length);

      // Process raw AI reply into clean, TTS-preprocessed speech
      const cleanReply = this.responseProcessor.process(reply);

      // Transition to speaking and synthesize speech
      await this.synthesizeAndSpeak(cleanReply, generation);

    } catch (err) {
      console.error("[VoiceManager] Processing query failed", { code: err?.code || "REQUEST_ERROR" });
      if (this._isCurrent(generation)) this._fail(err, "REQUEST_FAILED");
    }
  }

  /**
   * Synthesize AI answer using TTS and queue it.
   * @param {string} replyText - Clean, speech-friendly text
   */
  async synthesizeAndSpeak(replyText, generation = this.sessionGeneration) {
    perfMonitor.start("tts");
    voiceMetrics.start("tts");
    perfMonitor.start("playbackStartup");
    voiceMetrics.start("playbackStartup");
    this.events.emitTTSStarted(replyText);

    try {
      // Split preprocessed text into sentence chunks for low-latency playback
      const chunks = this.responseProcessor.split(replyText);
      const files = [];

      for (const sentence of chunks) {
        const trimmed = sentence.trim();
        if (!trimmed) continue;

        const audioFile = await this.generateTTS(trimmed, {
          ...this._ttsOptions(),
          signal: this.sessionController?.signal
        });
        if (!this._isCurrent(generation)) {
          this.queue.discard?.(audioFile);
          files.forEach(file => this.queue.discard?.(file));
          return;
        }
        files.push(audioFile);
      }

      if (!files.length) throw new Error("No speech audio was generated.");

      perfMonitor.end("tts");
      voiceMetrics.end("tts");
      this.events.emitTTSFinished(perfMonitor.getMetrics().tts || 0, replyText.length);
      const playback = await this.queue.enqueueBatch(files);
      if (!playback?.completed && this._isCurrent(generation)) {
        this._fail(new Error("Audio playback was interrupted."), "AUDIO_PLAYBACK_FAILED");
      }

    } catch (err) {
      console.error("[VoiceManager] TTS synthesis failed", { code: err?.code || "TTS_ERROR" });
      if (this._isCurrent(generation)) this._fail(err, "TTS_FAILED");
    }
  }

  _ttsOptions() {
    return {
      voiceSelection: this.settings?.voiceSelection || VOICE_CONFIG.TTS.voiceSelection,
      speechSpeed: this.settings?.speechSpeed || VOICE_CONFIG.TTS.speechSpeed,
      speechPitch: this.settings?.speechPitch || VOICE_CONFIG.TTS.speechPitch,
      speechVolume: this.settings?.speechVolume || VOICE_CONFIG.TTS.speechVolume
    };
  }

  _isCurrent(generation) {
    return this.isActive && generation === this.sessionGeneration;
  }

  _fail(error, fallbackCode) {
    const reportedCode = typeof error?.code === "string" && /^[A-Z0-9_-]{1,64}$/.test(error.code)
      ? error.code
      : fallbackCode;
    console.error("[VoiceManager] Voice session failed", {
      stage: fallbackCode,
      code: reportedCode
    });
    this.currentError = reportedCode;
    this.isActive = false;
    this.sessionController?.abort();
    this.sessionController = null;
    this._clearConversationTimer();
    this.queue.cancel();
    this.events.emitVoiceError?.(reportedCode);
    this.stateMachine.transitionTo("error");
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
    this.events.emitStateChange(state, oldState, this.currentText, this.currentReply, this.currentError);
    if (state !== "error") this.currentError = null;

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
