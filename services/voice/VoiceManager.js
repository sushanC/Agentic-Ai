import { VoiceStateMachine } from "./VoiceStateMachine.js";
import { VoiceQueue } from "./VoiceQueue.js";
import { listen } from "../sttService.js";
import { generateTTS } from "../ttsService.js";
import { routeRequest } from "../toolRouter.js";
import { addMessage } from "../historyService.js";
import { updateMemory } from "../memoryService.js";
import { updateSummary } from "../summaryService.js";
import { incrementStat } from "../../storage/statsStorage.js";
import { loadSettings } from "../../storage/settingsStorage.js";
import { emitDevEvent, beginRequest, endRequest } from "../developerBridge.js";

class VoiceManager {
  constructor() {
    this.stateMachine = new VoiceStateMachine((state, oldState) => this._onStateChange(state, oldState));
    this.queue = new VoiceQueue();
    this.settings = null;
    this.isActive = false;
    this.conversationTimer = null;
    
    // Timing metrics tracking
    this.timings = {
      totalStart: null,
      listeningStart: null,
      listeningEnd: null,
      aiStart: null,
      aiEnd: null,
      ttsStart: null,
      ttsEnd: null,
      playbackStart: null,
      playbackEnd: null
    };

    // Bind queue callbacks
    this.queue.onPlayStart = (file) => {
      if (!this.timings.playbackStart) {
        this.timings.playbackStart = Date.now();
      }
    };
    
    this.queue.onEmpty = () => {
      this.timings.playbackEnd = Date.now();
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
    // Interruption check: If speaking, stop it
    if (this.stateMachine.state === "speaking") {
      console.log("[VoiceManager] Interruption: New request started while speaking. Stopping playback.");
      this.queue.cancel();
      emitDevEvent("PlaybackCancelled", { reason: "User interrupted with new request" });
    }

    if (!this.stateMachine.transitionTo("listening")) {
      return;
    }

    // Begin logical request context for timings & logs
    beginRequest();

    this.timings = {
      totalStart: Date.now(),
      listeningStart: Date.now(),
      listeningEnd: null,
      aiStart: null,
      aiEnd: null,
      ttsStart: null,
      ttsEnd: null,
      playbackStart: null,
      playbackEnd: null
    };

    emitDevEvent("ListeningStarted", { timestamp: new Date().toISOString() });

    // Handle Conversation Mode timeout trigger
    this._startConversationTimer();

    try {
      console.log("[VoiceManager] Calling listen()");
      const result = await listen({
        language: this.settings?.language || "en",
        silenceTimeout: this.settings?.pushToTalk ? 1 : 2.5, // shorter timeout if push to talk
        maxRecordingTime: 5,
        device: this.settings?.microphoneSelection || "default"
      });

      console.log("[VoiceManager] Listen returned:", result);

      this.timings.listeningEnd = Date.now();
      emitDevEvent("ListeningFinished", { 
        timestamp: new Date().toISOString(),
        latencyMs: this.timings.listeningEnd - this.timings.listeningStart 
      });

      this._clearConversationTimer();

      if (result.error) {
        console.error("[VoiceManager] Speech recognition failed:", result.error);
        emitDevEvent("SpeechRecognitionFailed", { error: result.error });
        this.stateMachine.transitionTo("error");
        return;
      }

      const text = result.text ? result.text.trim() : "";
      emitDevEvent("SpeechRecognized", { text });

      if (!text) {
        console.log("[VoiceManager] No speech detected.");
        emitDevEvent("SpeechRecognitionFailed", { error: "No speech detected" });
        
        if (this.isActive && this.settings?.conversationMode) {
          // In conversation mode, retry listening after empty speech
          console.log("[VoiceManager] Continuous conversation active. Retrying listening...");
          this.startListening();
        } else {
          this.stateMachine.transitionTo("idle");
        }
        return;
      }

      console.log(`[VoiceManager] Recognized Speech: "${text}"`);
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
  async processRequest(text) {
    if (!this.stateMachine.transitionTo("processing")) {
      return;
    }

    this.timings.aiStart = Date.now();
    emitDevEvent("AIStarted", { prompt: text });

    try {
      // Core AI pipeline integration (CIE -> Tool Router -> MSE -> Model)
      await addMessage("user", text);
      await updateMemory(text);

      const result = await routeRequest(text);
      const reply = result.answer;

      await addMessage("assistant", reply);
      await updateSummary();
      await incrementStat("messages");

      this.timings.aiEnd = Date.now();
      emitDevEvent("AIFinished", { 
        latencyMs: this.timings.aiEnd - this.timings.aiStart,
        reply 
      });

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
    this.timings.ttsStart = Date.now();
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

      this.timings.ttsEnd = Date.now();
      emitDevEvent("TTSFinished", {
        latencyMs: this.timings.ttsEnd - this.timings.ttsStart,
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
    const end = Date.now();
    const metrics = {
      listeningLatency: this.timings.listeningEnd && this.timings.listeningStart 
        ? this.timings.listeningEnd - this.timings.listeningStart : 0,
      aiLatency: this.timings.aiEnd && this.timings.aiStart 
        ? this.timings.aiEnd - this.timings.aiStart : 0,
      ttsLatency: this.timings.ttsEnd && this.timings.ttsStart 
        ? this.timings.ttsEnd - this.timings.ttsStart : 0,
      playbackDuration: this.timings.playbackEnd && this.timings.playbackStart 
        ? this.timings.playbackEnd - this.timings.playbackStart : 0,
      totalDuration: this.timings.totalStart ? end - this.timings.totalStart : 0
    };

    console.log("[VoiceManager] timings finalized:", metrics);

    emitDevEvent("FullRequestSummary", {
      latencyMs: metrics.totalDuration,
      success: this.stateMachine.state !== "error",
      payload: {
        listeningLatency: metrics.listeningLatency,
        aiLatency: metrics.aiLatency,
        ttsLatency: metrics.ttsLatency,
        playbackDuration: metrics.playbackDuration,
        totalDuration: metrics.totalDuration
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
        payload: { state, oldState }
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
