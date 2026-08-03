import { gmailAuthManager } from "../core/email/auth/GmailAuthManager.js";
import { gmailProvider } from "../core/email/providers/GmailProvider.js";
import { MimeBuilder } from "../core/email/composition/MimeBuilder.js";

/**
 * services/gmailService.js — Backward Compatibility Facade
 *
 * Delegates OAuth2 authentication, token management, MIME building, and email sending
 * to the core/email/ subsystem while preserving exact function signatures for existing callers.
 */

export function getOAuth2Client() {
  return gmailAuthManager.getOAuth2Client();
}

export async function getGmailStatus() {
  return await gmailAuthManager.getStatus();
}

export function getAuthUrl() {
  return gmailAuthManager.getAuthUrl();
}

export async function exchangeCodeForTokens(code) {
  return await gmailAuthManager.exchangeCodeForTokens(code);
}

export async function getAuthenticatedClient() {
  return await gmailAuthManager.getAuthenticatedClient();
}

export function buildMimeMessage(params) {
  return MimeBuilder.buildMimeMessage(params);
}

export async function sendEmail(params) {
  return await gmailProvider.send(params);
}
