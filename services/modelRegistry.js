/**
 * modelRegistry.js
 *
 * Centralized registry for all AI models.
 * No model IDs or names are hardcoded outside of this file.
 * Model IDs are loaded from environment variables where possible.
 *
 * Every model entry contains:
 *   provider, modelId, displayName, description, capabilities[],
 *   enabled, priority, status, reserved,
 *   supportsStreaming, supportsVision, supportsReasoning, supportsLongContext,
 *   supportsToolCalling, supportsMarkdown, supportsPDF, supportsMemory,
 *   supportsPlanning, supportsWriting, supportsCoding, supportsResearch,
 *   supportsOffline, fallback, latency, contextWindow, estimatedCostPer1kTokens
 */

export const modelRegistry = {

  // ─────────────────────────────────────────────────────────────────────────
  // GEMINI 2.5 Flash — Google
  // Primary: General Chat, Memory Extraction, Vision
  // ─────────────────────────────────────────────────────────────────────────
  gemini: {
    provider: "google",
    modelId: process.env.MODEL_GEMINI || "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    description: "Google's fastest multimodal model. Excels at general conversation, vision tasks, and memory extraction.",
    capabilities: ["general_chat", "vision", "pdf", "memory_extraction"],
    enabled: !!(process.env.GOOGLE_API_KEY || process.env.API_KEY),
    priority: 1,
    status: (process.env.GOOGLE_API_KEY || process.env.API_KEY) ? "online" : "offline",
    reserved: false,
    supportsStreaming: true,
    supportsVision: true,
    supportsReasoning: false,
    supportsLongContext: true,
    supportsToolCalling: true,
    supportsMarkdown: true,
    supportsPDF: true,
    supportsMemory: true,
    supportsPlanning: false,
    supportsWriting: true,
    supportsCoding: true,
    supportsResearch: false,
    supportsOffline: false,
    fallback: "groq",
    latency: "fast",
    contextWindow: 1000000,
    estimatedCostPer1kTokens: 0.00015
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DEEPSEEK Chat — DeepSeek
  // Primary: Programming / Coding
  // ─────────────────────────────────────────────────────────────────────────
  deepseek: {
    provider: "deepseek",
    modelId: process.env.MODEL_DEEPSEEK || "deepseek-chat",
    displayName: "DeepSeek Chat",
    description: "State-of-the-art coding model with advanced reasoning. Best for programming, debugging, and technical problem-solving.",
    capabilities: ["coding", "reasoning", "general_chat"],
    enabled: !!process.env.DEEPSEEK_API_KEY,
    priority: 1,
    status: process.env.DEEPSEEK_API_KEY ? "online" : "offline",
    reserved: false,
    supportsStreaming: true,
    supportsVision: false,
    supportsReasoning: true,
    supportsLongContext: true,
    supportsToolCalling: true,
    supportsMarkdown: true,
    supportsPDF: false,
    supportsMemory: false,
    supportsPlanning: false,
    supportsWriting: false,
    supportsCoding: true,
    supportsResearch: false,
    supportsOffline: false,
    fallback: "groq",
    latency: "medium",
    contextWindow: 64000,
    estimatedCostPer1kTokens: 0.00027
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GPT-OSS 120B — OpenRouter (free)
  // Primary: Writing. Fallback: Research, Planning
  // ─────────────────────────────────────────────────────────────────────────
  "gpt-oss": {
    provider: "openrouter",
    modelId: process.env.MODEL_GPT_OSS || "openai/gpt-oss-120b:free",
    displayName: "GPT-OSS 120B",
    description: "OpenAI's open-source 120B model via OpenRouter. Excellent for writing, content creation, and long-form generation.",
    capabilities: ["writing", "general_chat", "research"],
    enabled: !!process.env.OPENROUTER_API_KEY,
    priority: 2,
    status: process.env.OPENROUTER_API_KEY ? "online" : "offline",
    reserved: false,
    supportsStreaming: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsLongContext: true,
    supportsToolCalling: false,
    supportsMarkdown: true,
    supportsPDF: false,
    supportsMemory: false,
    supportsPlanning: true,
    supportsWriting: true,
    supportsCoding: false,
    supportsResearch: true,
    supportsOffline: false,
    fallback: "groq",
    latency: "medium",
    contextWindow: 128000,
    estimatedCostPer1kTokens: 0
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Nemotron 3 Ultra 550B — NVIDIA via OpenRouter (free)
  // Primary: Planning
  // ─────────────────────────────────────────────────────────────────────────
  nemotron: {
    provider: "openrouter",
    modelId: process.env.MODEL_NEMOTRON || "nvidia/nemotron-3-ultra-550b-a55b:free",
    displayName: "Nemotron 3 Ultra 550B",
    description: "NVIDIA's massive 550B planning and reasoning model. Best for strategic planning, roadmaps, and complex multi-step reasoning.",
    capabilities: ["planning", "agent_planning", "reasoning", "general_chat"],
    enabled: !!process.env.OPENROUTER_API_KEY,
    priority: 1,
    status: process.env.OPENROUTER_API_KEY ? "online" : "offline",
    reserved: false,
    supportsStreaming: true,
    supportsVision: false,
    supportsReasoning: true,
    supportsLongContext: true,
    supportsToolCalling: false,
    supportsMarkdown: true,
    supportsPDF: false,
    supportsMemory: false,
    supportsPlanning: true,
    supportsWriting: false,
    supportsCoding: false,
    supportsResearch: false,
    supportsOffline: false,
    fallback: "gpt-oss",
    latency: "slow",
    contextWindow: 128000,
    estimatedCostPer1kTokens: 0
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Qwen3 Next 80B — Alibaba via OpenRouter (free)
  // Primary: Research, PDF QA, Web Search
  // ─────────────────────────────────────────────────────────────────────────
  qwen: {
    provider: "openrouter",
    modelId: process.env.MODEL_QWEN || "qwen/qwen3-next-80b-a3b-instruct:free",
    displayName: "Qwen3 Next 80B",
    description: "Alibaba's 80B research and analysis model. Best for deep research, PDF question answering, web search summarization, and long-context tasks.",
    capabilities: ["research", "analysis", "summarization", "long_context", "pdf", "web_search", "general_chat"],
    enabled: !!process.env.OPENROUTER_API_KEY,
    priority: 1,
    status: process.env.OPENROUTER_API_KEY ? "online" : "offline",
    reserved: false,
    supportsStreaming: true,
    supportsVision: true,
    supportsReasoning: false,
    supportsLongContext: true,
    supportsToolCalling: true,
    supportsMarkdown: true,
    supportsPDF: true,
    supportsMemory: false,
    supportsPlanning: false,
    supportsWriting: false,
    supportsCoding: false,
    supportsResearch: true,
    supportsOffline: false,
    fallback: "gpt-oss",
    latency: "medium",
    contextWindow: 131072,
    estimatedCostPer1kTokens: 0
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Groq Llama 3.3 70B — Groq
  // Universal Fallback. Fallback for all primary models.
  // ─────────────────────────────────────────────────────────────────────────
  groq: {
    provider: "groq",
    modelId: process.env.MODEL_GROQ || "llama-3.3-70b-versatile",
    displayName: "Groq Llama 3.3 70B",
    description: "Ultra-fast Llama 3.3 70B running on Groq's LPU hardware. Used as the universal fallback for speed and reliability.",
    capabilities: ["general_chat", "math", "tool_calling", "coding"],
    enabled: !!process.env.GROQ_API_KEY,
    priority: 2,
    status: process.env.GROQ_API_KEY ? "online" : "offline",
    reserved: false,
    supportsStreaming: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsLongContext: false,
    supportsToolCalling: true,
    supportsMarkdown: true,
    supportsPDF: false,
    supportsMemory: true,
    supportsPlanning: false,
    supportsWriting: true,
    supportsCoding: true,
    supportsResearch: false,
    supportsOffline: false,
    fallback: "ollama",
    latency: "very_fast",
    contextWindow: 32768,
    estimatedCostPer1kTokens: 0.00059
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GLM 5.2 — ZhipuAI
  // DISABLED — Reserved / Experimental. Not used in routing.
  // ─────────────────────────────────────────────────────────────────────────
  glm: {
    provider: "glm",
    modelId: process.env.MODEL_GLM || "glm-5.2",
    displayName: "GLM 5.2",
    description: "ZhipuAI's GLM-5.2 model. Currently disabled and reserved for experimental use. Not included in automatic routing.",
    capabilities: ["general_chat"],
    enabled: false,
    priority: 99,
    status: "disabled",
    reserved: true,
    supportsStreaming: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsLongContext: false,
    supportsToolCalling: false,
    supportsMarkdown: true,
    supportsPDF: false,
    supportsMemory: false,
    supportsPlanning: false,
    supportsWriting: false,
    supportsCoding: false,
    supportsResearch: false,
    supportsOffline: false,
    fallback: null,
    latency: "unknown",
    contextWindow: 128000,
    estimatedCostPer1kTokens: 0
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Ollama Local — Local
  // Secondary Universal Fallback (offline / local)
  // ─────────────────────────────────────────────────────────────────────────
  ollama: {
    provider: "ollama",
    modelId: process.env.MODEL_OLLAMA || "qwen3:8b",
    displayName: "Ollama Local",
    description: "Local AI model running via Ollama. No internet required. Used as the secondary universal fallback for offline operation.",
    capabilities: ["offline", "general_chat"],
    enabled: true, // Local provider — assumed available
    priority: 5,
    status: "local",
    reserved: false,
    supportsStreaming: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsLongContext: false,
    supportsToolCalling: false,
    supportsMarkdown: true,
    supportsPDF: false,
    supportsMemory: false,
    supportsPlanning: false,
    supportsWriting: false,
    supportsCoding: false,
    supportsResearch: false,
    supportsOffline: true,
    fallback: null,
    latency: "variable",
    contextWindow: 8192,
    estimatedCostPer1kTokens: 0
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CAPABILITY MAPPING
// Maps each capability to its designated primary model registry key.
// Ordered by: best model for that task first.
// ─────────────────────────────────────────────────────────────────────────────
export const capabilityMapping = {
  general_chat:       "gemini",
  coding:             "deepseek",
  research:           "qwen",
  writing:            "gpt-oss",
  planning:           "nemotron",
  reasoning:          "deepseek",
  math:               "groq",
  vision:             "gemini",
  pdf:                "qwen",
  memory_extraction:  "gemini",
  web_search:         "qwen",
  agent_planning:     "nemotron",
  tool_calling:       "groq",
  offline:            "ollama"
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a model by its registry key name.
 * @param {string} name
 * @returns {object|null}
 */
export function getModel(name) {
  const model = modelRegistry[name];
  if (!model) return null;
  return { name, ...model };
}

/**
 * Get all enabled models.
 * @returns {object}
 */
export function getEnabledModels() {
  const enabled = {};
  for (const [key, model] of Object.entries(modelRegistry)) {
    if (model.enabled) {
      enabled[key] = { name: key, ...model };
    }
  }
  return enabled;
}

/**
 * Get the full model registry as an array (for API exposure).
 * @returns {Array}
 */
export function getModelRegistry() {
  return Object.entries(modelRegistry).map(([key, model]) => ({
    key,
    ...model
  }));
}

/**
 * Get a human-readable status string for a model.
 * @param {string} key
 * @returns {"online"|"disabled"|"offline"|"local"|"unknown"}
 */
export function getModelStatus(key) {
  const model = modelRegistry[key];
  if (!model) return "unknown";
  if (model.status) return model.status;
  if (!model.enabled) return "disabled";
  if (model.provider === "ollama") return "local";
  return "online";
}

/**
 * Resolves a model name to an active enabled model, following fallbacks if disabled.
 * @param {string} name
 * @param {Set<string>} visited - To prevent infinite loops in misconfigured fallbacks
 * @returns {object} - The resolved model configuration
 */
export function resolveModel(name, visited = new Set()) {
  const modelName = name.toLowerCase();
  if (visited.has(modelName)) {
    throw new Error(`Circular fallback detected for model: ${modelName}`);
  }
  visited.add(modelName);

  const model = getModel(modelName);
  if (!model) {
    // If unknown model, fall back to groq or first enabled model
    return getModel("groq") || Object.values(getEnabledModels())[0];
  }

  if (model.enabled) {
    return model;
  }

  if (model.fallback) {
    console.log(`⚠️ Model "${modelName}" is disabled. Falling back to "${model.fallback}"...`);
    return resolveModel(model.fallback, visited);
  }

  // Final absolute fallback
  return getModel("groq") || Object.values(getEnabledModels())[0];
}

/**
 * Resolves a capability to its designated default model, falling back if needed.
 * @param {string} capability
 * @returns {object} - The resolved model configuration
 */
export function resolveCapability(capability) {
  const defaultModelName = capabilityMapping[capability] || "groq";
  return resolveModel(defaultModelName);
}

/**
 * Resolves a capability to its model, checking settings overrides first.
 * This allows users to customize which model handles each capability
 * via Settings without restarting the application.
 *
 * @param {string} capability
 * @param {object} overrides - capabilityRoutes from saved settings { [capability]: modelKey }
 * @returns {object} - The resolved model configuration
 */
export function resolveCapabilityWithOverride(capability, overrides = {}) {
  if (overrides && overrides[capability]) {
    const overrideModel = resolveModel(overrides[capability]);
    if (overrideModel) {
      return overrideModel;
    }
  }
  return resolveCapability(capability);
}
