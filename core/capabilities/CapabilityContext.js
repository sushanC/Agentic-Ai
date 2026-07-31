/**
 * CapabilityContext.js
 *
 * Structured context object passed to capabilities during execution.
 * Encapsulates user prompt, toolContext, memory state, conversation history,
 * active tools, and runtime state.
 */
export class CapabilityContext {
  /**
   * Create structured CapabilityContext.
   *
   * @param {object} params
   * @param {string} params.prompt - User prompt string
   * @param {string} [params.toolContext="chat"] - Tool context mode ("chat", "voice", etc.)
   * @param {object} [params.workingMemory={}] - Active working memory context
   * @param {object} [params.semanticMemory={}] - Permanent user facts memory
   * @param {Array} [params.history=[]] - Conversation history
   * @param {string} [params.summary=""] - Conversation summary
   * @param {object} [params.pdfMemory={}] - PDF memory context
   * @param {object} [params.runtimeState={}] - Active runtime state
   * @param {object} [params.userPreferences={}] - User preferences
   * @returns {CapabilityContext}
   */
  constructor({
    prompt = "",
    toolContext = "chat",
    workingMemory = {},
    semanticMemory = {},
    history = [],
    summary = "",
    pdfMemory = {},
    runtimeState = {},
    userPreferences = {},
  } = {}) {
    this.prompt = String(prompt || "");
    this.promptLower = this.prompt.toLowerCase();
    this.toolContext = String(toolContext || "chat");
    this.workingMemory = workingMemory;
    this.semanticMemory = semanticMemory;
    this.history = history;
    this.summary = summary;
    this.pdfMemory = pdfMemory;
    this.runtimeState = runtimeState;
    this.userPreferences = userPreferences;
    this.timestamp = Date.now();
  }

  /**
   * Helper method to check if prompt includes keywords.
   * @param {...string} keywords
   * @returns {boolean}
   */
  includesAny(...keywords) {
    return keywords.some(kw => this.promptLower.includes(kw.toLowerCase()));
  }

  /**
   * Helper method to check if prompt starts with any keyword.
   * @param {...string} prefixes
   * @returns {boolean}
   */
  startsWithAny(...prefixes) {
    return prefixes.some(p => this.promptLower.startsWith(p.toLowerCase()));
  }
}
