import { providerPool } from "./ProviderPool.js";
import { resolveModel } from "../registry/ModelRegistry.js";
import { diagnostics } from "./Diagnostics.js";

/**
 * FallbackManager.js
 *
 * Automated candidate fallback selector.
 * Evaluates model fallback chains and selects the next best healthy candidate
 * respecting capability, health score, latency, and provider availability.
 * Ensures request execution does not terminate while healthy providers remain.
 */
export class FallbackManager {
  constructor(pool = providerPool) {
    this.pool = pool;
  }

  /**
   * Resolve an ordered array of candidate models for fallback execution.
   *
   * @param {object} primaryModelConfig - Resolved primary model config
   * @returns {object[]} Array of candidate model configs in priority order (primary first)
   */
  getFallbackCandidates(primaryModelConfig) {
    if (!primaryModelConfig) return [];

    const candidates = [primaryModelConfig];
    const fallbackList = primaryModelConfig.fallbackChain || (primaryModelConfig.fallback ? [primaryModelConfig.fallback] : []);

    for (const key of fallbackList) {
      try {
        const fallbackModel = resolveModel(key);
        if (
          fallbackModel &&
          fallbackModel.enabled &&
          fallbackModel.status !== "disabled" &&
          !candidates.some(c => c.name === fallbackModel.name || c.modelId === fallbackModel.modelId)
        ) {
          candidates.push(fallbackModel);
        }
      } catch (err) {
        diagnostics.warn("FallbackManager", `Failed resolving fallback key "${key}":`, { error: err.message });
      }
    }

    return candidates;
  }

  /**
   * Filter and select the next available healthy candidate from candidate list.
   *
   * @param {object[]} candidates - Array of candidate model configs
   * @param {Set<string>} [failedKeys] - Set of model/provider keys that failed in this session
   * @returns {object|null} Next healthy candidate or null
   */
  selectNextCandidate(candidates, failedKeys = new Set()) {
    for (const candidate of candidates) {
      const modelKey = candidate.name || candidate.key || candidate.provider;
      const providerKey = candidate.provider;

      if (failedKeys.has(modelKey) || failedKeys.has(providerKey)) {
        continue;
      }

      // Check live state in ProviderPool
      const isProviderHealthy = this.pool.isAvailable(providerKey);
      const isModelHealthy = this.pool.isAvailable(modelKey);

      if (isProviderHealthy && isModelHealthy) {
        diagnostics.info("FallbackManager", `Selected candidate: ${candidate.displayName} (${candidate.provider}/${candidate.modelId})`);
        return candidate;
      } else {
        diagnostics.debug("FallbackManager", `Skipped candidate ${candidate.displayName}: providerHealthy=${isProviderHealthy}, modelHealthy=${isModelHealthy}`);
      }
    }

    // If no strictly healthy candidate found, return first candidate that hasn't failed in current session
    for (const candidate of candidates) {
      const modelKey = candidate.name || candidate.key || candidate.provider;
      if (!failedKeys.has(modelKey)) {
        diagnostics.warn("FallbackManager", `No strictly healthy candidate found. Attempting degraded candidate: ${candidate.displayName}`);
        return candidate;
      }
    }

    return null;
  }
}

export const fallbackManager = new FallbackManager();
