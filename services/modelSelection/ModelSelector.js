/**
 * ModelSelector.js — Model Selection Engine
 *
 * Orchestrates the full selection pipeline:
 *
 *   CandidateBuilder
 *       ↓ (all models normalized)
 *   AvailabilityFilter
 *       ↓ (unavailable models removed)
 *   CapabilityFilter
 *       ↓ (incapable models removed)
 *   IntentScorer
 *       ↓ (each candidate scored 0–100)
 *   Sort by score descending
 *       ↓
 *   Pick winner (highest score)
 *       ↓
 *   SelectionDiagnostics (log)
 *
 * Returns the winning model config in a format compatible with what
 * modelRouter.js and ai.js expect (includes matchedCapability).
 *
 * Fallback chain:
 *  1. User override wins unconditionally if valid + available
 *  2. Highest-scoring available+capable candidate wins
 *  3. If no capable candidates, relax to general_chat candidates
 *  4. If still none, use resolveCapability() from static mapping
 */

import { buildCandidates, buildOverrideCandidate } from "./CandidateBuilder.js";
import { filterAvailable, getAvailableCandidates } from "./AvailabilityFilter.js";
import { filterByCapability, resolveCapabilityForIntent } from "./CapabilityFilter.js";
import { scoreCandidate } from "./IntentScorer.js";
import { logSelectionDiagnostics, buildDiagnosticsSummary } from "./SelectionDiagnostics.js";
import { resolveCapability } from "../modelRegistry.js";
import { getModelHealthScore, getCooldownRemaining, getModelHealth } from "./HealthScorer.js";
import { rankVoiceCandidates } from "../../features/voice/VoiceRoutingProfile.js";

// ─────────────────────────────────────────────────────────────────────────────
// Internal: score a list of available candidates and sort
// ─────────────────────────────────────────────────────────────────────────────

