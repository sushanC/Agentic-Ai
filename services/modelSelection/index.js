/**
 * index.js — Model Selection Engine (MSE)
 *
 * Single public entry point for the Model Selection Engine.
 *
 * Usage:
 *   import { selectModel, recordModelSuccess, recordModelFailure } from "./services/modelSelection/index.js";
 *
 *   // Select a model for a request
 *   const { selected, diagnostics } = selectModel({ intent, confidence, secondaryIntent, overrides });
 *
 *   // Record outcome
 *   recordModelSuccess(selected.name, latencyMs);
 *   recordModelFailure(selected.name, providerError);
 *
 * The MSE is the ONLY component that decides which model to use.
 * It knows: model metadata, health, capabilities, availability.
 * It does NOT know: provider implementations, streaming mechanics, CIE internals.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Core selector
// ─────────────────────────────────────────────────────────────────────────────
export { selectModel } from "./ModelSelector.js";

// ─────────────────────────────────────────────────────────────────────────────
// Health tracking (to be called by ai.js after each request)
// ─────────────────────────────────────────────────────────────────────────────
export {
  recordModelSuccess,
  recordModelFailure,
  getModelHealth,
  getModelHealthScore,
  isModelAvailable,
  getCooldownRemaining,
  getAllModelHealthScores,
  resetModelHealth,
  resetAllModelHealth,
} from "./HealthScorer.js";

// ─────────────────────────────────────────────────────────────────────────────
// Capability utilities (used by modelRouter.js thin adapter)
// ─────────────────────────────────────────────────────────────────────────────
export {
  resolveCapabilityForIntent,
  INTENT_TO_CAPABILITY,
} from "./CapabilityFilter.js";

// ─────────────────────────────────────────────────────────────────────────────
// Diagnostics (exposed for potential debug API endpoint)
// ─────────────────────────────────────────────────────────────────────────────
export { buildDiagnosticsSummary } from "./SelectionDiagnostics.js";

// ─────────────────────────────────────────────────────────────────────────────
// Scoring utilities (exposed for testing / introspection)
// ─────────────────────────────────────────────────────────────────────────────
export { scoreCandidate, getWeightsForIntent } from "./IntentScorer.js";
export { buildCandidates } from "./CandidateBuilder.js";
