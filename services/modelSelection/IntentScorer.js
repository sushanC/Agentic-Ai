/**
 * IntentScorer.js — Model Selection Engine
 *
 * Computes a composite score (0–100) for each candidate model given the current
 * intent. Scores are weighted dynamically based on what matters most for the
 * detected intent.
 *
 * Upgrade: Score candidate using 6 components:
 *  - capability score (domain capability)
 *  - health score (reliability and latency penalty)
 *  - latency (speed score)
 *  - priority (normalized model priority)
 *  - context window (normalized context size)
 *  - user override (direct override flag)
 *
 * Every intent picks a weight vector from INTENT_WEIGHTS.
 * Weights in each vector sum to 1.0.
 */

import { getModelHealthScore } from "./HealthScorer.js";
import { resolveCapabilityForIntent } from "./CapabilityFilter.js";

// ─────────────────────────────────────────────────────────────────────────────
// Latency tier → numeric score
// ─────────────────────────────────────────────────────────────────────────────
const LATENCY_SCORE = Object.freeze({
  very_fast:  1.0,
  fast:       0.82,
  medium:     0.60,
  slow:       0.35,
  variable:   0.50,
  unknown:    0.30,
});

// ─────────────────────────────────────────────────────────────────────────────
// Context window → normalized score (log-scale normalization)
// ─────────────────────────────────────────────────────────────────────────────
const MAX_CONTEXT = 1_000_000; // Gemini 2.5 Flash — used as ceiling

function contextScore(contextWindow) {
  if (!contextWindow || contextWindow <= 0) return 0;
  return Math.min(1.0, Math.log10(contextWindow) / Math.log10(MAX_CONTEXT));
}

// ─────────────────────────────────────────────────────────────────────────────
// Priority → normalized score (lower priority number = higher score)
// ─────────────────────────────────────────────────────────────────────────────
function priorityScore(priority) {
  const p = priority || 5;
  return Math.max(0.0, 1 - (p - 1) * 0.15); // priority 1 -> 1.0, 2 -> 0.85, 3 -> 0.70, etc.
}

