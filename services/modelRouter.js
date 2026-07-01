import { resolveCapabilityWithOverride } from "./modelRegistry.js";

/**
 * modelRouter.js
 *
 * Decides which AI model to use based on capabilities.
 * Maps tools and messages to capabilities, then returns the resolved registry object.
 * All model selection goes through the Model Registry — no hardcoded provider/model names.
 *
 * Capabilities:
 *   general_chat
 *   coding
 *   research
 *   writing
 *   planning
 *   reasoning
 *   math
 *   vision
 *   pdf
 *   memory_extraction
 *   web_search
 *   agent_planning
 *   tool_calling
 *   offline
 */
export function decideModel(
  message = "",
  tool = "chat",
  overrides = {}
) {

  // Helper: resolve capability → model, checking user overrides first
  const resolve = (capability) => {
    const modelConfig = resolveCapabilityWithOverride(capability, overrides);
    return { ...modelConfig, matchedCapability: capability };
  };

  // =====================
  // TOOL-BASED ROUTING
  // (highest priority — always wins)
  // =====================

  if (tool === "pdf") {
    return resolve("pdf");
  }

  if (tool === "web") {
    return resolve("web_search");
  }

  if (tool === "memory") {
    return resolve("memory_extraction");
  }

  if (
    tool === "agent" ||
    tool === "planning"
  ) {
    return resolve("agent_planning");
  }

  // =====================
  // KEYWORD-BASED ROUTING
  // (used when tool === "chat")
  // =====================

  const text = String(message).toLowerCase();

  // Vision / image analysis
  if (
    text.includes("image") ||
    text.includes("photo") ||
    text.includes("picture") ||
    text.includes("screenshot") ||
    text.includes("describe this") ||
    text.includes("look at") ||
    text.includes("what do you see")
  ) {
    return resolve("vision");
  }

  // Planning / strategy
  if (
    text.includes("plan") ||
    text.includes("roadmap") ||
    text.includes("strategy") ||
    text.includes("research and save")
  ) {
    return resolve("planning");
  }

  // Coding / debugging
  if (
    text.includes("code") ||
    text.includes("program") ||
    text.includes("java") ||
    text.includes("python") ||
    text.includes("javascript") ||
    text.includes("typescript") ||
    text.includes("react") ||
    text.includes("node") ||
    text.includes("sql") ||
    text.includes("bug") ||
    text.includes("error") ||
    text.includes("debug") ||
    text.includes("function") ||
    text.includes("algorithm")
  ) {
    return resolve("coding");
  }

  // Writing assistance (email drafting, essays, etc.)
  if (
    text.includes("write") ||
    text.includes("draft") ||
    text.includes("compose") ||
    text.includes("email") ||
    text.includes("essay")
  ) {
    return resolve("writing");
  }

  // Research / analysis / comparison / summarization / long explanations
  if (
    text.includes("research") ||
    text.includes("analyze") ||
    text.includes("find out") ||
    text.includes("compare") ||
    text.includes("comparison") ||
    text.includes("versus") ||
    text.includes(" vs ") ||
    text.includes("summarize") ||
    text.includes("summary") ||
    text.includes("explain in detail") ||
    text.includes("technical documentation") ||
    text.includes("long explanation")
  ) {
    return resolve("research");
  }

  // Web / live information
  if (
    text.includes("search online") ||
    text.includes("find online") ||
    text.includes("search the web") ||
    text.includes("look up")
  ) {
    return resolve("web_search");
  }

  // Math
  if (
    text.includes("gcd") ||
    text.includes("lcm") ||
    text.includes("equation") ||
    text.includes("factorial") ||
    text.includes("prime") ||
    text.includes("calculate") ||
    text.includes("compute")
  ) {
    return resolve("math");
  }

  // Offline / local
  if (
    text.includes("offline") ||
    text.includes("local mode")
  ) {
    return resolve("offline");
  }

  // Default general chat
  return resolve("general_chat");
}