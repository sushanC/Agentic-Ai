/**
 * HealthScorer.js — Model Selection Engine
 *
 * Per-model health tracking for samGPT.
 *
 * Tracks health at the MODEL level (e.g. "gemini", "deepseek") rather than the
 * provider level (e.g. "google", "groq"). This allows models sharing a provider
 * (e.g. two OpenRouter models) to have independent health records.
 *
 * Architecture:
 *  - Uses Exponential Moving Average (EMA) for success/failure rates so recent
 *    events have more influence than historical ones.
 *  - Cooldown durations are determined by failure type (Phase 7).
 *  - Auth errors and balance errors permanently disable a model until reset.
 *  - Completely independent from ProviderHealthManager — provider health
 *    continues to serve the executeWithCie retry loop; model health serves MSE.
 *
 * Public API:
 *  - recordModelSuccess(modelKey, latencyMs)
 *  - recordModelFailure(modelKey, providerError)
 *  - getModelHealth(modelKey) → full health record
 *  - getModelHealthScore(modelKey) → 0.0–1.0
 *  - isModelAvailable(modelKey) → boolean
 *  - getCooldownRemaining(modelKey) → ms remaining (0 if available)
 *  - resetModelHealth(modelKey)
 *  - resetAllModelHealth()
 *  - getAllModelHealthScores() → { [modelKey]: score }
 */

import { ProviderErrorType } from "../cie/ProviderErrorClassifier.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const EMA_ALPHA = 0.25;               // Slightly more reactive than provider-level EMA
const FAILURE_HISTORY_MAX = 10;       // Rolling window of last N failures

// Latency thresholds for score penalties
const LATENCY_PENALTY_HIGH   = 12_000; // >12s → heavy penalty
const LATENCY_PENALTY_MEDIUM = 6_000;  // >6s  → moderate penalty

// Health thresholds
const HEALTH_SCORE_DISABLED = 0.0;
const HEALTH_SCORE_COOLDOWN = 0.02;

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7 — Cooldown Durations by Error Type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the cooldown duration in milliseconds for a given error type.
 * Auth and balance errors return -1 (permanent disable until manual reset).
 *
 * @param {string} errorType   - One of ProviderErrorType values
 * @param {number} rateLimitCount - Number of rate limit events (escalates duration)
 * @returns {number} Cooldown in ms, or -1 for permanent disable
 */
