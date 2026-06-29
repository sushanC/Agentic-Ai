/**
 * modelRegistry.js
 *
 * Centralized registry for all AI models.
 * No model IDs or names are hardcoded outside of this file.
 * Model IDs are loaded from environment variables where possible.
 */

export const modelRegistry = {
  gemini: {
    provider: "google",
    modelId: process.env.MODEL_GEMINI || "gemini-2.5-flash",
    capabilities: ["vision", "pdf", "memory_extraction", "general_chat"],
    enabled: !!(process.env.GOOGLE_API_KEY || process.env.API_KEY),
    priority: 1,
    supportsStreaming: true,
    supportsVision: true,
    supportsToolCalling: true,
    supportsReasoning: false,
    supportsLongContext: true,
    supportsEmbeddings: true,
    fallback: "groq"
  },
  deepseek: {
    provider: "deepseek",
    modelId: process.env.MODEL_DEEPSEEK || "deepseek-chat",
    capabilities: ["coding", "reasoning", "general_chat"],
    enabled: !!process.env.DEEPSEEK_API_KEY,
    priority: 1,
    supportsStreaming: true,
    supportsVision: false,
    supportsToolCalling: true,
    supportsReasoning: true,
    supportsLongContext: true,
    supportsEmbeddings: false,
    fallback: "openrouter"
  },
  groq: {
    provider: "groq",
    modelId: process.env.MODEL_GROQ || "llama-3.3-70b-versatile",
    capabilities: ["math", "tool_calling", "general_chat"],
    enabled: !!process.env.GROQ_API_KEY,
    priority: 2,
    supportsStreaming: true,
    supportsVision: false,
    supportsToolCalling: true,
    supportsReasoning: false,
    supportsLongContext: false,
    supportsEmbeddings: false,
    fallback: "openrouter"
  },
  glm: {
    provider: "glm",
    modelId: process.env.MODEL_GLM || "glm-5.2",
    capabilities: ["research", "general_chat"],
    enabled: !!process.env.GLM_API_KEY,
    priority: 3,
    supportsStreaming: true,
    supportsVision: false,
    supportsToolCalling: true,
    supportsReasoning: false,
    supportsLongContext: true,
    supportsEmbeddings: false,
    fallback: "groq"
  },
  openrouter: {
    provider: "openrouter",
    modelId: process.env.MODEL_OPENROUTER || "meta-llama/llama-3.3-70b-instruct",
    capabilities: ["general_chat"],
    enabled: !!process.env.OPENROUTER_API_KEY,
    priority: 1,
    supportsStreaming: true,
    supportsVision: false,
    supportsToolCalling: true,
    supportsReasoning: false,
    supportsLongContext: true,
    supportsEmbeddings: false,
    fallback: "groq"
  },
  "gpt-oss": {
    provider: "openrouter",
    modelId: process.env.MODEL_GPT_OSS || "openai/gpt-oss-120b:free",
    capabilities: ["writing", "general_chat"],
    enabled: !!process.env.OPENROUTER_API_KEY,
    priority: 4,
    supportsStreaming: true,
    supportsVision: false,
    supportsToolCalling: false,
    supportsReasoning: false,
    supportsLongContext: true,
    supportsEmbeddings: false,
    fallback: "openrouter"
  },
  nemotron: {
    provider: "openrouter",
    modelId: process.env.MODEL_NEMOTRON || "nvidia/nemotron-3-ultra-550b-a55b:free",
    capabilities: ["planning", "agent_planning", "general_chat"],
    enabled: !!process.env.OPENROUTER_API_KEY,
    priority: 4,
    supportsStreaming: true,
    supportsVision: false,
    supportsToolCalling: false,
    supportsReasoning: false,
    supportsLongContext: true,
    supportsEmbeddings: false,
    fallback: "openrouter"
  },
  ollama: {
    provider: "ollama",
    modelId: process.env.MODEL_OLLAMA || "qwen3:8b",
    capabilities: ["offline", "general_chat"],
    enabled: true, // Local provider, assumed available
    priority: 5,
    supportsStreaming: true,
    supportsVision: false,
    supportsToolCalling: false,
    supportsReasoning: false,
    supportsLongContext: false,
    supportsEmbeddings: false,
    fallback: "groq"
  }
};

/**
 * Capability mapping to default models.
 */
export const capabilityMapping = {
  general_chat: "groq",
  coding: "deepseek",
  research: "glm",
  writing: "gpt-oss",
  planning: "nemotron",
  reasoning: "deepseek",
  math: "groq",
  vision: "gemini",
  pdf: "gemini",
  memory_extraction: "gemini",
  agent_planning: "nemotron",
  tool_calling: "groq",
  offline: "ollama"
};

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
