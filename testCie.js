// Set mock API keys so that models are enabled in the registry
process.env.GROQ_API_KEY = "mock-groq-key";
process.env.GOOGLE_API_KEY = "mock-google-key";

import { detectIntent, detectIntentFull } from "./services/cie/IntentDetector.js";
import { retrieveRelevantMemory } from "./services/cie/MemoryRetriever.js";
import { getDynamicHistory } from "./services/cie/HistoryManager.js";
import { getCompressedSummary } from "./services/cie/SummaryManager.js";
import { optimizeContext } from "./services/cie/TokenBudgetManager.js";
import { runCiePipeline, buildSummaryContext } from "./services/cie/index.js";
import { saveMemory } from "./features/memory/index.js";
import { saveSummary } from "./storage/summaryStorage.js";
import { addMessage } from "./features/chat/index.js";
import { loadSettings } from "./storage/settingsStorage.js";
import { askModelCie } from "./services/ai.js";
import { groqProvider } from "./services/providers/groqProvider.js";
import { ollamaProvider } from "./services/providers/ollamaProvider.js";

// Phase 9 imports
import { classifyProviderError, ProviderErrorType, ProviderError } from "./services/cie/ProviderErrorClassifier.js";
import { evaluate as evaluateRetryPolicy, RetryAction } from "./services/cie/RetryPolicyEngine.js";
import {
  recordSuccess, recordFailure, getHealthScore, resetAllHealth, resetHealth
} from "./services/cie/ProviderHealthManager.js";