function getCooldownMs(errorType, rateLimitCount = 0) {
  switch (errorType) {
    case ProviderErrorType.RATE_LIMIT: {
      // Escalating cooldown: 30s base, up to 120s after repeated limits
      const base = 30_000;
      const escalation = Math.min(rateLimitCount * 15_000, 90_000);
      return base + escalation;
    }
    case ProviderErrorType.NETWORK:
      return 10_000;

    case ProviderErrorType.MODEL_OVERLOADED:
      return 20_000;

    case ProviderErrorType.PROVIDER_UNAVAILABLE: {
      // Escalating: 20s–60s
      return 20_000 + Math.min(rateLimitCount * 10_000, 40_000);
    }

    case ProviderErrorType.TIMEOUT:
      return 15_000;

    case ProviderErrorType.AUTH_ERROR:
    case ProviderErrorType.INSUFFICIENT_BALANCE:
      return -1; // Permanent until manual reset

    case ProviderErrorType.CONTEXT_LIMIT:
    case ProviderErrorType.PAYLOAD_TOO_LARGE:
      return 0; // No cooldown — handled by compression, not availability

    default:
      return 5_000; // Unknown errors: brief cooldown
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Health Record Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a fresh health record for a model (starts optimistic).
 * @returns {object}
 */
function createModelHealthRecord() {
  return {
    // EMA-based rates
    successRate:        1.0,  // Starts optimistic
    failureRate:        0.0,

    // Latency tracking
    avgLatencyMs:       0,    // EMA of response time
    avgResponseTimeMs:  0,    // Alias — first-token latency (same for non-streaming)

    // Counters
    totalRequests:      0,
    totalSuccesses:     0,
    totalFailures:      0,
    contextErrorCount:  0,
    rateLimitCount:     0,
    networkErrorCount:  0,

    // Cooldown state
    cooldownExpiry:         null,    // Timestamp (ms) when cooldown ends; null = no cooldown
    permanentlyDisabled:    false,   // Auth / balance failures

    // Derived
    available:          true,
    healthScore:        1.0,

    // History
    lastSuccessAt:      null,
    lastFailureAt:      null,
    lastFailureType:    null,
    failureHistory:     [],  // Ring buffer of last FAILURE_HISTORY_MAX failures
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal State
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Map<string, object>} */
const modelHealthStore = new Map();

function getRecord(modelKey) {
  if (!modelHealthStore.has(modelKey)) {
    modelHealthStore.set(modelKey, createModelHealthRecord());
  }
  return modelHealthStore.get(modelKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// EMA Helper
// ─────────────────────────────────────────────────────────────────────────────

function updateEma(current, newValue) {
  if (current === 0 && newValue === 0) return 0;
  if (current === 0) return newValue;
  return EMA_ALPHA * newValue + (1 - EMA_ALPHA) * current;
}

// ─────────────────────────────────────────────────────────────────────────────
// Availability Resolver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine if a model is currently available based on its health record.
 * @param {object} rec - Health record
 * @returns {boolean}
 */
function resolveAvailability(rec) {
  if (rec.permanentlyDisabled) return false;
  if (rec.cooldownExpiry && Date.now() < rec.cooldownExpiry) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite Health Score
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a normalized health score (0.0–1.0) for a model.
 * Used by IntentScorer as the health component of the weighted total.
 *
 * @param {object} rec - Health record
 * @returns {number} 0.0–1.0
 */
function computeHealthScore(rec) {
  if (rec.permanentlyDisabled) return HEALTH_SCORE_DISABLED;
  if (rec.cooldownExpiry && Date.now() < rec.cooldownExpiry) return HEALTH_SCORE_COOLDOWN;

  let score = rec.successRate;

  // Latency penalty
  if (rec.avgLatencyMs > LATENCY_PENALTY_HIGH) {
    score *= 0.65;
  } else if (rec.avgLatencyMs > LATENCY_PENALTY_MEDIUM) {
    score *= 0.82;
  }

  // Repeated rate limits reduce score
  if (rec.rateLimitCount > 3) score *= 0.85;
  if (rec.rateLimitCount > 7) score *= 0.75;

  // Recent failure penalty
  if (rec.lastFailureAt && (Date.now() - rec.lastFailureAt) < 60_000) {
    score *= 0.90;
  }

  return Math.max(0.0, Math.min(1.0, score));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a successful model call.
 *
 * @param {string} modelKey  - Registry key (e.g. "gemini", "deepseek")
 * @param {number} latencyMs - Response time in milliseconds
 */
export function recordModelSuccess(modelKey, latencyMs) {
  const rec = getRecord(modelKey);
  const now = Date.now();

  rec.totalRequests++;
  rec.totalSuccesses++;
  rec.successRate    = updateEma(rec.successRate, 1.0);
  rec.failureRate    = updateEma(rec.failureRate, 0.0);
  rec.avgLatencyMs   = updateEma(rec.avgLatencyMs, latencyMs);
  rec.avgResponseTimeMs = rec.avgLatencyMs;
  rec.lastSuccessAt  = now;

  // A successful call clears non-permanent cooldowns
  if (!rec.permanentlyDisabled) {
    rec.cooldownExpiry = null;
  }

  rec.available    = resolveAvailability(rec);
  rec.healthScore  = computeHealthScore(rec);
}

/**
 * Record a failed model call.
 *
 * @param {string} modelKey       - Registry key (e.g. "gemini", "deepseek")
 * @param {import("../cie/ProviderErrorClassifier.js").ProviderError} providerError
 */
export function recordModelFailure(modelKey, providerError) {
  const rec = getRecord(modelKey);
  const now = Date.now();

  rec.totalRequests++;
  rec.totalFailures++;
  rec.successRate    = updateEma(rec.successRate, 0.0);
  rec.failureRate    = updateEma(rec.failureRate, 1.0);
  rec.lastFailureAt  = now;
  rec.lastFailureType = providerError.errorType;

  // Add to failure history ring buffer
  rec.failureHistory.push({
    errorType:  providerError.errorType,
    statusCode: providerError.statusCode,
    timestamp:  now,
  });
  if (rec.failureHistory.length > FAILURE_HISTORY_MAX) {
    rec.failureHistory.shift();
  }

  // Error-type counters
  switch (providerError.errorType) {
    case ProviderErrorType.RATE_LIMIT:
      rec.rateLimitCount++;
      break;
    case ProviderErrorType.NETWORK:
      rec.networkErrorCount++;
      break;
    case ProviderErrorType.CONTEXT_LIMIT:
    case ProviderErrorType.PAYLOAD_TOO_LARGE:
      rec.contextErrorCount++;
      break;
    default:
      break;
  }

  // Set cooldown
  const cooldownMs = getCooldownMs(providerError.errorType, rec.rateLimitCount);
  if (cooldownMs === -1) {
    // Permanent disable
    rec.permanentlyDisabled = true;
    rec.cooldownExpiry = null;
    console.warn(`⛔ [HealthScorer] Model "${modelKey}" permanently disabled due to ${providerError.errorType}. Manual reset required.`);
  } else if (cooldownMs > 0) {
    rec.cooldownExpiry = now + cooldownMs;
    console.warn(`🕐 [HealthScorer] Model "${modelKey}" cooling down for ${(cooldownMs / 1000).toFixed(0)}s (${providerError.errorType})`);
  }

  rec.available   = resolveAvailability(rec);
  rec.healthScore = computeHealthScore(rec);
}

/**
 * Get the full health record for a model.
 *
 * @param {string} modelKey
 * @returns {object} Snapshot of health record with refreshed availability
 */
export function getModelHealth(modelKey) {
  const rec = getRecord(modelKey);
  // Refresh derived fields (cooldowns may have expired)
  rec.available   = resolveAvailability(rec);
  rec.healthScore = computeHealthScore(rec);
  return { ...rec, failureHistory: [...rec.failureHistory] };
}

/**
 * Get a normalized health score (0.0–1.0) for a model.
 *
 * @param {string} modelKey
 * @returns {number}
 */
export function getModelHealthScore(modelKey) {
  const rec = getRecord(modelKey);
  rec.available   = resolveAvailability(rec);
  rec.healthScore = computeHealthScore(rec);
  return rec.healthScore;
}

/**
 * Check whether a model is currently available for requests.
 *
 * @param {string} modelKey
 * @returns {boolean}
 */
export function isModelAvailable(modelKey) {
  const rec = getRecord(modelKey);
  return resolveAvailability(rec);
}

/**
 * Get remaining cooldown in milliseconds for a model.
 * Returns 0 if the model is not in cooldown.
 *
 * @param {string} modelKey
 * @returns {number} milliseconds remaining
 */
export function getCooldownRemaining(modelKey) {
  const rec = getRecord(modelKey);
  if (rec.permanentlyDisabled) return Infinity;
  if (rec.cooldownExpiry && Date.now() < rec.cooldownExpiry) {
    return rec.cooldownExpiry - Date.now();
  }
  return 0;
}

/**
 * Get health scores for all tracked models.
 * @returns {object} { [modelKey]: score }
 */
export function getAllModelHealthScores() {
  const scores = {};
  for (const key of modelHealthStore.keys()) {
    scores[key] = getModelHealthScore(key);
  }
  return scores;
}

/**
 * Reset health data for a specific model (clears permanent disable and cooldowns).
 * @param {string} modelKey
 */
export function resetModelHealth(modelKey) {
  modelHealthStore.set(modelKey, createModelHealthRecord());
  console.log(`♻️  [HealthScorer] Health reset for model "${modelKey}"`);
}

/**
 * Reset health data for all models.
 */
export function resetAllModelHealth() {
  modelHealthStore.clear();
  console.log("♻️  [HealthScorer] All model health records reset.");
}
