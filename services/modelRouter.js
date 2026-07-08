/**
 * modelRouter.js — Thin Adapter (v3 — MSE Integration)
 *
 * This module is now a thin adapter. Its ONLY job is:
 *  1. Translate tool context (pdf, web, memory, agent) into capability context
 *  2. Delegate all model selection to the Model Selection Engine (MSE)
 *
 * v3 changes (MSE integration):
 *  - ALL keyword-based routing removed. Message content is no longer parsed here.
 *  - Message understanding is exclusively the IntentDetector's responsibility.
 *  - Model selection is exclusively the MSE's responsibility.
 *  - decideModel() is now async (calls detectIntentFull → selectModel).
 *  - Signature change: healthScores param removed (MSE manages its own health).
 *  - Backward compatible: callers that await decideModel() work unchanged.
 *
 * Architecture:
 *   Tool Context (pdf/web/memory/agent)
 *       ↓ translated to tool string
 *   IntentDetector.detectIntentFull(message, tool, settings)
 *       ↓ { intent, confidence, secondaryIntent }
 *   MSE.selectModel({ intent, confidence, secondaryIntent, overrides })
 *       ↓
 *   Model config with matchedCapability
 *
 * Phase 10 compliance:
 *  - This module knows NOTHING about provider implementations.
 *  - Adding a new model requires ONLY registry registration.
 *  - No model-specific logic here.
 */

import { detectIntentFull } from "./cie/IntentDetector.js";
import { selectModel } from "./modelSelection/index.js";
import { emitDevEvent } from "./developerBridge.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tool → intent override map
// These tools bypass IntentDetector because the tool context is unambiguous.
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_INTENT_OVERRIDES = Object.freeze({
  pdf:      "PDF",
  web:      "WebSearch",
  memory:   "Memory",
  agent:    "AgentWorkflow",
  planning: "AgentWorkflow",
});

// ─────────────────────────────────────────────────────────────────────────────
// Public: decideModel (async — Phase 2/6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decide which model to use for a given message and tool context.
 *
 * All model selection is delegated to the Model Selection Engine.
 * No keyword parsing. No routing logic. No scoring.
 *
 * @param {string} message   - User message (passed to IntentDetector)
 * @param {string} tool      - Active tool ("chat", "pdf", "web", "memory", "agent", "planning")
 * @param {object} overrides - User capability route overrides from settings
 * @param {object} [_healthScores] - Deprecated: ignored. MSE uses per-model health internally.
 * @param {object} [settings] - User settings (forwarded to IntentDetector)
 * @returns {Promise<object>} Resolved model config with matchedCapability
 */
export async function decideModel(
  message = "",
  tool = "chat",
  overrides = {},
  _healthScores = {},  // Kept for backward compatibility — intentionally ignored
  settings = {}
) {
  // 1. Resolve intent
  //    Tool overrides take highest priority (tool context is unambiguous).
  //    For "chat" tool, IntentDetector determines intent from message content.
  let intent, confidence, secondaryIntent;

  const toolOverride = TOOL_INTENT_OVERRIDES[tool];
  if (toolOverride) {
    intent          = toolOverride;
    confidence      = 1.0;
    secondaryIntent = null;
  } else {
    const intentResult = await detectIntentFull(message, tool, settings);
    intent          = intentResult.intent;
    confidence      = intentResult.confidence;
    secondaryIntent = intentResult.secondaryIntent;
  }

  // 2. Delegate to MSE — single authoritative decision maker
  const { selected, diagnostics } = selectModel({
    intent,
    confidence,
    secondaryIntent,
    overrides,
  });

  // Emit to developer console
  if (diagnostics) {
    emitDevEvent('ModelSelected', {
      selected:  diagnostics.selected,
      candidates: diagnostics.candidates,
      reason:     diagnostics.reason,
    });
  }

  return selected;
}