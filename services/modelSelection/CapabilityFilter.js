/**
 * CapabilityFilter.js — Model Selection Engine
 *
 * Removes candidates that cannot satisfy the capability required by the intent.
 *
 * Responsibilities (single):
 *  - Map intent → required capability
 *  - Map capability → required model flags/properties
 *  - Filter out candidates missing those flags
 *
 * This is purely structural matching — no scoring or health involved.
 * Health and scoring live in IntentScorer.js.
 *
 * Intent → Capability mapping:
 *   Programming   → coding
 *   Research      → research
 *   Writing       → writing
 *   Planning      → planning
 *   Vision/Image  → vision
 *   PDF           → pdf
 *   Memory        → memory
 *   WebSearch     → web_search (no hard requirement — any model qualifies)
 *   Math          → math (no hard requirement)
 *   AgentWorkflow → planning (agent-capable)
 *   Offline       → offline
 *   Greeting / GeneralChat / Default → no capability requirement (all qualify)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Intent → Capability map
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps intent strings (from IntentDetector) to the primary capability key.
 * Intents not listed here default to "general_chat" — no hard filter applied.
 */
export const INTENT_TO_CAPABILITY = Object.freeze({
  // IntentDetector intent values → capability key
  Programming:    "coding",
  Research:       "research",
  Writing:        "writing",
  Planning:       "planning",
  Vision:         "vision",
  PDF:            "pdf",
  Memory:         "memory_extraction",
  MemoryExtraction: "memory_extraction",
  AgentWorkflow:  "agent_planning",
  ActionPlanning: "agent_planning",
  WebSearch:      "web_search",
  // No hard filter for these — all capable models qualify:
  // Greeting, GeneralChat, TaskCreation, Reminder, Calendar,
  // Email, EmailDraft, EmailExtraction, Filesystem, Browser,
  // Summary, ToolRouting, Math (preferred but not required)
});

// ─────────────────────────────────────────────────────────────────────────────
// Capability → Required flags map
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps capability keys to the model flags that MUST be true.
 * Models lacking any required flag are hard-filtered out.
 */
const CAPABILITY_REQUIREMENTS = Object.freeze({
  coding:           { coding: true },
  research:         { research: true },
  writing:          { writing: true },
  planning:         { planning: true },
  agent_planning:   { planning: true },
  vision:           { vision: true },
  pdf:              { pdf: true },
  memory_extraction:{ memory: true },
  tool_calling:     { toolCalling: true },
  offline:          { offline: true },
  // These have no hard requirements — preference applied via scoring:
  web_search:       {},
  general_chat:     {},
  math:             {},
});

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the required capability for a given intent.
 *
 * @param {string} intent - Intent string from IntentDetector
 * @returns {string} Capability key
 */
export function resolveCapabilityForIntent(intent) {
  return INTENT_TO_CAPABILITY[intent] || "general_chat";
}

export function satisfiesCapability(candidate, capability) {
  if (capability === "general_chat") {
    return { passes: true, reason: null };
  }

  // Primary check: check candidate's capabilities metadata array
  if (candidate.capabilities && candidate.capabilities.includes(capability)) {
    return { passes: true, reason: null };
  }

  // Secondary/Fallback check: check structural requirements flags
  const requirements = CAPABILITY_REQUIREMENTS[capability];
  if (!requirements) {
    // Unknown capability with no requirements — don't filter
    return { passes: true, reason: null };
  }

  for (const [flagName, requiredValue] of Object.entries(requirements)) {
    if (candidate.flags[flagName] !== requiredValue) {
      return {
        passes: false,
        reason: `Requires ${flagName}=${requiredValue}, model has ${flagName}=${candidate.flags[flagName]}`,
      };
    }
  }

  return { passes: true, reason: null };
}

/**
 * Filter candidates to those capable of handling the given intent.
 *
 * @param {import("./CandidateBuilder.js").CandidateModel[]} candidates
 * @param {string} intent - Primary intent from IntentDetector
 * @returns {{ passed: CandidateModel[], rejected: Array<{candidate, reason}> }}
 */
export function filterByCapability(candidates, intent) {
  const capability = resolveCapabilityForIntent(intent);
  const passed = [];
  const rejected = [];

  for (const candidate of candidates) {
    const { passes, reason } = satisfiesCapability(candidate, capability);
    if (passes) {
      passed.push(candidate);
    } else {
      rejected.push({ candidate, reason: `UnsupportedCapability: ${reason}` });
    }
  }

  return { passed, rejected, capability };
}
