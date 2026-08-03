import { EMAIL_STATUS } from "./EmailConfig.js";

/**
 * EmailResult.js
 *
 * Standardized return contract payload for all operations in Email System V2.
 */
export class EmailResult {
  /**
   * Create standardized EmailResult object.
   *
   * @param {object} params
   * @param {boolean} [params.success=true]
   * @param {string} [params.status=EMAIL_STATUS.DRAFT]
   * @param {string} [params.operation="draft"]
   * @param {string} [params.conversationId=""]
   * @param {string} [params.answer=""] - Human text answer (Voice / Chat prompt)
   * @param {object} [params.draft=null]
   * @param {object} [params.recipient=null]
   * @param {string} [params.missingField=null]
   * @param {string} [params.confirmationId=null]
   * @param {string} [params.messageId=null]
   * @param {string} [params.provider="gmail"]
   * @param {string} [params.error=null]
   * @param {object} [params.metadata={}]
   * @returns {object}
   */
  static create({
    success = true,
    status = EMAIL_STATUS.DRAFT,
    operation = "draft",
    conversationId = "",
    answer = "",
    draft = null,
    recipient = null,
    missingField = null,
    confirmationId = null,
    messageId = null,
    provider = "gmail",
    error = null,
    metadata = {}
  }) {
    return {
      success: Boolean(success),
      status: String(status),
      operation: String(operation),
      conversationId: String(conversationId || ""),
      answer: String(answer || ""),
      response: String(answer || ""),
      draft: draft ? { ...draft } : null,
      recipient: recipient ? { ...recipient } : null,
      missingField: missingField ? String(missingField) : null,
      confirmationId: confirmationId ? String(confirmationId) : null,
      messageId: messageId ? String(messageId) : null,
      provider: String(provider),
      error: error ? (error.message || String(error)) : null,
      metadata: {
        timestamp: new Date().toISOString(),
        ...metadata
      }
    };
  }
}
