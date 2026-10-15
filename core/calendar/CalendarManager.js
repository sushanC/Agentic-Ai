import { calendarRegistry } from "./CalendarRegistry.js";
import { calendarConversationManager } from "./conversation/CalendarConversationManager.js";
import { CalendarIntentResolver } from "./intent/CalendarIntentResolver.js";
import { CalendarFieldExtractor } from "./intent/CalendarFieldExtractor.js";
import { DateTimeResolver } from "./scheduling/DateTimeResolver.js";
import { RecurrenceResolver } from "./scheduling/RecurrenceResolver.js";
import { ConflictDetector } from "./scheduling/ConflictDetector.js";
import { AvailabilityEngine } from "./scheduling/AvailabilityEngine.js";
import { CalendarConfirmationPolicy } from "./policy/CalendarConfirmationPolicy.js";
import { CalendarValidationPolicy } from "./policy/CalendarValidationPolicy.js";
import { calendarDiagnostics } from "./CalendarDiagnostics.js";
import { CalendarResult } from "./CalendarResult.js";
import { CALENDAR_STATUS, CALENDAR_INTENT, CALENDAR_ERROR, CALENDAR_CONFIG } from "./CalendarConfig.js";
import { listPending } from "../../services/confirmationService.js";
import { addActivity } from "../../storage/activityStorage.js";
import { ContactResolver } from "../email/contacts/ContactResolver.js";

/**
 * CalendarManager.js
 *
 * Single orchestrator for Calendar System V1.
 * Manages conversational calendar sessions, intent resolution, date/time resolution,
 * contact lookup, conflict detection, draft generation, confirmation policy
 * enforcement, and provider dispatch.
 *
 * Architecture mirrors EmailManager.js to maintain consistency.
 *
 * CalendarManager:
 *   - contains NO Google API implementation
 *   - contains NO OAuth implementation
 *   - contains NO raw date parsing (delegates to DateTimeResolver)
 *   - contains NO confirmation creation logic (delegates to CalendarConfirmationPolicy)
 *   - contains NO provider calls (delegates to CalendarRegistry → GoogleCalendarProvider)
 */
export class CalendarManager {
  constructor() {
    this.registry      = calendarRegistry;
    this.conversations = calendarConversationManager;
    this.diagnostics   = calendarDiagnostics;
  }

  // ─── Main Entry Point ─────────────────────────────────────────────────────

  /**
   * Main entry point for executing calendar requests from any channel (Chat, Voice).
   *
   * @param {object} context - { prompt, toolContext, conversationId, userPreferences }
   * @returns {Promise<object>} CalendarResult
   */
  async handle(context) {
    const prompt = (context.prompt || "").trim();
    const userPrefs = context.userPreferences || {};

    // ── Step 1: Check for active pending calendar confirmations ─────────────
    const pendingList  = await listPending();
    const pendingCal   = pendingList.find(p => p.tool && p.tool.startsWith("calendar_") && p.status === "pending");
    const activeSession = this.conversations.getActiveSession();

    const hasActiveConfirmation = Boolean(pendingCal || (activeSession?.status === CALENDAR_STATUS.WAITING_CONFIRMATION));
    const hasActiveSession      = Boolean(activeSession);

    const resolvedIntent = CalendarIntentResolver.resolve(prompt, { hasActiveConfirmation, hasActiveSession });

    this.diagnostics.logIntentDetected(
      activeSession?.conversationId || "new",
      resolvedIntent.intent,
      resolvedIntent.confidence
    );

    // ── Step 2: Handle CONFIRM ───────────────────────────────────────────────
    if (resolvedIntent.intent === CALENDAR_INTENT.CONFIRM && (pendingCal || activeSession)) {
      const confirmationId = pendingCal?.id || activeSession?.confirmationId;
      if (confirmationId) {
        return await this.confirmOperation(confirmationId, activeSession);
      }
    }

    // ── Step 3: Handle CANCEL ────────────────────────────────────────────────
    if (resolvedIntent.intent === CALENDAR_INTENT.CANCEL && (pendingCal || activeSession)) {
      const confirmationId = pendingCal?.id || activeSession?.confirmationId;
      return await this.cancelOperation(confirmationId, activeSession);
    }

    // ── Step 4: Resume existing active multi-turn session ───────────────────
    if (activeSession) {
      return await this.resumeSession(activeSession, prompt, userPrefs);
    }

    // ── Step 5: Start new calendar request ──────────────────────────────────
    return await this.startNewRequest(prompt, resolvedIntent, userPrefs, context);
  }

