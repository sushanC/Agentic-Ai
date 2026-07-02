/**
 * RetryPolicyEngine.js
 *
 * Centralized retry, compression, and fallback decision engine.
 *
 * Replaces the inline `checkIsSizeError()` / retry loop previously in ai.js.
 * All retry decisions are made deterministically from the ProviderError type —
 * no string matching on raw error messages in calling code.
 *
 * Decision priority (evaluated in order):
 *  1. shouldCompress + retries available  → compress + retry same provider
 *  2. shouldFallback                      → fall back to next provider
 *  3. retryable + retries available       → bare retry same provider
 *  4. otherwise                           → abort (throw)
 */

import { ProviderError, ProviderErrorType, classifyProviderError } from "./ProviderErrorClassifier.js";

// ─────────────────────────────────────────────────────────────────────────────
// Action constants
// ─────────────────────────────────────────────────────────────────────────────

export const RetryAction = Object.freeze({
  COMPRESS: "compress",   // Compress context, retry same provider
  RETRY:    "retry",      // Retry same provider without compression
  FALLBACK: "fallback",   // Fall back to next provider
  ABORT:    "abort",      // Give up — rethrow
});

// ─────────────────────────────────────────────────────────────────────────────
// Policy Result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} PolicyResult
 * @property {string} action        - One of RetryAction values
 * @property {ProviderError} error  - The classified error
 * @property {string} reason        - Human-readable reason for logging
 */

// ─────────────────────────────────────────────────────────────────────────────
// Core evaluate() function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a caught error and return the appropriate retry action.
 *
 * @param {Error} rawError           - The raw error caught from provider call
 * @param {string} providerKey       - Provider identifier (for classification)
 * @param {number} retryCount        - How many retries have been attempted so far
 * @param {number} maxRetries        - Maximum retries allowed
 * @param {boolean} canFallback      - Whether a fallback provider is configured
 * @param {boolean} hasYieldedChunks - Whether streaming already yielded data (no retry possible)
 * @returns {PolicyResult}
 */
export function evaluate({
  rawError,
  providerKey,
  retryCount,
  maxRetries,
  canFallback,
  hasYieldedChunks = false,
}) {
  // Normalize to ProviderError
  const err = (rawError instanceof ProviderError)
    ? rawError
    : classifyProviderError(providerKey, rawError);

  const retriesRemaining = retryCount < maxRetries;

  // ── Streaming: if we already emitted chunks, we cannot retry or compress ──
  if (hasYieldedChunks) {
    return {
      action: RetryAction.ABORT,
      error: err,
      reason: `Streaming already started — cannot retry after partial output. Type: ${err.errorType}`,
    };
  }

  // ── Auth / Insufficient Balance: never retry, never compress ─────────────
  if (
    err.errorType === ProviderErrorType.AUTH_ERROR ||
    err.errorType === ProviderErrorType.INSUFFICIENT_BALANCE ||
    err.errorType === ProviderErrorType.INVALID_REQUEST
  ) {
    if (canFallback) {
      return {
        action: RetryAction.FALLBACK,
        error: err,
        reason: `${err.errorType} on ${providerKey} — falling back immediately`,
      };
    }
    return {
      action: RetryAction.ABORT,
      error: err,
      reason: `${err.errorType} on ${providerKey} — no fallback configured`,
    };
  }

  // ── Context limit / Payload too large: compress and retry ─────────────────
  if (err.shouldCompress && retriesRemaining) {
    return {
      action: RetryAction.COMPRESS,
      error: err,
      reason: `${err.errorType} on ${providerKey} — compressing context (attempt ${retryCount + 1}/${maxRetries})`,
    };
  }

  // ── shouldCompress but retries exhausted → fallback ───────────────────────
  if (err.shouldCompress && !retriesRemaining && canFallback) {
    return {
      action: RetryAction.FALLBACK,
      error: err,
      reason: `${err.errorType} on ${providerKey} — compression retries exhausted, falling back`,
    };
  }

  // ── Fallback-eligible errors (rate limit, network, overloaded, etc.) ──────
  if (err.shouldFallback && canFallback) {
    return {
      action: RetryAction.FALLBACK,
      error: err,
      reason: `${err.errorType} on ${providerKey} — falling back to next provider`,
    };
  }

  // ── Retryable errors (timeout, unknown) ───────────────────────────────────
  if (err.retryable && retriesRemaining) {
    return {
      action: RetryAction.RETRY,
      error: err,
      reason: `${err.errorType} on ${providerKey} — retrying same provider (attempt ${retryCount + 1}/${maxRetries})`,
    };
  }

  // ── Nothing left to try ───────────────────────────────────────────────────
  return {
    action: RetryAction.ABORT,
    error: err,
    reason: `${err.errorType} on ${providerKey} — no retries or fallback available`,
  };
}

/**
 * Convenience: log the policy decision with consistent formatting.
 * @param {PolicyResult} result
 */
export function logPolicyDecision(result) {
  const icon = {
    [RetryAction.COMPRESS]: "🗜️ [RetryPolicy]",
    [RetryAction.RETRY]:    "🔁 [RetryPolicy]",
    [RetryAction.FALLBACK]: "🔄 [RetryPolicy]",
    [RetryAction.ABORT]:    "❌ [RetryPolicy]",
  }[result.action] || "[RetryPolicy]";

  console.warn(`${icon} ${result.reason}`);
}
