import { providerPool } from "./ProviderPool.js";
import { diagnostics } from "./Diagnostics.js";

/**
 * FallbackManager.js
 *
 * Fallback policy enforcer.
 *
 * Responsibilities:
 *   1. Delegate candidate discovery to ProviderPool
 *   2. Skip providers that already failed in the current session (failedKeys)
 *   3. Skip providers with OPEN circuits (via pool.isAvailable)
 *   4. Skip providers in cooldown (via pool.getCooldownRemaining)
 *   5. Return the next viable candidate
 *   6. Prevent circular fallback loops (Ollama is strictly final)
 */
export class FallbackManager {
  constructor(pool = providerPool) {
    this.pool = pool;
  }

  /**
   * Get an ordered list of candidate model configs for the given primary model.
   *
   * @param {object} primaryModelConfig - Resolved primary model config
   * @param {object} [filters={}] - Optional capability filters forwarded to ProviderPool
   * @returns {object[]} Ordered candidate list
   */
  getCandidates(primaryModelConfig, filters = {}) {
    if (!primaryModelConfig) return [];
    return this.pool.getCandidates(primaryModelConfig, filters);
  }

  /**
   * Filter and select the next available healthy candidate from the candidate list.
   *
   * @param {object[]} candidates - Ordered candidate list from getCandidates()
   * @param {Set<string>} [failedKeys=new Set()] - Keys that failed in this session
   * @returns {object|null} Next viable candidate or null if all exhausted
   */
  selectNextCandidate(candidates, failedKeys = new Set()) {
    if (!candidates || candidates.length === 0) {
      diagnostics.error("FallbackManager", "All model providers failed. Returning graceful system error.");
      return null;
    }

    for (const candidate of candidates) {
      const modelKey = (candidate.name || candidate.key || candidate.provider || "").toLowerCase();
      const providerKey = (candidate.provider || "").toLowerCase();

      // Policy: Skip session-failed candidates
      if (failedKeys.has(modelKey) || failedKeys.has(providerKey)) {
        diagnostics.debug("FallbackManager", `Skipping failed candidate: ${candidate.displayName || modelKey} (in failedKeys)`);
        continue;
      }

      // Policy: Skip OPEN circuits and cooldown providers
      const isProviderAvailable = this.pool.isAvailable(providerKey);
      const isModelAvailable    = this.pool.isAvailable(modelKey);

      if (isProviderAvailable && isModelAvailable) {
        diagnostics.info("FallbackManager", `Selected candidate: ${candidate.displayName} (${providerKey}/${candidate.modelId || modelKey})`, {
          providerHealth: this.pool.getHealthScore(providerKey),
          modelHealth:    this.pool.getHealthScore(modelKey),
          cooldown:       this.pool.getCooldownRemaining(providerKey),
        });
        return candidate;
      }

      diagnostics.debug("FallbackManager", `Skipped candidate ${candidate.displayName}: providerAvailable=${isProviderAvailable}, modelAvailable=${isModelAvailable}`);
    }

    // Degraded fallback: attempt first candidate that hasn't failed in session
    for (const candidate of candidates) {
      const modelKey = (candidate.name || candidate.key || candidate.provider || "").toLowerCase();
      const providerKey = (candidate.provider || "").toLowerCase();
      if (!failedKeys.has(modelKey) && !failedKeys.has(providerKey)) {
        diagnostics.warn("FallbackManager", `No strictly healthy candidate found. Attempting degraded candidate: ${candidate.displayName}`);
        return candidate;
      }
    }

    diagnostics.error("FallbackManager", "All model providers failed. Returning graceful system error.", {
      totalCandidates: candidates.length,
      failedKeys: [...failedKeys],
    });

    return null;
  }
}

export const fallbackManager = new FallbackManager();
