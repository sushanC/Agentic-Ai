/**
 * EmailContext.js
 *
 * Structured context object passed to EmailManager and EmailCapability.
 */
export class EmailContext {
  /**
   * @param {object} params
   * @param {string} params.prompt - User prompt
   * @param {string} [params.toolContext="chat"] - Interaction channel ("chat", "voice", etc.)
   * @param {string} [params.conversationId] - Active conversation ID if continuing a session
   * @param {string} [params.confirmationId] - Active confirmation ID if resolving confirmation
   * @param {Array} [params.attachments=[]] - Normalized attachment metadata
   * @param {object} [params.semanticMemory={}] - Permanent memory context
   * @param {object} [params.workingMemory={}] - Active working memory context
   * @param {object} [params.userPreferences={}] - User preferences
   */
  constructor({
    prompt = "",
    toolContext = "chat",
    conversationId = null,
    confirmationId = null,
    attachments = [],
    semanticMemory = {},
    workingMemory = {},
    userPreferences = {}
  } = {}) {
    this.prompt = String(prompt || "");
    this.promptLower = this.prompt.toLowerCase().trim();
    this.toolContext = String(toolContext || "chat");
    this.conversationId = conversationId;
    this.confirmationId = confirmationId;
    this.attachments = Array.isArray(attachments) ? attachments : [];
    this.semanticMemory = semanticMemory;
    this.workingMemory = workingMemory;
    this.userPreferences = userPreferences;
    this.timestamp = Date.now();
  }
}