// ─────────────────────────────────────────────────────────────────────────────
// Intent-specific weight tables (Override weight = 0.50 for all intents)
// ─────────────────────────────────────────────────────────────────────────────
const INTENT_WEIGHTS = Object.freeze({
  Greeting: {
    capability: 0.05,
    health:     0.10,
    latency:    0.25,   // Speed is highly weighted
    priority:   0.05,
    context:    0.05,
    override:   0.50,
  },

  GeneralChat: {
    capability: 0.15,
    health:     0.15,
    latency:    0.10,
    priority:   0.05,
    context:    0.05,
    override:   0.50,
  },

  Programming: {
    capability: 0.25,   // Coding ability matters most
    health:     0.10,
    latency:    0.05,
    priority:   0.05,
    context:    0.05,
    override:   0.50,
  },

  Research: {
    capability: 0.20,   // Research capability priority
    health:     0.10,
    latency:    0.05,
    priority:   0.05,
    context:    0.10,   // Large context window score is highly weighted
    override:   0.50,
  },

  Planning: {
    capability: 0.20,   // Planning capability priority
    health:     0.10,
    latency:    0.05,
    priority:   0.10,   // Priority rank matters
    context:    0.05,
    override:   0.50,
  },

  Writing: {
    capability: 0.25,   // Writing quality is primary
    health:     0.10,
    latency:    0.05,
    priority:   0.05,
    context:    0.05,
    override:   0.50,
  },

  Vision: {
    capability: 0.25,   // Vision capability priority
    health:     0.10,
    latency:    0.05,
    priority:   0.05,
    context:    0.05,
    override:   0.50,
  },

  Memory: {
    capability: 0.20,
    health:     0.15,
    latency:    0.05,
    priority:   0.05,
    context:    0.05,
    override:   0.50,
  },

  MemoryExtraction: {
    capability: 0.20,
    health:     0.15,
    latency:    0.05,
    priority:   0.05,
    context:    0.05,
    override:   0.50,
  },

  PDF: {
    capability: 0.20,
    health:     0.10,
    latency:    0.05,
    priority:   0.05,
    context:    0.10,   // Large context size
    override:   0.50,
  },

  WebSearch: {
    capability: 0.15,
    health:     0.10,
    latency:    0.15,
    priority:   0.05,
    context:    0.05,
    override:   0.50,
  },

  TaskCreation: {
    capability: 0.15,
    health:     0.15,
    latency:    0.10,
    priority:   0.05,
    context:    0.05,
    override:   0.50,
  },

  Reminder: {
    capability: 0.15,
    health:     0.15,
    latency:    0.10,
    priority:   0.05,
    context:    0.05,
    override:   0.50,
  },

  Calendar: {
    capability: 0.15,
    health:     0.15,
    latency:    0.10,
    priority:   0.05,
    context:    0.05,
    override:   0.50,
  },

  Email: {
    capability: 0.15,
    health:     0.15,
    latency:    0.10,
    priority:   0.05,
    context:    0.05,
    override:   0.50,
  },

  AgentWorkflow: {
    capability: 0.20,
    health:     0.10,
    latency:    0.05,
    priority:   0.10,
    context:    0.05,
    override:   0.50,
  },

  ActionPlanning: {
    capability: 0.20,
    health:     0.10,
    latency:    0.05,
    priority:   0.10,
    context:    0.05,
    override:   0.50,
  },

  Summary: {
    capability: 0.15,
    health:     0.15,
    latency:    0.10,
    priority:   0.05,
    context:    0.05,
    override:   0.50,
  },

  _default: {
    capability: 0.15,
    health:     0.15,
    latency:    0.10,
    priority:   0.05,
    context:    0.05,
    override:   0.50,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Capability score extraction
// ─────────────────────────────────────────────────────────────────────────────
function getCapabilityScore(candidate, intent) {
  const scoreMap = {
    Programming:       "coding",
    Research:          "research",
    Writing:           "writing",
    Planning:          "planning",
    AgentWorkflow:     "planning",
    ActionPlanning:    "planning",
    Vision:            "vision",
    PDF:               "research",
    Memory:            "general",
    MemoryExtraction:  "general",
    WebSearch:         "research",
    Email:             "writing",
    TaskCreation:      "general",
    Calendar:          "general",
    Reminder:          "general",
    Greeting:          "general",
    GeneralChat:       "general",
    Summary:           "research",
  };
  const field = scoreMap[intent] || "general";
  return candidate.scores?.[field] ?? 0.5;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a composite 0–100 score for a candidate given the current intent.
 *
 * @param {import("./CandidateBuilder.js").CandidateModel} candidate
 * @param {string} intent - Primary intent from IntentDetector
 * @param {object} [overrides={}] - capabilityRoutes overrides
 * @param {number} [estimatedTokens=0] - Estimated input token size of request
 * @returns {{ score: number, breakdown: object }}
 */
export function scoreCandidate(candidate, intent, overrides = {}, estimatedTokens = 0) {
  let weights = { ...(INTENT_WEIGHTS[intent] || INTENT_WEIGHTS._default) };

  // Dynamic Prompt token size awareness weight adjustment
  if (estimatedTokens > 0) {
    if (estimatedTokens > 15000) {
      // Large prompt: increase context weight, reduce latency weight
      const shift = Math.min(weights.latency, 0.15);
      weights.latency -= shift;
      weights.context += shift;
    } else if (estimatedTokens < 2000) {
      // Small prompt: increase latency weight, reduce context weight
      const shift = Math.min(weights.context, 0.05);
      weights.context -= shift;
      weights.latency += shift;
    }
  }

  const capabilityKey = resolveCapabilityForIntent(intent);
  const isOverride = overrides?.[capabilityKey] === candidate.key;

  // Individual component scores (all 0.0–1.0)
  const health     = getModelHealthScore(candidate.key);
  const latency    = LATENCY_SCORE[candidate.latencyTier || candidate.latency] ?? 0.30;
  const priority   = priorityScore(candidate.priority);
  const context    = contextScore(candidate.contextWindow);
  const capability = getCapabilityScore(candidate, intent);
  const override   = isOverride ? 1.0 : 0.0;

  // Weighted composite (0.0–1.0)
  const raw =
    health     * weights.health     +
    latency    * weights.latency    +
    priority   * weights.priority   +
    context    * weights.context    +
    capability * weights.capability +
    override   * weights.override;

  // Scale to 0–100 integer
  const score = Math.round(raw * 100);

  return {
    score,
    breakdown: {
      health:     Math.round(health * 100),
      latency:    Math.round(latency * 100),
      priority:   Math.round(priority * 100),
      context:    Math.round(context * 100),
      capability: Math.round(capability * 100),
      override:   Math.round(override * 100),
      weights,
    },
  };
}

/**
 * Get the weight table for a given intent (for diagnostics).
 *
 * @param {string} intent
 * @returns {object} Weight vector
 */
export function getWeightsForIntent(intent) {
  return INTENT_WEIGHTS[intent] || INTENT_WEIGHTS._default;
}
