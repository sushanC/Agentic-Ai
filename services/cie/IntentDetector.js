/**
 * IntentDetector.js — v2
 *
 * Confidence-scored intent classification engine.
 *
 * v2 changes over v1:
 *  - Replaced keyword-only binary matching with confidence scoring for all
 *    intents that have ambiguous boundaries.
 *  - Added `TaskCreation` as a distinct intent (previously collapsed into Task).
 *  - "Plan my day"     → Planning   (was incorrectly Task in v1)
 *  - "Remember to buy milk" → TaskCreation (not Memory)
 *  - "Create a task"  → TaskCreation
 *  - "Build roadmap"  → Planning
 *  - Semantic fallback path unchanged.
 *
 * Public API (backward-compatible):
 *  - detectIntent(message, tool, settings) → string   (same as v1)
 *  - detectIntentFull(message, tool, settings) → { intent, confidence, secondaryIntent, reason }
 */

import { getEmbedding, cosineSimilarity } from "../embeddingService.js";

// ─────────────────────────────────────────────────────────────────────────────
// Intent Constants
// ─────────────────────────────────────────────────────────────────────────────

export const Intent = Object.freeze({
  Greeting:       "Greeting",
  GeneralChat:    "GeneralChat",
  Planning:       "Planning",
  TaskCreation:   "TaskCreation",
  Reminder:       "Reminder",
  Calendar:       "Calendar",
  Email:          "Email",
  PDFQuestion:    "PDF",
  Research:       "Research",
  Coding:         "Programming",
  Writing:        "Writing",
  Filesystem:     "Filesystem",
  Browser:        "Browser",
  Image:          "Vision",
  Memory:         "Memory",
  Search:         "WebSearch",
  // Internal / tool-triggered
  Summary:           "Summary",
  MemoryExtraction:  "MemoryExtraction",
  ActionPlanning:    "ActionPlanning",
  ToolRouting:       "ToolRouting",
  EmailExtraction:   "EmailExtraction",
  EmailDraft:        "EmailDraft",
  AgentWorkflow:     "AgentWorkflow",
});

// ─────────────────────────────────────────────────────────────────────────────
// Reference phrases for semantic intent classification (embeddings)
// ─────────────────────────────────────────────────────────────────────────────

const INTENT_REFERENCES = {
  Greeting: [
    "hello", "hi", "hey there", "good morning", "how are you", "yo", "greetings"
  ],
  Programming: [
    "write a python script", "debug this code", "fix the syntax error", "implement an algorithm", "javascript function help"
  ],
  Research: [
    "tell me about the history of quantum computing", "detailed analysis of", "explain the theory of relativity", "literature review on", "summarize the latest trends"
  ],
  Writing: [
    "write an essay on", "draft a blog post", "compose a letter", "rewrite this paragraph", "creative writing prompt"
  ],
  Planning: [
    "create a roadmap for my project", "plan my weekly goals", "project strategy", "what is my plan for tomorrow", "build a learning plan"
  ],
  Memory: [
    "what is my favorite color?", "do you remember my name?", "what is my dog's name", "recall my preferences", "who am i"
  ],
  Email: [
    "send an email to john", "check my inbox", "draft a reply to the client", "gmail message"
  ],
  TaskCreation: [
    "add a new todo item", "mark task as completed", "show my backlog", "create task finish assignment", "remind me to buy milk"
  ],
  WebSearch: [
    "search the web for the latest news", "look up today's weather online", "who won the game yesterday?", "search online for"
  ],
  Filesystem: [
    "list files in the directory", "read the file at path", "create a new folder", "write content to file.txt"
  ],
  Browser: [
    "open the website", "browse to google.com", "scrape the content of this url"
  ],
  Calendar: [
    "schedule a meeting for tomorrow", "what is on my calendar?", "add appointment", "upcoming events"
  ]
};

// Cache for reference embeddings to avoid re-computing
const referenceEmbeddingsCache = {};

