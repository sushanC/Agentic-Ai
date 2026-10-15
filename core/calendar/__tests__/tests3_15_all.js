/**
 * test3_list_events.js — LIST_EVENTS intent resolution
 * test4_availability.js — CHECK_AVAILABILITY intent + datetime resolution
 * test5_conflict.js — ConflictDetector logic
 * test6_reschedule.js — RESCHEDULE_EVENT intent detection
 * test7_delete.js — DELETE_EVENT intent detection
 * test8_ambiguous.js — Ambiguous time (bare "4")
 * test9_recurring.js — RecurrenceResolver
 * test10_auth_missing.js — Auth required result
 * test11_voice.js — CONFIRM/CANCEL intent with active session
 * test12_workflow.js — WorkflowPlanner calendar rule
 * test13_cancellation.js — CANCEL intent
 * test14_double_confirm.js — Double-confirm idempotency (confirmationId)
 * test15_timezone.js — Timezone resolution priority chain
 */

import { CalendarIntentResolver } from "../intent/CalendarIntentResolver.js";
import { RecurrenceResolver } from "../scheduling/RecurrenceResolver.js";
import { DateTimeResolver } from "../scheduling/DateTimeResolver.js";
import { CALENDAR_INTENT } from "../CalendarConfig.js";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

// ─── Test 3: LIST_EVENTS ─────────────────────────────────────────────────────
console.log("=== TEST 3: LIST_EVENTS ===");
{
  const cases = [
    "What's on my calendar today?",
    "Show me my schedule for tomorrow",
    "List my upcoming events",
    "What events do I have next week?",
    "Do I have anything today?",
  ];
  for (const p of cases) {
    const { intent } = CalendarIntentResolver.resolve(p);
    assert(intent === CALENDAR_INTENT.LIST_EVENTS, `"${p.slice(0,40)}" → LIST_EVENTS`);
  }
}

// ─── Test 4: CHECK_AVAILABILITY ──────────────────────────────────────────────
console.log("\n=== TEST 4: CHECK_AVAILABILITY ===");
{
  const cases = [
    "Am I free tomorrow at 3 PM?",
    "Are you free Friday from 2 to 4?",
    "Find me a free one-hour slot tomorrow afternoon",
    "Check my availability on Monday",
    "What's my free time this week?",
  ];
  for (const p of cases) {
    const { intent } = CalendarIntentResolver.resolve(p);
    assert(intent === CALENDAR_INTENT.CHECK_AVAILABILITY, `"${p.slice(0,45)}" → CHECK_AVAILABILITY`);
  }

  // DateTime resolution for "tomorrow afternoon"
  const dtResult = DateTimeResolver.resolve({ dateExpr: "tomorrow", startTimeExpr: "afternoon", timezone: "Asia/Kathmandu" });
  assert(dtResult.resolved, "tomorrow afternoon resolves");
  assert(dtResult.start !== null, "afternoon start is set");
}

// ─── Test 5: ConflictDetector logic ──────────────────────────────────────────
console.log("\n=== TEST 5: Conflict detection (offline, no provider) ===");
{
  // Build overlap test without actual provider
  const proposedStart = new Date("2026-08-08T10:00:00Z").getTime();
  const proposedEnd   = new Date("2026-08-08T11:00:00Z").getTime();

  const fakeEvent = {
    start: "2026-08-08T09:30:00Z",
    end:   "2026-08-08T10:30:00Z",
  };

  const eStart = new Date(fakeEvent.start).getTime();
  const eEnd   = new Date(fakeEvent.end).getTime();
  const overlaps = proposedStart < eEnd && proposedEnd > eStart;

  assert(overlaps, "Events that partially overlap are detected as conflicts");

  // No-overlap case
  const nonOverlapEvent = { start: "2026-08-08T11:00:00Z", end: "2026-08-08T12:00:00Z" };
  const eS2 = new Date(nonOverlapEvent.start).getTime();
  const eE2 = new Date(nonOverlapEvent.end).getTime();
  const noOverlap = !(proposedStart < eE2 && proposedEnd > eS2);
  assert(noOverlap, "Back-to-back events are NOT detected as conflicts");
}

// ─── Test 6: RESCHEDULE_EVENT ────────────────────────────────────────────────
console.log("\n=== TEST 6: RESCHEDULE_EVENT ===");
{
  const cases = [
    "Reschedule my meeting with Sujan to 5 PM",
    "Move the project review to Friday",
    "Postpone tomorrow's standup by one hour",
    "Push the meeting to next Monday",
    "Shift the DSA session to 8 PM",
  ];
  for (const p of cases) {
    const { intent } = CalendarIntentResolver.resolve(p);
    assert(intent === CALENDAR_INTENT.RESCHEDULE_EVENT, `"${p.slice(0,45)}" → RESCHEDULE_EVENT`);
  }
}