  // ─── New Request Flow ────────────────────────────────────────────────────

  /**
   * Start processing a new calendar request.
   */
  async startNewRequest(prompt, resolvedIntent, userPrefs, context) {
    const session = this.conversations.startSession({ intent: resolvedIntent.intent });
    this.diagnostics.logConversationStarted(session.conversationId, prompt);

    // ── Read-only intents: handle immediately without multi-turn ────────────
    if (CalendarIntentResolver.isReadOnly(resolvedIntent.intent)) {
      return await this.handleReadOnly(resolvedIntent.intent, prompt, session, userPrefs);
    }

    // ── Mutating intents: extract fields and build draft ────────────────────
    const extracted = await CalendarFieldExtractor.extract(prompt);
    this.diagnostics.logFieldsExtracted(session.conversationId, extracted);

    session.update({
      title:          extracted.title,
      rawDate:        extracted.date,
      rawStartTime:   extracted.startTime,
      rawEndTime:     extracted.endTime,
      durationMinutes: extracted.duration ? this._parseDurationFromExtracted(extracted.duration) : null,
      recurrence:     extracted.recurrenceText ? this._resolveRecurrence(session, extracted.recurrenceText) : null,
      description:    extracted.description,
      location:       extracted.location || null,
    });

    // Resolve attendee names to contacts
    await this.resolveAttendees(session, extracted.attendeeNames, userPrefs);

    // If this is DELETE or UPDATE intent, find the target event first
    if (resolvedIntent.intent === CALENDAR_INTENT.DELETE_EVENT ||
        resolvedIntent.intent === CALENDAR_INTENT.UPDATE_EVENT ||
        resolvedIntent.intent === CALENDAR_INTENT.RESCHEDULE_EVENT) {
      return await this.handleMutateExistingEvent(session, prompt, userPrefs);
    }

    // CREATE_EVENT: check for missing fields
    return await this.proceedWithFieldCollection(session, userPrefs);
  }

  // ─── Field Collection (Multi-turn) ───────────────────────────────────────

  /**
   * Evaluate what fields are missing and either ask for them or proceed to confirmation.
   */
  async proceedWithFieldCollection(session, userPrefs) {
    const timezone = DateTimeResolver.getTimezone(userPrefs);

    // ── Resolve date + time if raw expressions are available ────────────────
    if ((session.rawDate || session.rawStartTime) && !session.resolvedStart) {
      const dtResult = DateTimeResolver.resolve({
        dateExpr:     session.rawDate,
        startTimeExpr: session.rawStartTime,
        endTimeExpr:  session.rawEndTime,
        durationExpr: session.durationMinutes ? `${session.durationMinutes} minutes` : null,
        timezone,
      });

      if (dtResult.ambiguous) {
        // Ask clarifying question
        session.update({ status: CALENDAR_STATUS.COLLECTING_START_TIME });
        this.diagnostics.logDateTimeAmbiguous(session.conversationId, session.rawStartTime, dtResult.ambiguityReason);
        return CalendarResult.create({
          success: true,
          status: CALENDAR_STATUS.COLLECTING_START_TIME,
          intent: session.intent,
          operation: "collect",
          conversationId: session.conversationId,
          answer: dtResult.ambiguityReason || "What time did you mean?",
          missingField: "startTime",
        });
      }

      if (dtResult.resolved) {
        session.update({
          resolvedStart: dtResult.start,
          resolvedEnd:   dtResult.end,
          timezone:      dtResult.timezone,
        });
        this.diagnostics.logDateTimeResolved(session.conversationId, session.rawStartTime, dtResult.start, dtResult.timezone);
      }
    }

    // ── Collect missing fields one at a time ─────────────────────────────────
    if (!session.title) {
      session.update({ status: CALENDAR_STATUS.COLLECTING_TITLE });
      return CalendarResult.create({
        success: true, status: CALENDAR_STATUS.COLLECTING_TITLE,
        intent: session.intent, operation: "collect",
        conversationId: session.conversationId,
        answer: "What should I call this event?",
        missingField: "title",
      });
    }

    if (!session.rawDate && !session.resolvedStart) {
      session.update({ status: CALENDAR_STATUS.COLLECTING_DATE });
      return CalendarResult.create({
        success: true, status: CALENDAR_STATUS.COLLECTING_DATE,
        intent: session.intent, operation: "collect",
        conversationId: session.conversationId,
        answer: "What date should I schedule it?",
        missingField: "date",
      });
    }

    if (!session.resolvedStart && !session.rawStartTime) {
      session.update({ status: CALENDAR_STATUS.COLLECTING_START_TIME });
      return CalendarResult.create({
        success: true, status: CALENDAR_STATUS.COLLECTING_START_TIME,
        intent: session.intent, operation: "collect",
        conversationId: session.conversationId,
        answer: "What time should I schedule it?",
        missingField: "startTime",
      });
    }

    // ── All required fields present: check conflicts and confirm ─────────────
    return await this.checkConflictsAndConfirm(session, userPrefs);
  }

