/**
 * CandidateBuilder.js — Model Selection Engine
 *
 * Reads the model registry and produces a flat, normalized candidate list.
 *
 * Responsibilities (single):
 *  - Enumerate all models from modelRegistry
 *  - Normalize each entry into a uniform CandidateModel shape
 *  - Attach user overrides when present
 *  - Never filter — filtering is AvailabilityFilter's job
 *
 * The MSE must not know about provider implementations. This module only reads
 * model metadata — it never imports from services/providers/.
 */

import { modelRegistry } from "../modelRegistry.js";

// ─────────────────────────────────────────────────────────────────────────────
// CandidateModel type (documentation only — JS has no types)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} CandidateModel
 * @property {string}  key              - Registry key (e.g. "gemini", "deepseek")
 * @property {string}  provider         - Provider name (e.g. "google")
 * @property {string}  modelId          - Actual model ID string
 * @property {string}  displayName      - Human-readable name
 * @property {boolean} enabled          - From registry definition
 * @property {boolean} reserved         - Manually disabled (e.g. GLM experimental)
 * @property {number}  priority         - Registry priority (lower = more preferred)
 * @property {string}  latency          - Latency tier string
 * @property {number}  contextWindow    - Max context tokens
 * @property {number}  estimatedCostPer1kTokens
 * @property {object}  scores           - Capability scores { coding, writing, ... }
 * @property {object}  flags            - All supports* booleans
 * @property {string[]} capabilities    - Capability array from registry
 * @property {string|null} fallback     - Fallback model key
 * @property {boolean} fromOverride     - True if this model was user-overridden
 */

// ─────────────────────────────────────────────────────────────────────────────
// Score defaults (used when registry doesn't define scores yet)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SCORES = {
  coding:    0.5,
  writing:   0.5,
  planning:  0.5,
  research:  0.5,
  reasoning: 0.5,
  vision:    0.0,
  math:      0.5,
  tool:      0.5,
  general:   0.5,
};

// ─────────────────────────────────────────────────────────────────────────────
// Normalizer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a raw registry entry into a CandidateModel.
 *
 * @param {string} key       - Registry key
 * @param {object} model     - Raw registry entry
 * @param {boolean} fromOverride - Whether this was user-selected via override
 * @returns {CandidateModel}
 */
function normalize(key, model, fromOverride = false) {
  // Merge registry scores with defaults (registry scores take precedence)
  const scores = Object.assign({}, DEFAULT_SCORES, model.scores || {});

  // Extract all supports* flags into a clean flags object
  const flags = {
    streaming:    model.supportsStreaming    ?? false,
    vision:       model.supportsVision       ?? false,
    reasoning:    model.supportsReasoning    ?? false,
    longContext:  model.supportsLongContext  ?? false,
    toolCalling:  model.supportsToolCalling  ?? false,
    markdown:     model.supportsMarkdown     ?? true,
    pdf:          model.supportsPDF          ?? false,
    memory:       model.supportsMemory       ?? false,
    planning:     model.supportsPlanning     ?? false,
    writing:      model.supportsWriting      ?? false,
    coding:       model.supportsCoding       ?? false,
    research:     model.supportsResearch     ?? false,
    offline:      model.supportsOffline      ?? false,
  };

  return {
    key,
    provider:                   model.provider,
    modelId:                    model.modelId,
    displayName:                model.displayName || key,
    description:                model.description || "",
    enabled:                    model.enabled ?? false,
    reserved:                   model.reserved ?? false,
    priority:                   model.priority ?? 99,
    status:                     model.status || "unknown",
    latency:                    model.latency || "unknown",
    latencyTier:                model.latencyTier || model.latency || "unknown",
    contextWindow:              model.contextWindow || 4096,
    estimatedCostPer1kTokens:   model.estimatedCostPer1kTokens ?? 0,
    scores,
    flags,
    capabilities:               Array.isArray(model.capabilities) ? [...model.capabilities] : [],
    fallback:                   model.fallback || null,
    fromOverride,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the full candidate list from the model registry.
 *
 * @param {object} [overrides={}] - capabilityRoutes from settings { [capability]: modelKey }
 * @returns {CandidateModel[]} All models, normalized (unfiltered)
 */
export function buildCandidates(overrides = {}) {
  const overrideKeys = new Set(Object.values(overrides || {}));

  const candidates = [];
  for (const [key, model] of Object.entries(modelRegistry)) {
    if (model.enabled) {
      const isOverride = overrideKeys.has(key);
      candidates.push(normalize(key, model, isOverride));
    }
  }

  return candidates;
}

/**
 * Build candidates for a specific capability override only.
 * Returns an array with the single overridden model (if it exists in registry).
 *
 * @param {string} capability  - Capability key
 * @param {object} overrides   - capabilityRoutes
 * @returns {CandidateModel[]} Single-item array or empty
 */
export function buildOverrideCandidate(capability, overrides = {}) {
  const overrideKey = overrides?.[capability];
  if (!overrideKey) return [];

  const model = modelRegistry[overrideKey];
  if (!model || !model.enabled) return [];

  return [normalize(overrideKey, model, true)];
}