function scoreCandidates(candidates, intent, overrides = {}, estimatedTokens = 0) {
  return candidates
    .map(candidate => {
      const { score, breakdown } = scoreCandidate(candidate, intent, overrides, estimatedTokens);
      return { candidate, score, breakdown };
    })
    .sort((a, b) => {
      // Primary: score descending
      if (b.score !== a.score) return b.score - a.score;
      // Tiebreak: priority ascending (lower = better)
      return (a.candidate.priority || 99) - (b.candidate.priority || 99);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Select the best model for a given intent.
 *
 * @param {object} params
 * @param {string} params.intent           - Primary intent (from IntentDetector)
 * @param {number} [params.confidence]     - Intent confidence (0–1)
 * @param {string|null} [params.secondaryIntent]
 * @param {object} [params.overrides]      - capabilityRoutes from settings
 * @param {number} [params.estimatedTokens] - Estimated input token size of request
 * @returns {{ selected: object, diagnostics: object }}
 */
export function selectModel({
  intent,
  confidence = 1.0,
  secondaryIntent = null,
  overrides = {},
  estimatedTokens = 0,
  isVoiceMode = false,
}) {
  const capability = resolveCapabilityForIntent(intent);

  // ── 1. Build full candidate pool ──────────────────────────────────────────
  const allCandidates = buildCandidates(overrides);

  // ── 2. Check for user override first ─────────────────────────────────────
  const overrideKey = overrides?.[capability];
  if (overrideKey) {
    const overrideCandidates = buildOverrideCandidate(capability, overrides);
    const availableOverrides = getAvailableCandidates(overrideCandidates, estimatedTokens);

    if (availableOverrides.length > 0) {
      const overrideCandidate = availableOverrides[0];
      const scored = scoreCandidates(availableOverrides, intent, overrides, estimatedTokens);

      const availabilityResults = filterAvailable(allCandidates, estimatedTokens);
      const diagnosticsInput = {
        intent, confidence, secondaryIntent, capability,
        allCandidates,
        availabilityResults,
        capabilityResults: { passed: availableOverrides, rejected: [] },
        scoredCandidates: scored,
        selected: overrideCandidate,
        selectionReason: `User override: ${overrideKey} for capability "${capability}"`,
        overrideApplied: overrideKey,
        relaxedToGeneral: false,
        staticFallbackUsed: false,
      };
      logSelectionDiagnostics(diagnosticsInput);

      return {
        selected: buildModelConfig(overrideCandidate, capability),
        diagnostics: buildDiagnosticsSummary(diagnosticsInput),
      };
    }
    // Override candidate is unavailable — fall through to standard selection
    console.warn(`⚠️ [ModelSelector] User override "${overrideKey}" is unavailable. Falling through to standard selection.`);
  }

  // ── 3. Availability filter ────────────────────────────────────────────────
  const availabilityResults = filterAvailable(allCandidates, estimatedTokens);
  const availableCandidates = availabilityResults
    .filter(r => r.available)
    .map(r => r.candidate);

  // ── 4. Capability filter ──────────────────────────────────────────────────
  const { passed: capableCandidates, rejected: capabilityRejected } =
    filterByCapability(availableCandidates, intent);

  // ── 5. Score and sort ─────────────────────────────────────────────────────
  let scoredCandidates = scoreCandidates(capableCandidates, intent, overrides, estimatedTokens);

  if (isVoiceMode) {
    console.log("[ModelSelector] Voice Mode active. Applying Voice Routing Profile (Gemini Flash -> Groq -> OpenRouter -> Ollama)...");
    const candidatesOnly = scoredCandidates.map(s => s.candidate);
    const rankedCandidates = rankVoiceCandidates(candidatesOnly, { text: intent });
    scoredCandidates = rankedCandidates.map(c => {
      const origScored = scoredCandidates.find(s => s.candidate.key === c.key);
      return origScored || { candidate: c, score: 90, breakdown: {} };
    });
  }

  // ── 6. Fallback: relax to general_chat if no capable candidates ───────────
  let relaxedToGeneral = false;
  if (scoredCandidates.length === 0 && availableCandidates.length > 0) {
    console.warn(
`[ModelSelector]
Intent: ${intent}
Capability: ${capability}
Available Models: ${availableCandidates.length}
Relaxing to GeneralChat`
);
    relaxedToGeneral = true;
    const { passed: generalCandidates } = filterByCapability(availableCandidates, "GeneralChat");
    scoredCandidates = scoreCandidates(
      generalCandidates.length > 0 ? generalCandidates : availableCandidates,
      "GeneralChat",
      overrides,
      estimatedTokens
    );
  }

  // ── 7. Final fallback: static registry mapping ────────────────────────────
  let selected;
  let selectionReason;
  let staticFallbackUsed = false;

  if (scoredCandidates.length > 0) {
    selected = scoredCandidates[0].candidate;
    selectionReason = relaxedToGeneral
      ? `No ${capability} candidates available — selected highest general_chat scorer`
      : `Highest weighted score for ${intent} intent`;
  } else {
    // Absolute last resort — static capability mapping
    console.warn(`⚠️ [ModelSelector] Zero available candidates. Using static registry fallback.`);
    staticFallbackUsed = true;
    const staticModel = resolveCapability(capability);

    if (!staticModel) {
      throw new Error(
        `No fallback model registered for capability "${capability}".`
      );
    }

    const diagnosticsInput = {
      intent, confidence, secondaryIntent, capability,
      allCandidates, availabilityResults,
      capabilityResults: { passed: [], rejected: capabilityRejected },
      scoredCandidates: [],
      selected: null,
      selectionReason: "All candidates unavailable — static registry fallback used",
      overrideApplied: null,
      relaxedToGeneral,
      staticFallbackUsed,
    };
    logSelectionDiagnostics(diagnosticsInput);

    return {
      selected: {
        ...staticModel,
        matchedCapability: capability
      },
      diagnostics: buildDiagnosticsSummary(diagnosticsInput)
    };
  }

  // ── 8. Log diagnostics ────────────────────────────────────────────────────
  const diagnosticsInput = {
    intent, confidence, secondaryIntent, capability,
    allCandidates,
    availabilityResults,
    capabilityResults: { passed: capableCandidates, rejected: capabilityRejected },
    scoredCandidates,
    selected,
    selectionReason,
    overrideApplied: null,
    relaxedToGeneral,
    staticFallbackUsed,
  };
  logSelectionDiagnostics(diagnosticsInput);

  return {
    selected: buildModelConfig(selected, capability),
    diagnostics: buildDiagnosticsSummary(diagnosticsInput),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Converts a CandidateModel to the model config shape expected by ai.js callers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the model config object that ai.js and executeWithCie expect.
 * Preserves all existing fields from the CandidateModel + adds matchedCapability.
 *
 * @param {import("./CandidateBuilder.js").CandidateModel} candidate
 * @param {string} capability
 * @returns {object} Model config compatible with existing callers
 */
function buildModelConfig(candidate, capability) {
  const healthRecord = getModelHealth(candidate.key);
  return {
    // Fields that ai.js accesses directly
    name:            candidate.key,
    provider:        candidate.provider,
    modelId:         candidate.modelId,
    displayName:     candidate.displayName,
    fallback:        candidate.fallback,
    enabled:         candidate.enabled,
    status:          candidate.status,
    latency:         candidate.latency,
    contextWindow:   candidate.contextWindow,

    // All capability flags (needed by some provider callers)
    supportsStreaming:    candidate.flags.streaming,
    supportsVision:      candidate.flags.vision,
    supportsReasoning:   candidate.flags.reasoning,
    supportsLongContext: candidate.flags.longContext,
    supportsToolCalling: candidate.flags.toolCalling,
    supportsMarkdown:    candidate.flags.markdown,
    supportsPDF:         candidate.flags.pdf,
    supportsMemory:      candidate.flags.memory,
    supportsPlanning:    candidate.flags.planning,
    supportsWriting:     candidate.flags.writing,
    supportsCoding:      candidate.flags.coding,
    supportsResearch:    candidate.flags.research,
    supportsOffline:     candidate.flags.offline,

    // Expose health & selection metrics (Requirement 6)
    health:              getModelHealthScore(candidate.key),
    cooldown:            getCooldownRemaining(candidate.key),
    averageLatency:      healthRecord.avgLatencyMs,
    successRate:         healthRecord.successRate,
    failureCount:        healthRecord.totalFailures,
    contextSize:         candidate.contextWindow,
    capabilityScores:    candidate.scores,

    // MSE metadata
    matchedCapability: capability,
    _fromMSE: true,     // Flag so callers can tell MSE selected this
  };
}
