import { emailRegistry } from "./EmailRegistry.js";
import { emailConversationManager } from "./conversation/EmailConversationManager.js";
import { EmailIntentResolver } from "./intent/EmailIntentResolver.js";
import { EmailFieldExtractor } from "./intent/EmailFieldExtractor.js";
import { ContactResolver } from "./contacts/ContactResolver.js";
import { EmailComposer } from "./composition/EmailComposer.js";
import { EmailConfirmationPolicy } from "./policy/EmailConfirmationPolicy.js";
import { EmailValidationPolicy } from "./policy/EmailValidationPolicy.js";
import { DraftEmailAction } from "./actions/DraftEmailAction.js";
import { SendEmailAction } from "./actions/SendEmailAction.js";
import { ReplyEmailAction } from "./actions/ReplyEmailAction.js";
import { ForwardEmailAction } from "./actions/ForwardEmailAction.js";
import { emailDiagnostics } from "./EmailDiagnostics.js";
import { EmailResult } from "./EmailResult.js";
import { EMAIL_STATUS, EMAIL_INTENT } from "./EmailConfig.js";
import { listPending } from "../../services/confirmationService.js";
import { addActivity } from "../../storage/activityStorage.js";

/**
 * EmailManager.js
 *
 * Single orchestrator for Email System V2.
 * Manages conversational email sessions, intent resolution, contact lookup,
 * draft generation, confirmation policy enforcement, and provider dispatch.
 */
export class EmailManager {
  constructor() {
    this.registry = emailRegistry;
    this.conversations = emailConversationManager;
    this.diagnostics = emailDiagnostics;
  }

  /**
   * Main entry point for executing email requests from any channel (Chat, Voice, etc.).
   *
   * @param {import("./EmailContext.js").EmailContext} context
   * @returns {Promise<object>} EmailResult
   */
  async handle(context) {
    const prompt = context.prompt.trim();

    // Step 1: Check for active pending email confirmations
    const pendingList = await listPending();
    const activePendingEmail = pendingList.find(p => p.tool === "email_draft" && p.status === "pending");
    const activeSession = this.conversations.getActiveSession();

    // Check if the user is confirming or cancelling an active email confirmation
    const resolvedIntent = EmailIntentResolver.resolve(prompt, {
      hasActiveConfirmation: Boolean(activePendingEmail || (activeSession && activeSession.status === EMAIL_STATUS.WAITING_CONFIRMATION))
    });

    if (resolvedIntent.intent === EMAIL_INTENT.CONFIRM && (activePendingEmail || activeSession)) {
      const confirmationId = activePendingEmail?.id || activeSession?.confirmationId;
      if (confirmationId) {
        return await this.confirmSend(confirmationId, activeSession);
      }
    }

    if (resolvedIntent.intent === EMAIL_INTENT.CANCEL && (activePendingEmail || activeSession)) {
      const confirmationId = activePendingEmail?.id || activeSession?.confirmationId;
      if (confirmationId) {
        return await this.cancelSend(confirmationId, activeSession);
      }
    }

    // Step 2: Check if resuming an existing active multi-turn session
    if (activeSession) {
      return await this.resumeConversation(activeSession, prompt, context);
    }

    // Step 3: New email request flow
    return await this.startNewConversation(prompt, context);
  }

  /**
   * Start a new email conversation flow.
   */
  async startNewConversation(prompt, context) {
    const session = this.conversations.startSession();
    this.diagnostics.logConversationStarted(session.conversationId, prompt);

    const intentResult = EmailIntentResolver.resolve(prompt);
    session.update({ intent: intentResult.intent });
    this.diagnostics.logIntentDetected(session.conversationId, intentResult.intent, intentResult.confidence);

    // Extract fields via LLM & deterministic rules
    const extracted = await EmailFieldExtractor.extract(prompt);
    session.update({
      subject: extracted.subject,
      body: extracted.body,
      cc: extracted.cc,
      bcc: extracted.bcc
    });

    // Check if attachments were passed in workflow context
    if (context.attachments && context.attachments.length > 0) {
      session.update({ attachments: context.attachments });
    }

    const query = extracted.recipientEmail || extracted.recipientName;

    if (!query) {
      session.update({ status: EMAIL_STATUS.COLLECTING_RECIPIENT, missingFields: ["recipient"] });
      const answer = "Who would you like me to email?";
      this.diagnostics.logMissingFieldRequested(session.conversationId, "recipient", answer);
      return EmailResult.create({
        success: true,
        status: EMAIL_STATUS.COLLECTING_RECIPIENT,
        operation: "draft",
        conversationId: session.conversationId,
        answer,
        missingField: "recipient"
      });
    }

    return await this.resolveAndProceed(session, query, extracted);
  }

