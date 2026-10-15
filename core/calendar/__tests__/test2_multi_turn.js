/**
 * test2_multi_turn.js
 *
 * Test: Multi-turn conversation state machine
 * Turn 1: "Schedule a meeting with Sujan" (no date/time → COLLECTING_DATE)
 * Turn 2: "tomorrow" → COLLECTING_START_TIME
 * Turn 3: "4 PM" → CHECKING_CONFLICTS / WAITING_CONFIRMATION
 */

import { CalendarConversationManager } from "../conversation/CalendarConversationManager.js";
import { DateTimeResolver } from "../scheduling/DateTimeResolver.js";
import { CALENDAR_STATUS, CALENDAR_INTENT } from "../CalendarConfig.js";

function test() {
  console.log("=== TEST 2: Multi-turn conversation state machine ===\n");

  const manager = new CalendarConversationManager();

  // Turn 1: Start session with title only
  const session = manager.startSession({
    intent: CALENDAR_INTENT.CREATE_EVENT,
    title: "Meeting with Sujan",
    status: CALENDAR_STATUS.COLLECTING_DATE,
  });

  console.assert(session.conversationId !== null, "Session should have an ID");
  console.assert(session.status === CALENDAR_STATUS.COLLECTING_DATE, `Expected COLLECTING_DATE, got ${session.status}`);
  console.log(`✅ Turn 1: Session ${session.conversationId} created, status=${session.status}`);

  // getActiveSession should return this session
  const active = manager.getActiveSession();
  console.assert(active !== null, "Should find active session");
  console.assert(active.conversationId === session.conversationId, "Active session should match created session");
  console.log(`✅ getActiveSession found session: ${active.conversationId}`);

  // Turn 2: User provides date
  session.update({ rawDate: "tomorrow", status: CALENDAR_STATUS.COLLECTING_START_TIME });
  console.assert(session.rawDate === "tomorrow", "rawDate should be set");
  console.assert(session.status === CALENDAR_STATUS.COLLECTING_START_TIME, `Expected COLLECTING_START_TIME, got ${session.status}`);
  console.log(`✅ Turn 2: rawDate="tomorrow", status=${session.status}`);

  // Turn 3: User provides time → resolve
  session.update({ rawStartTime: "4 PM" });
  const tz = "Asia/Kathmandu";
  const dtResult = DateTimeResolver.resolve({
    dateExpr: session.rawDate,
    startTimeExpr: session.rawStartTime,
    timezone: tz,
  });
  console.assert(dtResult.resolved, "Should resolve tomorrow at 4 PM");
  session.update({
    resolvedStart: dtResult.start,
    resolvedEnd: dtResult.end,
    timezone: tz,
    status: CALENDAR_STATUS.WAITING_CONFIRMATION,
  });

  // getMissingFields should now return empty array
  const missing = session.getMissingFields();
  console.assert(missing.length === 0, `No missing fields expected, got: ${JSON.stringify(missing)}`);
  console.log(`✅ Turn 3: resolvedStart=${dtResult.start}, status=${session.status}, missingFields=[]`);

  // buildDraft should produce a valid draft
  const draft = session.buildDraft();
  console.assert(draft.title === "Meeting with Sujan", `Expected "Meeting with Sujan", got "${draft.title}"`);
  console.assert(draft.start.dateTime !== null, "Draft should have a start dateTime");
  console.assert(draft.end.dateTime !== null, "Draft should have an end dateTime");
  console.log(`✅ Draft built: "${draft.title}" at ${draft.start.dateTime}`);

  // End session
  manager.endSession(session.conversationId);
  const afterEnd = manager.getSession(session.conversationId);
  console.assert(afterEnd === null, "Session should be gone after endSession");
  console.log("✅ Session ended and cleaned up");

  console.log("\n✅ Test 2 PASSED\n");
}

test();