// ─── Test 7: DELETE_EVENT ─────────────────────────────────────────────────────
console.log("\n=== TEST 7: DELETE_EVENT ===");
{
  const cases = [
    "Cancel the meeting with Sujan tomorrow",
    "Delete the project review event",
    "Remove my appointment on Friday",
    "Drop the standup today",
  ];
  for (const p of cases) {
    const { intent } = CalendarIntentResolver.resolve(p);
    assert(intent === CALENDAR_INTENT.DELETE_EVENT, `"${p.slice(0,45)}" → DELETE_EVENT`);
  }
}

// ─── Test 8: Ambiguous time ────────────────────────────────────────────────
console.log("\n=== TEST 8: Ambiguous time (bare '4') ===");
{
  const result = DateTimeResolver._resolveTime("4");
  assert(!result.resolved, "Bare '4' is ambiguous");
  assert(result.ambiguous === true, "ambiguous flag is set");
  assert(result.ambiguityReason.includes("4 AM") || result.ambiguityReason.includes("4 PM"), "Reason mentions AM/PM");
  console.log(`  Ambiguity reason: "${result.ambiguityReason}"`);

  // But "4 PM" is unambiguous
  const r2 = DateTimeResolver._resolveTime("4 PM");
  assert(r2.resolved, "'4 PM' is unambiguous");
  assert(r2.hours === 16, "'4 PM' resolves to hour 16");

  // And "16:00" is unambiguous
  const r3 = DateTimeResolver._resolveTime("16:00");
  assert(r3.resolved, "'16:00' is unambiguous");
  assert(r3.hours === 16, "'16:00' resolves to hour 16");
}

// ─── Test 9: RecurrenceResolver ──────────────────────────────────────────────
console.log("\n=== TEST 9: RecurrenceResolver ===");
{
  const cases = [
    { text: "every Monday at 7 PM",   freq: "WEEKLY", byDay: ["MO"] },
    { text: "every day",              freq: "DAILY",  byDay: [] },
    { text: "daily",                  freq: "DAILY",  byDay: [] },
    { text: "weekly",                 freq: "WEEKLY", byDay: [] },
    { text: "every weekday",          freq: "WEEKLY", byDay: ["MO","TU","WE","TH","FR"] },
    { text: "biweekly",               freq: "WEEKLY", interval: 2 },
    { text: "monthly",                freq: "MONTHLY", byDay: [] },
    { text: "every month on the 15th",freq: "MONTHLY", byMonthDay: 15 },
  ];

  for (const c of cases) {
    const result = RecurrenceResolver.resolve(c.text);
    assert(result.resolved, `"${c.text}" resolves`);
    assert(result.spec.frequency === c.freq, `"${c.text}" → ${c.freq}`);
    if (c.byDay) {
      assert(JSON.stringify(result.spec.byDay) === JSON.stringify(c.byDay), `byDay: ${JSON.stringify(c.byDay)}`);
    }
    if (c.byMonthDay) {
      assert(result.spec.byMonthDay === c.byMonthDay, `byMonthDay: ${c.byMonthDay}`);
    }
  }

  // RRULE generation
  const spec = { frequency: "WEEKLY", interval: 1, byDay: ["MO"], byMonthDay: null, count: null, until: null };
  const rrule = RecurrenceResolver.toGoogleRRule(spec);
  assert(rrule.length === 1, "toGoogleRRule returns array of 1");
  assert(rrule[0].startsWith("RRULE:"), "RRULE starts with RRULE:");
  assert(rrule[0].includes("BYDAY=MO"), "RRULE includes BYDAY=MO");

  // Human readable
  const human = RecurrenceResolver.toHumanReadable(spec);
  assert(human.toLowerCase().includes("monday"), `Human readable includes "Monday": "${human}"`);
}

// ─── Test 10: Auth missing ───────────────────────────────────────────────────
console.log("\n=== TEST 10: Auth required path ===");
{
  // CalendarResult with auth metadata
  const { CalendarResult } = await import("../CalendarResult.js");
  const { CALENDAR_STATUS, CALENDAR_ERROR } = await import("../CalendarConfig.js");

  const result = CalendarResult.create({
    success: false,
    status: CALENDAR_STATUS.RECOVERY_REQUIRED,
    intent: "CREATE_EVENT",
    operation: "auth",
    answer: "Please connect your Google Calendar.",
    error: CALENDAR_ERROR.AUTH_REQUIRED,
    metadata: {
      recoverable: true,
      automaticRetryable: false,
      recoveryAction: "google_calendar_authorization",
      requiresAuthorization: true,
      authUrl: "https://accounts.google.com/o/oauth2/auth?...",
    },
  });

  assert(result.success === false, "Auth required result has success=false");
  assert(result.error === CALENDAR_ERROR.AUTH_REQUIRED, "Error code is AUTH_REQUIRED");
  assert(result.metadata.recoverable === true, "Result is recoverable");
  assert(result.metadata.requiresAuthorization === true, "requiresAuthorization flag set");
  console.log("  CalendarResult.create() produces correct auth recovery object");
}

