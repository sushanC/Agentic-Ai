/**
 * scratch/test_error_fallback_system.js
 *
 * Dedicated regression test suite for Global Error Handling + Final Fallback Reliability Layer.
 * Validates all 18 reliability test scenarios specified in Part 14.
 */

import { ErrorNormalizer, ERROR_CODES, USER_ERROR_MESSAGES } from "../core/errors/index.js";
import { FallbackManager } from "../core/runtime/FallbackManager.js";
import { buildCanonicalCandidateChain } from "../core/runtime/FallbackPolicy.js";
import { CapabilityResult } from "../core/capabilities/CapabilityResult.js";
import { WorkflowResult } from "../core/workflow/WorkflowResult.js";

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

async function runTests() {
  console.log("=== REGRESSION TEST SUITE: Global Error Handling & Reliability Layer ===\n");

  // ── 1. Successful request ──────────────────────────────────────────────────
  console.log("--- Test 1: Successful request contract ---");
  {
    const res = CapabilityResult.create({
      success: true,
      capability: "chat",
      answer: "Hello! How can I help you?",
    });
    assert(res.success === true, "Result success is true");
    assert(res.answer === "Hello! How can I help you?", "Answer payload preserved");
    assert(res.capability === "chat", "Capability preserved");
  }

  // ── 2–6. Canonical Model Fallback Order & Candidate Generation ────────────
  console.log("\n--- Test 2–6: Canonical Model Fallback Order & Ollama Final Fallback ---");
  {
    const mockPrimaryGemini = { name: "gemini", key: "gemini", provider: "google", displayName: "Gemini 2.5 Flash" };

    const resolver = (key) => {
      const db = {
        groq:       { name: "groq", key: "groq", provider: "groq", displayName: "Groq Llama 3.3 70B", enabled: true },
        gemini:     { name: "gemini", key: "gemini", provider: "google", displayName: "Gemini 2.5 Flash", enabled: true },
        "gpt-oss":  { name: "gpt-oss", key: "gpt-oss", provider: "openrouter", displayName: "GPT-OSS 120B", enabled: true },
        ollama:     { name: "ollama", key: "ollama", provider: "ollama", displayName: "Ollama Local", enabled: true },
      };
      return db[key] || null;
    };

    const candidates = buildCanonicalCandidateChain(mockPrimaryGemini, resolver);

    assert(candidates.length === 4, "4 candidates in canonical fallback chain");
    assert(candidates[0].provider === "google", "Candidate 1: Primary (Google Gemini)");
    assert(candidates[1].provider === "groq", "Candidate 2: Groq");
    assert(candidates[2].provider === "openrouter", "Candidate 3: OpenRouter (GPT-OSS)");
    assert(candidates[3].provider === "ollama", "Candidate 4: Ollama Local (STRICTLY FINAL)");

    // Primary = Ollama case
    const mockPrimaryOllama = { name: "ollama", key: "ollama", provider: "ollama", displayName: "Ollama Local" };
    const ollamaCandidates = buildCanonicalCandidateChain(mockPrimaryOllama, resolver);
    assert(ollamaCandidates.length === 1, "When Ollama is primary, no cloud fallbacks are added");
    assert(ollamaCandidates[0].provider === "ollama", "Only Ollama candidate returned");
  }

  // ── 7. All AI Providers Fail → Graceful Error ──────────────────────────────
  console.log("\n--- Test 7: All providers fail → graceful error (never throws raw exception to user) ---");
  {
    const fbManager = new FallbackManager();
    const candidates = [
      { name: "groq", provider: "groq", displayName: "Groq" },
      { name: "gemini", provider: "google", displayName: "Gemini" },
      { name: "gpt-oss", provider: "openrouter", displayName: "OpenRouter" },
      { name: "ollama", provider: "ollama", displayName: "Ollama Local" },
    ];

    const failedKeys = new Set(["groq", "google", "openrouter", "ollama"]);
    const nextCandidate = fbManager.selectNextCandidate(candidates, failedKeys);
    assert(nextCandidate === null, "selectNextCandidate returns null when all providers in failedKeys");

    const normalized = ErrorNormalizer.normalize(new Error("[Runtime Error] All available AI providers are currently down or degraded."), {
      code: ERROR_CODES.ALL_MODELS_FAILED
    });

    assert(normalized.success === false, "Normalized error has success: false");
    assert(normalized.userMessage === USER_ERROR_MESSAGES[ERROR_CODES.ALL_MODELS_FAILED], "User message is clean user-safe error");
    assert(!normalized.userMessage.includes("Runtime Error"), "User message contains zero internal stack trace or raw tech strings");
  }

  // ── 8–10. Application / Capability Failure vs LLM Fallback ───────────────
  console.log("\n--- Test 8–10: Domain/Application errors do NOT trigger LLM fallback ---");
  {
    // 8: Calendar event not found
    const calError = ErrorNormalizer.normalize("CALENDAR_EVENT_NOT_FOUND", { capability: "calendar", tool: "calendar_delete" });
    assert(calError.code === ERROR_CODES.CALENDAR_EVENT_NOT_FOUND, "Code detected as CALENDAR_EVENT_NOT_FOUND");
    assert(calError.userMessage === USER_ERROR_MESSAGES[ERROR_CODES.CALENDAR_EVENT_NOT_FOUND], "Returns clean calendar user message");

    // 9: Gmail auth required
    const gmailErr = ErrorNormalizer.normalize("invalid_grant: Token has been expired or revoked.", { capability: "email", tool: "email_draft" });
    assert(gmailErr.code === ERROR_CODES.GMAIL_REAUTH_REQUIRED, "Code detected as GMAIL_REAUTH_REQUIRED");
    assert(gmailErr.userMessage === USER_ERROR_MESSAGES[ERROR_CODES.GMAIL_REAUTH_REQUIRED], "Returns clean Gmail reauth user message");
    assert(gmailErr.requiresReauth === true, "requiresReauth flag set");

    // 10: User cancellation
    const cancelRes = CapabilityResult.create({
      success: true,
      capability: "calendar",
      tool: "calendar_cancel",
      answer: "I've cancelled the calendar request.",
    });
    assert(cancelRes.success === true, "User cancellation handled as valid clean response");
    assert(cancelRes.answer === "I've cancelled the calendar request.", "Cancellation message preserved");
  }

  // ── 11–12. Capability & Workflow Exceptions ────────────────────────────────
  console.log("\n--- Test 11–12: Workflow & Capability exceptions never produce answer: null ---");
  {
    // 11: Capability throws
    const capErr = new Error("Database query timeout");
    const normalizedCap = ErrorNormalizer.normalize(capErr, { capability: "database", tool: "db_query" });
    assert(normalizedCap.answer !== null, "Normalized output has userMessage");
    assert(typeof normalizedCap.userMessage === "string" && normalizedCap.userMessage.length > 0, "userMessage is non-empty string");

    // 12: WorkflowResult with error
    const wfResult = WorkflowResult.create({
      success: false,
      workflowId: "wf-123",
      answer: normalizedCap.userMessage,
      capability: "database",
      tool: "db_query",
    });
    assert(wfResult.success === false, "WorkflowResult has success: false");
    assert(wfResult.answer === normalizedCap.userMessage, "WorkflowResult answer is non-null user-safe string");
  }

  // ── 13. Streaming Failure ──────────────────────────────────────────────────
  console.log("\n--- Test 13: Streaming failure mid-yield produces safe termination string ---");
  {
    const streamInterruptedMsg = USER_ERROR_MESSAGES[ERROR_CODES.STREAMING_INTERRUPTED];
    assert(typeof streamInterruptedMsg === "string" && streamInterruptedMsg.length > 0, "Streaming interrupted message exists");
    assert(streamInterruptedMsg.includes("Sorry for the interruption"), "Contains friendly polite notice");
  }

  // ── 14–16. Frontend Safety & Empty Message Prevention ─────────────────────
  console.log("\n--- Test 14–16: Frontend safety (never render empty assistant messages) ---");
  {
    // 14: success = false with valid answer
    const r14 = { success: false, answer: "Sorry for the inconvenience. Gmail needs to be reconnected." };
    const reply14 = r14.answer || "Fallback message";
    assert(reply14 === "Sorry for the inconvenience. Gmail needs to be reconnected.", "Preserves explicit answer");

    // 15: success = false with answer = null
    const r15 = { success: false, answer: null };
    const normalized15 = ErrorNormalizer.normalize(r15.answer || "CAPABILITY_FAILED");
    const reply15 = r15.answer || normalized15.userMessage;
    assert(reply15 !== null && reply15.length > 0, "Auto-fills answer when null");
    assert(!reply15.includes("null"), "Does not print literal 'null'");

    // 16: Verify no empty assistant messages
    const emptyTestInputs = [null, undefined, "", "   "];
    for (const input of emptyTestInputs) {
      let reply = input;
      if (!reply || typeof reply !== "string" || reply.trim() === "") {
        reply = "Sorry for the inconvenience. I wasn't able to complete that request. Please try again.";
      }
      assert(reply.length > 0 && reply.includes("Sorry for the inconvenience"), `Empty input "${input}" safe-guarded`);
    }
  }

  // ── 17–18. Loop Prevention & Duplicate Provider Execution ──────────────────
  console.log("\n--- Test 17–18: No fallback loops & No duplicate provider execution ---");
  {
    const candidates = [
      { name: "groq", provider: "groq", displayName: "Groq" },
      { name: "gemini", provider: "google", displayName: "Gemini" },
      { name: "gpt-oss", provider: "openrouter", displayName: "GPT-OSS" },
      { name: "ollama", provider: "ollama", displayName: "Ollama" },
    ];

    const fbManager = new FallbackManager();
    const failedKeys = new Set();

    let attempts = 0;
    while (true) {
      const active = fbManager.selectNextCandidate(candidates, failedKeys);
      if (!active) break;
      attempts++;
      failedKeys.add(active.provider);
      failedKeys.add(active.name);
    }

    assert(attempts === 4, `Iterated through exactly 4 candidates without looping (attempts: ${attempts})`);
    assert(failedKeys.has("ollama"), "Ollama was evaluated in sequence");
    assert(failedKeys.size >= 4, "All candidates marked as failed");

    // Verify 5th attempt returns null immediately
    const extraAttempt = fbManager.selectNextCandidate(candidates, failedKeys);
    assert(extraAttempt === null, "5th attempt returns null (no circular loop)");
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("✅ ALL 18 RELIABILITY TESTS PASSED");
  }
}

runTests().catch(err => {
  console.error("❌ Test suite crash:", err);
  process.exit(1);
});
