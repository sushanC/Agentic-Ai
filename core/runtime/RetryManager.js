import { RUNTIME_CONFIG } from "./RuntimeConfig.js";
import { diagnostics } from "./Diagnostics.js";

/**
 * RetryManager.js
 *
 * Evaluates error transientness and computes exponential backoff delays with randomized jitter.
 *
 * Rules:
 *  - Retryable: TIMEOUT, NETWORK, CONNECTION_RESET, HTTP 502, 503, 504.
 *  - Non-retryable: HTTP 401, 403, INSUFFICIENT_BALANCE, INVALID_REQUEST, UNSUPPORTED_MODEL.
 */
export class RetryManager {
  /**
   * Determine if an error is a transient failure that should be retried.
   *
   * @param {object|Error} err
   * @returns {boolean}
   */
  isRetryable(err) {
    if (!err) return false;

    const code = err.code || err.status || err.statusCode;
    const type = err.type || err.name;
    const msg = String(err.message || "").toLowerCase();

    // Permanent non-retryable errors
    if (code === 401 || code === 403) return false;
    if (type === "AUTH_ERROR" || type === "INSUFFICIENT_BALANCE" || type === "INVALID_REQUEST") return false;
    if (msg.includes("api key") || msg.includes("unauthorized") || msg.includes("invalid key")) return false;

    // Transient retryable errors
    if (code === 429 || code === 502 || code === 503 || code === 504) return true;
    if (type === "TIMEOUT" || type === "NETWORK" || type === "MODEL_OVERLOADED" || type === "PROVIDER_UNAVAILABLE") return true;
    if (msg.includes("timeout") || msg.includes("econnreset") || msg.includes("etimedout") || msg.includes("overloaded") || msg.includes("fetch failed")) return true;

    return false;
  }

  /**
   * Calculate exponential backoff delay (ms) with randomized jitter.
   * Formula: delay = min(maxBackoff, initialBackoff * 2^attempt) ± jitter
   *
   * @param {number} attempt - Current retry attempt index (0-based)
   * @returns {number} Delay in milliseconds
   */
  calculateBackoff(attempt) {
    const { initialBackoffMs, maxBackoffMs, jitterFactor } = RUNTIME_CONFIG.RETRY;
    const rawBackoff = Math.min(maxBackoffMs, initialBackoffMs * Math.pow(2, attempt));

    // Calculate jitter (+/- jitterFactor)
    const jitterRange = rawBackoff * jitterFactor;
    const jitter = (Math.random() * 2 - 1) * jitterRange;

    const delay = Math.max(0, Math.round(rawBackoff + jitter));
    diagnostics.debug("RetryManager", `Calculated backoff for attempt ${attempt + 1}: ${delay}ms`);
    return delay;
  }

  /**
   * Sleep helper for backoff delay execution.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const retryManager = new RetryManager();
