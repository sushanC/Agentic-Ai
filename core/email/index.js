/**
 * core/email/index.js
 *
 * Public entry point for Email System V2 package (`core/email/`).
 */

export { EmailManager, emailManager } from "./EmailManager.js";
export { EmailContext } from "./EmailContext.js";
export { EmailResult } from "./EmailResult.js";
export { EmailRegistry, emailRegistry } from "./EmailRegistry.js";
export { EmailDiagnostics, emailDiagnostics } from "./EmailDiagnostics.js";
export { EMAIL_STATUS, EMAIL_INTENT, EMAIL_CONFIG } from "./EmailConfig.js";

// Auth & Providers
export { GmailAuthManager, gmailAuthManager } from "./auth/GmailAuthManager.js";
export { BaseEmailProvider } from "./providers/BaseEmailProvider.js";
export { GmailProvider, gmailProvider } from "./providers/GmailProvider.js";

// Intent & Contacts
export { EmailIntentResolver } from "./intent/EmailIntentResolver.js";
export { EmailFieldExtractor } from "./intent/EmailFieldExtractor.js";
export { ContactResolver } from "./contacts/ContactResolver.js";
export { ContactRepository } from "./contacts/ContactRepository.js";

// Conversation
export { EmailConversationState } from "./conversation/EmailConversationState.js";
export { EmailConversationManager, emailConversationManager } from "./conversation/EmailConversationManager.js";

// Composition & Policy
export { MimeBuilder } from "./composition/MimeBuilder.js";
export { SignatureManager } from "./composition/SignatureManager.js";
export { EmailComposer } from "./composition/EmailComposer.js";
export { EmailValidationPolicy } from "./policy/EmailValidationPolicy.js";
export { EmailConfirmationPolicy } from "./policy/EmailConfirmationPolicy.js";

// Actions
export { DraftEmailAction } from "./actions/DraftEmailAction.js";
export { SendEmailAction } from "./actions/SendEmailAction.js";
export { ReplyEmailAction } from "./actions/ReplyEmailAction.js";
export { ForwardEmailAction } from "./actions/ForwardEmailAction.js";
