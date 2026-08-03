import { developerEvents } from "../events/DeveloperEvents.js";

/**
 * EmailDiagnostics.js
 *
 * Telemetry and event bridge for Email System V2.
 * Emits structured developer events to DeveloperEvents.
 * Ensures zero logging of OAuth tokens, client secrets, or full raw email bodies.
 */
export class EmailDiagnostics {
  constructor() {
    this.events = developerEvents;
  }

  logConversationStarted(conversationId, prompt) {
    this.events.emitDevEvent("EmailConversationStarted", {
      conversationId,
      prompt: (prompt || "").slice(0, 100)
    });
  }

  logIntentDetected(conversationId, intent, confidence) {
    this.events.emitDevEvent("EmailIntentDetected", {
      conversationId,
      intent,
      confidence
    });
  }

  logRecipientResolutionStarted(conversationId, query) {
    this.events.emitDevEvent("RecipientResolutionStarted", {
      conversationId,
      query
    });
  }

  logRecipientResolutionResult(conversationId, query, status, matchType, matchedName, matchedEmail, confidence) {
    this.events.emitDevEvent("RecipientResolutionResult", {
      conversationId,
      query,
      status,
      matchType,
      matchedName,
      matchedEmail,
      confidence
    });
  }

  logRecipientResolved(conversationId, name, email, method) {
    this.events.emitDevEvent("RecipientResolved", {
      conversationId,
      name,
      email,
      method
    });
  }

  logRecipientAmbiguous(conversationId, query, count) {
    this.events.emitDevEvent("RecipientAmbiguous", {
      conversationId,
      query,
      count
    });
  }

  logMissingFieldRequested(conversationId, missingField, question) {
    this.events.emitDevEvent("MissingFieldRequested", {
      conversationId,
      missingField,
      question
    });
  }

  logDraftCreated(conversationId, draftId, subject, to) {
    this.events.emitDevEvent("DraftCreated", {
      conversationId,
      draftId,
      subject,
      to
    });
  }

  logConfirmationCreated(conversationId, confirmationId, title) {
    this.events.emitDevEvent("ConfirmationCreated", {
      conversationId,
      confirmationId,
      title
    });
  }

  logConfirmationAccepted(confirmationId) {
    this.events.emitDevEvent("ConfirmationAccepted", { confirmationId });
  }

  logConfirmationRejected(confirmationId) {
    this.events.emitDevEvent("ConfirmationRejected", { confirmationId });
  }

  logSendStarted(conversationId, provider, to) {
    this.events.emitDevEvent("SendStarted", { conversationId, provider, to });
  }

  logSendSucceeded(conversationId, messageId, durationMs) {
    this.events.emitDevEvent("SendSucceeded", { conversationId, messageId, durationMs });
  }

  logSendFailed(conversationId, error, retryable = true) {
    this.events.emitDevEvent("SendFailed", {
      conversationId,
      error: error.message || error,
      retryable
    });
  }

  logError(operation, error) {
    this.events.emitDevEvent("EmailError", {
      operation,
      error: error.message || error
    });
  }
}

export const emailDiagnostics = new EmailDiagnostics();
