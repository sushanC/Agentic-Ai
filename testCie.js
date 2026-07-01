import { detectIntent } from "./services/cie/IntentDetector.js";
import { retrieveRelevantMemory } from "./services/cie/MemoryRetriever.js";
import { getDynamicHistory } from "./services/cie/HistoryManager.js";
import { getCompressedSummary } from "./services/cie/SummaryManager.js";
import { optimizeContext } from "./services/cie/TokenBudgetManager.js";
import { runCiePipeline } from "./services/cie/index.js";
import { saveMemory } from "./storage/memoryStorage.js";
import { saveSummary } from "./storage/summaryStorage.js";
import { addMessage } from "./services/historyService.js";
import { loadSettings } from "./storage/settingsStorage.js";

async function runTests() {
  console.log("🧪 STARTING CIE UNIT TESTS...\n");

  // Setup mock memory/profile for testing
  const mockMemory = {
    name: "Sushan",
    programming_languages: ["JavaScript", "Python", "Go"],
    favorite_technologies: ["Node.js", "React", "VS Code"],
    favorite_database: "PostgreSQL",
    favorite_framework: "Next.js",
    favorite_color: "Midnight Blue",
    favorite_sport: "Football",
    contacts: { "Alice": "alice@example.com" },
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

  // Test 1: Intent Detection
  console.log("--- TEST 1: Intent Detection ---");
  const greetingIntent = await detectIntent("Hi there!", "chat", settings);
  console.log(`"Hi there!" -> Intent: ${greetingIntent} (Expected: Greeting)`);

  const programmingIntent = await detectIntent("Write a binary search in JavaScript", "chat", settings);
  console.log(`"Write a binary search..." -> Intent: ${programmingIntent} (Expected: Programming)`);

  const memoryIntent = await detectIntent("What is my favorite database?", "chat", settings);
  console.log(`"What is my favorite database?" -> Intent: ${memoryIntent} (Expected: Memory)`);

  const generalIntent = await detectIntent("Tell me a joke", "chat", settings);
  console.log(`"Tell me a joke" -> Intent: ${generalIntent} (Expected: GeneralChat)`);
  console.log();

  // Test 2: Context Selection (Greeting vs Programming)
  console.log("--- TEST 2: Context Selection ---");
  const greetingCie = await runCiePipeline("Hi there!", "chat", { maxContext: 32768, estimateTokens: (t) => t.length / 4 }, "System", "", settings);
  console.log("Greeting Intent Context:");
  console.log("- Memory Keys:", greetingCie.memoryKeys);
  console.log("- History Count:", greetingCie.historyCount);
  console.log("- Summary Size:", greetingCie.summarySize);

  const programmingCie = await runCiePipeline("Write a binary search in JavaScript", "chat", { maxContext: 32768, estimateTokens: (t) => t.length / 4 }, "System", "", settings);
  console.log("\nProgramming Intent Context:");
  console.log("- Memory Keys:", programmingCie.memoryKeys);
  console.log("- History Count:", programmingCie.historyCount);
  console.log("- Summary Size:", programmingCie.summarySize);
  console.log();

  // Test 3: Semantic Memory Retrieval
  console.log("--- TEST 3: Semantic Memory Retrieval ---");
  const semMemory = await retrieveRelevantMemory("What is my favorite IDE?", "Memory", settings);
  console.log("Query: 'What is my favorite IDE?'");
  console.log("Retrieved Memory:", semMemory);
  console.log();

  // Test 4: Token Budget Manager (Simulating Groq Overflow)
  console.log("--- TEST 4: Token Budget Manager ---");
  const smallProvider = {
    maxContext: 400, // Very small context window to trigger optimization
    preferredContextSize: 300,
    estimateTokens: (t) => Math.ceil(t.length / 4)
  };

  const largePrompt = "A very long user message that takes up space.";
  const optimized = optimizeContext({
    provider: smallProvider,
    systemPrompt: "You are a helpful assistant.",
    userPrompt: largePrompt,
    memory: mockMemory,
    history: [
      { role: "user", content: "Message 1" },
      { role: "assistant", content: "Response 1" },
      { role: "user", content: "Message 2" }
    ],
    summary: mockSummary,
    settings: { tokenSafetyMargin: 0.1 }
  });

  console.log("Small Context Optimization:");
  console.log("- Compression Applied:", optimized.compressionApplied);
  console.log("- Memory Keys Kept:", optimized.memoryKeys);
  console.log("- History Count Kept:", optimized.historyCount);
  console.log("- Summary Size Kept:", optimized.summarySize);
  console.log("- Estimated Tokens:", optimized.estimatedTokens);
  console.log();

  console.log("✅ ALL CIE UNIT TESTS COMPLETED.");
}

runTests().catch(err => {
  console.error("❌ Test execution failed:", err);
});
