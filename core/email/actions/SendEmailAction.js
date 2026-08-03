import { gmailProvider } from "../providers/GmailProvider.js";
import { EmailValidationPolicy } from "../policy/EmailValidationPolicy.js";

/**
 * SendEmailAction.js
 *
 * Handles actual email transmission through configured email provider (GmailProvider).
 */
export class SendEmailAction {
  /**
   * Execute email send.
   *
   * @param {object} params - { to, cc, bcc, subject, body, html, signature, attachments }
   * @param {object} [provider=gmailProvider]
   * @returns {Promise<{success: boolean, messageId: string}>}
   */
  static async execute(params, provider = gmailProvider) {
    const validation = EmailValidationPolicy.validatePayload(params);
    if (!validation.valid) {
      const err = new Error(`Validation failed: ${validation.errors.join("; ")}`);
      err.code = "VALIDATION_FAILED";
      throw err;
    }

    return await provider.send(params);
  }
}
