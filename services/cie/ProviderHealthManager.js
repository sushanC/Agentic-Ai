/**
 * ProviderHealthManager.js
 *
 * In-memory provider health tracking for the samGPT AI pipeline.
 *
 * Records success/failure events per provider and exposes health scores
 * that influence adaptive model selection in modelRouter.js.
 *
 * Design decisions:
 *  - In-memory only: resets on restart to avoid stale penalty data.
 *  - Uses exponential moving average (EMA) for success rate so recent
 *    events have more influence than old ones.
 *  - Thread-safe for single-process Node.js (no async locks needed).
 */

import { ProviderErrorType } from "./ProviderErrorClassifier.js";

// ─────────────────────────────────────────────────────────────────────────────
// Provider Status Enum
// ─────────────────────────────────────────────────────────────────────────────

export const ProviderStatus = Object.freeze({
  HEALTHY:      "healthy",
  BUSY:         "busy",
  RATE_LIMITED: "rate_limited",
  OFFLINE:      "offline",
  DISABLED:     "disabled",
});

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const EMA_ALPHA = 0.2;          // EMA smoothing factor (higher = more reactive)
const RATE_LIMIT_COOLDOWN_MS = 60_000;   // 1 minute cooldown after 429
const OFFLINE_COOLDOWN_MS    = 120_000;  // 2 minute cooldown after network failure
const LOW_HEALTH_THRESHOLD   = 0.5;      // Below this score = degraded
const OFFLINE_THRESHOLD      = 0.2;      // Below this score = offline

// ─────────────────────────────────────────────────────────────────────────────
// Health Record Factory
// ─────────────────────────────────────────────────────────────────────────────

