/**
 * IntentScorer.js — Model Selection Engine
 *
 * Computes a composite score (0–100) for each candidate model given the current
 * intent. Scores are weighted dynamically based on what matters most for the
 * detected intent.
 *
 * Phase 5 — Intent-specific scoring weights.
 *
 * Score components:
 *  - Health Score    : How reliable/healthy the model currently is (0–1 → %)
 *  - Latency Score   : How fast the model typically responds
 *  - Cost Score      : Cheaper models score higher (inverted cost)
 *  - Capability Score: Model's self-declared strength for this intent's domain
 *  - Context Score   : Larger context window scores higher (for long-context intents)
 *  - Reasoning Score : Model's reasoning capability (for planning/research intents)
 *  - Quality Score   : Model's output quality (for writing intents)
 *
 * Every intent picks a weight vector from INTENT_WEIGHTS.
 * Weights in each vector must sum to 1.0.
 */

import { getModelHealthScore } from "./HealthScorer.js";

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
  // Log scale: small windows get penalized, but the jump from 128k to 1M is not as huge
  return Math.min(1.0, Math.log10(contextWindow) / Math.log10(MAX_CONTEXT));
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost → normalized score (lower cost = higher score)
// ─────────────────────────────────────────────────────────────────────────────

const MAX_COST = 0.002; // $0.002/1k tokens — used as ceiling

