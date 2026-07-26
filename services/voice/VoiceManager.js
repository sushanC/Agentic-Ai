import { VoiceStateMachine } from "./VoiceStateMachine.js";
import { VoiceQueue } from "./VoiceQueue.js";
import { listen } from "../sttService.js";
import { generateTTS } from "../ttsService.js";
import { routeRequest } from "../toolRouter.js";
import { addMessage } from "../historyService.js";
import { updateMemory } from "../../features/memory/index.js";
import { updateSummary } from "../summaryService.js";
import { incrementStat } from "../../storage/statsStorage.js";
import { loadSettings } from "../../storage/settingsStorage.js";
import { emitDevEvent, beginRequest, endRequest } from "../developerBridge.js";
import { perfMonitor } from "./VoicePerformanceMonitor.js";
import { voiceMetrics } from "./VoicePerformanceMetrics.js";
import { shouldExtractMemory, isShortcutQuery, getVoiceCieOptions } from "./VoiceLatencyOptimizer.js";
import { VoicePipelineOptimizer } from "./VoicePipelineOptimizer.js";

/**
 * VoiceManager.js
 *
 * Coordinates the full-duplex Jarvis Voice Pipeline.
 * Handles timings, VAD configs, MSE tool routing, and OS audio playback.
 */
class VoiceManager {
  constructor() {
    this.stateMachine = new VoiceStateMachine((state, oldState) => this._onStateChange(state, oldState));
    this.queue = new VoiceQueue();
    this.pipelineOptimizer = new VoicePipelineOptimizer(this.queue);
    this.settings = null;
    this.isActive = false;
    this.conversationTimer = null;
    this.currentText = null;
    this.currentReply = null;
    this.playbackActive = false;

    // Bind queue callbacks
    this.queue.onPlayStart = (file) => {
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
    emitDevEvent("VoiceStarted", { msg: "Jarvis voice assistant active" });
    
    if (this.settings?.conversationMode) {
      emitDevEvent("ConversationStarted", { msg: "Continuous conversation started" });
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
    emitDevEvent("VoiceStopped", { reason: "User manual deactivate" });
    
    if (this.settings?.conversationMode) {
      emitDevEvent("ConversationEnded", { reason: "User deactivated voice mode" });
    }
  }

  /**
   * Start recording input from the user.
   */
  async startListening() {    
    await this.init();

    // Interruption check: If speaking, stop it
    if (this.stateMachine.state === "speaking") {
      console.log("[VoiceManager] Interruption: New request started while speaking. Stopping playback.");
      this.queue.cancel();
      emitDevEvent("PlaybackCancelled", { reason: "User interrupted with new request" });
    }

    if (!this.stateMachine.transitionTo("listening")) {
      return;
    }

    // Reset active transcripts for the new request
    this.currentText = null;
    this.currentReply = null;

    // Start tracking lifecycle timings
    const sessionId = `voice-${Date.now()}`;
    perfMonitor.startSession(sessionId);

    // Begin logical request context for timings & logs
    beginRequest();

    emitDevEvent("ListeningStarted", { timestamp: new Date().toISOString() });

    // Handle Conversation Mode timeout trigger
    this._startConversationTimer();

    try {
      console.log("[VoiceManager] Calling listen()");
      
      perfMonitor.start("recording");
      const result = await listen({
        language: this.settings?.language || "en",
        silenceTimeout: this.settings?.silenceTimeout || 2.0,
        maxRecordingTime: this.settings?.maxRecordingTime || 15,
        noiseTolerance: this.settings?.noiseTolerance || 300,
        noSpeechTimeout: this.settings?.noSpeechTimeout || 5.0,
        device: this.settings?.microphoneSelection || "default"
      });
      perfMonitor.end("recording");

      console.log("[VoiceManager] Listen returned:", result);

      this._clearConversationTimer();

      if (result.error) {
        console.error("[VoiceManager] Speech recognition failed:", result.error);
        emitDevEvent("SpeechRecognitionFailed", { error: result.error });
        this.stateMachine.transitionTo("error");
        return;
      }

      const text = result.text ? result.text.trim() : "";
      this.currentText = text;
      
      emitDevEvent("SpeechRecognized", { text });

      if (!text) {
        console.log("[VoiceManager] No speech detected.");
        emitDevEvent("SpeechRecognitionFailed", { error: "No speech detected" });
        
        if (this.isActive && this.settings?.conversationMode) {
          console.log("[VoiceManager] Continuous conversation active. Retrying listening...");
          this.startListening();
        } else {
          this.stateMachine.transitionTo("idle");
        }
        return;
      }

      console.log(`[VoiceManager] Recognized Speech: "${text}"`);

      // Set physical ALSA speaker selection in queue dynamically
      if (this.settings?.speakerSelection) {
        this.queue.setSpeaker(this.settings.speakerSelection);
      }

      await this.processRequest(text);

    } catch (err) {
      console.error("[VoiceManager] Listening failed:", err);
      emitDevEvent("SpeechRecognitionFailed", { error: err.message });
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
    emitDevEvent("VoiceStopped", { reason: "User cancelled listening" });
  }

  /**
   * Stop speaking and clear playback.
   */
  stopSpeaking() {
    console.log("[VoiceManager] Stopping playback.");
    this.queue.cancel();
    this.stateMachine.transitionTo("idle");
    emitDevEvent("PlaybackCancelled", { reason: "User stopped playback" });
  }

  /**
   * Send the transcribed user request to the AI routing pipeline.
   * @param {string} text
   */
  /**
   * Send the transcribed user request to the AI routing pipeline.
   * @param {string} text
   */
  async processRequest(text) {
    if (!this.stateMachine.transitionTo("processing")) {
      return;
    }

    perfMonitor.start("aiPipeline");
    voiceMetrics.start("cie");
    voiceMetrics.setMetadata("text", text);
    emitDevEvent("AIStarted", { prompt: text });

    try {
      // Core AI pipeline integration (CIE -> Tool Router -> MSE -> Model)
      await addMessage("user", text);

      // Memory Optimization: Skip memory extraction for greetings, small talk, and control shortcuts
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
      emitDevEvent("AIFinished", { 
        latencyMs: perfMonitor.getMetrics().aiPipeline || 0,
        reply 
      });

      this.currentReply = reply;
      voiceMetrics.setMetadata("reply", reply);

      // Clean markdown tags or symbols for TTS
      const cleanReply = reply.replace(/\*\*|__/g, "").replace(/`/g, "");

      // Proceed to Speak transition
      this.stateMachine.transitionTo("speaking");
      await this.synthesizeAndSpeak(cleanReply);

    } catch (err) {
      console.error("[VoiceManager] Processing query failed:", err);
      this.stateMachine.transitionTo("error");
    }
  }

  /**
   * Synthesize AI answer using TTS and queue it.
   * @param {string} replyText
   */
  async synthesizeAndSpeak(replyText) {
    perfMonitor.start("tts");
    voiceMetrics.start("tts");
    perfMonitor.start("playbackStartup");
    voiceMetrics.start("playbackStartup");
    emitDevEvent("TTSStarted", { text: replyText });

    try {
      // Split reply into sentences to start speaking low-latency (first sentence first)
      const sentences = replyText.match(/[^.!?]+[.!?]+(\s|$)/g) || [replyText];
      
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (!trimmed) continue;

        const audioFile = await generateTTS(trimmed, {
          voiceSelection: this.settings?.voiceSelection || "en-IN-NeerjaNeural",
          speechSpeed: this.settings?.speechSpeed || "+0%",
          speechPitch: this.settings?.speechPitch || "+0Hz",
          speechVolume: this.settings?.speechVolume || "+0%"
        });

        this.queue.enqueue(audioFile);
      }

      perfMonitor.end("tts");
      voiceMetrics.end("tts");
      emitDevEvent("TTSFinished", {
        latencyMs: perfMonitor.getMetrics().tts || 0,
        characters: replyText.length
      });

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

    emitDevEvent("FullRequestSummary", {
      latencyMs: metrics.total || 0,
      success: this.stateMachine.state !== "error",
      payload: {
        listeningLatency: metrics.recording || 0,
        aiLatency: metrics.aiPipeline || 0,
        ttsLatency: metrics.tts || 0,
        playbackDuration: metrics.playback || 0,
        totalDuration: metrics.total || 0,
        playbackStartupLatency: metrics.playbackStartup || 0
      }
    });

    // Finalize developer request log
    endRequest();
  }

  /**
   * Handle state change by notifying Electron process.
   * @private
   */
  _onStateChange(state, oldState) {
    if (typeof process.send === "function") {
      process.send({
        type: "VOICE_STATE_CHANGE",
        payload: { 
          state, 
          oldState,
          text: state === "processing" ? this.currentText : null,
          reply: state === "speaking" ? this.currentReply : null
        }
      });
    }

    if (state === "error") {
      // Recover to idle after a small delay
      setTimeout(() => this.stateMachine.transitionTo("idle"), 3000);
    }
  }

  /**
   * Start timeout timer for continuous conversation.
   * @private
   */
  _startConversationTimer() {
    this._clearConversationTimer();
    
    if (!this.settings?.conversationMode) return;

    const timeoutSec = this.settings?.conversationTimeout || 30;
    
    this.conversationTimer = setTimeout(() => {
      console.log(`[VoiceManager] Conversation timed out after ${timeoutSec}s of silence.`);
      emitDevEvent("ConversationEnded", { reason: "Silence timeout reached" });
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

// Export singleton instance
export const voiceManager = new VoiceManager();
