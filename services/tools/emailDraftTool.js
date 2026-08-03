import { emailManager } from "../../core/email/EmailManager.js";
import { EmailContext } from "../../core/email/EmailContext.js";

/**
 * emailDraftTool.js — Backward Compatibility Adapter
 *
 * Conforms to ToolRegistry contract and delegates all email draft and confirmation
 * operations directly to EmailManager in core/email/.
 */
export class EmailDraftTool {
  requiresConfirmation = true;

  /**
   * Main execute method — conforms to the ToolRegistry interface.
   *
   * @param {object} action - { tool, action, input }
   * @returns {Promise<object|string>}
   */
  async execute(action) {
    if (action.action === "confirmed_draft") {
      const input = action.input || {};
      const confirmationId = input.confirmationId || action._confirmedId;

      const res = await emailManager.send({
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        body: input.body,
        html: input.html,
        signature: input.signature,
        attachments: input.attachments
      });

      return `✅ Email sent successfully to **${input.to}**!\n\n**Subject:** ${input.subject}\n**Message ID:** ${res.messageId}`;
    }

    const rawInput = typeof action.input === "string"
      ? action.input
      : action.input?.text || action.input?.content || String(action.input || "");

    const context = new EmailContext({
      prompt: rawInput,
      toolContext: "chat"
    });

    const result = await emailManager.handle(context);

    if (result.status === "waiting_confirmation" || result.status === "waiting_input" || result.status === "waiting_recipient" || result.status === "waiting_email_address" || result.status === "waiting_content") {
      if (result.confirmationId) {
        return {
          success: true,
          status: result.status === "waiting_confirmation" ? "pending_confirmation" : "waiting_input",
          confirmationId: result.confirmationId,
          tool: "email_draft",
          action: "draft",
          title: "Send Email",
          message: result.answer,
          preview: {
            to: result.draft?.to || result.recipient?.email || "",
            subject: result.draft?.subject || "",
            body: result.draft?.body || ""
          }
        };
      }
    }

    return result.answer || "Email operation processed.";
  }
}
