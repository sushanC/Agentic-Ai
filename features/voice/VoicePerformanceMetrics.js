import { performance } from "perf_hooks";
import { emitDevEvent } from "../../services/developerBridge.js";

class VoicePerformanceMetrics {
  constructor() {
    this.reset();
  }

  reset() {
    this.sessionId = null;
    this.timestamps = {};
    this.durations = {};
    this.metadata = {
      routingProfile: "VoiceLatencyProfile",
      selectedModel: null,
      fallbackChain: [],
      selectionReason: null,
      text: "",
      reply: ""
    };
  }

  startSession(sessionId) {
    this.reset();
    this.sessionId = sessionId || `voice-${Date.now()}`;
    this.start("total");
  }

  start(phase) {
    this.timestamps[`${phase}Start`] = performance.now();
  }

  end(phase) {
    const startKey = `${phase}Start`;
    if (this.timestamps[startKey] !== undefined) {
      this.durations[phase] = performance.now() - this.timestamps[startKey];
    }
  }

  recordDuration(phase, durationMs) {
    this.durations[phase] = durationMs;
  }

  setMetadata(key, value) {
    this.metadata[key] = value;
  }

  getSummary() {
    const round = (val) => val !== undefined ? Number(val.toFixed(2)) : 0;
    
    return {
      sessionId: this.sessionId,
      latencies: {
        recording: round(this.durations.recording),
        whisper: round(this.durations.whisper),
        promptBuild: round(this.durations.promptBuild),
        cie: round(this.durations.cie),
        toolRouter: round(this.durations.toolRouter),
        mse: round(this.durations.mse),
        provider: round(this.durations.provider),
        tts: round(this.durations.tts),
        playbackStartup: round(this.durations.playbackStartup),
        playbackDuration: round(this.durations.playback),
        totalLatency: round(this.durations.total)
      },
      metadata: { ...this.metadata }
    };
  }

  emitToConsole() {
    const summary = this.getSummary();
    
    emitDevEvent("VoicePerformanceMetrics", {
      sessionId: summary.sessionId,
      recordingLatencyMs: summary.latencies.recording,
      whisperLatencyMs: summary.latencies.whisper,
      promptBuildLatencyMs: summary.latencies.promptBuild,
      cieLatencyMs: summary.latencies.cie,
      toolRouterLatencyMs: summary.latencies.toolRouter,
      mseLatencyMs: summary.latencies.mse,
      providerLatencyMs: summary.latencies.provider,
      ttsLatencyMs: summary.latencies.tts,
      playbackStartupLatencyMs: summary.latencies.playbackStartup,
      playbackDurationMs: summary.latencies.playbackDuration,
      totalVoiceResponseLatencyMs: summary.latencies.totalLatency,
      voiceRoutingProfile: summary.metadata.routingProfile,
      selectedModel: summary.metadata.selectedModel,
      fallbackChain: summary.metadata.fallbackChain,
      selectionReason: summary.metadata.selectionReason
    });

    console.log("\n🎙️ [Voice Performance Telemetry]");
    console.log(`  Recording Latency       : ${summary.latencies.recording} ms`);
    console.log(`  Whisper Latency         : ${summary.latencies.whisper} ms`);
    console.log(`  CIE Latency             : ${summary.latencies.cie} ms`);
    console.log(`  Tool Router Latency     : ${summary.latencies.toolRouter} ms`);
    console.log(`  MSE Selection Latency   : ${summary.latencies.mse} ms`);
    console.log(`  Provider Latency        : ${summary.latencies.provider} ms`);
    console.log(`  TTS Latency             : ${summary.latencies.tts} ms`);
    console.log(`  Playback Startup Latency: ${summary.latencies.playbackStartup} ms`);
    console.log(`  Total Voice Latency     : ${summary.latencies.totalLatency} ms`);
    console.log(`  Selected Model          : ${summary.metadata.selectedModel}`);
    console.log(`  Selection Reason        : ${summary.metadata.selectionReason}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  }
}

export const voiceMetrics = new VoicePerformanceMetrics();
