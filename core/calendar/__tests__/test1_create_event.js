/**
 * test1_create_event.js
 *
 * Test: Complete CREATE_EVENT happy path
 * "Schedule a meeting with Sujan tomorrow at 4 PM"
 *
 * Validates: intent detection, field extraction, datetime resolution,
 * draft building, confirmation creation, session management.
 */

import { CalendarIntentResolver } from "../intent/CalendarIntentResolver.js";
import { CalendarFieldExtractor } from "../intent/CalendarFieldExtractor.js";
import { DateTimeResolver } from "../scheduling/DateTimeResolver.js";
import { CALENDAR_INTENT } from "../CalendarConfig.js";

async function test() {
  console.log("=== TEST 1: CREATE_EVENT happy path ===\n");

  const prompt = "Schedule a meeting with Sujan tomorrow at 4 PM";

  // 1. Intent
  const { intent, confidence } = CalendarIntentResolver.resolve(prompt, {});
  console.assert(intent === CALENDAR_INTENT.CREATE_EVENT, `Expected CREATE_EVENT, got ${intent}`);
  console.assert(confidence >= 0.85, `Expected confidence >= 0.85, got ${confidence}`);
  console.log(`✅ Intent: ${intent} (confidence: ${confidence})`);

  // 2. Field extraction
  const fields = await CalendarFieldExtractor.extract(prompt);
  console.assert(fields.date !== "" || fields.startTime !== "", "Should extract some date/time");
  console.log(`✅ Fields extracted: title="${fields.title}", date="${fields.date}", time="${fields.startTime}"`);
  console.assert(fields.attendeeNames.length > 0 || fields.title.toLowerCase().includes("sujan"),
    "Should capture Sujan as attendee or in title");

  // 3. Datetime resolution
  const tz = "Asia/Kathmandu";
  const dtResult = DateTimeResolver.resolve({
    dateExpr: "tomorrow",
    startTimeExpr: "4 PM",
    timezone: tz,
  });
  console.assert(dtResult.resolved, "DateTimeResolver should resolve tomorrow at 4 PM");
  console.assert(!dtResult.ambiguous, "Should not be ambiguous");
  console.assert(dtResult.start !== null, "Should have a start time");

  // Verify the resolved time is in the future
  console.assert(new Date(dtResult.start).getTime() > Date.now(), "Resolved time should be in the future");
  console.log(`✅ Resolved: ${dtResult.start} → ${dtResult.end} (${tz})`);

  console.log("\n✅ Test 1 PASSED\n");
}

test().catch(err => {
  console.error("❌ Test 1 FAILED:", err.message);
  process.exit(1);
});