  /**
   * Resume an ongoing multi-turn email conversation session.
   */
  async resumeConversation(session, prompt, context) {
    console.log(`📧 [EmailManager] Resuming conversation session [${session.conversationId}] in status [${session.status}]`);

    // Scenario A: Currently waiting for recipient contact resolution or email address
    if (
      session.status === EMAIL_STATUS.COLLECTING_RECIPIENT ||
      session.status === EMAIL_STATUS.COLLECTING_EMAIL_ADDRESS
    ) {
      return await this.resolveAndProceed(session, prompt, { subject: session.subject, body: session.body });
    }

    // Scenario B: Currently waiting for email body/content
    if (session.status === EMAIL_STATUS.COLLECTING_CONTENT) {
      session.update({ body: prompt, missingFields: [] });
      return await this.finalizeDraftAndPromptConfirmation(session);
    }

    // Default fallback: restart session with new prompt
    return await this.startNewConversation(prompt, context);
  }

  /**
   * Resolve recipient contact and proceed to draft / confirmation or prompt for missing input.
   */
  async resolveAndProceed(session, query, extracted) {
    // Preserve original contact name query (Bug 1)
    if (!EmailValidationPolicy.isValidEmail(query) && !session.pendingRecipientName) {
      const formattedName = query.trim().charAt(0).toUpperCase() + query.trim().slice(1);
      session.update({ pendingRecipientName: formattedName });
    }

    this.diagnostics.logRecipientResolutionStarted(session.conversationId, query);

    const contactResult = await ContactResolver.resolve(query);

    this.diagnostics.logRecipientResolutionResult(
      session.conversationId,
      query,
      contactResult.status,
      contactResult.matchType,
      contactResult.name,
      contactResult.email,
      contactResult.confidence
    );

    if (contactResult.status === "ambiguous") {
      session.update({ status: EMAIL_STATUS.COLLECTING_RECIPIENT, missingFields: ["recipient"] });
      const names = contactResult.matches.map(m => `${m.name} (${m.email})`).join(" or ");
      const answer = `I found multiple contacts matching "${query}": ${names}. Which one did you mean?`;
      this.diagnostics.logRecipientAmbiguous(session.conversationId, query, contactResult.matches.length);
      return EmailResult.create({
        success: true,
        status: EMAIL_STATUS.COLLECTING_RECIPIENT,
        operation: "draft",
        conversationId: session.conversationId,
        answer,
        missingField: "recipient"
      });
    }

    if (contactResult.status === "unknown") {
      const contactName = session.pendingRecipientName || query;
      session.update({
        status: EMAIL_STATUS.COLLECTING_EMAIL_ADDRESS,
        pendingRecipientName: contactName,
        recipientQuery: query,
        missingFields: ["recipientEmail"]
      });
      const answer = `I don't have ${contactName}'s email address yet. What is their email address?`;
      this.diagnostics.logMissingFieldRequested(session.conversationId, "recipientEmail", answer);
      return EmailResult.create({
        success: true,
        status: EMAIL_STATUS.COLLECTING_EMAIL_ADDRESS,
        operation: "draft",
        conversationId: session.conversationId,
        answer,
        missingField: "recipientEmail"
      });
    }

    // Contact resolved unambiguously
    let recipientName = contactResult.name || query;
    let recipientEmail = contactResult.email;

    // Check if user supplied explicit email address for a pending recipient name (Bug 1)
    if (EmailValidationPolicy.isValidEmail(query) && session.pendingRecipientName) {
      recipientName = session.pendingRecipientName;
      recipientEmail = query;
      await ContactResolver.saveNewContact(session.pendingRecipientName, query);
    }

    // Enforce Recipient Invariant (Bug 2)
    session.update({
      resolvedRecipient: { name: recipientName, email: recipientEmail },
      to: recipientEmail,
      recipientQuery: query
    });

    this.diagnostics.logRecipientResolved(session.conversationId, recipientName, recipientEmail, "ContactResolver");

    // If body is missing, prompt for body
    if (!session.body || session.body.trim().length === 0) {
      session.update({ status: EMAIL_STATUS.COLLECTING_CONTENT, missingFields: ["body"] });
      const answer = `What would you like me to tell ${recipientName}?`;
      this.diagnostics.logMissingFieldRequested(session.conversationId, "body", answer);
      return EmailResult.create({
        success: true,
        status: EMAIL_STATUS.COLLECTING_CONTENT,
        operation: "draft",
        conversationId: session.conversationId,
        answer,
        recipient: { name: recipientName, email: recipientEmail },
        missingField: "body"
      });
    }

    // Both recipient and body present: finalize draft & request confirmation
    return await this.finalizeDraftAndPromptConfirmation(session);
  }

