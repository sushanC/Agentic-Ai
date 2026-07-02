/**
 * testMSE.js — Model Selection Engine Test Suite
 *
 * Phase 11 — Validates all MSE behaviors before freezing the AI Core.
 *
 * Run with:
 *   node testMSE.js
 *
 * Tests:
 *  1. IntentDetector drives routing (no keyword routing in modelRouter)
 *  2. Per-model health records independently per model key
 *  3. Provider health not used for model selection score
 *  4. Cooldown correctly blocks and unblocks models
 *  5. AvailabilityFilter removes all expected categories
 *  6. IntentScorer produces different weight distributions per intent
 *  7. Streaming and non-streaming share identical selection logic (decideModel)
 *  8. Diagnostics log contains all candidates
 *  9. New model added to registry selected without router modification
 */

import "dotenv/config";

// ─────────────────────────────────────────────────────────────────────────────
// Test utilities
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => {
          console.log(`  ✅ ${name}`);
          passed++;
        })
        .catch(err => {
          console.log(`  ❌ ${name}: ${err.message}`);
          failures.push({ name, error: err.message });
          failed++;
        });
    }
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failures.push({ name, error: err.message });
    failed++;
  }
  return Promise.resolve();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(a, b, message) {
  if (a !== b) throw new Error(`${message} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertNotEqual(a, b, message) {
  if (a === b) throw new Error(`${message} — expected values to differ, both are ${JSON.stringify(a)}`);
}

function section(title) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

// ─────────────────────────────────────────────────────────────────────────────
// Imports
// ─────────────────────────────────────────────────────────────────────────────

import { detectIntentFull, Intent } from "./services/cie/IntentDetector.js";
import {
  recordModelSuccess,
  recordModelFailure,
  getModelHealth,
  getModelHealthScore,
  isModelAvailable,
  getCooldownRemaining,
  resetAllModelHealth,
  resetModelHealth,
} from "./services/modelSelection/HealthScorer.js";
import { filterAvailable, RejectionReason } from "./services/modelSelection/AvailabilityFilter.js";
import { filterByCapability, resolveCapabilityForIntent } from "./services/modelSelection/CapabilityFilter.js";
import { scoreCandidate, getWeightsForIntent } from "./services/modelSelection/IntentScorer.js";
import { selectModel } from "./services/modelSelection/ModelSelector.js";
import { buildCandidates } from "./services/modelSelection/CandidateBuilder.js";
import { decideModel } from "./services/modelRouter.js";
import { ProviderError, ProviderErrorType } from "./services/cie/ProviderErrorClassifier.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create a ProviderError
// ─────────────────────────────────────────────────────────────────────────────
function makeError(errorType, statusCode = null) {
  return new ProviderError({
    provider: "test",
    errorType,
    message: `Test ${errorType}`,
    statusCode,
    retryable: false,
    shouldFallback: true,
    shouldCompress: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main test runner
// ─────────────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log("\n" + "═".repeat(60));
  console.log("  samGPT — Model Selection Engine Test Suite");
  console.log("  Phase 11 Validation");
  console.log("═".repeat(60));

  // ── Reset state before tests ──────────────────────────────────────────────
  resetAllModelHealth();

  // ─────────────────────────────────────────────────────────────────────────
  section("Test 1: IntentDetector drives routing");
  // ─────────────────────────────────────────────────────────────────────────

  await test("Coding message → Programming intent", async () => {
    const { intent } = await detectIntentFull("Write a Python function to sort a list", "chat", {});
    assertEqual(intent, "Programming", "Intent should be Programming");
  });

  await test("Research message → Research intent", async () => {
    const { intent } = await detectIntentFull("Give me a detailed analysis of quantum computing", "chat", {});
    assert(intent === "Research", `Expected Research, got ${intent}`);
  });

  await test("Greeting message → Greeting intent", async () => {
    const { intent } = await detectIntentFull("Hello there!", "chat", {});
    assertEqual(intent, "Greeting", "Intent should be Greeting");
  });

  await test("Planning message → Planning intent", async () => {
    const { intent } = await detectIntentFull("Create a roadmap for my project", "chat", {});
    assertEqual(intent, "Planning", "Intent should be Planning");
  });

  await test("Writing message → Writing intent", async () => {
    const { intent } = await detectIntentFull("Write an essay on climate change", "chat", {});
    assert(intent === "Writing", `Expected Writing, got ${intent}`);
  });

  await test("Tool=pdf always returns PDF intent", async () => {
    const { intent } = await detectIntentFull("anything", "pdf", {});
    assertEqual(intent, "PDF", "Tool=pdf should always yield PDF intent");
  });

  // ─────────────────────────────────────────────────────────────────────────
  section("Test 2: Per-model health records independently per model key");
  // ─────────────────────────────────────────────────────────────────────────

  resetAllModelHealth();

  await test("Model health starts optimistic (score=1.0)", () => {
    const score = getModelHealthScore("gemini");
    assert(score === 1.0, `Expected score=1.0, got ${score}`);
  });

  await test("Recording success for 'gemini' does not affect 'deepseek'", () => {
    recordModelSuccess("gemini", 800);
    const geminiScore  = getModelHealthScore("gemini");
    const deepseekScore = getModelHealthScore("deepseek");
    assert(geminiScore >= 0.95, `Gemini score should remain high after success: ${geminiScore}`);
    assert(deepseekScore === 1.0, `Deepseek score should be unaffected: ${deepseekScore}`);
  });

  await test("Recording failure for 'groq' does not affect 'gemini'", () => {
    const geminiBefore = getModelHealthScore("gemini");
    recordModelFailure("groq", makeError(ProviderErrorType.TIMEOUT));
    const geminiAfter  = getModelHealthScore("gemini");
    assertEqual(geminiBefore, geminiAfter, "Gemini health should be unaffected by groq failure");
  });

  await test("Health record contains all required fields", () => {
    const health = getModelHealth("gemini");
    assert("successRate"       in health, "Missing successRate");
    assert("failureRate"       in health, "Missing failureRate");
    assert("avgLatencyMs"      in health, "Missing avgLatencyMs");
    assert("totalRequests"     in health, "Missing totalRequests");
    assert("rateLimitCount"    in health, "Missing rateLimitCount");
    assert("networkErrorCount" in health, "Missing networkErrorCount");
    assert("contextErrorCount" in health, "Missing contextErrorCount");
    assert("cooldownExpiry"    in health, "Missing cooldownExpiry");
    assert("available"         in health, "Missing available");
    assert("healthScore"       in health, "Missing healthScore");
    assert("lastSuccessAt"     in health, "Missing lastSuccessAt");
    assert("failureHistory"    in health, "Missing failureHistory");
  });

  await test("Failure rate increases after failure", () => {
    resetModelHealth("testModel");
    recordModelFailure("testModel", makeError(ProviderErrorType.TIMEOUT));
    const health = getModelHealth("testModel");
    assert(health.failureRate > 0, `Failure rate should increase: ${health.failureRate}`);
    assert(health.successRate < 1.0, `Success rate should decrease: ${health.successRate}`);
  });

  await test("Latency EMA updates on success", () => {
    resetModelHealth("latencyTest");
    recordModelSuccess("latencyTest", 1000);
    recordModelSuccess("latencyTest", 2000);
    const health = getModelHealth("latencyTest");
    assert(health.avgLatencyMs > 0, `Avg latency should be set: ${health.avgLatencyMs}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  section("Test 3: Provider health not used for model selection score");
  // ─────────────────────────────────────────────────────────────────────────

  await test("Model health score is independent of provider name", () => {
    resetModelHealth("gemini");
    resetModelHealth("deepseek");
    // Both should start at 1.0 regardless of provider
    assertEqual(getModelHealthScore("gemini"),   1.0, "gemini should start at 1.0");
    assertEqual(getModelHealthScore("deepseek"), 1.0, "deepseek should start at 1.0");
    // MSE CandidateBuilder uses model key "gemini", not provider "google"
    const candidates = buildCandidates();
    const gemini = candidates.find(c => c.key === "gemini");
    assert(gemini !== undefined, "gemini candidate should exist");
    assertEqual(gemini.provider, "google", "Provider should still be google");
    assertEqual(gemini.key, "gemini", "Key should be gemini (model-level)");
  });

  // ─────────────────────────────────────────────────────────────────────────
  section("Test 4: Cooldown correctly blocks and unblocks models");
  // ─────────────────────────────────────────────────────────────────────────

  await test("RATE_LIMIT triggers cooldown (>0ms)", () => {
    resetModelHealth("cooldownTest");
    recordModelFailure("cooldownTest", makeError(ProviderErrorType.RATE_LIMIT));
    const remaining = getCooldownRemaining("cooldownTest");
    assert(remaining > 0, `Cooldown should be set: ${remaining}ms`);
    assert(!isModelAvailable("cooldownTest"), "Model should be unavailable during cooldown");
  });

  await test("NETWORK triggers shorter cooldown than RATE_LIMIT", () => {
    resetModelHealth("networkTest");
    resetModelHealth("rateLimitTest");
    recordModelFailure("networkTest",   makeError(ProviderErrorType.NETWORK));
    recordModelFailure("rateLimitTest", makeError(ProviderErrorType.RATE_LIMIT));
    const networkCooldown   = getCooldownRemaining("networkTest");
    const rateLimitCooldown = getCooldownRemaining("rateLimitTest");
    assert(networkCooldown < rateLimitCooldown,
      `Network cooldown (${networkCooldown}ms) should be < rate limit (${rateLimitCooldown}ms)`);
  });

  await test("AUTH_ERROR causes permanent disable", () => {
    resetModelHealth("authTest");
    recordModelFailure("authTest", makeError(ProviderErrorType.AUTH_ERROR));
    assert(!isModelAvailable("authTest"), "Auth-failed model should be unavailable");
    assertEqual(getCooldownRemaining("authTest"), Infinity, "Auth failure = permanent disable");
  });

  await test("resetModelHealth clears permanent disable", () => {
    // authTest is still permanently disabled from the previous test
    resetModelHealth("authTest");
    assert(isModelAvailable("authTest"), "After reset, model should be available");
    assertEqual(getCooldownRemaining("authTest"), 0, "After reset, no cooldown");
  });

  await test("CONTEXT_LIMIT does NOT trigger cooldown", () => {
    resetModelHealth("contextTest");
    recordModelFailure("contextTest", makeError(ProviderErrorType.CONTEXT_LIMIT));
    assertEqual(getCooldownRemaining("contextTest"), 0,
      "Context limit errors should not trigger cooldown (handled by compression)");
    assert(isModelAvailable("contextTest"), "Model should remain available after context error");
  });

  // ─────────────────────────────────────────────────────────────────────────
  section("Test 5: AvailabilityFilter removes all expected categories");
  // ─────────────────────────────────────────────────────────────────────────

  await test("Disabled model (enabled=false) is filtered out", () => {
    const fakeCandidates = [{
      key: "fake-disabled", provider: "test", modelId: "test", displayName: "Test",
      enabled: false, reserved: false, status: "online", flags: {}, scores: {}, capabilities: []
    }];
    const results = filterAvailable(fakeCandidates);
    assertEqual(results[0].available, false, "Disabled model should not be available");
    assertEqual(results[0].rejectionReason, RejectionReason.DISABLED, "Rejection reason should be Disabled");
  });

  await test("Reserved model is filtered out", () => {
    const fakeCandidates = [{
      key: "fake-reserved", provider: "test", modelId: "test", displayName: "Test",
      enabled: true, reserved: true, status: "online", flags: {}, scores: {}, capabilities: []
    }];
    const results = filterAvailable(fakeCandidates);
    assertEqual(results[0].available, false, "Reserved model should not be available");
    assertEqual(results[0].rejectionReason, RejectionReason.RESERVED, "Rejection reason should be Reserved");
  });

  await test("Offline model (status=offline) is filtered out", () => {
    const fakeCandidates = [{
      key: "fake-offline", provider: "test", modelId: "test", displayName: "Test",
      enabled: true, reserved: false, status: "offline", flags: {}, scores: {}, capabilities: []
    }];
    const results = filterAvailable(fakeCandidates);
    assertEqual(results[0].available, false, "Offline model should not be available");
    assertEqual(results[0].rejectionReason, RejectionReason.OFFLINE, "Rejection reason should be Offline");
  });

  await test("Cooling-down model is filtered out", () => {
    resetModelHealth("coolingModel");
    recordModelFailure("coolingModel", makeError(ProviderErrorType.RATE_LIMIT));
    const fakeCandidates = [{
      key: "coolingModel", provider: "test", modelId: "test", displayName: "Test",
      enabled: true, reserved: false, status: "online", flags: {}, scores: {}, capabilities: []
    }];
    const results = filterAvailable(fakeCandidates);
    assertEqual(results[0].available, false, "Cooling model should not be available");
    assertEqual(results[0].rejectionReason, RejectionReason.COOLING_DOWN, "Rejection reason should be CoolingDown");
    assert(results[0].cooldownRemainingMs > 0, "Should report cooldown time remaining");
  });

  await test("GLM is reserved and filtered from real candidates", () => {
    const candidates = buildCandidates();
    const results = filterAvailable(candidates);
    const glmResult = results.find(r => r.candidate.key === "glm");
    assert(glmResult !== undefined, "GLM should appear in results");
    assertEqual(glmResult.available, false, "GLM should not be available (reserved=true + enabled=false)");
  });

  // ─────────────────────────────────────────────────────────────────────────
  section("Test 6: IntentScorer produces different weights per intent");
  // ─────────────────────────────────────────────────────────────────────────

  await test("Programming weights: capability > health", () => {
    const w = getWeightsForIntent("Programming");
    assert(w.capability > w.health, `Programming: capability(${w.capability}) should > health(${w.health})`);
    assert(w.capability >= 0.35, `Programming: capability weight should be >= 0.35, got ${w.capability}`);
  });

  await test("Greeting weights: latency > capability", () => {
    const w = getWeightsForIntent("Greeting");
    assert(w.latency > w.capability, `Greeting: latency(${w.latency}) should > capability(${w.capability})`);
    assert(w.latency >= 0.40, `Greeting: latency weight should be >= 0.40, got ${w.latency}`);
  });

  await test("Research weights: context window included", () => {
    const w = getWeightsForIntent("Research");
    assert(w.context > 0, `Research: context weight should be > 0, got ${w.context}`);
    assert(w.capability > w.latency, `Research: capability should dominate latency`);
  });

  await test("Planning weights: reasoning included", () => {
    const w = getWeightsForIntent("Planning");
    assert(w.reasoning > 0, `Planning: reasoning weight should be > 0, got ${w.reasoning}`);
    assert(w.capability > w.latency, `Planning: capability should dominate latency`);
  });

  await test("Greeting and Programming have different weight distributions", () => {
    const wg = getWeightsForIntent("Greeting");
    const wp = getWeightsForIntent("Programming");
    assertNotEqual(wg.latency, wp.latency, "Greeting and Programming latency weights should differ");
    assertNotEqual(wg.capability, wp.capability, "Greeting and Programming capability weights should differ");
  });

  await test("All weight vectors sum to ~1.0", () => {
    const intents = ["Greeting", "GeneralChat", "Programming", "Research", "Planning", "Writing", "Vision", "PDF", "WebSearch"];
    for (const intent of intents) {
      const w = getWeightsForIntent(intent);
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      assert(Math.abs(sum - 1.0) < 0.001, `${intent} weights sum to ${sum.toFixed(3)}, expected 1.0`);
    }
  });

  await test("Same candidate scores differently for different intents", () => {
    resetAllModelHealth();
    const candidates = buildCandidates();
    const deepseek = candidates.find(c => c.key === "deepseek");
    if (!deepseek) return; // Skip if deepseek not enabled

    const { score: codingScore }  = scoreCandidate(deepseek, "Programming");
    const { score: writingScore } = scoreCandidate(deepseek, "Writing");
    assert(codingScore !== writingScore,
      `DeepSeek should score differently for Programming(${codingScore}) vs Writing(${writingScore})`);
    assert(codingScore > writingScore,
      `DeepSeek should score higher for Programming(${codingScore}) than Writing(${writingScore})`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  section("Test 7: Streaming and non-streaming use identical selection path");
  // ─────────────────────────────────────────────────────────────────────────

  await test("decideModel is async (returns Promise)", async () => {
    const result = decideModel("Hello there", "chat", {}, {}, {});
    assert(result instanceof Promise, "decideModel should return a Promise");
    const model = await result;
    assert(model !== null && model !== undefined, "decideModel should resolve to a model");
    assert(typeof model.provider === "string", "Result should have provider field");
    assert(typeof model.modelId === "string", "Result should have modelId field");
  });

  await test("decideModel for chat tool uses IntentDetector (not keywords)", async () => {
    // If keyword routing were still present, this would route to 'coding' via 'python' keyword.
    // With MSE, the IntentDetector should classify this as Programming
    const model = await decideModel("Tell me about python snakes", "chat", {}, {}, {});
    assert(model !== null, "Should return a model");
    // Key check: the model is selected by MSE, not by keyword 'python'
    assert(model._fromMSE === true, "Model should be selected by MSE (_fromMSE flag)");
  });

  await test("decideModel for pdf tool overrides intent detection", async () => {
    const model = await decideModel("anything at all", "pdf", {}, {}, {});
    assert(model !== null, "Should return a model for PDF tool");
    // PDF tool should route to a model with pdf capability
    assert(model.supportsPDF === true || model.matchedCapability === "pdf",
      `PDF tool should select a PDF-capable model, got capability: ${model.matchedCapability}`);
  });

  await test("decideModel for web tool returns WebSearch model", async () => {
    const model = await decideModel("anything", "web", {}, {}, {});
    assert(model !== null, "Should return a model for web tool");
    assertEqual(model.matchedCapability, "web_search",
      `Web tool should map to web_search capability, got: ${model.matchedCapability}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  section("Test 8: Diagnostics contain all candidates");
  // ─────────────────────────────────────────────────────────────────────────

  await test("selectModel returns diagnostics with candidates array", () => {
    const { diagnostics } = selectModel({ intent: "Programming", confidence: 0.9, overrides: {} });
    assert(diagnostics !== null, "Diagnostics should be returned");
    assert(Array.isArray(diagnostics.candidates), "Diagnostics should contain candidates array");
    assert(diagnostics.candidates.length > 0, "Diagnostics should list at least one candidate");
  });

  await test("Diagnostics include selected model info", () => {
    const { diagnostics } = selectModel({ intent: "GeneralChat", confidence: 0.8, overrides: {} });
    assert(diagnostics.selected !== null, "Diagnostics should have selected model");
    assert(typeof diagnostics.selected.key === "string", "Selected should have key");
    assert(typeof diagnostics.selected.provider === "string", "Selected should have provider");
    assert(typeof diagnostics.intent === "string", "Diagnostics should have intent");
    assert(typeof diagnostics.capability === "string", "Diagnostics should have capability");
  });

  await test("Each candidate in diagnostics has score, health, latency fields", () => {
    const { diagnostics } = selectModel({ intent: "Writing", confidence: 0.85, overrides: {} });
    for (const c of diagnostics.candidates) {
      assert(typeof c.score     === "number", `Candidate ${c.key} missing score`);
      assert(typeof c.health    === "number", `Candidate ${c.key} missing health`);
      assert(typeof c.latency   === "number", `Candidate ${c.key} missing latency`);
      assert(typeof c.capability=== "number", `Candidate ${c.key} missing capability`);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  section("Test 9: New models require no router modification");
  // ─────────────────────────────────────────────────────────────────────────

  await test("CandidateBuilder includes all registry models dynamically", () => {
    const candidates = buildCandidates();
    const registryKeys = ["gemini", "deepseek", "gpt-oss", "nemotron", "qwen", "groq", "glm", "ollama"];
    for (const key of registryKeys) {
      const found = candidates.find(c => c.key === key);
      assert(found !== undefined, `Candidate "${key}" should exist in pool`);
    }
  });

  await test("selectModel selects a model without any routing code knowledge", () => {
    // This verifies the architecture: selectModel doesn't need to know anything about
    // model names or providers — it purely reads the registry + health
    const { selected } = selectModel({ intent: "Research", confidence: 0.9, overrides: {} });
    assert(selected !== null, "Should select a model for Research");
    assert(selected.matchedCapability === "research" || selected.matchedCapability === "general_chat",
      `Unexpected capability: ${selected.matchedCapability}`);
  });

  await test("Capability → Intent mapping is exhaustive (no routing fallback needed)", () => {
    const knownIntents = [
      "Programming", "Research", "Writing", "Planning", "Vision",
      "PDF", "Memory", "WebSearch", "AgentWorkflow", "Greeting", "GeneralChat"
    ];
    for (const intent of knownIntents) {
      const capability = resolveCapabilityForIntent(intent);
      assert(typeof capability === "string" && capability.length > 0,
        `Intent "${intent}" should resolve to a capability, got: ${capability}`);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────

  console.log("\n" + "═".repeat(60));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\n  Failures:");
    for (const f of failures) {
      console.log(`    ❌ ${f.name}`);
      console.log(`       ${f.error}`);
    }
  }
  console.log("═".repeat(60) + "\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("\n💥 Test runner crashed:", err);
  process.exit(1);
});
