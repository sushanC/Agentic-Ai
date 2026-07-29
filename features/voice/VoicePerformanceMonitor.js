import { performance } from "perf_hooks";

/**
 * VoicePerformanceMonitor.js
 *
 * Provides high-precision benchmarking for the voice request lifecycle.
 * Uses performance.now() for sub-millisecond reliability.
 */
class VoicePerformanceMonitor {
  constructor() {
    this.timestamps = {};
    this.durations = {};
    this.sessionId = null;
  }

  /**
   * Reset all telemetry metrics and start a new tracking session.
   * @param {string} sessionId
   */
  startSession(sessionId) {
    this.timestamps = {};
    this.durations = {};
    this.sessionId = sessionId;
    this.start("total");
  }

  /**
   * Mark the start of a voice request sub-phase.
   * @param {string} phase
   */
  start(phase) {
    this.timestamps[`${phase}Start`] = performance.now();
  }

  /**
   * Mark the end of a voice request sub-phase and calculate duration.
   * @param {string} phase
   */
  end(phase) {
    const startKey = `${phase}Start`;
    if (this.timestamps[startKey] !== undefined) {
      this.durations[phase] = performance.now() - this.timestamps[startKey];
    }
  }

  /**
   * Directly record a duration for a phase (e.g. from python daemon stats).
   * @param {string} phase
   * @param {number} durationMs
   */
  recordDuration(phase, durationMs) {
    this.durations[phase] = durationMs;
  }

  /**
   * Get all recorded phase durations rounded to 2 decimal places.
   * @returns {object}
   */
  getMetrics() {
    const metrics = {};
    for (const [phase, val] of Object.entries(this.durations)) {
      metrics[phase] = Number(val.toFixed(2));
    }
    return metrics;
  }
}

export const perfMonitor = new VoicePerformanceMonitor();