  /**
   * Resume an active session with new user input.
   */
  async resumeSession(session, prompt, userPrefs) {
    const status = session.status;

    if (status === CALENDAR_STATUS.COLLECTING_TITLE) {
      session.update({ title: prompt.trim() });
      return await this.proceedWithFieldCollection(session, userPrefs);
    }

    if (status === CALENDAR_STATUS.COLLECTING_DATE) {
      session.update({ rawDate: prompt.trim() });
      return await this.proceedWithFieldCollection(session, userPrefs);
    }

    if (status === CALENDAR_STATUS.COLLECTING_START_TIME) {
      session.update({ rawStartTime: prompt.trim() });
      return await this.proceedWithFieldCollection(session, userPrefs);
    }

    if (status === CALENDAR_STATUS.COLLECTING_END_TIME) {
      session.update({ rawEndTime: prompt.trim() });
      return await this.proceedWithFieldCollection(session, userPrefs);
    }

    if (status === CALENDAR_STATUS.CHECKING_CONFLICTS) {
      // User chose to proceed despite conflict
      const confirmLower = prompt.toLowerCase();
      if (/\b(yes|anyway|proceed|still|go ahead|schedule it anyway)\b/i.test(confirmLower)) {
        return await this.buildDraftAndConfirm(session);
      }
      // User wants a different time
      this.conversations.endSession(session.conversationId);
      return CalendarResult.create({
        success: true, status: CALENDAR_STATUS.CANCELLED,
        intent: session.intent, operation: "cancel",
        conversationId: session.conversationId,
        answer: "Okay, let me know when you'd like to reschedule.",
      });
    }

    // Default: restart
    this.conversations.endSession(session.conversationId);
    return CalendarResult.create({
      success: true, status: CALENDAR_STATUS.IDLE,
      intent: null, operation: "query",
      conversationId: "",
      answer: "I'm not sure what you'd like to do with your calendar. Could you try again?",
    });
  }

  // ─── Conflict Check + Confirm ─────────────────────────────────────────────

  async checkConflictsAndConfirm(session, userPrefs) {
    session.update({ status: CALENDAR_STATUS.CHECKING_CONFLICTS });

    const provider = this.registry.getProvider();

    // Check for auth issues before conflict check
    const authResult = await provider.getStatus();
    if (!authResult.hasCalendarScope) {
      return this._buildAuthRequiredResult(session, authResult.authUrl);
    }

    // Run conflict detection
    const conflictResult = await ConflictDetector.check({
      startISO:  session.resolvedStart,
      endISO:    session.resolvedEnd,
      provider,
    });

    this.diagnostics.logAvailabilityChecked(
      session.conversationId,
      !conflictResult.hasConflict,
      conflictResult.conflicts.length
    );

    if (conflictResult.hasConflict && conflictResult.conflicts.length > 0) {
      const conflictMsg = ConflictDetector.buildConflictMessage(
        conflictResult.conflicts,
        session.timezone || DateTimeResolver.getTimezone(userPrefs)
      );

      conflictResult.conflicts.forEach(c => {
        this.diagnostics.logConflictDetected(session.conversationId, c.title, c.start);
      });

      session.update({
        status: CALENDAR_STATUS.CHECKING_CONFLICTS,
        // Store conflict info for resume
        pendingConflicts: conflictResult.conflicts,
      });

      return CalendarResult.create({
        success: true,
        status: CALENDAR_STATUS.CHECKING_CONFLICTS,
        intent: session.intent,
        operation: "conflict_check",
        conversationId: session.conversationId,
        answer: conflictMsg,
        metadata: { conflicts: conflictResult.conflicts },
      });
    }

    // No conflict — proceed to confirmation
    return await this.buildDraftAndConfirm(session);
  }

