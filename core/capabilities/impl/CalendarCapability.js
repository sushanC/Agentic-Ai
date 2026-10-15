import { BaseCapability } from "../BaseCapability.js";
import { CapabilityResult } from "../CapabilityResult.js";
import { calendarManager } from "../../calendar/CalendarManager.js";

/**
 * CalendarCapability.js
 *
 * Lightweight integration facade connecting the Capability Framework and
 * Workflow Engine to Calendar System V1 (core/calendar/).
 *
 * Contains ZERO business logic, OAuth logic, date parsing, conflict detection,
 * or confirmation logic — all of that lives in CalendarManager and its components.
 *
 * Architecture mirrors EmailCapability.js exactly.
 */
export class CalendarCapability extends BaseCapability {
  constructor() {
    super("calendar", "Calendar & Scheduling Capability", 85);
  }

  canHandle(context) {
    if (context.includesAny(
      "schedule", "calendar", "meeting", "appointment", "event",
      "reschedule", "free slot", "busy", "availability", "cancel event",
      "delete event", "add event", "create event", "find event",
      "what's on my calendar", "my schedule", "am i free", "book"
    )) {
      return 0.90;
    }
    return 0.0;
  }

  async execute(context) {
    const calendarResult = await calendarManager.handle({
      prompt:          context.prompt,
      toolContext:     context.toolContext,
      conversationId:  context.runtimeState?.conversationId || null,
      confirmationId:  context.runtimeState?.confirmationId || null,
      userPreferences: context.userPreferences || context.semanticMemory?.preferences || {},
      workingMemory:   context.workingMemory,
    });

    return CapabilityResult.create({
      success:    calendarResult.success,
      capability: this.name,
      tool:       `calendar_${calendarResult.operation || "query"}`,
      answer:     calendarResult.answer,
      executedSteps: [{
        name:   `calendar_${calendarResult.operation || "query"}`,
        status: calendarResult.success ? "completed" : "failed",
      }],
      diagnostics: {
        status:          calendarResult.status,
        conversationId:  calendarResult.conversationId,
        confirmationId:  calendarResult.confirmationId,
        intent:          calendarResult.intent,
      },
      metadata: {
        status:          calendarResult.status,
        intent:          calendarResult.intent,
        draft:           calendarResult.draft,
        events:          calendarResult.events,
        availability:    calendarResult.availability,
        missingField:    calendarResult.missingField,
        confirmationId:  calendarResult.confirmationId,
        eventId:         calendarResult.eventId,
        error:           calendarResult.error,
        recovery:        calendarResult.metadata,
      },
    });
  }
}
