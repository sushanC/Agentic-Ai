/**
 * EmailConfig.js
 *
 * Centralized configuration, timeouts, limits, and status constants for Email System V2.
 */

export const EMAIL_STATUS = Object.freeze({
  IDLE: "idle",
  COLLECTING_RECIPIENT: "waiting_recipient",
  COLLECTING_EMAIL_ADDRESS: "waiting_email_address",
  COLLECTING_CONTENT: "waiting_content",
  DRAFT: "draft",
  WAITING_CONFIRMATION: "waiting_confirmation",
  SENDING: "sending",
  SENT: "sent",
  CANCELLED: "cancelled",
  RECOVERY_REQUIRED: "recovery_required",
  FAILED_RETRYABLE: "failed_retryable",
  FAILED: "failed"
});

export const EMAIL_INTENT = Object.freeze({
  DRAFT: "DRAFT",
  SEND: "SEND",
  REPLY: "REPLY",
  FORWARD: "FORWARD",
  CANCEL: "CANCEL",
  EDIT: "EDIT",
  CONFIRM: "CONFIRM",
  ADD_ATTACHMENT: "ADD_ATTACHMENT",
  CHANGE_RECIPIENT: "CHANGE_RECIPIENT",
  CHANGE_SUBJECT: "CHANGE_SUBJECT",
  CHANGE_BODY: "CHANGE_BODY"
});

export const EMAIL_CONFIG = {
  DEFAULT_TTL_MINUTES: 30,
  CONVERSATION_EXPIRATION_MS: 30 * 60 * 1000,
  DEFAULT_SIGNATURE: process.env.GMAIL_SIGNATURE || "",
  DEFAULT_PROVIDER: "gmail",
  CONFIRMATION_REQUIRED_INTENTS: [EMAIL_INTENT.SEND, EMAIL_INTENT.REPLY, EMAIL_INTENT.FORWARD]
};