function createHealthRecord() {
  return {
    successRate: 1.0,        // EMA of success (starts optimistic)
    avgLatencyMs: 0,         // EMA of response latency
    totalRequests: 0,        // Total requests attempted
    totalSuccesses: 0,       // Total successful completions
    totalFailures: 0,        // Total failed attempts
    contextErrorCount: 0,    // CONTEXT_LIMIT / PAYLOAD_TOO_LARGE errors
    rateLimitCount: 0,       // RATE_LIMIT (429) events
    timeoutCount: 0,         // TIMEOUT events
    lastFailureType: null,   // Last ProviderErrorType seen
    lastFailureTime: null,   // Timestamp of last failure (ms)
    rateLimitedUntil: null,  // Timestamp when rate limit cooldown ends
    offlineUntil: null,      // Timestamp when offline cooldown ends
    status: ProviderStatus.HEALTHY,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EMA update helper
// ─────────────────────────────────────────────────────────────────────────────

function updateEma(current, newValue) {
  if (current === 0 && newValue === 0) return 0;
  if (current === 0) return newValue;
  return EMA_ALPHA * newValue + (1 - EMA_ALPHA) * current;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal State
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Map<string, object>} */
const healthStore = new Map();

function getRecord(providerKey) {
  if (!healthStore.has(providerKey)) {
    healthStore.set(providerKey, createHealthRecord());
  }
  return healthStore.get(providerKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Resolver
// ─────────────────────────────────────────────────────────────────────────────

function resolveStatus(record) {
  const now = Date.now();

  if (record.rateLimitedUntil && now < record.rateLimitedUntil) {
    return ProviderStatus.RATE_LIMITED;
  }
  if (record.offlineUntil && now < record.offlineUntil) {
    return ProviderStatus.OFFLINE;
  }

  if (record.successRate < OFFLINE_THRESHOLD) {
    return ProviderStatus.OFFLINE;
  }
  if (record.successRate < LOW_HEALTH_THRESHOLD) {
    return ProviderStatus.BUSY;
  }
  return ProviderStatus.HEALTHY;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a successful provider call.
 *
 * @param {string} providerKey - Provider identifier (e.g. "google", "groq")
 * @param {number} latencyMs   - Response time in milliseconds
 */
export function recordSuccess(providerKey, latencyMs) {
  const rec = getRecord(providerKey);
  rec.totalRequests++;
  rec.totalSuccesses++;
  rec.successRate = updateEma(rec.successRate, 1.0);
  rec.avgLatencyMs = updateEma(rec.avgLatencyMs, latencyMs);

  // Clear cooldowns on success
  rec.rateLimitedUntil = null;
  rec.offlineUntil = null;

  rec.status = resolveStatus(rec);
}

/**
 * Record a provider failure.
 *
 * @param {string} providerKey      - Provider identifier
 * @param {import("./ProviderErrorClassifier.js").ProviderError} providerError - The classified error
 */
export function recordFailure(providerKey, providerError) {
  const rec = getRecord(providerKey);
  const now = Date.now();

  rec.totalRequests++;
  rec.totalFailures++;
  rec.successRate = updateEma(rec.successRate, 0.0);
  rec.lastFailureType = providerError.errorType;
  rec.lastFailureTime = now;

  // Error-type specific tracking
  switch (providerError.errorType) {
    case ProviderErrorType.CONTEXT_LIMIT:
    case ProviderErrorType.PAYLOAD_TOO_LARGE:
      rec.contextErrorCount++;
      break;

    case ProviderErrorType.RATE_LIMIT:
      rec.rateLimitCount++;
      rec.rateLimitedUntil = now + RATE_LIMIT_COOLDOWN_MS;
      break;

    case ProviderErrorType.TIMEOUT:
      rec.timeoutCount++;
      break;

    case ProviderErrorType.NETWORK:
    case ProviderErrorType.PROVIDER_UNAVAILABLE:
      rec.offlineUntil = now + OFFLINE_COOLDOWN_MS;
      break;

    default:
      break;
  }

  rec.status = resolveStatus(rec);
}

/**
 * Get the full health record for a provider.
 *
 * @param {string} providerKey
 * @returns {object} Health record snapshot
 */
export function getHealth(providerKey) {
  const rec = getRecord(providerKey);
  // Refresh status (cooldowns may have expired)
  rec.status = resolveStatus(rec);
  return { ...rec };
}

/**
 * Get a normalized health score from 0.0 (worst) to 1.0 (best).
 * Incorporates success rate, latency tier, and error pattern penalties.
 *
 * @param {string} providerKey
 * @returns {number} 0.0–1.0
 */
export function getHealthScore(providerKey) {
  const rec = getRecord(providerKey);
  const now = Date.now();

  // Cooling-down providers get a very low score so they are skipped
  if (rec.rateLimitedUntil && now < rec.rateLimitedUntil) return 0.05;
  if (rec.offlineUntil && now < rec.offlineUntil) return 0.0;

  // Base: EMA success rate (0.0–1.0)
  let score = rec.successRate;

  // Latency penalty: high average latency reduces score slightly
  if (rec.avgLatencyMs > 10_000) score *= 0.7;
  else if (rec.avgLatencyMs > 5_000) score *= 0.85;

  // Frequent rate limits reduce score
  if (rec.rateLimitCount > 5) score *= 0.8;

  return Math.max(0.0, Math.min(1.0, score));
}

/**
 * Get current status string for a provider.
 *
 * @param {string} providerKey
 * @returns {string} One of ProviderStatus values
 */
export function getStatus(providerKey) {
  const rec = getRecord(providerKey);
  rec.status = resolveStatus(rec);
  return rec.status;
}

/**
 * Check whether a provider is currently available for requests.
 * Returns false if rate-limited or offline.
 *
 * @param {string} providerKey
 * @returns {boolean}
 */
export function isAvailable(providerKey) {
  const status = getStatus(providerKey);
  return status !== ProviderStatus.RATE_LIMITED && status !== ProviderStatus.OFFLINE;
}

/**
 * Get health scores for all tracked providers.
 * @returns {object} { [providerKey]: score }
 */
export function getAllHealthScores() {
  const scores = {};
  for (const key of healthStore.keys()) {
    scores[key] = getHealthScore(key);
  }
  return scores;
}

/**
 * Reset health data for a specific provider (useful in tests).
 * @param {string} providerKey
 */
export function resetHealth(providerKey) {
  healthStore.set(providerKey, createHealthRecord());
}

/**
 * Reset all health data (useful in tests).
 */
export function resetAllHealth() {
  healthStore.clear();
}