async function getReferenceEmbeddings() {
  if (Object.keys(referenceEmbeddingsCache).length > 0) {
    return referenceEmbeddingsCache;
  }

  for (const [intent, phrases] of Object.entries(INTENT_REFERENCES)) {
    referenceEmbeddingsCache[intent] = [];
    for (const phrase of phrases) {
      try {
        const emb = await getEmbedding(phrase);
        referenceEmbeddingsCache[intent].push(emb);
      } catch (err) {
        console.error(`Failed to embed phrase "${phrase}":`, err.message);
      }
    }
  }
  return referenceEmbeddingsCache;
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence Scoring Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score a text against an array of keyword signals with weights.
 * Returns a score from 0.0 to 1.0.
 *
 * @param {string} text - Lowercased input text
 * @param {Array<{keywords: string[], weight: number}>} signals
 * @returns {number}
 */
function scoreSignals(text, signals) {
  let totalWeight = 0;
  let matchedWeight = 0;

  for (const signal of signals) {
    totalWeight += signal.weight;
    if (signal.keywords.some(kw => text.includes(kw))) {
      matchedWeight += signal.weight;
    }
  }

  return totalWeight > 0 ? matchedWeight / totalWeight : 0;
}

/**
 * Intent signal definitions for confidence scoring.
 * Each intent has an array of weighted keyword groups.
 * Higher weight = stronger signal for that intent.
 */
const INTENT_SIGNALS = {
  Greeting: [
    { keywords: ["hello", "hi ", "hey ", "hey!", "greetings", "good morning", "good afternoon", "good evening", "yo ", "sup ", "whats up", "what's up"], weight: 3 },
  ],

  Planning: [
    { keywords: ["roadmap", "project plan", "learning plan", "study plan", "strategy for", "plan for", "plan to", "plan my"], weight: 3 },
    { keywords: ["step by step plan", "action plan", "quarterly plan", "weekly plan", "goal plan"], weight: 3 },
    { keywords: ["milestone", "timeline", "phases", "deliverable"], weight: 2 },
    { keywords: ["build a plan", "create a plan", "make a plan", "develop a plan", "design a plan"], weight: 2 },
    { keywords: ["plan"], weight: 1 },  // weak signal alone
  ],

  TaskCreation: [
    { keywords: ["add task", "create task", "new task", "create a task", "add a task", "add to my tasks"], weight: 3 },
    { keywords: ["remind me to", "set a reminder", "reminder to", "remember to buy", "remember to call", "remember to send"], weight: 3 },
    { keywords: ["todo", "to-do", "to do list"], weight: 2 },
    { keywords: ["task for", "mark task", "complete task", "finish task"], weight: 2 },
    { keywords: ["reminder"], weight: 1 },
  ],

  Email: [
    { keywords: ["send email", "send an email", "send mail", "email to ", "draft email", "compose email", "write email"], weight: 3 },
    { keywords: ["gmail", "inbox", "reply to", "forward email"], weight: 2 },
    { keywords: ["email"], weight: 1 },
  ],

  Calendar: [
    { keywords: ["schedule a meeting", "book a meeting", "add appointment", "add to calendar", "calendar event"], weight: 3 },
    { keywords: ["meeting at", "appointment at", "event on"], weight: 2 },
    { keywords: ["calendar", "meeting", "schedule", "appointment"], weight: 1 },
  ],

  Memory: [
    { keywords: ["do you remember", "do you know my", "what is my", "what's my", "recall my", "remember my", "my profile", "about me", "who am i"], weight: 3 },
    { keywords: ["my name is", "my favorite", "i prefer", "i like", "my goal"], weight: 2 },
  ],

  Vision: [
    { keywords: ["describe this image", "look at this", "what do you see", "analyze this photo", "what's in the image"], weight: 3 },
    { keywords: ["image", "photo", "picture", "screenshot", "visual"], weight: 1 },
  ],

  Filesystem: [
    { keywords: ["list files", "read file", "write file", "create folder", "delete file", "open file", "file at path"], weight: 3 },
    { keywords: ["directory", "folder", "file"], weight: 1 },
  ],

  Browser: [
    { keywords: ["open website", "browse to", "go to url", "open chrome", "scrape url"], weight: 3 },
    { keywords: ["browser", "website", "open url"], weight: 1 },
  ],

  WebSearch: [
    { keywords: ["search online", "find online", "search the web", "look up online", "search for latest", "current news", "today's news"], weight: 3 },
    { keywords: ["latest news", "current score", "today's weather", "live score"], weight: 2 },
  ],

  Programming: [
    { keywords: ["write a function", "write code", "fix this bug", "debug this", "implement", "code for", "script for", "program to"], weight: 3 },
    { keywords: ["python", "javascript", "typescript", "java ", "react", "node.js", "sql", "algorithm", "recursion"], weight: 2 },
    { keywords: ["code", "bug", "error", "function", "class", "variable"], weight: 1 },
  ],

  Writing: [
    { keywords: ["write an essay", "draft a blog", "compose a letter", "write a report", "write a cover letter", "write an article"], weight: 3 },
    { keywords: ["rewrite this", "paraphrase this", "creative writing"], weight: 2 },
    { keywords: ["write", "draft", "compose", "essay"], weight: 1 },
  ],

  Research: [
    { keywords: ["detailed analysis", "research on", "study on", "literature review", "deep dive into", "explain in detail", "compare and contrast"], weight: 3 },
    { keywords: ["analyze", "versus", " vs ", "comparison between", "pros and cons"], weight: 2 },
    { keywords: ["research", "explain", "summarize"], weight: 1 },
  ],
};

/**
 * Compute confidence scores for all applicable intents.
 * Returns sorted array: [{ intent, score }]
 *
 * @param {string} text - Lowercased user message
 * @returns {Array<{intent: string, score: number}>}
 */
function computeConfidenceScores(text) {
  const results = [];

  for (const [intent, signals] of Object.entries(INTENT_SIGNALS)) {
    const score = scoreSignals(text, signals);
    if (score > 0) {
      results.push({ intent, score });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic fast-path checks (unambiguous intents)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fast-path for intents that are always unambiguous.
 * Returns intent string or null.
 * @param {string} lowerText
 * @returns {string|null}
 */
function fastPathDetect(lowerText) {
  // Greetings — very short messages starting with greeting word
  if (/^(hi|hello|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening|yo|sup|whats\s*up)(\s|!|,|$)/i.test(lowerText)) {
    return Intent.Greeting;
  }

  // Vision — explicit image references
  if (
    lowerText.includes("describe this image") ||
    lowerText.includes("what do you see") ||
    lowerText.includes("look at this photo") ||
    lowerText.includes("analyze this image")
  ) {
    return Intent.Image;
  }

  // Memory recall — explicit recall patterns
  if (
    /^(what|who|where|when|how|do\s+you\s+know|do\s+you\s+remember|recall)\s+(is\s+)?my\b/i.test(lowerText)
  ) {
    return Intent.Memory;
  }

  // Web search — explicit online search phrases
  if (
    lowerText.includes("search online") ||
    lowerText.includes("search the web") ||
    lowerText.includes("find online") ||
    lowerText.includes("look up online")
  ) {
    return Intent.Search;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full intent classification pipeline.
 *
 * @param {string} text       - Normalized user text
 * @param {string} lowerText  - Lowercased text
 * @param {object} settings   - User settings
 * @returns {Promise<{intent: string, confidence: number, secondaryIntent: string|null, reason: string}>}
 */
async function classifyIntent(text, lowerText, settings) {
  // 1. Fast-path for unambiguous intents
  const fastResult = fastPathDetect(lowerText);
  if (fastResult) {
    return {
      intent: fastResult,
      confidence: 0.99,
      secondaryIntent: null,
      reason: "fast-path exact match",
    };
  }

  // 2. Confidence scoring for all intents
  const scores = computeConfidenceScores(lowerText);

  if (scores.length > 0) {
    const best = scores[0];
    const second = scores[1] || null;

    // Critical disambiguation: Planning vs TaskCreation
    // "Plan my day" must → Planning, "Add task" must → TaskCreation
    if (best.intent === "Planning" || best.intent === "TaskCreation") {
      const planningScore = scores.find(s => s.intent === "Planning")?.score || 0;
      const taskScore = scores.find(s => s.intent === "TaskCreation")?.score || 0;

      // TaskCreation wins only if it has a higher or equal score to Planning
      // AND the text contains strong task creation signals (explicit task/remind keywords)
      const hasStrongTaskSignal =
        lowerText.includes("add task") ||
        lowerText.includes("create task") ||
        lowerText.includes("new task") ||
        lowerText.includes("remind me to") ||
        lowerText.includes("remember to") ||
        lowerText.includes("set a reminder") ||
        lowerText.includes("todo") ||
        lowerText.includes("to-do");

      if (taskScore > planningScore && hasStrongTaskSignal) {
        return {
          intent: Intent.TaskCreation,
          confidence: taskScore,
          secondaryIntent: planningScore > 0 ? Intent.Planning : null,
          reason: `TaskCreation (${taskScore.toFixed(2)}) > Planning (${planningScore.toFixed(2)}) with strong task signal`,
        };
      }

      if (planningScore >= taskScore && planningScore > 0) {
        return {
          intent: Intent.Planning,
          confidence: planningScore,
          secondaryIntent: taskScore > 0 ? Intent.TaskCreation : null,
          reason: `Planning (${planningScore.toFixed(2)}) >= TaskCreation (${taskScore.toFixed(2)})`,
        };
      }
    }

    // Use best confidence score if above threshold
    if (best.score >= 0.25) {
      const intentMap = {
        Greeting:     Intent.Greeting,
        Planning:     Intent.Planning,
        TaskCreation: Intent.TaskCreation,
        Email:        Intent.Email,
        Calendar:     Intent.Calendar,
        Memory:       Intent.Memory,
        Vision:       Intent.Image,
        Filesystem:   Intent.Filesystem,
        Browser:      Intent.Browser,
        WebSearch:    Intent.Search,
        Programming:  Intent.Coding,
        Writing:      Intent.Writing,
        Research:     Intent.Research,
      };

      const mappedIntent = intentMap[best.intent] || Intent.GeneralChat;

      return {
        intent: mappedIntent,
        confidence: best.score,
        secondaryIntent: second ? (intentMap[second.intent] || null) : null,
        reason: `confidence score ${best.score.toFixed(2)} (next: ${second ? second.score.toFixed(2) : "none"})`,
      };
    }
  }

  // 3. Semantic similarity classification (if enabled in settings)
  if (settings.enableSmartContext !== false && text.length > 0) {
    try {
      const promptEmbedding = await getEmbedding(text);
      const refEmbeddings = await getReferenceEmbeddings();

      let bestIntent = Intent.GeneralChat;
      let highestSimilarity = -1;
      let secondBestIntent = null;
      let secondSimilarity = -1;

      for (const [intent, embeddings] of Object.entries(refEmbeddings)) {
        for (const emb of embeddings) {
          const sim = cosineSimilarity(promptEmbedding, emb);
          if (sim > highestSimilarity) {
            secondSimilarity = highestSimilarity;
            secondBestIntent = bestIntent;
            highestSimilarity = sim;
            bestIntent = intent;
          } else if (sim > secondSimilarity) {
            secondSimilarity = sim;
            secondBestIntent = intent;
          }
        }
      }

      if (highestSimilarity >= 0.35) {
        const intentLookup = {
          Greeting: Intent.Greeting,
          Planning: Intent.Planning,
          TaskCreation: Intent.TaskCreation,
          Email: Intent.Email,
          Calendar: Intent.Calendar,
          Memory: Intent.Memory,
          Browser: Intent.Browser,
          WebSearch: Intent.Search,
          Programming: Intent.Coding,
          Writing: Intent.Writing,
          Research: Intent.Research,
          Filesystem: Intent.Filesystem,
        };
        return {
          intent: intentLookup[bestIntent] || Intent.GeneralChat,
          confidence: highestSimilarity,
          secondaryIntent: secondBestIntent ? (intentLookup[secondBestIntent] || null) : null,
          reason: `semantic similarity ${highestSimilarity.toFixed(3)}`,
        };
      }
    } catch (err) {
      console.warn("⚠️ Semantic intent detection failed:", err.message);
    }
  }

  return {
    intent: Intent.GeneralChat,
    confidence: 0.0,
    secondaryIntent: null,
    reason: "no confident match — defaulting to GeneralChat",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect intent from a message.
 * Returns string intent name (backward-compatible with v1).
 *
 * @param {string} message  - User message
 * @param {string} [tool]   - Active tool context
 * @param {object} [settings] - User settings
 * @returns {Promise<string>} Intent string
 */
export async function detectIntent(message, tool = "chat", settings = {}) {
  const result = await detectIntentFull(message, tool, settings);
  return result.intent;
}

/**
 * Detect intent with full metadata including confidence score and reason.
 * Use this for diagnostics and observability.
 *
 * @param {string} message  - User message
 * @param {string} [tool]   - Active tool context
 * @param {object} [settings] - User settings
 * @returns {Promise<{intent: string, confidence: number, secondaryIntent: string|null, reason: string}>}
 */
export async function detectIntentFull(message, tool = "chat", settings = {}) {
  const text = String(message || "").trim();
  const lowerText = text.toLowerCase();

  // Tool-based overrides (highest priority — always wins)
  if (tool === "pdf") return { intent: Intent.PDFQuestion, confidence: 1.0, secondaryIntent: null, reason: "tool=pdf" };
  if (tool === "web") return { intent: Intent.Search, confidence: 1.0, secondaryIntent: null, reason: "tool=web" };
  if (tool === "memory") return { intent: Intent.Memory, confidence: 1.0, secondaryIntent: null, reason: "tool=memory" };
  if (tool === "agent" || tool === "planning") return { intent: Intent.AgentWorkflow, confidence: 1.0, secondaryIntent: null, reason: "tool=agent/planning" };
  if (tool === "summary" || tool === "summarize") return { intent: Intent.Summary, confidence: 1.0, secondaryIntent: null, reason: "tool=summary" };
  if (tool === "MemoryExtraction") return { intent: Intent.MemoryExtraction, confidence: 1.0, secondaryIntent: null, reason: "tool=MemoryExtraction" };
  if (tool === "ActionPlanning") return { intent: Intent.ActionPlanning, confidence: 1.0, secondaryIntent: null, reason: "tool=ActionPlanning" };
  if (tool === "ToolRouting") return { intent: Intent.ToolRouting, confidence: 1.0, secondaryIntent: null, reason: "tool=ToolRouting" };
  if (tool === "EmailExtraction") return { intent: Intent.EmailExtraction, confidence: 1.0, secondaryIntent: null, reason: "tool=EmailExtraction" };
  if (tool === "EmailDraft") return { intent: Intent.EmailDraft, confidence: 1.0, secondaryIntent: null, reason: "tool=EmailDraft" };

  return await classifyIntent(text, lowerText, settings);
}