  async buildDraftAndConfirm(session) {
    const draft = session.buildDraft();
    session.update({ draft, status: CALENDAR_STATUS.WAITING_CONFIRMATION });

    this.diagnostics.logDraftCreated(session.conversationId, draft);

    // Build confirmation via CalendarConfirmationPolicy
    const pendingRecord = await CalendarConfirmationPolicy.requestCreateConfirmation({
      draft,
      conversationId: session.conversationId,
    });

    session.update({ confirmationId: pendingRecord.confirmationId });

    this.diagnostics.logConfirmationCreated(
      session.conversationId,
      pendingRecord.confirmationId,
      session.intent
    );

    addActivity(`Calendar event draft prepared: ${draft.title}`);

    return CalendarResult.create({
      success: true,
      status: CALENDAR_STATUS.WAITING_CONFIRMATION,
      intent: session.intent,
      operation: "draft",
      conversationId: session.conversationId,
      answer: pendingRecord.message,
      draft,
      confirmationId: pendingRecord.confirmationId,
    });
  }

  // ─── Confirmation / Cancellation ─────────────────────────────────────────

  async confirmOperation(confirmationId, session) {
    this.diagnostics.logConfirmationResolved(confirmationId, session?.intent, true);

    const result = await CalendarConfirmationPolicy.confirm(confirmationId);

    if (!result.success) {
      // If not found, it was already confirmed (idempotency guard)
      if (result.message && result.message.includes("not found or has expired")) {
        return CalendarResult.create({
          success: true,
          status: CALENDAR_STATUS.COMPLETED,
          intent: session?.intent,
          operation: "create",
          conversationId: session?.conversationId || "",
          answer: "That event was already created.",
        });
      }

      const errObj = result.error || {};
      const requiresAuth = Boolean(errObj.requiresReauth || errObj.code === CALENDAR_ERROR.AUTH_REQUIRED);
      const status = requiresAuth ? CALENDAR_STATUS.RECOVERY_REQUIRED : CALENDAR_STATUS.FAILED;

      if (session) session.update({ status, confirmationId: null });

      this.diagnostics.logRecoveryRequired(
        session?.conversationId || confirmationId,
        errObj.code,
        errObj.recoveryAction
      );

      return CalendarResult.create({
        success: false,
        status,
        intent: session?.intent,
        operation: "create",
        conversationId: session?.conversationId || "",
        answer: requiresAuth
          ? "I couldn't create the event because Google Calendar needs to be connected. Your draft is preserved."
          : `Failed to create event: ${result.message}`,
        confirmationId: null,
        error: errObj.code || result.message,
        metadata: {
          recoverable: true,
          automaticRetryable: errObj.retryable === true,
          recoveryAction: requiresAuth ? "google_calendar_authorization" : "retry_prompt",
          requiresAuthorization: requiresAuth,
          authUrl: errObj.authUrl || null,
        },
      });
    }

    // Success
    const execResult = result.result || {};
    const eventId    = execResult.eventId || null;

    if (session) {
      session.update({ status: CALENDAR_STATUS.COMPLETED, eventId });
      this.conversations.endSession(session.conversationId);
    }

    this.diagnostics.logEventCreated(session?.conversationId || confirmationId, eventId);
    addActivity(`Calendar event created: ${session?.draft?.title || "Event"}`);

    return CalendarResult.create({
      success: true,
      status: CALENDAR_STATUS.COMPLETED,
      intent: session?.intent,
      operation: "create",
      conversationId: session?.conversationId || "",
      answer: execResult.message || "✅ Done! I've added it to your calendar.",
      eventId,
    });
  }

