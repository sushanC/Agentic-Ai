import { circuitBreaker, CircuitState } from "./CircuitBreaker.js";
import { providerHealthTracker } from "./ProviderHealth.js";
import { diagnostics } from "./Diagnostics.js";

/**
 * ProviderPool.js
 *
 * Single source of truth for live provider and model state.
 * Maintains health, availability, latencies, success rates, moving averages,
 * and circuit breaker states for every provider and model in the system.
 */
export class ProviderPool {
  constructor() {
    this.circuit = circuitBreaker;
    this.health = providerHealthTracker;
  }

  /**
   * Check if a provider or model is currently available for execution.
   *
   * @param {string} key - Provider key (e.g. "google", "groq") or model key (e.g. "gemini")
   * @returns {boolean}
   */
  isAvailable(key) {
    if (!key) return false;
    const allowCircuit = this.circuit.allowRequest(key);
    const healthScore = this.health.getHealthScore(key);
    const isHealthy = healthScore > 0.1;

    const available = allowCircuit && isHealthy;
    diagnostics.trace("ProviderPool", `Availability check for ${key}: available=${available} (circuit=${this.circuit.getState(key)}, healthScore=${healthScore})`);
    return available;
  }

  /**
   * Record a successful completion for a provider or model.
   * Updates health metrics and closes circuit breaker if probing.
   *
   * @param {string} key
   * @param {number} latencyMs
   */
  recordSuccess(key, latencyMs = 0) {
    if (!key) return;
    this.health.recordSuccess(key, latencyMs);
    this.circuit.recordSuccess(key);
    diagnostics.debug("ProviderPool", `Recorded success for ${key} (Latency: ${latencyMs}ms, New Health: ${this.health.getHealthScore(key)})`);
  }

  /**
   * Record a failure event for a provider or model.
   * Updates health metrics and evaluates circuit breaker trip rules.
   *
   * @param {string} key
   * @param {object} [error]
   */
  recordFailure(key, error = {}) {
    if (!key) return;
    this.health.recordFailure(key, error);
    this.circuit.recordFailure(key, error);
    diagnostics.warn("ProviderPool", `Recorded failure for ${key}`, { error: error.message || error });
  }

  /**
   * Get full live state for a provider or model.
   * @param {string} key
   * @returns {object}
   */
  getState(key) {
    const metrics = this.health.getMetrics(key);
    const circuitState = this.circuit.getState(key);

    return {
      key,
      circuitState,
      isAvailable: this.isAvailable(key),
      ...metrics,
    };
  }

  /**
   * Get health score (0.0 to 1.0) for a key.
   * @param {string} key
   * @returns {number}
   */
  getHealthScore(key) {
    return this.health.getHealthScore(key);
  }

  /**
   * Get remaining cooldown (ms) if provider/model is on cooldown.
   * @param {string} key
   * @returns {number} 0 if available
   */
  getCooldownRemaining(key) {
    const metrics = this.health.getMetrics(key);
    if (!metrics.cooldownUntil) return 0;
    return Math.max(0, metrics.cooldownUntil - Date.now());
  }

  /**
   * Manually reset provider/model health and circuit breaker.
   * @param {string} key
   */
  reset(key) {
    this.health.reset(key);
    this.circuit.reset(key);
    diagnostics.info("ProviderPool", `Reset state for ${key}`);
  }
}

export const providerPool = new ProviderPool();
