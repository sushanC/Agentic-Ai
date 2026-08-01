import { developerEvents } from "../events/DeveloperEvents.js";

/**
 * VisionDiagnostics.js
 *
 * Telemetry logging and developer event emissions for the Vision Framework.
 */
export class VisionDiagnostics {
  constructor() {
    this.events = developerEvents;
  }

  logStarted(task, imageCount) {
    this.events.emitDevEvent("VisionStarted", { task, imageCount });
  }

  logProviderSelected(providerName, modelId) {
    this.events.emitDevEvent("VisionProviderSelected", { provider: providerName, model: modelId });
  }

  logImageNormalized(count, totalBytes) {
    this.events.emitDevEvent("VisionImageNormalized", { count, totalBytes });
  }

  logAnalyzerCompleted(analyzerName, durationMs) {
    this.events.emitDevEvent("VisionAnalyzerCompleted", { analyzer: analyzerName, durationMs });
  }

  logProviderFailed(providerName, error) {
    this.events.emitDevEvent("VisionProviderFailed", { provider: providerName, error: error.message || error });
  }

  logFallbackActivated(fromProvider, toProvider) {
    this.events.emitDevEvent("VisionFallbackActivated", { from: fromProvider, to: toProvider });
  }

  logFinished(providerName, task, durationMs, cached = false) {
    this.events.emitDevEvent("VisionCompleted", { provider: providerName, task, durationMs, cached });
  }

  logError(task, error) {
    this.events.emitDevEvent("VisionError", { task, error: error.message || error });
  }
}

export const visionDiagnostics = new VisionDiagnostics();