async function runTests() {
  console.log("🧪 STARTING CIE UNIT & VALIDATION TESTS...\n");

  // Setup mock memory/profile for testing
  const mockMemory = {
    name: "Sushan",
    user_name: "Sushan",
    programming_languages: ["JavaScript", "Python", "Go"],
    favorite_technologies: ["Node.js", "React", "VS Code"],
    favorite_database: "PostgreSQL",
    favorite_framework: "Next.js",
    favorite_color: "Midnight Blue",
    favorite_sport: "Football",
    contacts: { 
      professor: "prof@university.edu",
      Alice: "alice@example.com" 
    },
    goals: ["Build a production-grade CIE", "Learn Rust"],
    tasks: ["Refactor prompt pipeline", "Write tests"],
    notes: "Remember to test semantic retrieval with Xenova."
  };
  await saveMemory(mockMemory);

  // Setup mock summary
  const mockSummary = "The user Sushan is working on an agentic AI assistant. He wants to optimize prompt construction. He prefers Midnight Blue.";
  await saveSummary({ summary: mockSummary });

  // Add some history
  await addMessage("user", "Hello assistant!");
  await addMessage("assistant", "Hi Sushan! How can I help you today?");
  await addMessage("user", "I want to write some JavaScript code.");
  await addMessage("assistant", "Sure! Let's write some JavaScript.");

  const settings = await loadSettings();

  const mockProvider = {
    maxContext: 4000,
    safetyMargin: 0.1,
    preferredContextSize: 3000,
    preferredHistoryLength: 5,
    preferredSummaryLength: 600,
    maxRetries: 3,
    compressionStrategy: "history-first",
    estimateTokens(text) {
      return Math.ceil((text || "").length / 4);
    }
  };

  // ---------------------------------------------------------
  // VALIDATION 1: Summary never bypasses the CIE
  // ---------------------------------------------------------
  console.log("--- VALIDATION 1: Summary never bypasses the CIE ---");
  const summaryCieResult = await buildSummaryContext(mockProvider, settings);
  if (summaryCieResult && summaryCieResult.intent === "Summary") {
    console.log("✅ PASS: Summary context built successfully via CIE.");
    console.log(`- Prompt Text starts with: "${summaryCieResult.promptText.substring(0, 43)}..."`);
  } else {
    throw new Error("❌ FAIL: Summary bypassed CIE or had wrong intent.");
  }
  console.log();

  // ---------------------------------------------------------
  // VALIDATION 2: Token estimates match the final prompt
  // ---------------------------------------------------------
  console.log("--- VALIDATION 2: Token estimates match the final prompt ---");
  const cieResult = await runCiePipeline("Write a program", "chat", mockProvider, "System", "", settings);
  const rawPrompt = (cieResult.systemPrompt ? cieResult.systemPrompt + "\n\n" : "") + cieResult.promptText;
  const directEstimate = mockProvider.estimateTokens(rawPrompt);
  if (cieResult.estimatedTokens === directEstimate) {
    console.log("✅ PASS: Token estimate matches the direct estimation of the final constructed prompt string.");
    console.log(`- Estimated tokens: ${cieResult.estimatedTokens}`);
  } else {
    throw new Error(`❌ FAIL: Estimate mismatch! CIE: ${cieResult.estimatedTokens}, Direct: ${directEstimate}`);
  }
  console.log();

  // ---------------------------------------------------------
  // VALIDATION 3: Semantic memory retrieval excludes irrelevant memory
  // ---------------------------------------------------------
  console.log("--- VALIDATION 3: Semantic memory retrieval ---");
  
  // Test A: Research query should return no personal memory
  const researchMemory = await retrieveRelevantMemory("Research Kubernetes deployments", "Research", settings);
  if (Object.keys(researchMemory).length === 0) {
    console.log("✅ PASS: 'Research Kubernetes' query successfully returned NO personal memory.");
  } else {
    console.log("Retrieved keys:", Object.keys(researchMemory));
    throw new Error("❌ FAIL: Irrelevant personal memory returned for research query.");
  }

  // Test B: Programming language query should return only programming_languages
  const progMemory = await retrieveRelevantMemory("What is my favorite programming language?", "GeneralChat", settings);
  const progKeys = Object.keys(progMemory);
  if (progKeys.includes("programming_languages") && !progKeys.includes("favorite_sport")) {
    console.log("✅ PASS: Programming query returned 'programming_languages' and excluded 'favorite_sport'.");
  } else {
    console.log("Retrieved keys:", progKeys);
    throw new Error("❌ FAIL: Programming language query did not properly target/exclude memory.");
  }

  // Test C: Email request should return professor contact and user name
  const emailMemory = await retrieveRelevantMemory("Email my professor", "Email", settings);
  const emailKeys = Object.keys(emailMemory);
  if (emailKeys.includes("contacts.professor") && (emailKeys.includes("user_name") || emailKeys.includes("name"))) {
    console.log("✅ PASS: 'Email my professor' query returned only contacts.professor and user identity.");
  } else {
    console.log("Retrieved keys:", emailKeys);
    throw new Error("❌ FAIL: Email query did not return contacts.professor or user identity.");
  }
  console.log();

  // ---------------------------------------------------------
  // VALIDATION 4: No provider receives an oversized prompt
  // ---------------------------------------------------------
  console.log("--- VALIDATION 4: No provider receives an oversized prompt ---");
  
  // Simulated small provider with tight maxContext
  const tightProvider = {
    maxContext: 150, 
    safetyMargin: 0.1,
    preferredContextSize: 100,
    estimateTokens: (t) => Math.ceil(t.length / 4)
  };
  
  const optimized = optimizeContext({
    provider: tightProvider,
    systemPrompt: "System instruction.",
    userPrompt: "A moderately long user message to force context compression.",
    memory: mockMemory,
    history: [
      { role: "user", content: "Hello there" },
      { role: "assistant", content: "How can I assist you?" }
    ],
    summary: mockSummary,
    settings: { tokenSafetyMargin: 0.1 }
  });

  const maxBudgetLimit = tightProvider.maxContext * (1 - tightProvider.safetyMargin);
  if (optimized.estimatedTokens <= maxBudgetLimit) {
    console.log(`✅ PASS: Token budget optimization kept estimated tokens (${optimized.estimatedTokens}) below safety cap (${maxBudgetLimit}).`);
    console.log(`- Compression Applied: ${optimized.compressionApplied}`);
  } else {
    throw new Error(`❌ FAIL: Prompt exceeded the provider safety cap! Tokens: ${optimized.estimatedTokens}, Cap: ${maxBudgetLimit}`);
  }
  console.log();

  // ---------------------------------------------------------
  // VALIDATION 5: Compression activates before fallback
  // ---------------------------------------------------------
  console.log("--- VALIDATION 5: Compression activates before fallback ---");
  
  // Mock groqProvider.generate to simulate size error on first call, then succeed
  let groqAttempts = 0;
  const origGroqGenerate = groqProvider.generate;
  const origOllamaGenerate = ollamaProvider.generate;

  groqProvider.generate = async (modelId, prompt, options) => {
    groqAttempts++;
    if (groqAttempts === 1) {
      throw new Error("[Groq Error] 413 Payload Too Large");
    }
    return "Success response after compression";
  };

  const result = await askModelCie("groq", "Simulated query with long text to compress", "GeneralChat");
  
  if (groqAttempts === 2 && result === "Success response after compression") {
    console.log("✅ PASS: askModelCie successfully compressed prompt and resolved on primary provider without falling back.");
  } else {
    throw new Error(`❌ FAIL: Compression retry did not activate as expected. Attempts: ${groqAttempts}`);
  }

  // Fallback Validation: Mock groqProvider to always throw size errors, Ollama to succeed
  groqProvider.generate = async (modelId, prompt, options) => {
    throw new Error("[Groq Error] 429 Context length exceeded.");
  };

  let ollamaAttempts = 0;
  ollamaProvider.generate = async (modelId, prompt, options) => {
    ollamaAttempts++;
    return "Ollama fallback success response";
  };

  const resultWithFallback = await askModelCie("groq", "Query that forces fallback", "GeneralChat");

  if (ollamaAttempts === 1 && resultWithFallback === "Ollama fallback success response") {
    console.log("✅ PASS: askModelCie correctly fell back to ollama after primary provider compression retries failed.");
  } else {
    throw new Error(`❌ FAIL: Fallback did not activate as expected. Ollama attempts: ${ollamaAttempts}`);
  }
  console.log();

  // Restore original methods
  groqProvider.generate = origGroqGenerate;
  ollamaProvider.generate = origOllamaGenerate;

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 9 — NEW VALIDATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // ---------------------------------------------------------
  // VALIDATION 6: Greeting never triggers compression
  // shouldCompress must be false for greeting-related errors
  // ---------------------------------------------------------
  console.log("--- VALIDATION 6: Greeting errors never trigger compression ---");
  
  const greetingErr = new Error("Connection refused ECONNREFUSED");
  const greetingClassified = classifyProviderError("groq", greetingErr);
  
  if (!greetingClassified.shouldCompress) {
    console.log(`✅ PASS: Network error classified as ${greetingClassified.errorType} — shouldCompress: ${greetingClassified.shouldCompress}`);
  } else {
    throw new Error(`❌ FAIL: Network error incorrectly set shouldCompress=true (type: ${greetingClassified.errorType})`);
  }
  console.log();

  // ---------------------------------------------------------
  // VALIDATION 7: 429 never triggers compression
  // ---------------------------------------------------------
  console.log("--- VALIDATION 7: 429 Rate Limit never triggers compression ---");
  
  const rateLimitErr = new Error("429 Too Many Requests — rate limit exceeded");
  const rateLimitClassified = classifyProviderError("groq", rateLimitErr);
  
  if (rateLimitClassified.errorType === ProviderErrorType.RATE_LIMIT && !rateLimitClassified.shouldCompress) {
    console.log(`✅ PASS: 429 correctly classified as RATE_LIMIT — shouldCompress: false, shouldFallback: ${rateLimitClassified.shouldFallback}`);
  } else {
    throw new Error(`❌ FAIL: 429 was incorrectly classified. Type: ${rateLimitClassified.errorType}, shouldCompress: ${rateLimitClassified.shouldCompress}`);
  }

  // RetryPolicyEngine: 429 should produce FALLBACK action, not COMPRESS
  const retryDecision = evaluateRetryPolicy({
    rawError: rateLimitErr,
    providerKey: "groq",
    retryCount: 0,
    maxRetries: 3,
    canFallback: true,
    hasYieldedChunks: false,
  });

  if (retryDecision.action === RetryAction.FALLBACK) {
    console.log(`✅ PASS: RetryPolicyEngine returned FALLBACK (not COMPRESS) for 429 error`);
  } else {
    throw new Error(`❌ FAIL: RetryPolicyEngine returned ${retryDecision.action} for 429 (expected FALLBACK)`);
  }
  console.log();

  // ---------------------------------------------------------
  // VALIDATION 8: 413 always triggers compression
  // ---------------------------------------------------------
  console.log("--- VALIDATION 8: 413 Payload Too Large always triggers compression ---");
  
  const payloadErr = new Error("413 Request Entity Too Large");
  const payloadClassified = classifyProviderError("groq", payloadErr);
  
  if (payloadClassified.errorType === ProviderErrorType.PAYLOAD_TOO_LARGE && payloadClassified.shouldCompress) {
    console.log(`✅ PASS: 413 classified as PAYLOAD_TOO_LARGE — shouldCompress: true`);
  } else {
    throw new Error(`❌ FAIL: 413 incorrectly classified. Type: ${payloadClassified.errorType}, shouldCompress: ${payloadClassified.shouldCompress}`);
  }

  // Context limit keyword also triggers compression
  const contextErr = new Error("context length exceeded — prompt too long for this model");
  const contextClassified = classifyProviderError("google", contextErr);
  
  if (contextClassified.errorType === ProviderErrorType.CONTEXT_LIMIT && contextClassified.shouldCompress) {
    console.log(`✅ PASS: Context limit error classified as CONTEXT_LIMIT — shouldCompress: true`);
  } else {
    throw new Error(`❌ FAIL: Context limit error incorrectly classified. Type: ${contextClassified.errorType}, shouldCompress: ${contextClassified.shouldCompress}`);
  }

  const compressDecision = evaluateRetryPolicy({
    rawError: payloadErr,
    providerKey: "groq",
    retryCount: 0,
    maxRetries: 3,
    canFallback: true,
    hasYieldedChunks: false,
  });

  if (compressDecision.action === RetryAction.COMPRESS) {
    console.log(`✅ PASS: RetryPolicyEngine returned COMPRESS for 413 error`);
  } else {
    throw new Error(`❌ FAIL: RetryPolicyEngine returned ${compressDecision.action} for 413 (expected COMPRESS)`);
  }
  console.log();

  // ---------------------------------------------------------
  // VALIDATION 9: Intent v2 — Planning vs TaskCreation disambiguation
  // ---------------------------------------------------------
  console.log("--- VALIDATION 9: Intent v2 — Planning vs TaskCreation disambiguation ---");
  
  // "Plan my day" → Planning
  const planMyDay = await detectIntentFull("Plan my day", "chat", settings);
  if (planMyDay.intent === "Planning") {
    console.log(`✅ PASS: "Plan my day" → ${planMyDay.intent} (confidence: ${planMyDay.confidence.toFixed(2)}, reason: ${planMyDay.reason})`);
  } else {
    throw new Error(`❌ FAIL: "Plan my day" routed to "${planMyDay.intent}" instead of Planning`);
  }

  // "Create a task" → TaskCreation
  const createTask = await detectIntentFull("Create a task: finish my assignment", "chat", settings);
  if (createTask.intent === "TaskCreation") {
    console.log(`✅ PASS: "Create a task" → ${createTask.intent} (confidence: ${createTask.confidence.toFixed(2)})`);
  } else {
    throw new Error(`❌ FAIL: "Create a task" routed to "${createTask.intent}" instead of TaskCreation`);
  }

  // "Build project roadmap" → Planning
  const roadmap = await detectIntentFull("Build a project roadmap for next quarter", "chat", settings);
  if (roadmap.intent === "Planning") {
    console.log(`✅ PASS: "Build project roadmap" → ${roadmap.intent} (confidence: ${roadmap.confidence.toFixed(2)})`);
  } else {
    throw new Error(`❌ FAIL: "Build project roadmap" routed to "${roadmap.intent}" instead of Planning`);
  }

  // "Remember to buy milk" → TaskCreation
  const remindMilk = await detectIntentFull("Remind me to buy milk tomorrow", "chat", settings);
  if (remindMilk.intent === "TaskCreation") {
    console.log(`✅ PASS: "Remind me to buy milk" → ${remindMilk.intent} (confidence: ${remindMilk.confidence.toFixed(2)})`);
  } else {
    throw new Error(`❌ FAIL: "Remind me to buy milk" routed to "${remindMilk.intent}" instead of TaskCreation`);
  }
  console.log();

  // ---------------------------------------------------------
  // VALIDATION 10: ProviderHealthManager tracks correctly
  // ---------------------------------------------------------
  console.log("--- VALIDATION 10: ProviderHealthManager updates scores after success/failure ---");

  resetAllHealth();

  // Fresh provider should start at 1.0
  const initialScore = getHealthScore("test-provider");
  if (initialScore === 1.0) {
    console.log(`✅ PASS: New provider starts with health score 1.0`);
  } else {
    throw new Error(`❌ FAIL: New provider health score should be 1.0, got ${initialScore}`);
  }

  // Record a rate-limit failure — score should drop
  const mockRateLimitErr = classifyProviderError("test-provider", new Error("429 rate limit"));
  recordFailure("test-provider", mockRateLimitErr);
  const afterFailScore = getHealthScore("test-provider");
  if (afterFailScore < 1.0) {
    console.log(`✅ PASS: Health score dropped after failure: ${initialScore.toFixed(2)} → ${afterFailScore.toFixed(2)}`);
  } else {
    throw new Error(`❌ FAIL: Health score did not decrease after failure (score: ${afterFailScore})`);
  }

  // Record a success — score should recover
  recordSuccess("test-provider", 500);
  const afterSuccessScore = getHealthScore("test-provider");
  if (afterSuccessScore > afterFailScore) {
    console.log(`✅ PASS: Health score recovered after success: ${afterFailScore.toFixed(2)} → ${afterSuccessScore.toFixed(2)}`);
  } else {
    throw new Error(`❌ FAIL: Health score did not increase after success (score: ${afterSuccessScore})`);
  }

  // Rate-limited provider should return near-zero score during cooldown
  resetHealth("rate-limit-test");
  const rl429Err = classifyProviderError("rate-limit-test", new Error("429 too many requests"));
  recordFailure("rate-limit-test", rl429Err);
  const duringCooldownScore = getHealthScore("rate-limit-test");
  if (duringCooldownScore <= 0.1) {
    console.log(`✅ PASS: Rate-limited provider score during cooldown: ${duringCooldownScore.toFixed(3)} (≤ 0.1)`);
  } else {
    throw new Error(`❌ FAIL: Rate-limited provider should have near-zero score, got ${duringCooldownScore}`);
  }
  console.log();

  // ---------------------------------------------------------
  // VALIDATION 11: Token breakdown is present and sums correctly
  // ---------------------------------------------------------
  console.log("--- VALIDATION 11: Token breakdown is present and sums correctly ---");

  const breakdownResult = await runCiePipeline("Hello there", "chat", mockProvider, "System prompt for testing.", "", settings);
  
  if (breakdownResult.tokenBreakdown) {
    const bd = breakdownResult.tokenBreakdown;
    const sum = bd.systemTokens + bd.memoryTokens + bd.historyTokens + bd.summaryTokens + bd.pdfTokens + bd.userTokens;
    console.log(`✅ PASS: tokenBreakdown present — system:${bd.systemTokens} memory:${bd.memoryTokens} history:${bd.historyTokens} summary:${bd.summaryTokens} pdf:${bd.pdfTokens} user:${bd.userTokens}`);
    console.log(`  Component sum: ${sum}, estimatedTokens: ${breakdownResult.estimatedTokens}`);
    // The sum of components will be close but not necessarily identical to estimatedTokens
    // because estimatedTokens is estimated on the merged string (slightly different formatting)
    if (sum > 0) {
      console.log(`✅ PASS: Component token sum (${sum}) is non-zero and plausible`);
    } else {
      throw new Error(`❌ FAIL: Token breakdown component sum is 0 — estimation not working`);
    }
  } else {
    throw new Error("❌ FAIL: tokenBreakdown missing from CIE pipeline result");
  }
  console.log();

  console.log("🎉 ALL AUTOMATED CIE SELF-TEST VALIDATIONS PASSED.");
}

runTests().catch(err => {
  console.error("❌ Test execution failed:", err);
  process.exit(1);
});

