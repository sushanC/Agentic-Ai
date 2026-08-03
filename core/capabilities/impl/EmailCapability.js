import { BaseCapability } from "../BaseCapability.js";
import { CapabilityResult } from "../CapabilityResult.js";
import { emailManager } from "../../email/EmailManager.js";
import { EmailContext } from "../../email/EmailContext.js";

/**
 * EmailCapability.js
 *
 * Lightweight integration facade connecting Capability Framework and Workflow Engine
 * to Email System V2 (`core/email/`).
 *
 * Contains ZERO business logic, OAuth logic, MIME construction, contact storage, or confirmation logic.
 */
export class EmailCapability extends BaseCapability {
  constructor() {
    super("email", "Conversational Email Capability", 85);
  }

  canHandle(context) {
    if (context.includesAny(
      "email", "send email", "draft email", "reply to email",
      "forward email", "write an email", "send an email"
    )) {
      return 0.90;
    }
    return 0.0;
  }

  async execute(context) {
    const attachments = context.workingMemory?.attachments || context.runtimeState?.attachments || [];

    const emailContext = new EmailContext({
      prompt: context.prompt,
      toolContext: context.toolContext,
      conversationId: context.runtimeState?.conversationId,
      confirmationId: context.runtimeState?.confirmationId,
      attachments
    });

    const emailResult = await emailManager.handle(emailContext);

    return CapabilityResult.create({
      success: emailResult.success,
      capability: this.name,
      tool: "email_draft",
      answer: emailResult.answer,
      executedSteps: [{
        name: `email_${emailResult.operation}`,
        status: emailResult.success ? "completed" : "failed"
      }],
      diagnostics: {
        status: emailResult.status,
        conversationId: emailResult.conversationId,
        confirmationId: emailResult.confirmationId
      },
      metadata: {
        status: emailResult.status,
        draft: emailResult.draft,
        recipient: emailResult.recipient,
        missingField: emailResult.missingField,
        confirmationId: emailResult.confirmationId
      }
    });
  }
}
