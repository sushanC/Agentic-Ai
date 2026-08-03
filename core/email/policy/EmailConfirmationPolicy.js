import { createPending, confirmAction, cancelAction } from "../../../services/confirmationService.js";
import { EMAIL_CONFIG, EMAIL_INTENT } from "../EmailConfig.js";

/**
 * EmailConfirmationPolicy.js
 *
 * Enforces email confirmation policy:
 * - Drafting = NO confirmation required.
 * - Sending / Replying / Forwarding = Confirmation REQUIRED via generic confirmationService.
 */
export class EmailConfirmationPolicy {
  /**
   * Determine whether an intent requires user confirmation.
   * @param {string} intent
   * @returns {boolean}
   */
  static requiresConfirmation(intent) {
    return EMAIL_CONFIG.CONFIRMATION_REQUIRED_INTENTS.includes(intent);
  }

  /**
   * Create a pending email confirmation record via generic confirmationService.
   *
   * @param {object} params
   * @param {object} params.draft - Draft object
   * @param {string} [params.intent=EMAIL_INTENT.SEND]
   * @returns {Promise<object>} Confirmation response
   */
  static async requestConfirmation({ draft, intent = EMAIL_INTENT.SEND }) {
    const payload = {
      tool: "email_draft",
      action: "confirmed_draft",
      input: {
        to: draft.recipientEmail,
        cc: draft.cc,
        bcc: draft.bcc,
        subject: draft.subject,
        body: draft.body,
        html: draft.html,
        signature: draft.signature,
        conversationId: draft.conversationId
      }
    };

    const preview = {
      to: draft.recipientEmail,
      cc: (draft.cc || []).join(", "),
      bcc: (draft.bcc || []).join(", "),
      subject: draft.subject,
      body: draft.body,
      signature: draft.signature
    };

    return await createPending({
      tool: "email_draft",
      action: "draft",
      payload,
      preview,
      title: "Send Email",
      message: `I've drafted an email to ${draft.recipientName || draft.recipientEmail} about ${draft.subject}. Would you like me to send it?`,
      ttlMinutes: EMAIL_CONFIG.DEFAULT_TTL_MINUTES
    });
  }

  /**
   * Confirm and execute a pending confirmation by ID.
   * @param {string} confirmationId
   * @returns {Promise<object>}
   */
  static async confirm(confirmationId) {
    return await confirmAction(confirmationId);
  }

  /**
   * Cancel a pending confirmation by ID.
   * @param {string} confirmationId
   * @returns {Promise<object>}
   */
  static async cancel(confirmationId) {
    return await cancelAction(confirmationId);
  }
}