function costScore(estimatedCostPer1kTokens) {
  const cost = estimatedCostPer1kTokens || 0;
  return cost === 0 ? 1.0 : Math.max(0, 1 - (cost / MAX_COST));
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — Intent-specific weight tables
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Weight vectors keyed by intent string.
 * Each vector must sum to 1.0.
 *
 * Components:
 *  h = health      (from HealthScorer)
 *  l = latency     (from latency tier)
 *  c = cost        (from estimatedCostPer1kTokens)
 *  ca = capability (model's domain score)
 *  cx = context    (context window size)
 *  r = reasoning   (model.scores.reasoning)
 *  q = quality     (model.scores.writing — proxy for output quality)
 */
const INTENT_WEIGHTS = Object.freeze({

  Greeting: {
    health:     0.20,
    latency:    0.50,   // Speed is king for greetings
    cost:       0.20,
    capability: 0.10,
    context:    0.00,
    reasoning:  0.00,
    quality:    0.00,
  },

  GeneralChat: {
    health:     0.30,
    latency:    0.30,
    cost:       0.20,
    capability: 0.20,
    context:    0.00,
    reasoning:  0.00,
    quality:    0.00,
  },

  Programming: {
    health:     0.30,
    latency:    0.20,
    cost:       0.10,
    capability: 0.40,   // Coding ability matters most
    context:    0.00,
    reasoning:  0.00,
    quality:    0.00,
  },

  Research: {
    health:     0.20,
    latency:    0.10,
    cost:       0.05,
    capability: 0.45,   // Research depth matters most
    context:    0.20,   // Large context needed for thorough research
    reasoning:  0.00,
    quality:    0.00,
  },

  Planning: {
    health:     0.20,
    latency:    0.10,
    cost:       0.05,
    capability: 0.45,   // Planning capability matters most
    context:    0.00,
    reasoning:  0.20,   // Reasoning critical for multi-step plans
    quality:    0.00,
  },

  Writing: {
    health:     0.20,
    latency:    0.20,
    cost:       0.10,
    capability: 0.40,   // Writing quality is primary
    context:    0.00,
    reasoning:  0.00,
    quality:    0.10,   // Output quality secondary signal
  },

  Vision: {
    health:     0.25,
    latency:    0.15,
    cost:       0.10,
    capability: 0.50,   // Vision capability is hard requirement + quality
    context:    0.00,
    reasoning:  0.00,
    quality:    0.00,
  },

  Memory: {
    health:     0.30,
    latency:    0.25,
    cost:       0.10,
    capability: 0.35,
    context:    0.00,
    reasoning:  0.00,
    quality:    0.00,
  },

  MemoryExtraction: {
    health:     0.30,
    latency:    0.25,
    cost:       0.10,
    capability: 0.35,
    context:    0.00,
    reasoning:  0.00,
    quality:    0.00,
  },

  PDF: {
    health:     0.25,
    latency:    0.10,
    cost:       0.05,
    capability: 0.35,
    context:    0.25,   // Large context essential for PDF QA
    reasoning:  0.00,
    quality:    0.00,
  },

  WebSearch: {
    health:     0.25,
    latency:    0.30,
    cost:       0.15,
    capability: 0.30,
    context:    0.00,
    reasoning:  0.00,
    quality:    0.00,
  },

  TaskCreation: {
    health:     0.30,
    latency:    0.35,
    cost:       0.20,
    capability: 0.15,
    context:    0.00,
    reasoning:  0.00,
    quality:    0.00,
  },

  Reminder: {
    health:     0.30,
    latency:    0.35,
    cost:       0.20,
    capability: 0.15,
    context:    0.00,
    reasoning:  0.00,
    quality:    0.00,
  },

  Calendar: {
    health:     0.30,
    latency:    0.35,
    cost:       0.20,
    capability: 0.15,
    context:    0.00,
    reasoning:  0.00,
    quality:    0.00,
  },

  Email: {
    health:     0.30,
    latency:    0.25,
    cost:       0.15,
    capability: 0.30,
    context:    0.00,
    reasoning:  0.00,
    quality:    0.00,
  },

  AgentWorkflow: {
    health:     0.20,
    latency:    0.10,
    cost:       0.05,
    capability: 0.45,
    context:    0.00,
    reasoning:  0.20,
    quality:    0.00,
  },

  ActionPlanning: {
    health:     0.20,
    latency:    0.10,
    cost:       0.05,
    capability: 0.45,
    context:    0.00,
    reasoning:  0.20,
    quality:    0.00,
  },

  Summary: {
    health:     0.25,
    latency:    0.20,
    cost:       0.10,
    capability: 0.25,
    context:    0.20,
    reasoning:  0.00,
    quality:    0.00,
  },

  // Default fallback weights
  _default: {
    health:     0.30,
    latency:    0.25,
    cost:       0.20,
    capability: 0.25,
    context:    0.00,
    reasoning:  0.00,
    quality:    0.00,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Capability score extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map intent to the model's capability score field.
 *
 * @param {import("./CandidateBuilder.js").CandidateModel} candidate
 * @param {string} intent
 * @returns {number} 0.0–1.0
 */
function getCapabilityScore(candidate, intent) {
  const scoreMap = {
    Programming:       "coding",
    Research:          "research",
    Writing:           "writing",
    Planning:          "planning",
    AgentWorkflow:     "planning",
    ActionPlanning:    "planning",
    Vision:            "vision",
    PDF:               "research",     // Research score proxies PDF ability
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
 * @returns {{ score: number, breakdown: object }}
 */
export function scoreCandidate(candidate, intent) {
  const weights = INTENT_WEIGHTS[intent] || INTENT_WEIGHTS._default;

  // Individual component scores (all 0.0–1.0)
  const health     = getModelHealthScore(candidate.key);
  const latency    = LATENCY_SCORE[candidate.latencyTier || candidate.latency] ?? 0.30;
  const cost       = costScore(candidate.estimatedCostPer1kTokens);
  const capability = getCapabilityScore(candidate, intent);
  const context    = contextScore(candidate.contextWindow);
  const reasoning  = candidate.scores?.reasoning ?? 0.5;
  const quality    = candidate.scores?.writing ?? 0.5;   // Writing score as quality proxy

  // Weighted composite (0.0–1.0)
  const raw =
    health     * weights.health     +
    latency    * weights.latency    +
    cost       * weights.cost       +
    capability * weights.capability +
    context    * weights.context    +
    reasoning  * weights.reasoning  +
    quality    * weights.quality;

  // Scale to 0–100 integer
  const score = Math.round(raw * 100);

  return {
    score,
    breakdown: {
      health:     Math.round(health * 100),
      latency:    Math.round(latency * 100),
      cost:       Math.round(cost * 100),
      capability: Math.round(capability * 100),
      context:    Math.round(context * 100),
      reasoning:  Math.round(reasoning * 100),
      quality:    Math.round(quality * 100),
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
