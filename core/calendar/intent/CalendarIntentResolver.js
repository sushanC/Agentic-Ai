import { CALENDAR_INTENT } from "../CalendarConfig.js";

/**
 * CalendarIntentResolver.js
 *
 * Resolves user request intent for Calendar operations using deterministic
 * keyword heuristics. Returns a confidence score alongside the intent so
 * WorkflowPlanner and CalendarManager can act on it.
 *
 * Supports voice affirmations ("yes", "confirm", "go ahead") and
 * cancellation words ("no", "cancel", "stop") when an active confirmation exists.
 *
 * Design: fast, zero latency, zero AI calls. Used before LLM field extraction.
 */
export class CalendarIntentResolver {
  /**
   * Resolve the calendar intent from a user prompt.
   *
   * @param {string} prompt
   * @param {object} [context={}]
   * @param {boolean} [context.hasActiveConfirmation=false]
   * @param {boolean} [context.hasActiveSession=false]
   * @returns {{ intent: string, confidence: number }}
   */
  static resolve(prompt, context = {}) {
    const p = (prompt || "").toLowerCase().trim();

    // ── 1. Confirmation / Cancellation (highest priority when active) ──────
    if (context.hasActiveConfirmation || context.hasActiveSession) {
      if (/^(yes|yeah|yep|sure|ok|create it|confirm|do it|go ahead|schedule it|add it|book it|proceed)\b/i.test(p)) {
        return { intent: CALENDAR_INTENT.CONFIRM, confidence: 0.98 };
      }
      if (/^(no|nope|cancel|don't|dont|stop|abort|never mind|nevermind)\b/i.test(p)) {
        return { intent: CALENDAR_INTENT.CANCEL, confidence: 0.98 };
      }
    }

    // ── 2. Delete / Cancel an existing event (must come before generic cancel) ───────────
    if (/\b(cancel|delete|remove|drop)\b.*\b(event|meeting|appointment|session|call|schedule)\b/i.test(p)) {
      return { intent: CALENDAR_INTENT.DELETE_EVENT, confidence: 0.93 };
    }
    if (/\b(cancel|drop)\b.{0,30}\b(meeting|appointment|standup|session|call|interview|sync|review)\b/i.test(p)) {
      return { intent: CALENDAR_INTENT.DELETE_EVENT, confidence: 0.88 };
    }
    if (/\b(cancel tomorrow|cancel today|cancel this)\b/i.test(p)) {
      return { intent: CALENDAR_INTENT.DELETE_EVENT, confidence: 0.88 };
    }

    // ── 3. Generic Cancel / Abort (outside session or standalone) ──────────────────────
    if (/^(cancel|abort|stop|don't create|dont create|stop scheduling)\b/i.test(p)) {
      return { intent: CALENDAR_INTENT.CANCEL, confidence: 0.92 };
    }


    // ── 4. Reschedule / Move ──────────────────────────────────────────────
    if (/\b(reschedule|move|postpone|push|shift|change the time|change time)\b/i.test(p)) {
      return { intent: CALENDAR_INTENT.RESCHEDULE_EVENT, confidence: 0.93 };
    }

    // ── 5. Update / Edit ─────────────────────────────────────────────────
    if (/\b(update|edit|modify|change|rename)\b.*\b(event|meeting|appointment|title|agenda)\b/i.test(p)) {
      return { intent: CALENDAR_INTENT.UPDATE_EVENT, confidence: 0.90 };
    }

    // ── 6. Check Availability / Free/Busy ────────────────────────────────
    if (/\b(am i free|are you free|free slot|available slot|find.*(free|slot|opening)|check.*availability|busy|free time)\b/i.test(p)) {
      return { intent: CALENDAR_INTENT.CHECK_AVAILABILITY, confidence: 0.92 };
    }

    // ── 7. List Events / What's on my calendar ────────────────────────────────
    if (/\b(what.*calendar|my schedule|my events|what.*scheduled|list.*events?|show.*calendar|what.*on|upcoming events?)\b/i.test(p)) {
      return { intent: CALENDAR_INTENT.LIST_EVENTS, confidence: 0.91 };
    }
    if (/\b(what.*plan|do i have.*today|do i have.*tomorrow|do i have.*next|anything.*today|anything.*tomorrow|events.*next week|events.*week)\b/i.test(p)) {
      return { intent: CALENDAR_INTENT.LIST_EVENTS, confidence: 0.88 };
    }

    // ── 8. Find Event ─────────────────────────────────────────────────────
    if (/\b(find|look for|search for|where is|when is)\b.*\b(event|meeting|appointment|session)\b/i.test(p)) {
      return { intent: CALENDAR_INTENT.FIND_EVENT, confidence: 0.90 };
    }

    // ── 9. Create Event (most common case) ───────────────────────────────
    if (/\b(schedule|book|create|add|set up|plan|arrange|set a|make a)\b.*\b(meeting|appointment|event|session|call|reminder|standup|sync|interview|review)\b/i.test(p)) {
      return { intent: CALENDAR_INTENT.CREATE_EVENT, confidence: 0.92 };
    }
    if (/\b(schedule|book|create|add|arrange)\b/i.test(p) && /\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|at \d|pm|am)\b/i.test(p)) {
      return { intent: CALENDAR_INTENT.CREATE_EVENT, confidence: 0.88 };
    }
    if (/\b(every (day|week|month|monday|tuesday|wednesday|thursday|friday))\b/i.test(p)) {
      return { intent: CALENDAR_INTENT.CREATE_EVENT, confidence: 0.87 };
    }

    // ── 10. Default: uncertain ────────────────────────────────────────────
    return { intent: CALENDAR_INTENT.CREATE_EVENT, confidence: 0.55 };
  }

  /**
   * Return true if this intent requires user confirmation.
   * @param {string} intent
   * @returns {boolean}
   */
  static requiresConfirmation(intent) {
    return [
      CALENDAR_INTENT.CREATE_EVENT,
      CALENDAR_INTENT.UPDATE_EVENT,
      CALENDAR_INTENT.RESCHEDULE_EVENT,
      CALENDAR_INTENT.DELETE_EVENT,
    ].includes(intent);
  }

  /**
   * Return true if this intent is read-only (no side effects).
   * @param {string} intent
   * @returns {boolean}
   */
  static isReadOnly(intent) {
    return [
      CALENDAR_INTENT.LIST_EVENTS,
      CALENDAR_INTENT.FIND_EVENT,
      CALENDAR_INTENT.CHECK_AVAILABILITY,
    ].includes(intent);
  }
}