  /**
   * Finalize the draft payload and generate confirmation request.
   */
  async finalizeDraftAndPromptConfirmation(session) {
    const composed = EmailComposer.compose({
      subject: session.subject,
      body: session.body,
      signature: process.env.GMAIL_SIGNATURE
    });

    const recipientEmail = session.resolvedRecipient?.email || session.to;
    const recipientName = session.resolvedRecipient?.name || session.pendingRecipientName || "";

    // Enforce Recipient Invariant across complete draft payload (Bug 2 & 6)
    const draftObj = {
      conversationId: session.conversationId,
      recipientName,
      recipientEmail,
      to: recipientEmail,
      cc: session.cc || [],
      bcc: session.bcc || [],
      subject: composed.subject,
      body: composed.body,
      html: composed.html,
      signature: composed.signature,
      attachments: session.attachments || []
    };

    // Store complete finalized draft on session (Bug 6)
    session.update({
      status: EMAIL_STATUS.WAITING_CONFIRMATION,
      subject: composed.subject,
      body: composed.body,
      to: recipientEmail,
      draft: draftObj
    });

    this.diagnostics.logDraftCreated(session.conversationId, session.conversationId, composed.subject, recipientEmail);

    // Request confirmation via EmailConfirmationPolicy
    const pendingRecord = await EmailConfirmationPolicy.requestConfirmation({ draft: draftObj });
    session.update({ confirmationId: pendingRecord.confirmationId });

    this.diagnostics.logConfirmationCreated(session.conversationId, pendingRecord.confirmationId, pendingRecord.title);
    addActivity(`Email draft prepared for ${recipientEmail}: ${composed.subject}`);

    const recipientDisplay = recipientName || recipientEmail;
    const voiceAnswer = `I've drafted an email to ${recipientDisplay} about ${composed.subject}. Would you like me to send it?`;

    return EmailResult.create({
      success: true,
      status: EMAIL_STATUS.WAITING_CONFIRMATION,
      operation: "draft",
      conversationId: session.conversationId,
      answer: voiceAnswer,
      draft: draftObj,
      recipient: session.resolvedRecipient,
      confirmationId: pendingRecord.confirmationId
    });
  }

  /**
   * Confirm and send email execution path.
   */
  async confirmSend(confirmationId, session) {
    this.diagnostics.logConfirmationAccepted(confirmationId);

    const startTime = Date.now();
    const result = await EmailConfirmationPolicy.confirm(confirmationId);

    if (!result.success) {
      const errObj = result.error || {};
      const requiresReauth = Boolean(
        errObj.requiresReauth ||
        errObj.code === "GMAIL_REAUTH_REQUIRED"
      );

      const authUrl = errObj.authUrl || (requiresReauth ? this.registry.getProvider("gmail")?.authManager?.getAuthUrl() : null);
      const status = requiresReauth ? EMAIL_STATUS.RECOVERY_REQUIRED : EMAIL_STATUS.FAILED_RETRYABLE;

      if (session) {
        session.update({
          status,
          confirmationId: null // clear spent/failed confirmation ID
        });
      }

      this.diagnostics.logSendFailed(session?.conversationId || confirmationId, result.message, !requiresReauth);

      const userMsg = requiresReauth
        ? "I couldn't send the email because Gmail needs to be reconnected. Your draft is still saved."
        : `❌ Failed to send email: ${result.message}. Your draft is preserved.`;

      return EmailResult.create({
        success: false,
        status,
        operation: "send",
        conversationId: session?.conversationId || "",
        answer: userMsg,
        draft: session?.draft || null,
        confirmationId: null,
        error: requiresReauth ? "GMAIL_REAUTH_REQUIRED" : result.message,
        metadata: {
          recoverable: true,
          automaticRetryable: !requiresReauth,
          recoveryAction: requiresReauth ? "gmail_reauth" : "retry_prompt",
          requiresReauth,
          authUrl
        }
      });
    }

    const durationMs = Date.now() - startTime;
    const messageId = result.result?.messageId || "sent";

    if (session) {
      session.update({ status: EMAIL_STATUS.SENT });
      this.conversations.endSession(session.conversationId);
    }

    this.diagnostics.logSendSucceeded(session?.conversationId || confirmationId, messageId, durationMs);
    addActivity(`Email sent successfully via Gmail: ${messageId}`);

    return EmailResult.create({
      success: true,
      status: EMAIL_STATUS.SENT,
      operation: "send",
      conversationId: session?.conversationId || "",
      answer: "Done. I've sent it.",
      messageId,
      draft: session?.draft || null
    });
  }

  /**
   * Cancel pending email confirmation path.
   */
  async cancelSend(confirmationId, session) {
    this.diagnostics.logConfirmationRejected(confirmationId);

    await EmailConfirmationPolicy.cancel(confirmationId);

    if (session) {
      session.update({ status: EMAIL_STATUS.CANCELLED });
      this.conversations.endSession(session.conversationId);
    }

    return EmailResult.create({
      success: true,
      status: EMAIL_STATUS.CANCELLED,
      operation: "cancel",
      conversationId: session?.conversationId || "",
      answer: "I've cancelled sending the email."
    });
  }

  // Helper APIs exposed on EmailManager
  async draft(params) {
    return DraftEmailAction.execute(params);
  }

  async send(params) {
    const provider = this.registry.getProvider(params.provider || "gmail");
    return await SendEmailAction.execute(params, provider);
  }

  async reply(params) {
    const provider = this.registry.getProvider(params.provider || "gmail");
    return await ReplyEmailAction.execute(params, provider);
  }

  async forward(params) {
    const provider = this.registry.getProvider(params.provider || "gmail");
    return await ForwardEmailAction.execute(params, provider);
  }
}

export const emailManager = new EmailManager();
