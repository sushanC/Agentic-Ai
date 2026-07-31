import { providerPool } from "./ProviderPool.js";
import { diagnostics } from "./Diagnostics.js";

/**
 * FallbackManager.js
 *
 * Fallback policy enforcer — minimal by design.
 *
 * Responsibilities (and ONLY these):
 *   1. Delegate candidate discovery to ProviderPool (the single source of truth)
 *   2. Skip providers that already failed in the current session (failedKeys)
 *   3. Skip providers with OPEN circuits (via pool.isAvailable)
 *   4. Skip providers in cooldown (via pool.getCooldownRemaining)
 *   5. Return the next viable candidate
 *
 * FallbackManager does NOT:
 *   - Resolve fallbackChain or fallback fields directly
 *   - Import or name any provider
 *   - Maintain provider lists
 *   - Know which providers exist
 *
 * Provider discovery is fully delegated to ProviderPool.getCandidates().
 */
export class FallbackManager {
  constructor(pool = providerPool) {
    this.pool = pool;
  }

  /**
   * Get an ordered list of candidate model configs for the given primary model.
   * Fully delegated to ProviderPool — FallbackManager does zero resolution here.
   *
   * @param {object} primaryModelConfig - Resolved primary model config
   * @param {object} [filters={}] - Optional capability filters forwarded to ProviderPool
   * @returns {object[]} Ordered candidate list (primary first, fallbacks ranked by health/score)
   */
  getCandidates(primaryModelConfig, filters = {}) {
    if (!primaryModelConfig) return [];
    return this.pool.getCandidates(primaryModelConfig, filters);
  }

  /**
   * Filter and select the next available healthy candidate from the candidate list.
   *
   * Policy applied (in order):
   *   1. Skip if modelKey or providerKey is in failedKeys (session failures)
   *   2. Skip if provider circuit is not available (OPEN circuit or cooldown)
   *   3. Skip if model health check fails
   *   4. Return the first candidate that passes all policy checks
   *
   * Degraded fallback: if no strictly healthy candidate exists, return the first
   * candidate that hasn't failed in this session (prevents hard failure when all
   * providers are degraded but not fully down).
   *
   * @param {object[]} candidates - Ordered candidate list from getCandidates()
   * @param {Set<string>} [failedKeys=new Set()] - Keys that failed in this session
   * @returns {object|null} Next viable candidate or null if all exhausted
   */
  selectNextCandidate(candidates, failedKeys = new Set()) {
    for (const candidate of candidates) {
      const modelKey = candidate.name || candidate.key || candidate.provider;
      const providerKey = candidate.provider;

      // Policy: Skip session-failed candidates
      if (failedKeys.has(modelKey) || failedKeys.has(providerKey)) {
        diagnostics.debug("FallbackManager", `Skipping failed candidate: ${candidate.displayName} (in failedKeys)`);
        continue;
      }

      // Policy: Skip OPEN circuits and cooldown providers
      const isProviderAvailable = this.pool.isAvailable(providerKey);
      const isModelAvailable    = this.pool.isAvailable(modelKey);

      if (isProviderAvailable && isModelAvailable) {
        diagnostics.info("FallbackManager", `Selected candidate: ${candidate.displayName} (${providerKey}/${candidate.modelId})`, {
          providerHealth: this.pool.getHealthScore(providerKey),
          modelHealth:    this.pool.getHealthScore(modelKey),
          cooldown:       this.pool.getCooldownRemaining(providerKey),
        });
        return candidate;
      }

      diagnostics.debug("FallbackManager", `Skipped candidate ${candidate.displayName}: providerAvailable=${isProviderAvailable}, modelAvailable=${isModelAvailable}`);
    }

    // Degraded fallback: attempt first non-failed candidate even if unhealthy
    for (const candidate of candidates) {
      const modelKey = candidate.name || candidate.key || candidate.provider;
      if (!failedKeys.has(modelKey)) {
        diagnostics.warn("FallbackManager", `No strictly healthy candidate found. Attempting degraded candidate: ${candidate.displayName}`);
        return candidate;
      }
    }

    diagnostics.error("FallbackManager", "All candidates exhausted — no viable provider found.", { totalCandidates: candidates.length, failedKeys: [...failedKeys] });
    return null;
  }
}

export const fallbackManager = new FallbackManager();