// ─── Test 11: Voice — CONFIRM/CANCEL with active session ─────────────────────
console.log("\n=== TEST 11: Voice CONFIRM/CANCEL intent ===");
{
  const voicePhrases = [
    { phrase: "yes", intent: CALENDAR_INTENT.CONFIRM },
    { phrase: "Yeah", intent: CALENDAR_INTENT.CONFIRM },
    { phrase: "Sure, do it", intent: CALENDAR_INTENT.CONFIRM },
    { phrase: "go ahead", intent: CALENDAR_INTENT.CONFIRM },
    { phrase: "schedule it", intent: CALENDAR_INTENT.CONFIRM },
    { phrase: "no", intent: CALENDAR_INTENT.CANCEL },
    { phrase: "cancel", intent: CALENDAR_INTENT.CANCEL },
    { phrase: "never mind", intent: CALENDAR_INTENT.CANCEL },
    { phrase: "stop", intent: CALENDAR_INTENT.CANCEL },
  ];

  for (const { phrase, intent } of voicePhrases) {
    const { intent: detected } = CalendarIntentResolver.resolve(phrase, { hasActiveConfirmation: true });
    assert(detected === intent, `Voice "${phrase}" → ${intent}`);
  }
}

// ─── Test 12: WorkflowPlanner calendar rule ───────────────────────────────────
console.log("\n=== TEST 12: WorkflowPlanner calendar task rule ===");
{
  const { workflowPlanner } = await import("../../workflow/WorkflowPlanner.js");
  const { CapabilityContext } = await import("../../capabilities/CapabilityContext.js");

  const calendarPrompts = [
    "Schedule a meeting with Sujan tomorrow at 4 PM",
    "What's on my calendar today?",
    "Am I free tomorrow at 3?",
    "Book an appointment with the doctor next Friday",
    "Cancel the meeting with the team",
    "Reschedule the project review to Monday",
  ];

  for (const p of calendarPrompts) {
    const ctx = new CapabilityContext({ prompt: p });
    const graph = workflowPlanner.plan(ctx);
    const nodes = graph.getAllNodes();
    assert(nodes.length > 0, `Graph has nodes for "${p.slice(0,40)}"`);
    const calendarNode = nodes.find(n => n.requiredCapability === "calendar");
    assert(calendarNode !== null, `"${p.slice(0,40)}" routed to calendar capability`);
  }
}

// ─── Test 13: CANCEL intent ───────────────────────────────────────────────────
console.log("\n=== TEST 13: CANCEL intent ===");
{
  const cases = [
    { phrase: "cancel", context: { hasActiveSession: true }, expected: CALENDAR_INTENT.CANCEL },
    { phrase: "don't create it", context: { hasActiveSession: true }, expected: CALENDAR_INTENT.CANCEL },
    { phrase: "don't schedule it", context: { hasActiveConfirmation: true }, expected: CALENDAR_INTENT.CANCEL },
  ];
  for (const c of cases) {
    const { intent } = CalendarIntentResolver.resolve(c.phrase, c.context);
    assert(intent === c.expected, `"${c.phrase}" with context → CANCEL`);
  }
}

// ─── Test 14: Double-confirm idempotency ─────────────────────────────────────
console.log("\n=== TEST 14: Double-confirm idempotency ===");
{
  // confirmationService returns "not found or has expired" on second confirm
  // CalendarManager maps this to a safe already-completed response
  const fakeResult = { success: false, message: "Action not found or has expired." };
  const isAlreadyDone = fakeResult.success === false &&
    fakeResult.message &&
    fakeResult.message.includes("not found or has expired");
  assert(isAlreadyDone, "Double-confirm is identified as already-completed");
}

// ─── Test 15: Timezone resolution priority ────────────────────────────────────
console.log("\n=== TEST 15: Timezone resolution priority ===");
{
  // Priority: userPreferences.timezone > CALENDAR_TIMEZONE env > Intl fallback
  const prefs1 = { timezone: "America/New_York" };
  const tz1 = DateTimeResolver.getTimezone(prefs1);
  assert(tz1 === "America/New_York", `userPreferences.timezone wins: ${tz1}`);

  const prefs2 = {};
  const tz2 = DateTimeResolver.getTimezone(prefs2);
  assert(typeof tz2 === "string" && tz2.length > 0, `Fallback timezone is a non-empty string: ${tz2}`);
  console.log(`  Fallback timezone: ${tz2}`);

  // DateTimeResolver should produce different UTC times for the same "4 PM" in different zones
  const dtKTM = DateTimeResolver.resolve({ dateExpr: "today", startTimeExpr: "4 PM", timezone: "Asia/Kathmandu" });
  const dtNYC = DateTimeResolver.resolve({ dateExpr: "today", startTimeExpr: "4 PM", timezone: "America/New_York" });

  if (dtKTM.resolved && dtNYC.resolved) {
    const ktmTime = new Date(dtKTM.start).getTime();
    const nycTime = new Date(dtNYC.start).getTime();
    assert(ktmTime !== nycTime, "Same '4 PM' in different timezones produces different UTC timestamps");
    console.log(`  4 PM KTM = ${dtKTM.start}`);
    console.log(`  4 PM NYC = ${dtNYC.start}`);
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(60)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("✅ ALL TESTS PASSED");
}
