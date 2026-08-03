import { EMAIL_INTENT } from "../EmailConfig.js";

/**
 * EmailIntentResolver.js
 *
 * Resolves user request intent (DRAFT, SEND, REPLY, FORWARD, CANCEL, EDIT, CONFIRM, etc.).
 * Supports voice affirmations ("yes", "send it", "go ahead") when an active pending confirmation exists.
 */
export class EmailIntentResolver {
  /**
   * Resolve intent from prompt and context.
   *
   * @param {string} prompt
   * @param {object} [context={}]
   * @returns {{ intent: string, confidence: number }}
   */
  static resolve(prompt, context = {}) {
    const p = (prompt || "").toLowerCase().trim();

    // Check for explicit confirmation affirmations when there is an active pending email confirmation
    if (context.hasActiveConfirmation) {
      if (/^(yes|yeah|yep|sure|ok|send|send it|go ahead|yes send it|confirm|do it)\b/i.test(p)) {
        return { intent: EMAIL_INTENT.CONFIRM, confidence: 0.98 };
      }
      if (/^(no|nope|cancel|don't send|dont send|stop|abort)\b/i.test(p)) {
        return { intent: EMAIL_INTENT.CANCEL, confidence: 0.98 };
      }
    }

    if (/\b(cancel|don't send|dont send|abort|stop)\b/i.test(p)) {
      return { intent: EMAIL_INTENT.CANCEL, confidence: 0.95 };
    }

    if (/\b(reply|respond to email)\b/i.test(p)) {
      return { intent: EMAIL_INTENT.REPLY, confidence: 0.90 };
    }

    if (/\b(forward|fwd)\b/i.test(p)) {
      return { intent: EMAIL_INTENT.FORWARD, confidence: 0.90 };
    }

    if (/\b(change recipient|send to someone else|change to)\b/i.test(p)) {
      return { intent: EMAIL_INTENT.CHANGE_RECIPIENT, confidence: 0.90 };
    }

    if (/\b(change subject|set subject|subject to)\b/i.test(p)) {
      return { intent: EMAIL_INTENT.CHANGE_SUBJECT, confidence: 0.90 };
    }

    if (/\b(change body|edit message|update content)\b/i.test(p)) {
      return { intent: EMAIL_INTENT.CHANGE_BODY, confidence: 0.90 };
    }

    if (/\b(add attachment|attach|send file)\b/i.test(p)) {
      return { intent: EMAIL_INTENT.ADD_ATTACHMENT, confidence: 0.90 };
    }

    if (/\b(send immediately|send right now|send email to)\b/i.test(p) && p.includes("@")) {
      return { intent: EMAIL_INTENT.SEND, confidence: 0.90 };
    }

    return { intent: EMAIL_INTENT.DRAFT, confidence: 0.85 };
  }
}
