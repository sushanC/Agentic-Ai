import { getEmbedding, cosineSimilarity } from "../embeddingService.js";

// Reference phrases for semantic intent classification
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
    "create a roadmap for my project", "plan my weekly goals", "project strategy", "what is my plan for tomorrow"
  ],
  Memory: [
    "what is my favorite color?", "do you remember my name?", "what is my dog's name", "recall my preferences", "who am i"
  ],
  Email: [
    "send an email to john", "check my inbox", "draft a reply to the client", "gmail message"
  ],
  Task: [
    "list my tasks", "add a new todo item", "mark task as completed", "remind me to buy milk", "show my backlog"
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

export async function detectIntent(message, tool = "chat", settings = {}) {
  const text = String(message || "").trim();
  const lowerText = text.toLowerCase();

  // 1. Tool-based detection (highest priority)
  if (tool === "pdf") return "PDF";
  if (tool === "web") return "WebSearch";
  if (tool === "memory") return "Memory";
  if (tool === "agent" || tool === "planning") return "AgentWorkflow";

  // 2. Fast Regex/Keyword-based detection
  if (/^(hi|hello|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening|yo|sup|whats\s*up)\b/i.test(lowerText)) {
    return "Greeting";
  }

  // Vision check
  if (
    lowerText.includes("image") ||
    lowerText.includes("photo") ||
    lowerText.includes("picture") ||
    lowerText.includes("screenshot") ||
    lowerText.includes("describe this") ||
    lowerText.includes("look at") ||
    lowerText.includes("what do you see")
  ) {
    return "Vision";
  }

  // Memory Question check
  if (
    /^(what|who|where|when|how|do\s+you\s+know|do\s+you\s+remember|recall)\s+(is\s+)?my\b/i.test(lowerText) ||
    lowerText.includes("remember that") ||
    lowerText.includes("my profile") ||
    lowerText.includes("about me")
  ) {
    return "Memory";
  }

  // Email check
  if (
    lowerText.includes("email") ||
    lowerText.includes("gmail") ||
    lowerText.includes("send mail") ||
    lowerText.includes("inbox")
  ) {
    return "Email";
  }

  // Task check
  if (
    lowerText.includes("task") ||
    lowerText.includes("todo") ||
    lowerText.includes("to-do") ||
    lowerText.includes("reminder")
  ) {
    return "Task";
  }

  // Calendar check
  if (
    lowerText.includes("calendar") ||
    lowerText.includes("meeting") ||
    lowerText.includes("schedule") ||
    lowerText.includes("appointment")
  ) {
    return "Calendar";
  }

  // Filesystem check
  if (
    lowerText.includes("file") ||
    lowerText.includes("folder") ||
    lowerText.includes("directory") ||
    lowerText.includes("list files") ||
    lowerText.includes("read file") ||
    lowerText.includes("write file")
  ) {
    return "Filesystem";
  }

  // Browser check
  if (
    lowerText.includes("browser") ||
    lowerText.includes("website") ||
    lowerText.includes("open url") ||
    lowerText.includes("chrome")
  ) {
    return "Browser";
  }

  // Web Search check
  if (
    lowerText.includes("search online") ||
    lowerText.includes("find online") ||
    lowerText.includes("search the web") ||
    lowerText.includes("look up online")
  ) {
    return "WebSearch";
  }

  // Planning check
  if (
    lowerText.includes("plan") ||
    lowerText.includes("roadmap") ||
    lowerText.includes("strategy") ||
    lowerText.includes("research and save")
  ) {
    return "Planning";
  }

  // Programming check
  if (
    lowerText.includes("code") ||
    lowerText.includes("program") ||
    lowerText.includes("java") ||
    lowerText.includes("python") ||
    lowerText.includes("javascript") ||
    lowerText.includes("typescript") ||
    lowerText.includes("react") ||
    lowerText.includes("node") ||
    lowerText.includes("sql") ||
    lowerText.includes("bug") ||
    lowerText.includes("error") ||
    lowerText.includes("debug") ||
    lowerText.includes("function") ||
    lowerText.includes("algorithm")
  ) {
    return "Programming";
  }

  // Writing check
  if (
    lowerText.includes("write") ||
    lowerText.includes("draft") ||
    lowerText.includes("compose") ||
    lowerText.includes("essay")
  ) {
    return "Writing";
  }

  // Research check
  if (
    lowerText.includes("research") ||
    lowerText.includes("analyze") ||
    lowerText.includes("find out") ||
    lowerText.includes("compare") ||
    lowerText.includes("comparison") ||
    lowerText.includes("versus") ||
    lowerText.includes(" vs ") ||
    lowerText.includes("summarize") ||
    lowerText.includes("summary") ||
    lowerText.includes("explain in detail") ||
    lowerText.includes("technical documentation") ||
    lowerText.includes("long explanation")
  ) {
    return "Research";
  }

  // 3. Semantic similarity classification (if enabled in settings)
  if (settings.enableSmartContext !== false && text.length > 0) {
    try {
      const promptEmbedding = await getEmbedding(text);
      const refEmbeddings = await getReferenceEmbeddings();
      
      let bestIntent = "GeneralChat";
      let highestSimilarity = -1;

      for (const [intent, embeddings] of Object.entries(refEmbeddings)) {
        for (const emb of embeddings) {
          const sim = cosineSimilarity(promptEmbedding, emb);
          if (sim > highestSimilarity) {
            highestSimilarity = sim;
            bestIntent = intent;
          }
        }
      }

      // Only accept semantic match if similarity is reasonably high
      if (highestSimilarity >= 0.35) {
        return bestIntent;
      }
    } catch (err) {
      console.warn("⚠️ Semantic intent detection failed:", err.message);
    }
  }

  // Default
  return "GeneralChat";
}
