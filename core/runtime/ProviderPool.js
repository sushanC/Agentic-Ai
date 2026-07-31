import { circuitBreaker, CircuitState } from "./CircuitBreaker.js";
import { providerHealthTracker } from "./ProviderHealth.js";
import { diagnostics } from "./Diagnostics.js";
import { googleProvider } from "../../services/providers/googleProvider.js";
import { groqProvider } from "../../services/providers/groqProvider.js";
import { deepseekProvider } from "../../services/providers/deepseekProvider.js";
import { glmProvider } from "../../services/providers/glmProvider.js";
import { openRouterProvider } from "../../services/providers/openRouterProvider.js";
import { ollamaProvider } from "../../services/providers/ollamaProvider.js";

/**
 * ProviderPool.js
 *
 * Runtime Provider Registry and single source of truth for all provider knowledge.
 *
 * Responsibilities:
 *   - Provider registration and discovery
 *   - Live health, circuit breaker, and latency state per provider/model
 *   - Candidate generation: ordered, scored, filtered by capability
 *   - Dynamic recovery notification
 *
 * No other runtime component imports provider implementations.
 * To add a new provider: call registerProvider() — zero other runtime changes required.
 */
export class ProviderPool {
  constructor() {
    this.circuit = circuitBreaker;
    this.health = providerHealthTracker;

    /**
     * Internal provider registry.
     * Shape: Map<string, ProviderEntry>
     *
     * ProviderEntry = {
     *   key:                    string,
     *   displayName:            string,
     *   implementation:         object,   // { generate, stream, health, ... }
     *   supportsStreaming:       boolean,
     *   supportsVision:         boolean,
     *   supportsToolCalling:    boolean,
     *   supportsEmbeddings:     boolean,
     *   supportsJSONMode:       boolean,
     *   supportsStructuredOutput: boolean,
     *   supportsVoice:          boolean,
     *   supportsOCR:            boolean,
     *   supportsLongContext:    boolean,
     *   supportsReasoning:      boolean,
     *   supportsOffline:        boolean,
     *   isLocal:                boolean,
     *   priority:               number,
     *   enabled:                boolean,
     *   status:                 string,
     * }
     */
    this._registry = new Map();

    // Register all built-in providers at startup.
    // This is the ONLY location in the runtime that knows providers exist.
    this._registerBuiltinProviders();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REGISTRATION API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a provider implementation with its runtime metadata.
   * Call this once per provider at startup (or dynamically for plugins).
   *
   * @param {string} key - Provider registry key (e.g. "google", "groq")
   * @param {object} implementation - Provider object with generate/stream/health methods
   * @param {object} meta - Provider metadata
   * @param {string}  meta.displayName
   * @param {boolean} [meta.supportsStreaming=false]
   * @param {boolean} [meta.supportsVision=false]
   * @param {boolean} [meta.supportsToolCalling=false]
   * @param {boolean} [meta.supportsEmbeddings=false]
   * @param {boolean} [meta.supportsJSONMode=false]
   * @param {boolean} [meta.supportsStructuredOutput=false]
   * @param {boolean} [meta.supportsVoice=false]
   * @param {boolean} [meta.supportsOCR=false]
   * @param {boolean} [meta.supportsLongContext=false]
   * @param {boolean} [meta.supportsReasoning=false]
   * @param {boolean} [meta.supportsOffline=false]
   * @param {boolean} [meta.isLocal=false]
   * @param {number}  [meta.priority=99]
   * @param {boolean} [meta.enabled=true]
   * @param {string}  [meta.status="online"]
   */
  registerProvider(key, implementation, meta = {}) {
    if (!key || typeof key !== "string") throw new Error("ProviderPool: provider key must be a non-empty string.");
    if (!implementation || typeof implementation.generate !== "function") {
      throw new Error(`ProviderPool: implementation for "${key}" must expose a generate() method.`);
    }

    const entry = {
      key,
      displayName:            meta.displayName            ?? key,
      implementation,
      supportsStreaming:       meta.supportsStreaming       ?? false,
      supportsVision:         meta.supportsVision          ?? false,
      supportsToolCalling:    meta.supportsToolCalling     ?? false,
      supportsEmbeddings:     meta.supportsEmbeddings      ?? false,
      supportsJSONMode:       meta.supportsJSONMode        ?? false,
      supportsStructuredOutput: meta.supportsStructuredOutput ?? false,
      supportsVoice:          meta.supportsVoice           ?? false,
      supportsOCR:            meta.supportsOCR             ?? false,
      supportsLongContext:    meta.supportsLongContext      ?? false,
      supportsReasoning:      meta.supportsReasoning        ?? false,
      supportsOffline:        meta.supportsOffline          ?? false,
      isLocal:                meta.isLocal                  ?? false,
      priority:               meta.priority                 ?? 99,
      enabled:                meta.enabled                  ?? true,
      status:                 meta.status                   ?? "online",
    };

    this._registry.set(key, entry);
    diagnostics.info("ProviderPool", `Registered provider: ${entry.displayName} (key="${key}", enabled=${entry.enabled})`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DISCOVERY API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get the provider implementation for a given registry key.
   * Returns null if the provider is not registered.
   *
   * @param {string} key
   * @returns {object|null}
   */
  getProvider(key) {
    return this._registry.get(key)?.implementation ?? null;
  }

  /**
   * Alias of getProvider — explicit naming for the execution layer.
   * @param {string} key
   * @returns {object|null}
   */
  getProviderInstance(key) {
    return this.getProvider(key);
  }

  /**
   * Return all registered provider entries (as a plain object snapshot).
   * Do NOT expose the internal Map directly.
   *
   * @returns {object} key → entry
   */
  getProviders() {
    const result = {};
    for (const [key, entry] of this._registry.entries()) {
      result[key] = { ...entry };
    }
    return result;
  }

  /**
   * Return entries for all currently available providers.
   * Available = registered + enabled + circuit not OPEN.
   *
   * @returns {object[]}
   */
  getAvailableProviders() {
    const available = [];
    for (const entry of this._registry.values()) {
      if (entry.enabled && this.isAvailable(entry.key)) {
        available.push({ ...entry });
      }
    }
    diagnostics.debug("ProviderPool", `Available providers: [${available.map(e => e.key).join(", ")}]`);
    return available;
  }

  /**
   * Return entries for providers that support streaming and are currently available.
   *
   * @returns {object[]}
   */
  getStreamingProviders() {
    return this.getAvailableProviders().filter(e => e.supportsStreaming);
  }

  /**
   * Build an ordered, scored candidate list for a given model config and optional capability filters.
   * This is the primary discovery method used by FallbackManager.
   *
   * Candidate scoring formula:
   *   score = healthScore × circuitWeight × latencyScore × priorityScore × capabilityMatchBonus
   *
   * @param {object} primaryModelConfig - Resolved primary model config from ModelRegistry
   * @param {object} [filters={}] - Optional capability filters
   * @param {boolean} [filters.streaming]
   * @param {boolean} [filters.vision]
   * @param {boolean} [filters.toolCalling]
   * @param {boolean} [filters.embeddings]
   * @param {boolean} [filters.reasoning]
   * @param {boolean} [filters.longContext]
   * @param {boolean} [filters.offline]
   * @param {boolean} [filters.localOnly]
   * @param {boolean} [filters.cloudOnly]
   * @param {boolean} [filters.jsonMode]
   * @param {boolean} [filters.structuredOutput]
   * @returns {object[]} Ordered candidate model configs (primary first, then scored fallbacks)
   */
  getCandidates(primaryModelConfig, filters = {}) {
    if (!primaryModelConfig) {
      diagnostics.warn("ProviderPool", "getCandidates() called with null modelConfig — returning empty list.");
      return [];
    }

    diagnostics.debug("ProviderPool", `Discovering candidates for primary: ${primaryModelConfig.displayName}`, { filters });

    // Start with the primary candidate
    const seen = new Set();
    const candidates = [];

    this._addCandidate(candidates, seen, primaryModelConfig, "primary");

    // Walk fallbackChain from ModelRegistry if present
    const fallbackChain = primaryModelConfig.fallbackChain || (primaryModelConfig.fallback ? [primaryModelConfig.fallback] : []);

    for (const fallbackKey of fallbackChain) {
      try {
        // Dynamically resolve from ModelRegistry without importing it (inversion of control)
        const { resolveModel } = await_safe_import_resolveModel();
        if (!resolveModel) continue;

        const fallbackModel = resolveModel(fallbackKey);
        if (fallbackModel && fallbackModel.enabled && fallbackModel.status !== "disabled") {
          this._addCandidate(candidates, seen, fallbackModel, "fallback-chain");
        }
      } catch (err) {
        diagnostics.warn("ProviderPool", `Failed resolving fallback key "${fallbackKey}":`, { error: err.message });
      }
    }

    // If registered providers exist that aren't yet in candidates, append them as last-resort
    for (const entry of this._registry.values()) {
      if (!seen.has(entry.key) && entry.enabled) {
        candidates.push(this._buildSyntheticCandidate(entry));
        seen.add(entry.key);
        diagnostics.debug("ProviderPool", `Appended registry-only provider as last-resort: ${entry.key}`);
      }
    }

    // Apply capability filters
    const filtered = this._applyFilters(candidates, filters);

    // Score and rank (preserving primary at front)
    const [primary, ...rest] = filtered;
    const ranked = primary ? [primary, ...this._rankCandidates(rest)] : this._rankCandidates(filtered);

    diagnostics.info("ProviderPool", `Candidate discovery complete. Found ${ranked.length} candidate(s).`, {
      candidates: ranked.map(c => ({ provider: c.provider, model: c.displayName, score: c._score }))
    });

    return ranked;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RECOVERY API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Notify the registry that a provider/model circuit has recovered.
   * Called by RecoveryScheduler when a circuit transitions to HALF_OPEN or CLOSED.
   * Future requests automatically consider this provider again.
   *
   * @param {string} key
   */
  notifyRecovery(key) {
    const entry = this._registry.get(key);
    diagnostics.info("ProviderPool", `Recovery notification for "${key}". Circuit state: ${this.circuit.getState(key)}.${entry ? ` Provider: ${entry.displayName}.` : ""}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRESERVED PUBLIC API (backward compatible — unchanged signatures)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check if a provider or model is currently available for execution.
   *
   * @param {string} key - Provider key (e.g. "google", "groq") or model key (e.g. "gemini")
   * @returns {boolean}
   */
  isAvailable(key) {
    if (!key) return false;
    const allowCircuit = this.circuit.allowRequest(key);
    const healthScore = this.health.getHealthScore(key);
    const isHealthy = healthScore > 0.1;

    const available = allowCircuit && isHealthy;
    diagnostics.trace("ProviderPool", `Availability check for ${key}: available=${available} (circuit=${this.circuit.getState(key)}, healthScore=${healthScore})`);
    return available;
  }

  /**
   * Record a successful completion for a provider or model.
   * Updates health metrics and closes circuit breaker if probing.
   *
   * @param {string} key
   * @param {number} latencyMs
   */
  recordSuccess(key, latencyMs = 0) {
    if (!key) return;
    this.health.recordSuccess(key, latencyMs);
    this.circuit.recordSuccess(key);
    diagnostics.debug("ProviderPool", `Recorded success for ${key} (Latency: ${latencyMs}ms, New Health: ${this.health.getHealthScore(key)})`);
  }

  /**
   * Record a failure event for a provider or model.
   * Updates health metrics and evaluates circuit breaker trip rules.
   *
   * @param {string} key
   * @param {object} [error]
   */
  recordFailure(key, error = {}) {
    if (!key) return;
    this.health.recordFailure(key, error);
    this.circuit.recordFailure(key, error);
    diagnostics.warn("ProviderPool", `Recorded failure for ${key}`, { error: error.message || error });
  }

  /**
   * Get full live state for a provider or model.
   * @param {string} key
   * @returns {object}
   */
  getState(key) {
    const metrics = this.health.getMetrics(key);
    const circuitState = this.circuit.getState(key);
    const entry = this._registry.get(key);

    return {
      key,
      circuitState,
      isAvailable: this.isAvailable(key),
      registryEntry: entry ? { ...entry, implementation: undefined } : null,
      ...metrics,
    };
  }

  /**
   * Get health score (0.0 to 1.0) for a key.
   * @param {string} key
   * @returns {number}
   */
  getHealthScore(key) {
    return this.health.getHealthScore(key);
  }

  /**
   * Get remaining cooldown (ms) if provider/model is on cooldown.
   * @param {string} key
   * @returns {number} 0 if available
   */
  getCooldownRemaining(key) {
    const metrics = this.health.getMetrics(key);
    if (!metrics.cooldownUntil) return 0;
    return Math.max(0, metrics.cooldownUntil - Date.now());
  }

  /**
   * Manually reset provider/model health and circuit breaker.
   * @param {string} key
   */
  reset(key) {
    this.health.reset(key);
    this.circuit.reset(key);
    diagnostics.info("ProviderPool", `Reset state for ${key}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INTERNAL — PROVIDER SCORING & FILTERING
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Score a candidate model config using live runtime metrics.
   * Higher score = better candidate.
   *
   * @param {object} candidate
   * @returns {number} Composite score 0.0–1.0+
   */
  _scoreCandidate(candidate) {
    const providerKey = candidate.provider;
    const modelKey = candidate.name || candidate.key || providerKey;

    const healthScore = this.health.getHealthScore(providerKey);
    const modelHealth = this.health.getHealthScore(modelKey);
    const combinedHealth = (healthScore + modelHealth) / 2;

    // Circuit weight: penalize non-CLOSED states
    const circuitState = this.circuit.getState(providerKey);
    const circuitWeight = circuitState === CircuitState.CLOSED ? 1.0
      : circuitState === CircuitState.HALF_OPEN ? 0.5
      : 0.0;

    // Latency score: faster = higher score
    const latency = candidate.latency || candidate.latencyTier || "medium";
    const latencyScore = { very_fast: 1.0, fast: 0.85, medium: 0.65, slow: 0.40, variable: 0.55, unknown: 0.50 }[latency] ?? 0.50;

    // Priority score: lower priority number = better (inverted and normalized 0–1)
    const priority = candidate.priority ?? 99;
    const priorityScore = Math.max(0, (10 - Math.min(priority, 10)) / 10);

    // Capability match bonus: streaming support
    const streamingBonus = (candidate.supportsStreaming || candidate.streamingSupport) ? 0.05 : 0;

    // Offline provider gets mild penalty (last resort)
    const offlinePenalty = (candidate.supportsOffline || candidate.offlineSupport) ? 0.1 : 0;

    const score = (combinedHealth * 0.4)
      + (circuitWeight * 0.25)
      + (latencyScore * 0.20)
      + (priorityScore * 0.10)
      + streamingBonus
      - offlinePenalty;

    diagnostics.trace("ProviderPool", `Score for ${candidate.displayName}: ${score.toFixed(3)}`, {
      healthScore: combinedHealth,
      circuitWeight,
      latencyScore,
      priorityScore,
      streamingBonus,
      offlinePenalty,
    });

    return Math.max(0, score);
  }

  /**
   * Sort candidates by descending score. Mutates and returns the array.
   * @param {object[]} candidates
   * @returns {object[]}
   */
  _rankCandidates(candidates) {
    return candidates
      .map(c => ({ ...c, _score: this._scoreCandidate(c) }))
      .sort((a, b) => b._score - a._score);
  }

  /**
   * Apply capability filters to a candidate list.
   * Future capabilities require zero runtime changes — just pass the filter key.
   *
   * @param {object[]} candidates
   * @param {object} filters
   * @returns {object[]}
   */
  _applyFilters(candidates, filters) {
    if (!filters || Object.keys(filters).length === 0) return candidates;

    const CAPABILITY_MAP = {
      streaming:        c => c.supportsStreaming || c.streamingSupport,
      vision:           c => c.supportsVision,
      toolCalling:      c => c.supportsToolCalling,
      embeddings:       c => c.supportsEmbeddings,
      reasoning:        c => c.supportsReasoning,
      longContext:      c => c.supportsLongContext,
      offline:          c => c.supportsOffline || c.offlineSupport,
      localOnly:        c => c.provider === "ollama" || (this._registry.get(c.provider)?.isLocal ?? false),
      cloudOnly:        c => !(c.supportsOffline || c.offlineSupport) && !(this._registry.get(c.provider)?.isLocal ?? false),
      jsonMode:         c => c.supportsJSONMode || (this._registry.get(c.provider)?.supportsJSONMode ?? false),
      structuredOutput: c => c.supportsStructuredOutput || (this._registry.get(c.provider)?.supportsStructuredOutput ?? false),
      voice:            c => this._registry.get(c.provider)?.supportsVoice ?? false,
      ocr:              c => this._registry.get(c.provider)?.supportsOCR ?? false,
    };

    return candidates.filter(candidate => {
      for (const [filterKey, filterValue] of Object.entries(filters)) {
        if (!filterValue) continue; // Skip falsy filters
        const check = CAPABILITY_MAP[filterKey];
        if (check && !check(candidate)) {
          diagnostics.debug("ProviderPool", `Filtered out ${candidate.displayName}: failed capability filter "${filterKey}"`);
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Add a candidate to the list if it hasn't been seen yet (by model key and provider).
   * @param {object[]} candidates
   * @param {Set} seen
   * @param {object} model
   * @param {string} reason
   */
  _addCandidate(candidates, seen, model, reason) {
    const modelKey = model.name || model.key;
    const providerKey = model.provider;
    const dedupeKey = `${providerKey}::${modelKey || ""}`;

    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      seen.add(providerKey); // also track provider key for last-resort exclusion
      candidates.push(model);
      diagnostics.debug("ProviderPool", `Added candidate [${reason}]: ${model.displayName} (${providerKey}/${model.modelId})`);
    }
  }

  /**
   * Build a minimal synthetic candidate for a provider that has no ModelRegistry entry.
   * Used only for last-resort appending from registry.
   * @param {object} entry
   * @returns {object}
   */
  _buildSyntheticCandidate(entry) {
    return {
      key: entry.key,
      name: entry.key,
      provider: entry.key,
      modelId: null,
      displayName: entry.displayName,
      enabled: entry.enabled,
      status: entry.status,
      priority: entry.priority,
      supportsStreaming: entry.supportsStreaming,
      supportsVision: entry.supportsVision,
      supportsToolCalling: entry.supportsToolCalling,
      supportsReasoning: entry.supportsReasoning,
      supportsLongContext: entry.supportsLongContext,
      supportsOffline: entry.supportsOffline,
      latency: "unknown",
      latencyTier: "unknown",
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INTERNAL — BUILTIN PROVIDER REGISTRATION
  //
  // This is the ONLY location in the entire runtime that imports or names
  // concrete provider implementations. Adding a new provider means adding
  // one import at the top of this file and one registerProvider() call here.
  // ─────────────────────────────────────────────────────────────────────────

  _registerBuiltinProviders() {
    this.registerProvider("google", googleProvider, {
      displayName:         "Google Gemini",
      supportsStreaming:   true,
      supportsVision:      true,
      supportsToolCalling: true,
      supportsLongContext: true,
      supportsJSONMode:    true,
      isLocal:             false,
      priority:            1,
      enabled:             !!(process.env.GOOGLE_API_KEY || process.env.API_KEY),
      status:              (process.env.GOOGLE_API_KEY || process.env.API_KEY) ? "online" : "offline",
    });

    this.registerProvider("groq", groqProvider, {
      displayName:         "Groq",
      supportsStreaming:   true,
      supportsToolCalling: true,
      supportsReasoning:   true,
      isLocal:             false,
      priority:            2,
      enabled:             !!process.env.GROQ_API_KEY,
      status:              process.env.GROQ_API_KEY ? "online" : "offline",
    });

    this.registerProvider("openrouter", openRouterProvider, {
      displayName:         "OpenRouter",
      supportsStreaming:   true,
      supportsLongContext: true,
      isLocal:             false,
      priority:            3,
      enabled:             !!process.env.OPENROUTER_API_KEY,
      status:              process.env.OPENROUTER_API_KEY ? "online" : "offline",
    });

    this.registerProvider("deepseek", deepseekProvider, {
      displayName:         "DeepSeek",
      supportsStreaming:   true,
      supportsReasoning:   true,
      supportsToolCalling: true,
      supportsLongContext: true,
      isLocal:             false,
      priority:            4,
      enabled:             false, // Future reactivation: !!process.env.DEEPSEEK_API_KEY
      status:              "disabled",
    });

    this.registerProvider("glm", glmProvider, {
      displayName:         "GLM",
      supportsStreaming:   true,
      isLocal:             false,
      priority:            99,
      enabled:             false,
      status:              "disabled",
    });

    this.registerProvider("ollama", ollamaProvider, {
      displayName:         "Ollama Local",
      supportsStreaming:   true,
      supportsOffline:     true,
      isLocal:             true,
      priority:            5,
      enabled:             true,
      status:              "local",
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL UTILITY
//
// Safe synchronous import shim for resolveModel.
// Avoids a circular dependency: ProviderPool → ModelRegistry → (nothing runtime).
// ModelRegistry does NOT import ProviderPool so there is no cycle.
// We use a lazy require-style singleton to load it once and cache it.
// ─────────────────────────────────────────────────────────────────────────────

let _resolveModel = null;

function await_safe_import_resolveModel() {
  // Return cached function if already loaded
  if (_resolveModel) return _resolveModel;

  try {
    // Dynamic import is async but we need the function synchronously for getCandidates.
    // Because getCandidates is only called after module initialization completes,
    // we use a lazy top-level import pattern resolved via a module-level cache.
    // The actual dynamic import is kicked off below and cached on first resolution.
    return null; // Will be populated by the async initializer
  } catch {
    return null;
  }
}

// Async initializer: pre-loads resolveModel into cache at module startup.
// This completes before any getCandidates() call can occur in practice.
async function _initResolveModel() {
  try {
    const mod = await import("../registry/ModelRegistry.js");
    _resolveModel = mod.resolveModel;
  } catch (err) {
    diagnostics.warn("ProviderPool", "Could not pre-load ModelRegistry.resolveModel:", { error: err.message });
  }
}

// Kick off pre-load immediately on module load (non-blocking)
_initResolveModel();

// Override getCandidates to use cached resolveModel once available
const _originalGetCandidates = ProviderPool.prototype.getCandidates;
ProviderPool.prototype.getCandidates = function(primaryModelConfig, filters = {}) {
  if (!primaryModelConfig) {
    diagnostics.warn("ProviderPool", "getCandidates() called with null modelConfig — returning empty list.");
    return [];
  }

  diagnostics.debug("ProviderPool", `Discovering candidates for primary: ${primaryModelConfig.displayName}`, { filters });

  const seen = new Set();
  const candidates = [];

  this._addCandidate(candidates, seen, primaryModelConfig, "primary");

  // Walk fallbackChain from ModelRegistry entry if present
  const fallbackChain = primaryModelConfig.fallbackChain || (primaryModelConfig.fallback ? [primaryModelConfig.fallback] : []);

  for (const fallbackKey of fallbackChain) {
    if (!_resolveModel) continue;
    try {
      const fallbackModel = _resolveModel(fallbackKey);
      if (fallbackModel && fallbackModel.enabled && fallbackModel.status !== "disabled") {
        this._addCandidate(candidates, seen, fallbackModel, "fallback-chain");
      }
    } catch (err) {
      diagnostics.warn("ProviderPool", `Failed resolving fallback key "${fallbackKey}":`, { error: err.message });
    }
  }

  // Append any registered provider not yet covered as last-resort
  for (const entry of this._registry.values()) {
    if (!seen.has(entry.key) && entry.enabled) {
      candidates.push(this._buildSyntheticCandidate(entry));
      seen.add(entry.key);
      diagnostics.debug("ProviderPool", `Appended registry provider as last-resort: ${entry.key}`);
    }
  }

  // Apply capability filters
  const filtered = this._applyFilters(candidates, filters);

  // Score and rank — preserve primary at front
  const [primary, ...rest] = filtered;
  const ranked = primary ? [primary, ...this._rankCandidates(rest)] : this._rankCandidates(filtered);

  diagnostics.info("ProviderPool", `Candidate discovery complete. ${ranked.length} candidate(s) found.`, {
    candidates: ranked.map(c => ({ provider: c.provider, model: c.displayName, score: c._score?.toFixed(3) }))
  });

  return ranked;
};

export const providerPool = new ProviderPool();