  async cancelOperation(confirmationId, session) {
    if (confirmationId) {
      await CalendarConfirmationPolicy.cancel(confirmationId);
    }
    if (session) {
      session.update({ status: CALENDAR_STATUS.CANCELLED });
      this.conversations.endSession(session.conversationId);
    }

    return CalendarResult.create({
      success: true,
      status: CALENDAR_STATUS.CANCELLED,
      intent: session?.intent,
      operation: "cancel",
      conversationId: session?.conversationId || "",
      answer: "I've cancelled the calendar request.",
    });
  }

  // ─── Read-only Handlers ───────────────────────────────────────────────────

  async handleReadOnly(intent, prompt, session, userPrefs) {
    this.conversations.endSession(session.conversationId); // read-only = no session needed

    const provider  = this.registry.getProvider();
    const authCheck = await provider.getStatus();

    if (!authCheck.hasCalendarScope) {
      return this._buildAuthRequiredResult(null, authCheck.authUrl);
    }

    const timezone = DateTimeResolver.getTimezone(userPrefs);

    if (intent === CALENDAR_INTENT.LIST_EVENTS) {
      const extracted = await CalendarFieldExtractor.extract(prompt);
      const timeMin   = new Date().toISOString();
      const timeMax   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

      // Try to resolve date from extracted if present
      let resolvedTimeMin = timeMin;
      let resolvedTimeMax = timeMax;

      if (extracted.date) {
        const dtResult = DateTimeResolver.resolve({
          dateExpr:      extracted.date,
          startTimeExpr: "0:00",
          timezone,
        });
        if (dtResult.resolved) {
          resolvedTimeMin = dtResult.start;
          const dayEnd = new Date(dtResult.start);
          dayEnd.setHours(23, 59, 59);
          resolvedTimeMax = dayEnd.toISOString();
        }
      }

      const listResult = await provider.listEvents({
        timeMin: resolvedTimeMin,
        timeMax: resolvedTimeMax,
        maxResults: CALENDAR_CONFIG.LIST_EVENTS_MAX_RESULTS,
      });

      if (!listResult.success) {
        return CalendarResult.create({
          success: false, status: CALENDAR_STATUS.FAILED,
          intent, operation: "list",
          answer: "I couldn't fetch your calendar. " + (listResult.error || ""),
          error: listResult.errorCode,
          metadata: {
            requiresAuthorization: listResult.requiresAuthorization,
            authUrl: listResult.authUrl,
          },
        });
      }

      const events = listResult.events || [];
      if (events.length === 0) {
        const dateLabel = extracted.date ? `on ${extracted.date}` : "in the next week";
        return CalendarResult.create({
          success: true, status: CALENDAR_STATUS.COMPLETED,
          intent, operation: "list",
          answer: `You have no events ${dateLabel}.`,
          events: [],
        });
      }

      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
      });
      const endFmt = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true,
      });

      const lines = events.map(e => {
        const title = e.title || "(Untitled)";
        const startStr = e.start ? fmt.format(new Date(e.start)) : "";
        const endStr   = e.end   ? endFmt.format(new Date(e.end)) : "";
        return `• ${title}${startStr ? ` — ${startStr}` : ""}${endStr ? ` to ${endStr}` : ""}`;
      });

      return CalendarResult.create({
        success: true, status: CALENDAR_STATUS.COMPLETED,
        intent, operation: "list",
        answer: `Here's what's on your calendar:\n${lines.join("\n")}`,
        events,
      });
    }

    if (intent === CALENDAR_INTENT.CHECK_AVAILABILITY) {
      const extracted = await CalendarFieldExtractor.extract(prompt);
      const dtResult  = DateTimeResolver.resolve({
        dateExpr:      extracted.date,
        startTimeExpr: extracted.startTime,
        endTimeExpr:   extracted.endTime,
        durationExpr:  extracted.duration,
        timezone,
      });

      if (!dtResult.resolved) {
        return CalendarResult.create({
          success: true, status: CALENDAR_STATUS.COMPLETED,
          intent, operation: "availability",
          answer: dtResult.error || dtResult.ambiguityReason || "Could not understand the time window.",
        });
      }

      const availResult = await AvailabilityEngine.checkWindow({
        startISO: dtResult.start, endISO: dtResult.end, timezone, provider,
      });

      return CalendarResult.create({
        success: true, status: CALENDAR_STATUS.COMPLETED,
        intent, operation: "availability",
        answer: availResult.answer,
        availability: {
          isFree: availResult.isFree,
          busyEvents: availResult.busyEvents,
          start: dtResult.start,
          end: dtResult.end,
        },
      });
    }

    return CalendarResult.create({
      success: true, status: CALENDAR_STATUS.COMPLETED,
      intent, operation: "query",
      answer: "I couldn't process that calendar query. Please try again.",
    });
  }

  // ─── Mutate Existing Event ────────────────────────────────────────────────

  async handleMutateExistingEvent(session, prompt, userPrefs) {
    const provider  = this.registry.getProvider();
    const timezone  = DateTimeResolver.getTimezone(userPrefs);
    const extracted = await CalendarFieldExtractor.extract(prompt);

    // Search for the target event by title
    const searchQuery = session.title || extracted.title || "";
    if (!searchQuery) {
      return CalendarResult.create({
        success: true, status: CALENDAR_STATUS.COLLECTING_TITLE,
        intent: session.intent, operation: "collect",
        conversationId: session.conversationId,
        answer: "Which event would you like to update?",
        missingField: "title",
      });
    }

    const timeMin  = new Date().toISOString();
    const timeMax  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const findResult = await provider.findEvents(searchQuery, { timeMin, timeMax });

    if (!findResult.success) {
      return this._buildProviderErrorResult(session, findResult);
    }

    const matches = findResult.events || [];

    if (matches.length === 0) {
      this.conversations.endSession(session.conversationId);
      return CalendarResult.create({
        success: false, status: CALENDAR_STATUS.FAILED,
        intent: session.intent, operation: "find",
        conversationId: session.conversationId,
        answer: `I couldn't find an event matching "${searchQuery}". Could you be more specific?`,
        error: CALENDAR_ERROR.EVENT_NOT_FOUND,
      });
    }

    if (matches.length > 1) {
      // Ambiguous — ask which event
      const options = matches.slice(0, 3).map((e, i) => {
        const startStr = e.start ? new Date(e.start).toLocaleString("en-US", { timeZone: timezone }) : "";
        return `${i + 1}. "${e.title}" (${startStr})`;
      }).join("\n");

      session.update({ status: CALENDAR_STATUS.COLLECTING_TITLE });
      return CalendarResult.create({
        success: true, status: CALENDAR_STATUS.COLLECTING_TITLE,
        intent: session.intent, operation: "find",
        conversationId: session.conversationId,
        answer: `I found multiple events matching "${searchQuery}":\n${options}\n\nWhich one did you mean?`,
        metadata: { ambiguousEvents: matches.slice(0, 3) },
      });
    }

    // Exactly one match
    const targetEvent = matches[0];
    session.update({ targetEvent });

    if (session.intent === CALENDAR_INTENT.DELETE_EVENT) {
      return await this.buildDeleteConfirmation(session, targetEvent);
    }

    // UPDATE or RESCHEDULE — build the patch
    return await this.buildUpdateConfirmation(session, targetEvent, timezone);
  }

  async buildDeleteConfirmation(session, event) {
    const pendingRecord = await CalendarConfirmationPolicy.requestDeleteConfirmation({
      eventId:         event.id,
      event,
      conversationId:  session.conversationId,
    });

    session.update({
      status: CALENDAR_STATUS.WAITING_CONFIRMATION,
      confirmationId: pendingRecord.confirmationId,
    });

    this.diagnostics.logConfirmationCreated(session.conversationId, pendingRecord.confirmationId, session.intent);

    return CalendarResult.create({
      success: true,
      status: CALENDAR_STATUS.WAITING_CONFIRMATION,
      intent: session.intent,
      operation: "delete",
      conversationId: session.conversationId,
      answer: pendingRecord.message,
      confirmationId: pendingRecord.confirmationId,
    });
  }

  async buildUpdateConfirmation(session, targetEvent, timezone) {
    // Build the "after" patch from session fields
    const patch = {};

    if (session.resolvedStart) {
      patch.start = { dateTime: session.resolvedStart, timeZone: timezone };
      patch.end   = { dateTime: session.resolvedEnd,   timeZone: timezone };
    } else if (session.rawStartTime) {
      // Need to resolve new time relative to target event's date
      const eventDate = targetEvent.start ? new Date(targetEvent.start) : new Date();
      const dtResult = DateTimeResolver.resolve({
        dateExpr:      `${eventDate.getFullYear()}-${eventDate.getMonth() + 1}-${eventDate.getDate()}`,
        startTimeExpr: session.rawStartTime,
        timezone,
      });
      if (dtResult.resolved) {
        patch.start = { dateTime: dtResult.start, timeZone: timezone };
        patch.end   = { dateTime: dtResult.end,   timeZone: timezone };
      }
    }

    if (session.title && session.title !== targetEvent.title) {
      patch.title = session.title;
    }

    const pendingRecord = await CalendarConfirmationPolicy.requestUpdateConfirmation({
      eventId:        targetEvent.id,
      before:         { ...targetEvent, start: { dateTime: targetEvent.start }, end: { dateTime: targetEvent.end } },
      after:          patch,
      conversationId: session.conversationId,
    });

    session.update({
      status: CALENDAR_STATUS.WAITING_CONFIRMATION,
      confirmationId: pendingRecord.confirmationId,
    });

    return CalendarResult.create({
      success: true,
      status: CALENDAR_STATUS.WAITING_CONFIRMATION,
      intent: session.intent,
      operation: "update",
      conversationId: session.conversationId,
      answer: pendingRecord.message,
      confirmationId: pendingRecord.confirmationId,
    });
  }

  // ─── Attendee Resolution ─────────────────────────────────────────────────

  async resolveAttendees(session, attendeeNames, userPrefs) {
    if (!attendeeNames || attendeeNames.length === 0) return;

    const resolved = [];
    for (const name of attendeeNames) {
      const contactResult = await ContactResolver.resolve(name);
      if (contactResult.status === "resolved" && contactResult.email) {
        resolved.push({ name: contactResult.name || name, email: contactResult.email });
        this.diagnostics.logAttendeeResolved(session.conversationId, contactResult.name || name, contactResult.email);
      } else {
        // Unknown contact — add name-only (no invitation email)
        resolved.push({ name, email: null });
        this.diagnostics.logAttendeeAmbiguous(session.conversationId, name, 0);
      }
    }

    session.update({ attendees: resolved });
  }

  // ─── Helper Utilities ─────────────────────────────────────────────────────

  _resolveRecurrence(session, recurrenceText) {
    if (!recurrenceText) return null;
    const result = RecurrenceResolver.resolve(recurrenceText);
    return result.resolved ? result.spec : null;
  }

  _parseDurationFromExtracted(durationStr) {
    if (!durationStr) return null;
    const { DateTimeResolver: DR } = { DateTimeResolver };
    return DateTimeResolver._parseDuration(durationStr);
  }

  _buildAuthRequiredResult(session, authUrl) {
    if (session) {
      session.update({ status: CALENDAR_STATUS.RECOVERY_REQUIRED });
    }
    this.diagnostics.logRecoveryRequired(
      session?.conversationId || "unknown",
      CALENDAR_ERROR.AUTH_REQUIRED,
      "google_calendar_authorization"
    );
    return CalendarResult.create({
      success: false,
      status: CALENDAR_STATUS.RECOVERY_REQUIRED,
      intent: session?.intent || null,
      operation: "auth",
      conversationId: session?.conversationId || "",
      answer: "I need access to your Google Calendar to do that. Please connect your Google account.",
      error: CALENDAR_ERROR.AUTH_REQUIRED,
      metadata: {
        recoverable:          true,
        automaticRetryable:   false,
        recoveryAction:       "google_calendar_authorization",
        requiresAuthorization: true,
        authUrl,
      },
    });
  }

  _buildProviderErrorResult(session, providerResult) {
    if (providerResult.requiresAuthorization) {
      return this._buildAuthRequiredResult(session, providerResult.authUrl);
    }
    return CalendarResult.create({
      success: false,
      status: CALENDAR_STATUS.FAILED,
      intent: session?.intent,
      operation: "provider",
      conversationId: session?.conversationId || "",
      answer: "I had trouble connecting to Google Calendar. Please try again.",
      error: providerResult.errorCode || CALENDAR_ERROR.PROVIDER_ERROR,
      metadata: {
        recoverable:        true,
        automaticRetryable: providerResult.automaticRetryable === true,
      },
    });
  }
}

export const calendarManager = new CalendarManager();
