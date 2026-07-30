import { RUNTIME_CONFIG } from "./RuntimeConfig.js";

/**
 * ProviderHealth.js
 *
 * Maintains rolling health metrics per provider and model.
 * Computes Exponential Moving Average (EMA) of success rates, average latency,
 * P95 latency over a moving window, and health scores (0.0 to 1.0).
 */
export class ProviderHealthTracker {
  constructor() {
    this.records = new Map();
  }

  _getRecord(key) {
    if (!this.records.has(key)) {
      this.records.set(key, {
        successRate: 1.0,           // EMA of success rate (1.0 = 100%)
        avgLatencyMs: 0,            // EMA of response latency
        latencies: [],              // Window of last N latencies for P95
        totalRequests: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        consecutiveFailures: 0,
        lastSuccessTime: null,
        lastFailureTime: null,
        lastFailureType: null,
        cooldownUntil: null,
      });
    }
    return this.records.get(key);
  }

  /**
   * Record a successful invocation.
   * @param {string} key
   * @param {number} latencyMs
   */
  recordSuccess(key, latencyMs = 0) {
    const r = this._getRecord(key);
    const alpha = RUNTIME_CONFIG.HEALTH.emaAlpha;

    r.totalRequests++;
    r.totalSuccesses++;
    r.consecutiveFailures = 0;
    r.lastSuccessTime = Date.now();

    // EMA updates
    r.successRate = alpha * 1.0 + (1 - alpha) * r.successRate;
    r.avgLatencyMs = r.avgLatencyMs === 0 ? latencyMs : (alpha * latencyMs + (1 - alpha) * r.avgLatencyMs);

    // P95 latency window update
    r.latencies.push(latencyMs);
    if (r.latencies.length > RUNTIME_CONFIG.HEALTH.p95WindowSize) {
      r.latencies.shift();
    }
  }

  /**
   * Record a failure invocation.
   * @param {string} key
   * @param {object} [error]
   */
  recordFailure(key, error = {}) {
    const r = this._getRecord(key);
    const alpha = RUNTIME_CONFIG.HEALTH.emaAlpha;

    r.totalRequests++;
    r.totalFailures++;
    r.consecutiveFailures++;
    r.lastFailureTime = Date.now();
    r.lastFailureType = error.type || error.name || "UNKNOWN";

    // EMA update for failure
    r.successRate = alpha * 0.0 + (1 - alpha) * r.successRate;

    if (error.cooldownMs) {
      r.cooldownUntil = Date.now() + error.cooldownMs;
    }
  }

  /**
   * Compute rolling P95 latency over recent window.
   * @param {string} key
   * @returns {number}
   */
  getP95Latency(key) {
    const r = this._getRecord(key);
    if (r.latencies.length === 0) return r.avgLatencyMs;

    const sorted = [...r.latencies].sort((a, b) => a - b);
    const p95Idx = Math.floor(sorted.length * 0.95);
    return sorted[p95Idx] || sorted[sorted.length - 1];
  }

  /**
   * Get composite health score (0.0 to 1.0) factoring in success rate, latency penalty, and cooldowns.
   * @param {string} key
   * @returns {number}
   */
  getHealthScore(key) {
    const r = this._getRecord(key);
    const now = Date.now();

    // Cooldown check
    if (r.cooldownUntil && now < r.cooldownUntil) {
      return 0.05;
    }

    let score = r.successRate;

    // Latency penalty
    const p95 = this.getP95Latency(key);
    if (p95 > RUNTIME_CONFIG.LATENCY.highPenaltyMs) {
      score *= 0.6;
    } else if (p95 > RUNTIME_CONFIG.LATENCY.mediumPenaltyMs) {
      score *= 0.85;
    }

    return Math.max(0.0, Math.min(1.0, Math.round(score * 100) / 100));
  }

  /**
   * Return full health metrics record.
   * @param {string} key
   * @returns {object}
   */
  getMetrics(key) {
    const r = this._getRecord(key);
    return {
      ...r,
      p95LatencyMs: this.getP95Latency(key),
      healthScore: this.getHealthScore(key),
    };
  }

  /**
   * Reset health record for key.
   * @param {string} key
   */
  reset(key) {
    this.records.delete(key);
  }
}

export const providerHealthTracker = new ProviderHealthTracker();
