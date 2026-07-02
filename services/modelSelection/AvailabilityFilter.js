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
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal filter checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a single candidate against all availability criteria.
 *
 * @param {import("./CandidateBuilder.js").CandidateModel} candidate
 * @returns {{ available: boolean, reason: string|null, cooldownRemainingMs: number }}
 */
function evaluateCandidate(candidate) {
  // 1. Explicitly disabled in registry
  if (!candidate.enabled) {
    return { available: false, reason: RejectionReason.DISABLED, cooldownRemainingMs: 0 };
  }

  // 2. Reserved / manually disabled (e.g. experimental models like GLM)
  if (candidate.reserved) {
    return { available: false, reason: RejectionReason.RESERVED, cooldownRemainingMs: 0 };
  }

  // 3. Offline — API key not configured
  if (candidate.status === "offline") {
    return { available: false, reason: RejectionReason.OFFLINE, cooldownRemainingMs: 0 };
  }

  // 4. Per-model health checks
  const health = getModelHealth(candidate.key);

  if (health.permanentlyDisabled) {
    const reason =
      health.lastFailureType === ProviderErrorType.AUTH_ERROR
        ? RejectionReason.AUTH_FAILURE
        : RejectionReason.INSUFFICIENT_BALANCE;
    return { available: false, reason, cooldownRemainingMs: Infinity };
  }

  if (health.cooldownExpiry && Date.now() < health.cooldownExpiry) {
    const cooldownRemainingMs = health.cooldownExpiry - Date.now();
    return { available: false, reason: RejectionReason.COOLING_DOWN, cooldownRemainingMs };
  }

  // 5. Provider-level availability (from ProviderHealthManager)
  // A healthy model on a rate-limited provider should also be skipped.
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
 * @returns {FilterResult[]}
 *
 * @typedef {object} FilterResult
 * @property {import("./CandidateBuilder.js").CandidateModel} candidate
 * @property {boolean} available
 * @property {string|null} rejectionReason - null if available
 * @property {number} cooldownRemainingMs  - 0 if not in cooldown
 */
export function filterAvailable(candidates) {
  return candidates.map(candidate => {
    const { available, reason, cooldownRemainingMs } = evaluateCandidate(candidate);
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
 * @returns {import("./CandidateBuilder.js").CandidateModel[]}
 */
export function getAvailableCandidates(candidates) {
  return filterAvailable(candidates)
    .filter(r => r.available)
    .map(r => r.candidate);
}
