import { EmailComposer } from "../composition/EmailComposer.js";
import { EmailValidationPolicy } from "../policy/EmailValidationPolicy.js";

/**
 * DraftEmailAction.js
 *
 * Handles drafting email messages without sending or requesting confirmation.
 */
export class DraftEmailAction {
  static execute(params) {
    const composed = EmailComposer.compose(params);
    const validation = EmailValidationPolicy.validatePayload({
      to: params.to || params.recipientEmail,
      cc: params.cc,
      bcc: params.bcc,
      subject: composed.subject,
      body: composed.body
    });

    return {
      draft: {
        recipientName: params.recipientName || "",
        recipientEmail: params.to || params.recipientEmail || "",
        to: params.to || params.recipientEmail || "",
        cc: params.cc || [],
        bcc: params.bcc || [],
        subject: composed.subject,
        body: composed.body,
        html: composed.html,
        signature: composed.signature,
        attachments: params.attachments || []
      },
      valid: validation.valid,
      errors: validation.errors
    };
  }
}
