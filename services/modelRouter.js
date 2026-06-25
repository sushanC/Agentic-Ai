/**
 * modelRouter.js
 *
 * Decides which AI model to use based on:
 * 1. Tool type (explicit routing — highest priority)
 * 2. Keyword analysis of the message (fallback)
 *
 * Routing table:
 *   pdf       → gemini   (vision + long context)
 *   web       → gemini   (summarization of web results)
 *   agent     → openrouter (complex multi-step planning)
 *   planning  → openrouter
 *   coding    → deepseek
 *   math      → groq
 *   offline   → ollama
 *   general   → groq (default)
 */
export function decideModel(
  message = "",
  tool = "chat"
) {

  // =====================
  // TOOL-BASED ROUTING
  // (highest priority — always wins)
  // =====================

  if (tool === "pdf") {
    return "gemini";
  }

  if (tool === "web") {
    return "gemini";
  }

  if (
    tool === "agent" ||
    tool === "planning"
  ) {
    return "openrouter";
  }

  // =====================
  // KEYWORD-BASED ROUTING
  // (used when tool === "chat")
  // =====================

  const text =
    String(message).toLowerCase();

  // Planning / strategy
  if (
    text.includes("plan") ||
    text.includes("roadmap") ||
    text.includes("strategy") ||
    text.includes("research and save") ||
    text.includes("analyze")
  ) {
    return "openrouter";
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
    return "deepseek";
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
    return "groq";
  }

  // Offline / local
  if (
    text.includes("offline") ||
    text.includes("local mode")
  ) {
    return "ollama";
  }

  // Default
  return "groq";
}