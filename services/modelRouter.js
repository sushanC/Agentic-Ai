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

import { loadMemory } from "../storage/memoryStorage.js";
import { getRecentHistory } from "./historyService.js";
import { loadSummary } from "../storage/summaryStorage.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";

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
// Prompt Token Estimation Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimate the total token count of the upcoming prompt (including system prompt,
 * user message, memory, conversation history, and summaries).
 * Uses a standard 4 characters per token heuristic.
 *
 * @param {string} message
 * @param {string} tool
 * @returns {Promise<number>} Estimated tokens
 */
async function estimateTotalTokens(message, tool) {
  // Base length: user prompt + system prompt
  let charLength = (message?.length || 0) + (SYSTEM_PROMPT?.length || 0);

  try {
    // Retrieve context elements in parallel
    const [memory, history, summary] = await Promise.all([
      loadMemory().catch(() => ({})),
      getRecentHistory(10).catch(() => []),
      loadSummary().catch(() => ({})),
    ]);

    if (memory) {
      charLength += JSON.stringify(memory).length;
    }
    if (Array.isArray(history)) {
      charLength += history.reduce((sum, msg) => sum + (msg.content?.length || 0) + 20, 0);
    }
    if (summary && summary.summary) {
      charLength += summary.summary.length;
    }
  } catch (err) {
    console.error("⚠️ [TokenEstimation] Failed to load context for token estimation:", err.message);
  }

  // 1 token = approx 4 characters
  return Math.ceil(charLength / 4);
}

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
  // 1. Estimate total tokens in the prompt context
  const estimatedTokens = await estimateTotalTokens(message, tool);

  // 2. Resolve intent
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

  // 3. Delegate to MSE — single authoritative decision maker
  const { selected, diagnostics } = selectModel({
    intent,
    confidence,
    secondaryIntent,
    overrides,
    estimatedTokens, // Pass estimated tokens to MSE
    isVoiceMode: (tool === "voice")
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