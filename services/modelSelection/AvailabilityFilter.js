/**
 * AvailabilityFilter.js — Model Selection Engine
 *
 * Removes models that cannot currently answer a request.
 *
 * Phase 4 specification — filters applied in priority order:
 *  1. Disabled         — model.enabled === false
 *  2. Reserved         — model.reserved === true (manually disabled, e.g. GLM)
 *  3. Permanently Disabled — Auth / balance failure, requires manual reset
 *  4. Cooling Down     — model health cooldown has not yet expired
 *  5. Offline          — model.status === "offline" (API key missing)
 *  6. Auth Failure     — last failure was AUTH_ERROR (permanent until reset)
 *  7. Insufficient Balance — last failure was INSUFFICIENT_BALANCE
 *  8. Provider Disabled  — provider-level health marks provider as unavailable
 *
 * Only models that pass ALL filters proceed to scoring.
 *
 * Design: this module has no scoring logic — it is a pure pass/fail gate.
 */

import { getModelHealth } from "./HealthScorer.js";
import { isAvailable as isProviderAvailable } from "../cie/ProviderHealthManager.js";
import { ProviderErrorType } from "../cie/ProviderErrorClassifier.js";
import dns from "dns";

// ─────────────────────────────────────────────────────────────────────────────
// Background Connectivity Checking
// ─────────────────────────────────────────────────────────────────────────────

let systemOffline = false;

function checkConnectivity() {
  dns.lookup("google.com", (err) => {
    if (err) {
      dns.lookup("openrouter.ai", (err2) => {
        systemOffline = !!err2;
      });
    } else {
      systemOffline = false;
    }
  });
}

// Check initially
checkConnectivity();

// Periodic checks every 10 seconds
const intervalId = setInterval(checkConnectivity, 10000);
if (intervalId && typeof intervalId.unref === "function") {
  intervalId.unref();
}

export function isSystemOffline() {
  return systemOffline;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rejection Reason Constants
// ─────────────────────────────────────────────────────────────────────────────

export const RejectionReason = Object.freeze({
  DISABLED:              "Disabled",
  RESERVED:              "Reserved",
  PERMANENTLY_DISABLED:  "PermanentlyDisabled",
  COOLING_DOWN:          "CoolingDown",
  OFFLINE:               "Offline",
  AUTH_FAILURE:          "AuthFailure",
  INSUFFICIENT_BALANCE:  "InsufficientBalance",
  PROVIDER_DISABLED:     "ProviderDisabled",
  UNSUPPORTED_CAPABILITY:"UnsupportedCapability",
  UNHEALTHY:             "Unhealthy",
  NETWORK_OFFLINE:       "NetworkOffline",
  CONTEXT_LIMIT_EXCEEDED:"ContextLimitExceeded",
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal filter checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a single candidate against all availability criteria.
 *
 * @param {import("./CandidateBuilder.js").CandidateModel} candidate
 * @param {number} [estimatedTokens=0]
 * @returns {{ available: boolean, reason: string|null, cooldownRemainingMs: number }}
 */
function evaluateCandidate(candidate, estimatedTokens = 0) {
  // 1. Explicitly disabled in registry
  if (!candidate.enabled) {
    return { available: false, reason: RejectionReason.DISABLED, cooldownRemainingMs: 0 };
  }

  // 2. Reserved / manually disabled (e.g. GLM)
  if (candidate.reserved) {
    return { available: false, reason: RejectionReason.RESERVED, cooldownRemainingMs: 0 };
  }

  // 3. Offline connectivity check (skip non-local models immediately)
  if (systemOffline && candidate.provider !== "ollama" && candidate.status !== "local") {
    return { available: false, reason: RejectionReason.NETWORK_OFFLINE, cooldownRemainingMs: 0 };
  }

  // 4. Context size check (estimated tokens exceed maximum context window)
  if (estimatedTokens > 0 && candidate.contextWindow && estimatedTokens > candidate.contextWindow) {
    return { available: false, reason: RejectionReason.CONTEXT_LIMIT_EXCEEDED, cooldownRemainingMs: 0 };
  }

  // Preserve local models — bypass network status, model health, cooldowns, and provider check
  if (candidate.provider === "ollama" || candidate.status === "local") {
    return { available: true, reason: null, cooldownRemainingMs: 0 };
  }

  // 5. Offline — API key not configured
  if (candidate.status === "offline") {
    return { available: false, reason: RejectionReason.OFFLINE, cooldownRemainingMs: 0 };
  }

  // 6. Per-model health checks
  const health = getModelHealth(candidate.key);

  if (health.permanentlyDisabled) {
    const reason =
      health.lastFailureType === ProviderErrorType.AUTH_ERROR
        ? RejectionReason.AUTH_FAILURE
        : RejectionReason.INSUFFICIENT_BALANCE;
    return { available: false, reason, cooldownRemainingMs: Infinity };
  }

  // Unhealthy: success rate < 20%
  if (health.successRate < 0.2) {
    return { available: false, reason: RejectionReason.UNHEALTHY, cooldownRemainingMs: 0 };
  }

  if (health.cooldownExpiry && Date.now() < health.cooldownExpiry) {
    const cooldownRemainingMs = health.cooldownExpiry - Date.now();
    return { available: false, reason: RejectionReason.COOLING_DOWN, cooldownRemainingMs };
  }

  // 7. Provider-level availability (from ProviderHealthManager)
  const providerAvailable = isProviderAvailable(candidate.provider);
  if (!providerAvailable) {
    return { available: false, reason: RejectionReason.PROVIDER_DISABLED, cooldownRemainingMs: 0 };
  }

  return { available: true, reason: null, cooldownRemainingMs: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter candidates to those that can currently handle requests.
 *
 * @param {import("./CandidateBuilder.js").CandidateModel[]} candidates
 * @param {number} [estimatedTokens=0]
 * @returns {FilterResult[]}
 */
export function filterAvailable(candidates, estimatedTokens = 0) {
  return candidates.map(candidate => {
    const { available, reason, cooldownRemainingMs } = evaluateCandidate(candidate, estimatedTokens);
    return {
      candidate,
      available,
      rejectionReason: reason,
      cooldownRemainingMs,
    };
  });
}

/**
 * Return only the available candidates (shorthand over filterAvailable).
 *
 * @param {import("./CandidateBuilder.js").CandidateModel[]} candidates
 * @param {number} [estimatedTokens=0]
 * @returns {import("./CandidateBuilder.js").CandidateModel[]}
 */
export function getAvailableCandidates(candidates, estimatedTokens = 0) {
  return filterAvailable(candidates, estimatedTokens)
    .filter(r => r.available)
    .map(r => r.candidate);
}
