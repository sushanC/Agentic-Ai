import { EMAIL_STATUS } from "../EmailConfig.js";

/**
 * EmailConversationState.js
 *
 * Encapsulates multi-turn email conversation state object.
 */
export class EmailConversationState {
  /**
   * @param {object} params
   * @param {string} [params.conversationId]
   * @param {string} [params.status=EMAIL_STATUS.IDLE]
   * @param {string} [params.recipientQuery=""]
   * @param {string} [params.pendingRecipientName=""]
   * @param {object} [params.resolvedRecipient=null]
   * @param {string} [params.to=""]
   * @param {Array} [params.cc=[]]
   * @param {Array} [params.bcc=[]]
   * @param {string} [params.subject=""]
   * @param {string} [params.body=""]
   * @param {string} [params.html=""]
   * @param {Array} [params.attachments=[]]
   * @param {Array} [params.missingFields=[]]
   * @param {string} [params.confirmationId=null]
   * @param {object} [params.draft=null]
   */
  constructor({
    conversationId = null,
    status = EMAIL_STATUS.IDLE,
    recipientQuery = "",
    pendingRecipientName = "",
    resolvedRecipient = null,
    to = "",
    cc = [],
    bcc = [],
    subject = "",
    body = "",
    html = "",
    attachments = [],
    missingFields = [],
    confirmationId = null,
    draft = null
  } = {}) {
    this.conversationId = conversationId || `email-conv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    this.status = status;
    this.recipientQuery = recipientQuery;
    this.pendingRecipientName = pendingRecipientName;
    this.resolvedRecipient = resolvedRecipient;
    this.to = to;
    this.cc = cc;
    this.bcc = bcc;
    this.subject = subject;
    this.body = body;
    this.html = html;
    this.attachments = attachments;
    this.missingFields = missingFields;
    this.confirmationId = confirmationId;
    this.draft = draft;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    this.expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  }

  update(fields = {}) {
    Object.assign(this, fields);
    this.updatedAt = new Date().toISOString();
    return this;
  }

  toJSON() {
    return {
      conversationId: this.conversationId,
      status: this.status,
      recipientQuery: this.recipientQuery,
      pendingRecipientName: this.pendingRecipientName,
      resolvedRecipient: this.resolvedRecipient,
      to: this.to,
      cc: this.cc,
      bcc: this.bcc,
      subject: this.subject,
      body: this.body,
      html: this.html,
      attachments: this.attachments,
      missingFields: this.missingFields,
      confirmationId: this.confirmationId,
      draft: this.draft,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      expiresAt: this.expiresAt
    };
  }
}
