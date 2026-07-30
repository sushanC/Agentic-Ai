import { RUNTIME_CONFIG } from "./RuntimeConfig.js";
import { diagnostics } from "./Diagnostics.js";

export const CircuitState = Object.freeze({
  CLOSED:    "CLOSED",     // Normal operation, requests allowed
  OPEN:      "OPEN",       // Circuit tripped, requests blocked / skipped
  HALF_OPEN: "HALF_OPEN",  // Cooldown expired, single probe request allowed
});

/**
 * CircuitBreaker.js
 *
 * Implements a per-provider / per-model Circuit Breaker state machine.
 * States:
 *   - CLOSED: Normal healthy operation.
 *   - OPEN: Repeated failures exceeded threshold. Fast-fails / skips provider.
 *   - HALF_OPEN: Cooldown expired. Allows a probe request.
 *
 * Rules:
 *   - Consecutive transient failures >= failureThreshold -> OPEN
 *   - 429 Rate Limit / 503 Provider Outage -> OPEN immediately
 *   - Cooldown time passes -> HALF_OPEN
 *   - HALF_OPEN probe succeeds -> CLOSED
 *   - HALF_OPEN probe fails -> OPEN again (cooldown resets/escalates)
 */
export class CircuitBreaker {
  constructor() {
    this.circuits = new Map();
  }

  _getCircuit(key) {
    if (!this.circuits.has(key)) {
      this.circuits.set(key, {
        state: CircuitState.CLOSED,
        consecutiveFailures: 0,
        lastStateChange: Date.now(),
        openedAt: null,
        cooldownUntil: null,
        probeActive: false,
      });
    }
    return this.circuits.get(key);
  }

  /**
   * Get current state of a circuit breaker.
   * Auto-transitions from OPEN to HALF_OPEN if cooldown has expired.
   *
   * @param {string} key - Provider or model identifier
   * @returns {string} One of CircuitState values
   */
  getState(key) {
    const circuit = this._getCircuit(key);
    const now = Date.now();

    if (circuit.state === CircuitState.OPEN) {
      if (circuit.cooldownUntil && now >= circuit.cooldownUntil) {
        this._transitionTo(key, circuit, CircuitState.HALF_OPEN);
      }
    }

    return circuit.state;
  }

  /**
   * Check if requests are allowed through this circuit breaker.
   * @param {string} key
   * @returns {boolean}
   */
  allowRequest(key) {
    const state = this.getState(key);
    const circuit = this._getCircuit(key);

    if (state === CircuitState.CLOSED) return true;

    if (state === CircuitState.HALF_OPEN) {
      if (!circuit.probeActive) {
        circuit.probeActive = true;
        diagnostics.info("CircuitBreaker", `Allowing single probe request for ${key} (HALF_OPEN)`);
        return true;
      }
      return false;
    }

    return false; // OPEN
  }

  /**
   * Record a successful completion.
   * Resets failures and closes circuit if in HALF_OPEN or CLOSED.
   * @param {string} key
   */
  recordSuccess(key) {
    const circuit = this._getCircuit(key);
    circuit.consecutiveFailures = 0;
    circuit.probeActive = false;

    if (circuit.state !== CircuitState.CLOSED) {
      diagnostics.info("CircuitBreaker", `Probe succeeded for ${key}. Closing circuit (CLOSED).`);
      this._transitionTo(key, circuit, CircuitState.CLOSED);
    }
  }

  /**
   * Record a failure event.
   * Tripping rules:
   *  - If 429 Rate limit or 503 Outage: Trip OPEN immediately.
   *  - If consecutive failures >= threshold: Trip OPEN.
   *  - If HALF_OPEN fails: Trip OPEN immediately.
   *
   * @param {string} key
   * @param {object} [error]
   */
  recordFailure(key, error = {}) {
    const circuit = this._getCircuit(key);
    circuit.consecutiveFailures++;
    circuit.probeActive = false;

    const isImmediateTrip = error.type === "RATE_LIMIT" || error.type === "PROVIDER_UNAVAILABLE" || error.status === 429;
    const isHalfOpenFailure = circuit.state === CircuitState.HALF_OPEN;
    const isThresholdExceeded = circuit.consecutiveFailures >= RUNTIME_CONFIG.CIRCUIT.failureThreshold;

    if (isImmediateTrip || isHalfOpenFailure || isThresholdExceeded) {
      const cooldown = isImmediateTrip
        ? (error.cooldownMs || RUNTIME_CONFIG.CIRCUIT.cooldownMs * 2)
        : RUNTIME_CONFIG.CIRCUIT.cooldownMs;

      circuit.cooldownUntil = Date.now() + cooldown;
      diagnostics.warn("CircuitBreaker", `Circuit TRIPPED for ${key} (Failures: ${circuit.consecutiveFailures}, Cooldown: ${cooldown}ms)`, { errorType: error.type });
      this._transitionTo(key, circuit, CircuitState.OPEN);
    }
  }

  /**
   * Manually reset circuit breaker for a key.
   * @param {string} key
   */
  reset(key) {
    const circuit = this._getCircuit(key);
    circuit.consecutiveFailures = 0;
    circuit.cooldownUntil = null;
    circuit.probeActive = false;
    this._transitionTo(key, circuit, CircuitState.CLOSED);
  }

  _transitionTo(key, circuit, newState) {
    if (circuit.state !== newState) {
      const oldState = circuit.state;
      circuit.state = newState;
      circuit.lastStateChange = Date.now();
      if (newState === CircuitState.OPEN) {
        circuit.openedAt = Date.now();
      }
      diagnostics.info("CircuitBreaker", `State transition for ${key}: ${oldState} -> ${newState}`);
    }
  }
}

export const circuitBreaker = new CircuitBreaker();
