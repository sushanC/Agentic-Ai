import { detectIntentFull } from "../../services/cie/IntentDetector.js";
import { selectModel } from "../../services/modelSelection/index.js";
import { developerEvents } from "../events/DeveloperEvents.js";
import { ContextAssembly } from "../context/ContextAssembly.js";
import { SYSTEM_PROMPT } from "../../services/systemPrompt.js";

const TOOL_INTENT_OVERRIDES = Object.freeze({
  pdf:      "PDF",
  web:      "WebSearch",
  memory:   "Memory",
  agent:    "AgentWorkflow",
  planning: "AgentWorkflow",
  research: "Research",
  code:     "Programming",
  vision:   "Vision",
});

/**
 * Estimate the total token count of the upcoming prompt context.
 * @param {string} message
 * @param {string} tool
 * @returns {Promise<number>}
 */
async function estimateTotalTokens(message, tool) {
  let charLength = (message?.length || 0) + (SYSTEM_PROMPT?.length || 0);

  try {
    const context = await ContextAssembly.assembleContext(message);
    if (context.memory) {
      charLength += JSON.stringify(context.memory).length;
    }
    if (Array.isArray(context.history)) {
      charLength += context.history.reduce((sum, msg) => sum + (msg.content?.length || 0) + 20, 0);
    }
    if (context.summary) {
      charLength += context.summary.length;
    }
  } catch (err) {
    console.error("⚠️ [TokenEstimation] Failed to assemble context for token estimation:", err.message);
  }

  return Math.ceil(charLength / 4);
}

/**
 * Decide which model to use for a given message and tool context.
 * All model selection is delegated to the Model Selection Engine (MSE).
 *
 * @param {string} message - User prompt
 * @param {string} tool - Active tool ("chat", "pdf", "web", "memory", "agent", "planning", "voice")
 * @param {object} overrides - Capability route overrides from settings
 * @param {object} [_healthScores] - Deprecated: ignored
 * @param {object} [settings] - User settings
 * @returns {Promise<object>} Resolved model config
 */
export async function decideModel(
  message = "",
  tool = "chat",
  overrides = {},
  _healthScores = {},
  settings = {}
) {
  const estimatedTokens = await estimateTotalTokens(message, tool);

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

  const { selected, diagnostics } = selectModel({
    intent,
    confidence,
    secondaryIntent,
    overrides,
    estimatedTokens,
    isVoiceMode: (tool === "voice")
  });

  if (diagnostics) {
    developerEvents.emitDevEvent('ModelSelected', {
      selected:   diagnostics.selected,
      candidates: diagnostics.candidates,
      reason:     diagnostics.reason,
    });
  }

  return selected;
}
